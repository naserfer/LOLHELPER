"""
LoL Pick Helper - overlay de champ select para tu pool de top.

Lee la API local del cliente de League (LCU). Solo LEE datos: no pickea, no banea
y no hace nada dentro de la partida.

    py overlay.py           -> overlay
    py overlay.py --text    -> modo consola
    py overlay.py --demo    -> champ select de ejemplo
"""
import base64
from collections import Counter
import json
import os
import queue
import re
import shutil
import ssl
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ingame  # noqa: E402
import support  # noqa: E402
import history  # noqa: E402
import wincons  # noqa: E402
POOL_FILE = os.path.join(HERE, "pool.json")
DD_DIR = os.path.join(HERE, ".ddragon")
POLL_SECONDS = 1.0
DD = "https://ddragon.leagueoflegends.com"

LOCKFILE_PATHS = [
    r"C:\Riot Games\League of Legends\lockfile",
    r"D:\Riot Games\League of Legends\lockfile",
    r"C:\Program Files\Riot Games\League of Legends\lockfile",
    "/Applications/League of Legends.app/Contents/LoL/lockfile",
]


def norm(name):
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


# ======================================================================= LCU
def find_credentials():
    out = ""
    try:
        if sys.platform == "win32":
            cmd = ["powershell", "-NoProfile", "-Command",
                   "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" "
                   "| Select-Object -ExpandProperty CommandLine"]
            out = subprocess.run(cmd, capture_output=True, text=True, timeout=5,
                                 creationflags=0x08000000).stdout
        else:
            out = subprocess.run(["ps", "-A", "-o", "command"], capture_output=True,
                                 text=True, timeout=5).stdout
    except Exception:
        out = ""
    port = re.search(r"--app-port=(\d+)", out)
    token = re.search(r"--remoting-auth-token=([\w-]+)", out)
    if port and token:
        return port.group(1), token.group(1)
    paths = list(LOCKFILE_PATHS)
    if os.environ.get("LOL_PATH"):
        paths.insert(0, os.path.join(os.environ["LOL_PATH"], "lockfile"))
    for p in paths:
        try:
            with open(p, encoding="utf-8") as f:
                parts = f.read().strip().split(":")
            if len(parts) >= 4:
                return parts[2], parts[3]
        except OSError:
            continue
    return None


class LCU:
    def __init__(self):
        self.ctx = ssl.create_default_context()
        self.ctx.check_hostname = False
        self.ctx.verify_mode = ssl.CERT_NONE  # certificado autofirmado de Riot (solo 127.0.0.1)
        self.port = None
        self.auth = None

    def connect(self):
        creds = find_credentials()
        if not creds:
            self.port = None
            return False
        self.port = creds[0]
        self.auth = base64.b64encode(f"riot:{creds[1]}".encode()).decode()
        return True

    def get(self, path):
        if not self.port and not self.connect():
            raise ConnectionError("Cliente de League no encontrado")
        req = urllib.request.Request(
            f"https://127.0.0.1:{self.port}{path}",
            headers={"Authorization": f"Basic {self.auth}", "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, context=self.ctx, timeout=3) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
        except (urllib.error.URLError, ConnectionError, OSError):
            self.port = None
            raise ConnectionError("Cliente de League no encontrado")


    def raw(self, path):
        """Bytes de un asset del cliente (ej. íconos). None si no se puede."""
        try:
            if not self.port and not self.connect():
                return None
            req = urllib.request.Request(f"https://127.0.0.1:{self.port}{path}",
                                         headers={"Authorization": f"Basic {self.auth}"})
            with urllib.request.urlopen(req, context=self.ctx, timeout=5) as r:
                return r.read()
        except Exception:
            return None


# ================================================================ Data Dragon
def _http_json(url, timeout=10):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


class DataDragon:
    """Datos e íconos oficiales de Riot. Se cachean en .ddragon/ ."""

    def __init__(self):
        os.makedirs(DD_DIR, exist_ok=True)
        self.version = None
        self.champs = {}      # id(int) -> {name, img, dmg}
        self.alias = {}       # norm(id interno, ej. MonkeyKing) -> nombre
        self.dmg_by_name = {}
        self.itemdb = ingame.ItemDB({})
        self.urls = {}        # (kind, norm(name)) -> url
        self.ready = False
        self.jobs = queue.Queue()
        self.on_image = None  # callback cuando baja un ícono nuevo
        self.lcu = None       # si está, los íconos de ítems salen del cliente
        self.lcu_icons = False
        self.pending = set()
        threading.Thread(target=self._worker, daemon=True).start()

    def _cached(self, fname, url, max_age):
        path = os.path.join(DD_DIR, fname)
        if os.path.exists(path) and time.time() - os.path.getmtime(path) < max_age:
            return json.load(open(path, encoding="utf-8"))
        try:
            data = _http_json(url)
            json.dump(data, open(path, "w", encoding="utf-8"))
            return data
        except Exception:
            if os.path.exists(path):
                return json.load(open(path, encoding="utf-8"))
            raise

    def load(self):
        try:
            self.version = self._cached("versions.json", f"{DD}/api/versions.json", 6 * 3600)[0]
            v = self.version
            cj = self._cached(f"champion_{v}.json", f"{DD}/cdn/{v}/data/en_US/champion.json", 1e9)
            for c in cj["data"].values():
                a, m = c["info"]["attack"], c["info"]["magic"]
                kind = "MIX" if abs(a - m) <= 1 and min(a, m) >= 4 else ("AP" if m > a else "AD")
                self.champs[int(c["key"])] = {"name": c["name"], "dmg": kind}
                self.alias[norm(c["id"])] = c["name"]
                self.dmg_by_name[norm(c["name"])] = kind
                self.urls[("champion", norm(c["name"]))] = f"{DD}/cdn/{v}/img/champion/{c['image']['full']}"
            ij = self._cached(f"item_{v}.json", f"{DD}/cdn/{v}/data/en_US/item.json", 1e9)
            self.itemdb = ingame.ItemDB(ij["data"])
            # Una sola imagen por nombre: la del ítem de la Grieta (id más bajo). Antes se colaban
            # las variantes de Arena/otros modos (ids 22xxxx, 32xxxx) que traen arte viejo.
            for iid, it in ij["data"].items():
                key = ("item", norm(it["name"]))
                best = self.itemdb.id_of(it["name"])
                if best is not None:
                    self.urls[key] = f"{DD}/cdn/{v}/img/item/{best}.png"
            self._lcu_items()
            sj = self._cached(f"summoner_{v}.json", f"{DD}/cdn/{v}/data/en_US/summoner.json", 1e9)
            for s in sj["data"].values():
                self.urls[("spell", norm(s["name"]))] = f"{DD}/cdn/{v}/img/spell/{s['image']['full']}"
                self.urls[("spell", norm(s["id"]))] = f"{DD}/cdn/{v}/img/spell/{s['image']['full']}"
            rj = self._cached(f"runes_{v}.json", f"{DD}/cdn/{v}/data/en_US/runesReforged.json", 1e9)
            for tree in rj:
                self.urls[("rune", norm(tree["name"]))] = f"{DD}/cdn/img/{tree['icon']}"
                for slot in tree["slots"]:
                    for r in slot["runes"]:
                        self.urls[("rune", norm(r["name"]))] = f"{DD}/cdn/img/{r['icon']}"
            self.ready = True
            self.clean_old()
        except Exception:
            self.ready = False

    def _lcu_items(self):
        """Si el cliente está abierto, usa los íconos que trae el propio cliente (el arte actual)."""
        if not self.lcu or self.lcu_icons:
            return
        try:
            data = self.lcu.get("/lol-game-data/assets/v1/items.json") or []
        except Exception:
            return
        by_id = {it.get("id"): it.get("iconPath") for it in data if it.get("iconPath")}
        for iid, it in self.itemdb.items.items():
            name = it.get("name")
            if self.itemdb.id_of(name) == iid and by_id.get(iid):
                self.urls[("item", norm(name))] = "lcu:" + by_id[iid]
        self.lcu_icons = True

    def img_dir(self):
        tag = (self.version or "x") + ("-lcu" if self.lcu_icons else "")
        return os.path.join(DD_DIR, "img", tag)

    def clean_old(self):
        base = os.path.join(DD_DIR, "img")
        keep = os.path.basename(self.img_dir())
        try:
            for d in os.listdir(base):
                full = os.path.join(base, d)
                if d != keep and os.path.isdir(full):
                    shutil.rmtree(full, ignore_errors=True)
        except OSError:
            pass

    def path(self, kind, name):
        return os.path.join(self.img_dir(), kind, norm(name) + ".png")

    def request(self, kind, name):
        """Devuelve la ruta local si ya existe; si no, la encola para bajarla."""
        p = self.path(kind, name)
        if os.path.exists(p):
            return p
        key = (kind, norm(name))
        if key in self.urls and key not in self.pending:
            self.pending.add(key)
            self.jobs.put((self.urls[key], p, key))
        return None

    def _worker(self):
        while True:
            url, p, key = self.jobs.get()
            try:
                os.makedirs(os.path.dirname(p), exist_ok=True)
                if url.startswith("lcu:"):
                    data = self.lcu.raw(url[4:])
                    if not data:
                        kind, nm = key
                        iid = self.itemdb.id_of(nm) if kind == "item" else None
                        if iid is None:
                            continue
                        url = f"{DD}/cdn/{self.version}/img/item/{iid}.png"
                        self.urls[key] = url
                if not url.startswith("lcu:"):
                    data = urllib.request.urlopen(url, timeout=10).read()
                with open(p + ".tmp", "wb") as f:
                    f.write(data)
                os.replace(p + ".tmp", p)
                if self.on_image:
                    self.on_image()
            except Exception:
                pass
            finally:
                self.pending.discard(key)


def load_champions(lcu, dd):
    champs = {cid: dict(v) for cid, v in dd.champs.items()}
    try:
        for c in lcu.get("/lol-game-data/assets/v1/champion-summary.json") or []:
            if c.get("id", -1) > 0:
                champs.setdefault(c["id"], {"dmg": "?"})["name"] = c["name"]
    except Exception:
        pass
    return champs


# ================================================================== análisis
def analyze(session, champs, pool):
    def cname(cid):
        return champs.get(cid, {}).get("name", f"#{cid}")

    def cdmg(cid):
        return champs.get(cid, {}).get("dmg", "?")

    local = session.get("localPlayerCellId")
    my_team = session.get("myTeam", [])
    their_team = session.get("theirTeam", [])

    bans = set()
    for group in session.get("actions", []):
        for a in group:
            if a.get("type") == "ban" and a.get("completed") and a.get("championId"):
                bans.add(a["championId"])
    b = session.get("bans") or {}
    bans.update(x for x in b.get("myTeamBans", []) + b.get("theirTeamBans", []) if x)

    me = next((p for p in my_team if p.get("cellId") == local), {})
    my_hover = me.get("championId") or me.get("championPickIntent") or 0
    allies = [p.get("championId") or p.get("championPickIntent") for p in my_team
              if p.get("cellId") != local]
    allies = [a for a in allies if a]
    enemies = [p.get("championId") for p in their_team if p.get("championId")]
    enemy_top = next((p.get("championId") for p in their_team
                      if p.get("assignedPosition") == "top" and p.get("championId")), None)

    taken = bans | set(allies) | set(enemies)
    enemy_list = [{"name": cname(e), "dmg": cdmg(e)} for e in enemies]
    enemy_names = [e["name"] for e in enemy_list]
    ad = sum(1 for e in enemy_list if e["dmg"] == "AD") + 0.5 * sum(1 for e in enemy_list if e["dmg"] == "MIX")
    ap = sum(1 for e in enemy_list if e["dmg"] == "AP") + 0.5 * sum(1 for e in enemy_list if e["dmg"] == "MIX")

    games_as_top = {}
    for c in pool:
        for n, m in c["matchups"].items():
            games_as_top[norm(n)] = max(games_as_top.get(norm(n), 0), m.get("games", 0))
    if enemy_top:
        lane_enemy = cname(enemy_top)
    else:
        cands = [(games_as_top.get(norm(n), 0), n) for n in enemy_names
                 if games_as_top.get(norm(n), 0) >= 300]
        lane_enemy = max(cands)[1] if cands else None

    if len(enemies) >= 3 and ad >= ap + 2:
        build_key = "vs_ad"
    elif len(enemies) >= 3 and ap >= ad + 2:
        build_key = "vs_ap"
    else:
        build_key = "default"

    recs = []
    for c in pool:
        mu = {norm(k): (k, v) for k, v in c["matchups"].items()}
        score = 0.0
        lane = None
        if lane_enemy and norm(lane_enemy) in mu:
            lane = mu[norm(lane_enemy)]
            score += 3 * lane[1]["score"]
        elif not lane_enemy:
            score += c.get("blind", 0)
        cb = c.get("comp_bonus", {})
        score += cb.get("AD", 0) * ad + cb.get("AP", 0) * ap
        cid = next((i for i, v in champs.items() if norm(v.get("name")) == norm(c["name"])), None)
        status = "ok"
        if cid in bans:
            status = "BANEADO"
        elif cid in allies:
            status = "ALIADO"
        elif cid in enemies:
            status = "RIVAL"
        recs.append({"name": c["name"], "score": round(score, 1), "status": status,
                     "lane": lane, "cfg": c})
    recs.sort(key=lambda r: (r["status"] != "ok", -r["score"]))

    threat = {}
    for c in pool:
        for n, m in c["matchups"].items():
            if m.get("games", 0) >= 500:
                threat[n] = threat.get(n, 0) - m["score"]
    taken_names = {norm(cname(t)) for t in taken}
    ban_sugg = [n for n, t in sorted(threat.items(), key=lambda x: -x[1])
                if t > 0 and norm(n) not in taken_names][:3]

    hover_name = cname(my_hover) if my_hover else None
    focus = next((r for r in recs if hover_name and norm(r["name"]) == norm(hover_name)), None)
    if focus is None:
        focus = next((r for r in recs if r["status"] == "ok"), recs[0] if recs else None)

    return {
        "phase": (session.get("timer") or {}).get("phase", ""),
        "enemies": enemy_list,
        "lane_enemy": lane_enemy,
        "ad": ad, "ap": ap,
        "build_key": build_key,
        "recs": recs,
        "ban_sugg": ban_sugg,
        "focus": focus,
    }


BUILD_LABEL = {"default": "estándar", "vs_ad": "vs equipo AD", "vs_ap": "vs equipo AP"}


def plan_for(f, build_key):
    cfg = f["cfg"]
    m = f["lane"][1] if f["lane"] else {}
    build = cfg["builds"][build_key]
    return {
        "start": m.get("start") or cfg["start"],
        "start_note": None if m.get("start") else cfg.get("start_note"),
        "boots": m.get("boots") or build.get("boots") or cfg["boots"],
        "first": m.get("first"),
        "build": build["items"],
        "runes": cfg["runes"],
        "spells": cfg["spells"],
        "skills": cfg["skills"],
        "tip": m.get("tip"),
        "general": cfg["general"],
        "pro": m.get("pro"),
    }


DIFF = {"easy": ("FÁCIL", "good"), "skill": ("PAREJO", "neutral"), "hard": ("DIFÍCIL", "bad"),
        "xhard": ("MUY DIFÍCIL", "bad")}


def game_sig(v):
    b = v["buy"] or {}
    l = v["lane"] or {}
    return json.dumps([v["me"]["champ"], v["me"]["level"], v["me"]["items"], b.get("items"), b.get("target"),
                       b.get("missing", 0) > 0, b.get("extra"), v["queue"], l.get("champ"), l.get("level"),
                       l.get("items"), l.get("kda"), l.get("dead"), [a for _, a in v["alerts"]],
                       [(t["name"], t["kda"], t["level"]) for t in v["threats"]],
                       (v.get("enemy_adc") or {}).get("items"), (v.get("enemy_adc") or {}).get("level"),
                       [(r["key"], r["value"], r["ok"]) for r in v.get("rules_live", [])]], ensure_ascii=False)


def render_game_text(v):
    L = [f"{int(v['time'] // 60)}:{int(v['time'] % 60):02d} · {v['me']['champ']} nivel {v['me']['level']} · oro {v['gold']}"]
    b = v["buy"]
    if b:
        if b["missing"] == 0:
            L.append("COMPRÁ: " + " + ".join(b["items"]) + f" ({b['cost']})" + (f" + {b['extra']}" if b.get("extra") else ""))
        else:
            L.append(f"Te faltan {b['missing']} para {', '.join(b['items'])}")
        L.append(f"Objetivo: {b['target']} — {ingame.reason_text(b['target'], v)}")
        for nx in b.get("also", []):
            L.append(f"  + avanzás {nx}")
    if v["queue"]:
        L.append("Siguiente: " + " → ".join(v["queue"]))
    if v["lane"]:
        l = v["lane"]
        L.append(f"Rival: {l['champ']} nv {l['level']} {l['kda']} · " + ", ".join(l["items"]))
    for tone, a in v["alerts"]:
        L.append(f"[{tone}] {a}")
    for n, t in v["objectives"]:
        L.append(f"{n}: {'vivo' if t <= 0 else f'{int(t // 60)}:{int(t % 60):02d}'}")
    return "\n".join(L)


def render_text(v, meta=""):
    if v is None:
        return "Esperando champ select..."
    if "gold" in v:
        return render_game_text(v)
    L = [f"Enemigos: {', '.join(e['name'] for e in v['enemies']) or '(nadie pickeó)'}"]
    if v["enemies"]:
        L.append(f"Daño rival: AD {v['ad']:g} / AP {v['ap']:g}")
    if v.get("mode") == "support":
        L.append(f"Tu ADC: {v.get('ally_adc') or '¿?'} · Línea rival: {v['lane_enemy'] or '¿?'} + {v.get('enemy_adc') or '¿?'}")
    else:
        L.append(f"Top rival: {v['lane_enemy'] or '¿? (pick a ciegas)'}")
    if v["ban_sugg"]:
        L.append(f"Ban sugerido: {' > '.join(v['ban_sugg'])}")
    L.append("\nRECOMENDACIÓN")
    for i, r in enumerate(v["recs"], 1):
        mark = "" if r["status"] == "ok" else f"  [{r['status']}]"
        wr = f"  {r['lane'][1]['wr']:.1f}% WR" if r["lane"] else ""
        sy = (f"  {'≈' if r['syn'][1].get('est') else 'sinergia '}{r['syn'][1]['delta']:+.1f} con {r['syn'][0]}"
              + (" (estimado)" if r['syn'][1].get('est') else "")) if r.get("syn") else ""
        L.append(f" {i}. {r['name']}  ({r['score']:+g}){wr}{sy}{mark}")
    f = v["focus"]
    if f:
        p = plan_for(f, v["build_key"])
        L.append(f"\n── {f['name']} ──")
        L.append("Inicio: " + " + ".join(p["start"]))
        L.append("Botas: " + p["boots"])
        if p["first"]:
            L.append("1er ítem vs rival: " + " → ".join(p["first"]))
        L.append(f"Build ({BUILD_LABEL[v['build_key']]}): " + " → ".join(p["build"]))
        r = p["runes"]
        L.append(f"Runas: {r['keystone']} · {', '.join(r['primary'] + r['secondary'])}")
        L.append(f"Hechizos: {' + '.join(p['spells'])} · Skills: {' > '.join(p['skills'])}")
        if p["tip"]:
            L.append("En línea: " + p["tip"])
        if p["pro"]:
            pr = p["pro"]
            extra = [x for x in (pr.get("rush"), pr.get("spell") and "+ " + pr["spell"]) if x]
            L.append(f"Challenger ({DIFF[pr['diff']][0]}): {pr['start']} · {pr['keystone']}"
                     + (" · " + " · ".join(extra) if extra else ""))
            if pr.get("note"):
                L.append("  " + pr["note"])
    if meta:
        L.append(f"\nDatos: {meta}")
    return "\n".join(L)


# ===================================================================== motor
class Engine:
    def __init__(self, demo=False):
        self.lcu = LCU()
        self.dd = DataDragon()
        self.dd.lcu = None if demo else self.lcu
        self.demo = demo
        self.last_game = None   # (momento, vista) de la última lectura buena de la partida
        self.history = history.History(self.lcu, os.path.join(HERE, ".cache"), self._champ_name)
        data = json.load(open(POOL_FILE, encoding="utf-8"))
        self.top_pool = data["pool"]
        self.top_meta = f"{data.get('source', '?')} · parche {data.get('patch', '?')}"
        sp = os.path.join(HERE, "pool_support.json")
        sdata = json.load(open(sp, encoding="utf-8")) if os.path.exists(sp) else {"pool": []}
        self.sup_pool = sdata["pool"]
        self.sup_dyn = sdata.get("dyn", {})
        self.sup_labels = sdata.get("arch_label", {})
        self.sup_adc_arch = sdata.get("adc_arch", {})
        self.sup_meta = f"{sdata.get('source', '?')} · parche {sdata.get('patch', '?')}"
        self.pool = self.top_pool + self.sup_pool          # para íconos y partida
        try:
            cfg = json.load(open(os.path.join(HERE, "settings.json"), encoding="utf-8"))
        except Exception:
            cfg = {}
        self.default_role = cfg.get("rol_por_defecto", "utility")
        self.role = self.default_role
        self.meta = self.sup_meta if self.role == "utility" else self.top_meta
        self.pro_source = data.get("pro_source", "")
        self.champs = {}
        self.view = None
        self.status = ("search", "Buscando el cliente de League")
        self.lock = threading.Lock()
        self.dd_loaded = False
        self.last_view = None
        self.demo_game = False
        self.demo_file = "demo_session.json"
        self.game_prev = {}
        self.game_events = []

    def live_game(self):
        if self.demo_game:
            return json.load(open(os.path.join(HERE, getattr(self, "demo_game_file", "demo_game.json")), encoding="utf-8"))
        try:
            with urllib.request.urlopen(ingame.LIVE_URL, context=self.lcu.ctx, timeout=3) as r:
                data = json.loads(r.read().decode("utf-8"))
            return data if data.get("allPlayers") else None
        except Exception:
            return None

    def game_step(self, g):
        hint = self.last_view["lane_enemy"] if self.last_view else None
        gv = ingame.analyze_game(g, self.pool, self.dd.itemdb, self.dd.dmg_by_name, self.dd.alias,
                                 lane_hint=hint, prev=self.game_prev,
                                 sup=(self.sup_pool, self.sup_dyn))
        if gv is None:
            return None
        hs = self.history.summary
        if hs and hs.get("rules"):
            my_id = g.get("activePlayer", {}).get("riotId") or g.get("activePlayer", {}).get("summonerName")
            gv["rules_live"] = wincons.live(hs["rules"], g,
                                            lambda p: (p.get("riotId") or p.get("summonerName")) == my_id)
        if gv["lane"]:
            self.game_prev = {"lane_name": gv["lane"]["champ"], "lane_items": gv["lane_items_raw"]}
        t = gv["time"]
        for ev in gv["events"]:
            self.game_events.append((t, ev))
        self.game_events = [(et, ev) for et, ev in self.game_events if t - et < 75 and et <= t]
        gv["alerts"] = [ev for _, ev in reversed(self.game_events)] + gv["alerts"]
        gv["alerts"] = gv["alerts"][:6]
        return gv

    def _champ_name(self, cid):
        return (self.champs.get(cid) or self.dd.champs.get(cid) or {}).get("name") or f"#{cid}"

    def select_view(self, session):
        me = next((p for p in session.get("myTeam", []) if p.get("cellId") == session.get("localPlayerCellId")), {})
        pos = me.get("assignedPosition") or ""
        self.role = "utility" if pos == "utility" else "top" if pos == "top" else self.default_role
        if self.role == "utility" and self.sup_pool:
            self.meta = self.sup_meta
            return support.analyze_support(session, self.champs, self.sup_pool, self.sup_dyn, self.sup_labels,
                                           adc_arch=self.sup_adc_arch, personal=self.history.summary)
        self.meta = self.top_meta
        return analyze(session, self.champs, self.top_pool)

    def step(self):
        if not self.dd_loaded:
            self.dd.load()
            self.dd_loaded = True
        g = self.live_game()
        if g:
            gv = self.game_step(g)
            if gv:
                self.last_game = (time.time(), gv)
                return gv, ("ingame", "En partida")
        # El juego a veces tarda en responder: seguimos mostrando la última lectura buena
        # en vez de saltar a la pantalla de champ select y volver (eso era el titileo).
        if self.last_game and time.time() - self.last_game[0] < 20:
            return self.last_game[1], ("ingame", "En partida")
        if self.demo:
            session = json.load(open(os.path.join(HERE, self.demo_file), encoding="utf-8"))
            demo_champs = {int(k): v for k, v in session.pop("_champs").items()}
            if not self.champs:
                self.champs = {**{k: dict(v) for k, v in self.dd.champs.items()}, **demo_champs}
            return self.select_view(session), ("live", "DEMO")
        try:
            if not self.champs:
                self.champs = load_champions(self.lcu, self.dd)
            session = self.lcu.get("/lol-champ-select/v1/session")
        except ConnectionError:
            self.champs = {}
            return None, ("off", "Abrí el cliente de League")
        except Exception as e:
            return None, ("off", f"Error: {e}")
        if not self.demo:
            self.history.refresh_async()
        if not session:
            phase = None
            try:
                phase = self.lcu.get("/lol-gameflow/v1/gameflow-phase")
            except Exception:
                pass
            if phase == "EndOfGame" and self.history.last and time.time() - self.history.last > 60:
                self.history.last = 0          # terminó una partida: actualizar tus stats
            if self.last_view is not None and phase in ("GameStart", "InProgress", "Reconnect", "WaitingForStats", "PreEndOfGame"):
                return self.last_view, ("game", "En partida")
            if phase in ("EndOfGame", "Lobby", "None", None, "Matchmaking", "ReadyCheck"):
                self.last_view = None
            return None, ("idle", "Esperando champ select")
        view = self.select_view(session)
        self.last_view = view
        return view, ("live", "En champ select")

    def run_forever(self):
        while True:
            view, status = self.step()
            with self.lock:
                self.view, self.status = view, status
            time.sleep(POLL_SECONDS)


def run_text(engine):
    last = None
    while True:
        view, status = engine.step()
        out = status[1] + "\n\n" + render_text(view, engine.meta)
        if out != last:
            os.system("cls" if os.name == "nt" else "clear")
            print(out)
            last = out
        time.sleep(POLL_SECONDS)


# ======================================================================= GUI
def run_gui(engine):
    import gui
    gui.run_gui(engine, plan_for, game_sig, render_text)


if __name__ == "__main__":
    eng = Engine(demo="--demo" in sys.argv)
    eng.demo_game = "--demo-partida" in sys.argv or "--demo-partida-support" in sys.argv
    if "--demo-support" in sys.argv:
        eng.demo = True
        eng.demo_file = "demo_session_support.json"
    if "--demo-partida-support" in sys.argv:
        eng.demo_game_file = "demo_game_support.json"
    if "--stats" in sys.argv:
        try:
            eng.dd.load()
            eng.champs = load_champions(eng.lcu, eng.dd)
        except Exception:
            pass
        eng.history.refresh_async(0)
        while eng.history._busy or eng.history.state == "pendiente":
            time.sleep(0.5)
        print(eng.history.state)
        print(history.render_text(eng.history.summary))
    elif "--text" in sys.argv:
        run_text(eng)
    else:
        run_gui(eng)
