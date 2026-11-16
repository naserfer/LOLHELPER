"""Tu historial: lee tus últimas partidas desde el cliente de League (local, sin API key).

Usa la API del propio cliente (LCU):
  /lol-summoner/v1/current-summoner                      -> tu puuid
  /lol-match-history/v1/products/lol/current-summoner/matches?begIndex=&endIndex=
  /lol-match-history/v1/games/{gameId}                   -> la partida con los 10 jugadores
Las partidas se guardan en .cache/ para no volver a pedirlas.
"""
import json
import os
import re
import threading
import time
from collections import defaultdict

import wincons

SR_QUEUES = {400: "Normal", 420: "SoloQ", 430: "Normal", 440: "Flex", 480: "Swiftplay", 490: "Quickplay"}
MAX_GAMES = 100
PAGE = 20


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


SUPPORT_ITEMS = {3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877}
SMITE = 11


def _role(p, champ_name=None, adcs=()):
    st = p.get("stats") or {}
    if any(st.get(f"item{i}") in SUPPORT_ITEMS for i in range(7)):
        return "support"                       # ítem de support: lo más fiable
    if SMITE in (p.get("spell1Id"), p.get("spell2Id")):
        return "jungle"
    tl = p.get("timeline") or {}
    lane, role = (tl.get("lane") or "").upper(), (tl.get("role") or "").upper()
    if lane == "BOTTOM" or lane == "BOT":
        return "support" if "SUPPORT" in role else "adc"
    return {"TOP": "top", "JUNGLE": "jungle", "MIDDLE": "mid", "MID": "mid"}.get(lane, "")


def _adcs():
    try:
        from support import ADCS
        return ADCS
    except Exception:
        return set()


def summarize(games, puuid, champ_name):
    """games: lista de partidas completas (formato LCU). Devuelve el resumen que muestra el overlay."""
    tot = {"g": 0, "w": 0}
    mates = defaultdict(lambda: {"g": 0, "w": 0, "name": ""})
    champs = defaultdict(lambda: {"g": 0, "w": 0, "k": 0, "d": 0, "a": 0})
    with_adc = defaultdict(lambda: {"g": 0, "w": 0})          # yo support, mi ADC
    pair = defaultdict(lambda: {"g": 0, "w": 0})              # (mi support, ADC aliado)
    roles = defaultdict(int)
    feats = []                                                # una fila por partida, para wincons
    for gm in games:
        if gm.get("queueId") not in SR_QUEUES or (gm.get("gameDuration") or 0) < 300:
            continue                                          # solo Grieta, sin remakes
        ids = {pi["participantId"]: pi.get("player", {}) for pi in gm.get("participantIdentities", [])}
        me_id = next((i for i, pl in ids.items() if pl.get("puuid") == puuid), None)
        parts = {p["participantId"]: p for p in gm.get("participants", [])}
        me = parts.get(me_id)
        if not me:
            continue
        win = bool(me.get("stats", {}).get("win"))
        tot["g"] += 1
        tot["w"] += win
        my_champ = champ_name(me.get("championId"))
        s = me.get("stats", {})
        c = champs[my_champ]
        c["g"] += 1; c["w"] += win
        c["k"] += s.get("kills", 0); c["d"] += s.get("deaths", 0); c["a"] += s.get("assists", 0)
        my_role = _role(me)
        adcs = _adcs()
        roles[my_role or "?"] += 1
        allies = [p for pid, p in parts.items() if p.get("teamId") == me.get("teamId") and pid != me_id]
        feats.append({"win": win, "role": my_role, "champ": my_champ, "id": gm.get("gameId"),
                      "f": wincons.features(me, allies + [me], (gm.get("gameDuration") or 0) / 60)})
        for p in allies:
            pl = ids.get(p["participantId"], {})
            key = pl.get("puuid") or pl.get("summonerName")
            if not key:
                continue
            m = mates[key]
            m["g"] += 1; m["w"] += win
            name = pl.get("gameName") or pl.get("summonerName") or "?"
            m["name"] = f"{name}#{pl['tagLine']}" if pl.get("tagLine") else name
        if my_role == "support":
            adc = next((p for p in allies if _role(p) == "adc"), None) or \
                next((p for p in allies if champ_name(p.get("championId")) in adcs and _role(p) != "jungle"), None)
            if adc:
                an = champ_name(adc.get("championId"))
                with_adc[an]["g"] += 1; with_adc[an]["w"] += win
                pr = pair[f"{my_champ}|{an}"]
                pr["g"] += 1; pr["w"] += win

    def rows(d, min_g=1):
        out = [dict(v, key=k) for k, v in d.items() if v["g"] >= min_g]
        return sorted(out, key=lambda r: (-r["g"], -r["w"]))

    # Reglas: con tus partidas del rol que más jugás (si alcanzan), si no con todas.
    main_role = max(roles, key=roles.get) if roles else ""
    same = [r for r in feats if r["role"] == main_role]
    base = same if len(same) >= 2 * wincons.MIN_SIDE + 6 else feats
    rules = wincons.learn(base)
    last = wincons.review(rules, feats[0]) if feats and rules else None
    return {
        "rules": rules, "rules_n": len(base), "rules_role": main_role if base is same else "todos",
        "last_review": last,
        "games": tot["g"], "wins": tot["w"],
        "mates": [m for m in rows(mates, 2)][:8],
        "champs": rows(champs)[:8],
        "with_adc": rows(with_adc)[:8],
        "pairs": {k: v for k, v in pair.items()},
        "by_champ": {norm(k): v for k, v in champs.items()},
        "with_adc_map": {k: dict(v) for k, v in with_adc.items()},
        "roles": dict(roles),
    }


class History:
    def __init__(self, lcu, cache_dir, champ_name):
        self.lcu = lcu
        self.cache_dir = cache_dir
        self.champ_name = champ_name     # id -> nombre
        self.summary = None
        self.version = 0
        self.state = "pendiente"
        self.last = 0
        self._busy = False

    def refresh_async(self, min_interval=600):
        if self._busy or time.time() - self.last < min_interval:
            return
        self._busy = True
        threading.Thread(target=self._run, daemon=True).start()

    def _run(self):
        try:
            self.state = "cargando"
            me = self.lcu.get("/lol-summoner/v1/current-summoner") or {}
            puuid = me.get("puuid")
            if not puuid:
                self.state = "sin cuenta"
                return
            os.makedirs(self.cache_dir, exist_ok=True)
            path = os.path.join(self.cache_dir, f"history_{puuid[:12]}.json")
            try:
                cache = json.load(open(path, encoding="utf-8"))
            except Exception:
                cache = {}
            ids = []
            for beg in range(0, MAX_GAMES, PAGE):
                res = self.lcu.get("/lol-match-history/v1/products/lol/current-summoner/matches"
                                   f"?begIndex={beg}&endIndex={beg + PAGE - 1}") or {}
                lst = (res.get("games") or {}).get("games") or []
                new = [g["gameId"] for g in lst if g.get("gameId") and g["gameId"] not in ids]
                if not new:
                    break
                ids += new
            for gid in ids:
                if str(gid) in cache:
                    continue
                g = self.lcu.get(f"/lol-match-history/v1/games/{gid}")
                if g:
                    cache[str(gid)] = g
                    time.sleep(0.05)
            keep = {str(i) for i in ids}
            cache = {k: v for k, v in cache.items() if k in keep} or cache
            json.dump(cache, open(path, "w", encoding="utf-8"))
            games = sorted(cache.values(), key=lambda g: -(g.get("gameCreation") or 0))
            self.summary = summarize(games, puuid, self.champ_name)
            self.state = "ok"
            self.version += 1
        except Exception as e:
            self.state = f"error: {e}"
        finally:
            self.last = time.time()
            self._busy = False


def wr(r):
    return 100.0 * r["w"] / r["g"] if r["g"] else 0.0


def render_text(s):
    if not s:
        return "Historial: todavía cargando."
    L = [f"Tus últimas {s['games']} partidas en la Grieta: {s['wins']}-{s['games'] - s['wins']} ({wr({'g': s['games'], 'w': s['wins']}):.0f}%)"]
    if s["mates"]:
        L.append("Con quién más jugaste:")
        for m in s["mates"]:
            L.append(f"  {m['name']}: {m['g']} partidas, {m['w']}-{m['g'] - m['w']} ({wr(m):.0f}%)")
    if s["champs"]:
        L.append("Tus campeones:")
        for c in s["champs"]:
            kda = (c["k"] + c["a"]) / max(1, c["d"])
            L.append(f"  {c['key']}: {c['g']} partidas, {wr(c):.0f}% · KDA {kda:.1f}")
    if s.get("rules"):
        L.append(f"Tus condiciones de victoria ({s['rules_n']} partidas, {s['rules_role']}):")
        for r in s["rules"]:
            L.append(f"  {wincons.rule_text(r)}: ganás {wincons.wr_of(r['ok']):.0f}% "
                     f"({r['ok'][1]} partidas) vs {wincons.wr_of(r['no']):.0f}% si no · "
                     + ("PISTA, todavía sin confirmar" if r["conf"] == "pista" else f"confianza {r['conf']}"))
    lr = s.get("last_review")
    if lr:
        L.append(f"Última partida ({'victoria' if lr['win'] else 'derrota'} con {lr['champ']}): cumpliste {lr['met']}/{lr['total']}")
        for i in lr["items"]:
            L.append(f"  {'✓' if i['ok'] else '✗'} {i['rule']} — hiciste {i['value']}")
        if lr["key_miss"]:
            L.append(f"  Lo que más te costó: {lr['key_miss']['rule']}")
    if s["with_adc"]:
        L.append("De support, con cada ADC:")
        for a in s["with_adc"]:
            L.append(f"  {a['key']}: {a['w']}-{a['g'] - a['w']}")
    return "\n".join(L)
