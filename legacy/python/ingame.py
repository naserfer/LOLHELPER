"""
Vista en partida: lee la Live Client Data API del juego (https://127.0.0.1:2999),
detecta tu campeón y tu rival, y calcula qué comprar con tu oro actual.
Solo lee datos que el propio juego expone; no automatiza nada.
"""
import re
from collections import Counter

LIVE_URL = "https://127.0.0.1:2999/liveclientdata/allgamedata"

# Ítems que aplican heridas graves (antiheal)
ANTIHEAL = {"Executioner's Calling", "Bramble Vest", "Thornmail", "Mortal Reminder", "Chempunk Chainsword",
            "Oblivion Orb", "Morellonomicon", "Chemtech Putrifier"}
# Campeones con mucha curación propia
HEALERS = {"Aatrox", "Darius", "Vladimir", "Sylas", "Fiora", "Warwick", "Dr. Mundo", "Olaf", "Soraka", "Yuumi",
           "Sona", "Nami", "Swain", "Illaoi", "Briar", "Irelia", "Volibear", "Trundle", "Nasus", "Udyr",
           "Sett", "Gwen", "Kayn", "Senna", "Milio", "Renata Glasc", "Seraphine"}
AUTO_ATTACKERS = {"Master Yi", "Tryndamere", "Jax", "Fiora", "Vayne", "Kog'Maw", "Kai'Sa", "Jinx", "Twitch",
                  "Kalista", "Xayah", "Zeri", "Varus", "Ashe", "Aphelios", "Draven", "Miss Fortune", "Tristana",
                  "Sivir", "Caitlyn", "Lucian", "Samira", "Nilah", "Bel'Veth", "Kindred", "Yasuo", "Yone",
                  "Gwen", "Kayle", "Quinn", "Smolder", "Corki", "Ezreal", "Graves"}
# Notas de definitiva del rival (cuándo cuidarse)
ULT_NOTES = {
    "Darius": "R hace daño verdadero y se resetea: no pelees bajo de vida.",
    "Garen": "R hace más daño cuanto menos vida tenés: alejate bajo el 40%.",
    "Mordekaiser": "R te aísla 1v1 en otra dimensión: no le pelees con la vida baja.",
    "Sett": "R te puede tirar encima de tu equipo; cuidado cerca de su jungla.",
    "Illaoi": "R crea tentáculos en todo el área: salí de la zona apenas la usa.",
    "Fiora": "R marca 4 vitales; si las rompe, se cura todo su equipo.",
    "Camille": "R te encierra en un área: guardá Flash.",
    "Malphite": "R es engage instantáneo: no te agrupes con tu equipo.",
    "Jax": "Su E bloquea autoataques; esperá a que la gaste.",
    "Aatrox": "R le da curación extra y revive al matar: no pelees largo.",
    "Yone": "R atraviesa en línea y te tira para arriba.",
    "Renekton": "R le da vida y daño extra por varios segundos.",
    "Kennen": "R stunea a todos los que quedan cerca: separate.",
    "Teemo": "R: hongos invisibles en el mapa; comprá Oracle Lens.",
    "Sion": "R: carga imparable desde lejos, mirá el minimapa.",
    "Nasus": "R le da vida y reduce tu armadura/resistencia.",
    "Tryndamere": "R lo hace inmortal 5 s: alejate y peleá después.",
    "Kayle": "Nivel 6 y 11 son sus picos; matala antes del 11.",
    "Gwen": "W la hace intocable desde afuera del área: entrá con ella.",
    "Gangplank": "R cubre área en todo el mapa; sus barriles hacen mucho daño.",
}

# Reglas de build en partida por campeón del pool
BUILD_RULES = {
    "Malphite": {
        "boots": {"ad": "Plated Steelcaps", "ap": "Mercury's Treads", "default": "Plated Steelcaps"},
        "options": [
            ("Sunfire Aegis", {"default": 3}),
            ("Thornmail", {"heal": 3, "auto": 2, "ad_heavy": 2}),
            ("Frozen Heart", {"auto": 3, "ad_heavy": 2}),
            ("Randuin's Omen", {"crit": 4, "ad_heavy": 1}),
            ("Kaenic Rookern", {"ap_heavy": 4, "ap_fed": 2}),
            ("Force of Nature", {"ap_heavy": 3}),
            ("Jak'Sho, The Protean", {"default": 1}),
        ],
    },
    "Garen": {
        "boots": {"ad": "Plated Steelcaps", "ap": "Mercury's Treads", "default": "Berserker's Greaves"},
        "options": [
            ("Stridebreaker", {"default": 5}),
            ("Phantom Dancer", {"default": 3}),
            ("Mortal Reminder", {"heal": 4, "tanky": 2}),
            ("Lord Dominik's Regards", {"tanky": 3}),
            ("Sterak's Gage", {"default": 2, "lane_fed": 1}),
            ("Dead Man's Plate", {"ad_heavy": 2, "lane_fed": 1}),
            ("Force of Nature", {"ap_heavy": 3, "ap_fed": 1}),
            ("Randuin's Omen", {"crit": 3}),
        ],
    },
    "Illaoi": {
        "boots": {"ad": "Plated Steelcaps", "ap": "Mercury's Treads", "default": "Plated Steelcaps"},
        "options": [
            ("Black Cleaver", {"default": 5}),
            ("Iceborn Gauntlet", {"default": 3}),
            ("Sterak's Gage", {"default": 2, "lane_fed": 1}),
            ("Chempunk Chainsword", {"heal": 4}),
            ("Death's Dance", {"ad_heavy": 2, "lane_fed": 1}),
            ("Spirit Visage", {"ap_heavy": 2}),
            ("Force of Nature", {"ap_heavy": 3, "ap_fed": 1}),
            ("Randuin's Omen", {"crit": 3}),
        ],
    },
}

HARD_CC = {"Leona", "Nautilus", "Thresh", "Blitzcrank", "Alistar", "Rell", "Rakan", "Morgana", "Lux", "Zyra",
           "Amumu", "Sejuani", "Malphite", "Ashe", "Varus", "Lissandra", "Annie", "Vi", "Jarvan IV", "Maokai",
           "Skarner", "Pantheon", "Braum", "Taric", "Zac", "Ornn", "Galio", "Kennen", "Twisted Fate", "Veigar",
           "Neeko", "Seraphine", "Sona", "Swain", "Warwick", "Xin Zhao", "Poppy", "Vex", "Cassiopeia", "Renekton",
           "Sett", "Rammus", "Nunu & Willump", "Lillia", "Wukong", "Mordekaiser", "Yasuo", "Yone", "Diana"}
SHIELDERS = {"Lulu", "Janna", "Karma", "Milio", "Seraphine", "Sona", "Nami", "Yuumi", "Renata Glasc", "Rakan",
             "Braum", "Taric", "Lux", "Ivern"}
SUPPORT_ITEMS = {"World Atlas", "Runic Compass", "Bounty of Worlds", "Celestial Opposition", "Dream Maker",
                 "Solstice Sleigh", "Zaz'Zak's Realmspike", "Bloodsong"}
SUPPORT_UPGRADED = SUPPORT_ITEMS - {"World Atlas", "Runic Compass"}

SUP_SITU = {
    "engage": [("Thornmail", {"heal": 3, "auto": 2}), ("Frozen Heart", {"auto": 3, "ad_heavy": 1}),
               ("Randuin's Omen", {"crit": 3}), ("Abyssal Mask", {"ap_heavy": 3}), ("Kaenic Rookern", {"ap_fed": 3}),
               ("Redemption", {"default": 1}), ("Mikael's Blessing", {"cc": 2})],
    "enchanter": [("Mikael's Blessing", {"cc": 3}), ("Redemption", {"default": 2}),
                  ("Chemtech Putrifier", {"heal": 3}), ("Staff of Flowing Water", {"ally_ap": 2}),
                  ("Ardent Censer", {"ally_auto": 2}), ("Locket of the Iron Solari", {"ap_fed": 2})],
    "mage": [("Zhonya's Hourglass", {"ad_fed": 3}), ("Banshee's Veil", {"ap_fed": 3}),
             ("Morellonomicon", {"heal": 3}), ("Void Staff", {"tanky": 3}), ("Rabadon's Deathcap", {"default": 1})],
    "fighter": [("Mortal Reminder", {"heal": 3}), ("Serpent's Fang", {"shields": 3}),
                ("Edge of Night", {"ap_fed": 2}), ("Guardian Angel", {"default": 1})],
}
ARCH_GROUP = {"engage": "engage", "warden": "engage", "roamer": "engage", "enchanter": "enchanter",
              "mage": "mage", "marksman": "fighter"}
FIGHTERS = {"Pyke", "Pantheon", "Senna"}


def support_rules(cfg):
    grp = "fighter" if cfg["name"] in FIGHTERS else ARCH_GROUP.get(cfg.get("arch"), "engage")
    core = cfg["builds"]["default"]["items"]
    opts = [(it, {"default": 6 - i}) for i, it in enumerate(core)]
    have = set(core)
    opts += [(it, w) for it, w in SUP_SITU[grp] if it not in have]
    boots = cfg["boots"]
    if grp == "engage":
        b = {"ad": "Plated Steelcaps", "ap": "Mercury's Treads", "default": boots}
    elif grp == "mage":
        b = {"ad": boots, "ap": "Mercury's Treads" if boots != "Sorcerer's Shoes" else boots, "default": boots}
    else:
        b = {"ad": boots, "ap": boots, "default": boots}
    return {"boots": b, "options": opts, "group": grp}


REASON = {
    "heal": "el rival se cura mucho",
    "auto": "pegan con autoataques",
    "ad_heavy": "equipo rival mayormente AD",
    "ap_heavy": "equipo rival con mucho AP",
    "ap_fed": "hay un AP muy fuerte",
    "crit": "tienen ítems de crítico",
    "tanky": "el rival se está armando tanque",
    "lane_fed": "tu rival de línea va adelante",
    "default": "parte de la build",
    "cc": "el rival tiene mucho control duro",
    "ad_fed": "hay un AD muy fuerte",
    "shields": "el rival tiene escudos",
    "ally_ap": "tu equipo tiene mucho daño mágico",
    "ally_auto": "tu ADC pega con autoataques",
}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


class ItemDB:
    """Ítems de Data Dragon: id -> datos, nombre -> id (Grieta del Invocador)."""

    def __init__(self, items_json):
        self.items = {}
        self.by_name = {}
        for sid, it in (items_json or {}).items():
            try:
                iid = int(sid)
            except ValueError:
                continue
            self.items[iid] = it
            on_sr = it.get("maps", {}).get("11", True)
            buyable = it.get("gold", {}).get("purchasable", True)
            key = norm(it.get("name"))
            if on_sr and buyable and iid < 10000:
                if key not in self.by_name or iid < self.by_name[key]:
                    self.by_name[key] = iid
            elif key not in self.by_name:
                self.by_name.setdefault("~" + key, iid)

    def id_of(self, name):
        return self.by_name.get(norm(name)) or self.by_name.get("~" + norm(name))

    def name(self, iid):
        return self.items.get(iid, {}).get("name", f"#{iid}")

    def total(self, iid):
        return self.items.get(iid, {}).get("gold", {}).get("total", 0)

    def base(self, iid):
        return self.items.get(iid, {}).get("gold", {}).get("base", 0)

    def comps(self, iid):
        return [int(x) for x in self.items.get(iid, {}).get("from", [])]

    def tags(self, iid):
        return set(self.items.get(iid, {}).get("tags", []))

    def is_boots(self, iid):
        return "Boots" in self.tags(iid)

    def is_legendary(self, iid):
        it = self.items.get(iid, {})
        return self.total(iid) >= 2200 and not it.get("into") and not self.is_boots(iid)

    def remaining(self, iid, inv):
        """Oro que falta para tener iid, consumiendo componentes del inventario (Counter, se modifica)."""
        if inv[iid] > 0:
            inv[iid] -= 1
            return 0
        comps = self.comps(iid)
        if not comps:
            return self.total(iid)
        return self.base(iid) + sum(self.remaining(c, inv) for c in comps)

    def _parts(self, item, inv):
        """Componentes directos que faltan de item: lista de (oro_que_falta, id)."""
        w = Counter(inv)
        out = []
        for c in self.comps(item):
            r = self.remaining(c, w)
            if r > 0:
                out.append((r, c))
        return out

    def plan_purchase(self, target, inv, gold):
        """Qué comprar ahora para avanzar hacia target. Devuelve (ids, oro_que_falta, costo)."""
        need = self.remaining(target, Counter(inv))
        if need <= gold:
            return [target], 0, need
        frontier = [target]
        for _ in range(3):
            cands = []
            for it in frontier:
                cands += self._parts(it, inv)
            if not cands:
                break
            cands.sort(reverse=True)
            buy, spend = [], 0
            w = Counter(inv)
            for _, c in cands:
                trial = Counter(w)
                r = self.remaining(c, trial)
                if r > 0 and spend + r <= gold:
                    buy.append(c)
                    spend += r
                    w = trial
                    w[c] += 1  # ya lo tendría
                    w[c] -= 1  # (se consume al armar el ítem final)
            if buy:
                return buy, 0, spend
            frontier = [c for _, c in cands]
        cands = self._parts(target, inv)
        deeper = []
        for _, c in cands:
            deeper += self._parts(c, inv)
        pool_ = deeper or cands
        if not pool_:
            return [], max(0, need - gold), need
        r, c = min(pool_)
        return [c], r - gold, r


def player_champ(p, dd_alias):
    raw = p.get("rawChampionName", "")
    m = re.search(r"displayname_(\w+)", raw)
    if m and norm(m.group(1)) in dd_alias:
        return dd_alias[norm(m.group(1))]
    return p.get("championName", "?")


def spell_key(s):
    raw = (s or {}).get("rawDisplayName", "")
    m = re.search(r"SummonerSpell_(Summoner[A-Za-z0-9]+)_", raw)
    return m.group(1) if m else (s or {}).get("displayName", "")


def analyze_game(g, pool, db, champ_dmg, dd_alias, lane_hint=None, prev=None, sup=None):
    prev = prev or {}
    ap_ = g.get("activePlayer", {})
    players = g.get("allPlayers", [])
    my_id = ap_.get("riotId") or ap_.get("summonerName")
    me = next((p for p in players if (p.get("riotId") or p.get("summonerName")) == my_id), None)
    if me is None and players:
        me = next((p for p in players if p.get("summonerName") == ap_.get("summonerName")), players[0])
    if me is None:
        return None
    my_team = me.get("team")
    my_champ = player_champ(me, dd_alias)
    enemies = [p for p in players if p.get("team") != my_team]
    gold = int(ap_.get("currentGold", 0))
    gtime = g.get("gameData", {}).get("gameTime", 0)

    def items_of(p):
        return [it["itemID"] for it in p.get("items", []) if it.get("itemID")]

    def item_value(p):
        return sum(db.total(i) for i in items_of(p))

    # rival de línea
    lane = None
    pos = me.get("position", "")
    if pos:
        lane = next((e for e in enemies if e.get("position") == pos), None)
    if lane is None and lane_hint:
        lane = next((e for e in enemies if norm(player_champ(e, dd_alias)) == norm(lane_hint)), None)
    if lane is None:
        tops = {}
        for c in pool:
            for n, m in c["matchups"].items():
                tops[norm(n)] = max(tops.get(norm(n), 0), m.get("games", 0))
        cand = sorted(enemies, key=lambda e: -tops.get(norm(player_champ(e, dd_alias)), 0))
        lane = cand[0] if cand and tops.get(norm(player_champ(cand[0], dd_alias)), 0) >= 300 else None

    # perfil del equipo enemigo
    ad = ap = 0.0
    heal_src, crit_src, auto_src, ap_fed, tank_items = [], [], [], [], 0
    threats = []
    for e in enemies:
        name = player_champ(e, dd_alias)
        sc = e.get("scores", {})
        val = item_value(e) + 300 * sc.get("kills", 0) + 300 + 100 * e.get("level", 1)
        dmg = champ_dmg.get(norm(name), "AD")
        ad_items = sum(db.total(i) for i in items_of(e) if db.tags(i) & {"Damage", "CriticalStrike", "AttackSpeed", "ArmorPenetration"})
        ap_items = sum(db.total(i) for i in items_of(e) if db.tags(i) & {"SpellDamage", "MagicPenetration"})
        if ad_items + ap_items > 0:
            share_ap = ap_items / (ad_items + ap_items)
        else:
            share_ap = {"AP": 1.0, "MIX": 0.5}.get(dmg, 0.0)
        ad += val * (1 - share_ap)
        ap += val * share_ap
        if name in HEALERS or any(db.tags(i) & {"LifeSteal", "SpellVamp"} for i in items_of(e)):
            heal_src.append(name)
        if any("CriticalStrike" in db.tags(i) for i in items_of(e)):
            crit_src.append(name)
        if name in AUTO_ATTACKERS:
            auto_src.append(name)
        if share_ap >= 0.6 and sc.get("kills", 0) >= 4:
            ap_fed.append(name)
        tank_items += sum(1 for i in items_of(e) if db.tags(i) & {"Armor", "SpellBlock"} and db.is_legendary(i))
        threats.append({"name": name, "value": val, "kda": f"{sc.get('kills', 0)}/{sc.get('deaths', 0)}/{sc.get('assists', 0)}",
                        "dmg": "AP" if share_ap >= 0.6 else "AD" if share_ap <= 0.4 else "MIX",
                        "level": e.get("level", 1), "dead": e.get("isDead", False),
                        "respawn": e.get("respawnTimer", 0)})
    total = ad + ap or 1
    ap_share = ap / total
    threats.sort(key=lambda t: -t["value"])

    lane_name = player_champ(lane, dd_alias) if lane else None
    lane_fed = bool(lane and (lane.get("scores", {}).get("kills", 0) >= 3 or lane.get("level", 1) - me.get("level", 1) >= 2
                              or item_value(lane) - item_value(me) >= 1500))
    cond = {
        "default": True,
        "heal": len(heal_src) >= 2 or (lane_name in heal_src),
        "auto": len(auto_src) >= 2,
        "ad_heavy": ap_share <= 0.4,
        "ap_heavy": ap_share >= 0.55,
        "ap_fed": bool(ap_fed),
        "crit": bool(crit_src),
        "tanky": tank_items >= 3,
        "lane_fed": lane_fed,
    }
    allies = [p for p in players if p.get("team") == my_team and p is not me]
    enemy_names = [player_champ(e, dd_alias) for e in enemies]
    cc_src = [n for n in enemy_names if n in HARD_CC]
    ad_fed = [t["name"] for t in threats if t["dmg"] != "AP" and int(t["kda"].split("/")[0]) >= 4]
    ally_adc = next((a for a in allies if a.get("position") == "BOTTOM"), None)
    ally_adc_name = player_champ(ally_adc, dd_alias) if ally_adc else None
    ally_ap = sum(1 for a in allies if champ_dmg.get(norm(player_champ(a, dd_alias))) == "AP")
    enemy_sup = next((e for e in enemies if e.get("position") == "UTILITY"), None)
    enemy_sup_name = player_champ(enemy_sup, dd_alias) if enemy_sup else None
    cond.update({
        "cc": len(cc_src) >= 3,
        "ad_fed": bool(ad_fed),
        "shields": any(n in SHIELDERS for n in enemy_names),
        "ally_ap": ally_ap >= 2,
        "ally_auto": bool(ally_adc_name and ally_adc_name in AUTO_ATTACKERS),
    })
    cond_src = {"heal": heal_src, "auto": auto_src, "crit": crit_src, "ap_fed": ap_fed, "cc": cc_src,
                "ad_fed": ad_fed, "shields": [n for n in enemy_names if n in SHIELDERS],
                "ally_auto": [ally_adc_name] if ally_adc_name else []}

    # build recomendada
    rules = BUILD_RULES.get(my_champ)
    sup_cfg = None
    if rules is None and sup:
        sup_cfg = next((c for c in sup[0] if c["name"] == my_champ), None)
        if sup_cfg:
            rules = support_rules(sup_cfg)
    my_items = items_of(me)
    inv = Counter(my_items)
    buy = None
    queue = []
    reasons = {}
    lane_mu = None
    if rules:
        scored = []
        for i, (item, w) in enumerate(rules["options"]):
            s = sum(v for k, v in w.items() if cond.get(k))
            why = [k for k in w if k != "default" and cond.get(k)]
            scored.append((-s, i, item, why))
        scored.sort()
        order = [it for _, _, it, _ in scored]
        for _, _, it, why in scored:
            reasons[it] = why
        cfg = next((c for c in pool if c["name"] == my_champ), None)
        if cfg and lane_name and not sup_cfg:
            lane_mu = next((m for n, m in cfg["matchups"].items() if norm(n) == norm(lane_name)), None)
        if lane_mu and lane_mu.get("first"):
            f = lane_mu["first"][0]
            if f in order:
                order.remove(f)
            order.insert(0, f)
            reasons.setdefault(f, [])
            reasons[f] = ["vs_lane"] + reasons[f]
        b = rules["boots"]
        lane_dmg = champ_dmg.get(norm(lane_name), "AD") if lane_name else "AD"
        if cond["ap_heavy"] or (lane_dmg == "AP" and ap_share >= 0.45):
            boots = b["ap"]
        elif cond["ad_heavy"] or lane_dmg == "AD":
            boots = b["ad"] if my_champ != "Garen" or lane_fed or cond["auto"] else b["default"]
        else:
            boots = b["default"]
        if lane_mu and lane_mu.get("boots") and not cond["ap_heavy"]:
            boots = lane_mu["boots"]
        order.insert(1, boots)
        reasons[boots] = ["boots"]

        # quitar lo que ya tengo (ítems completos o botas mejoradas)
        have_names = {norm(db.name(i)) for i in my_items}
        has_t2_boots = any(db.is_boots(i) and db.total(i) > 300 for i in my_items)
        for it in order:
            if norm(it) in have_names:
                continue
            if it == boots and has_t2_boots:
                continue
            if db.id_of(it) is None:
                continue
            queue.append(it)
        if sup_cfg and not any(db.name(i) in SUPPORT_ITEMS for i in my_items) and db.id_of("World Atlas"):
            queue.insert(0, "World Atlas")
            reasons["World Atlas"] = ["sup_item"]
        queue = queue[:4]
        if queue:
            tid = db.id_of(queue[0])
            ids, missing, cost = db.plan_purchase(tid, inv, gold)
            buy = {"target": queue[0], "items": [db.name(i) for i in ids], "missing": missing,
                   "cost": cost, "complete": ids == [tid] and missing == 0, "also": []}
            # si completa el primero y sobra oro, seguir con los siguientes de la lista
            if buy["complete"]:
                inv2 = Counter(inv)
                db.remaining(tid, inv2)
                inv2[tid] += 1
                gold2 = gold - cost
                for nxt in queue[1:3]:
                    nid = db.id_of(nxt)
                    if nid is None or gold2 < 300:
                        break
                    ids2, miss2, cost2 = db.plan_purchase(nid, inv2, gold2)
                    if miss2 or not ids2:
                        break
                    buy["items"] += [db.name(i) for i in ids2]
                    buy["also"].append(nxt)
                    buy["cost"] += cost2
                    gold2 -= cost2
                    if ids2 == [nid]:
                        db.remaining(nid, inv2)
                        inv2[nid] += 1
                    else:
                        for i in ids2:
                            inv2[i] += 1
                        break
            cost = buy["cost"]
            left = gold - (cost if missing == 0 else 0)
            if missing == 0 and left >= 75 and not any(norm(db.name(i)) == "controlward" for i in my_items) \
                    and db.id_of("Control Ward"):
                buy["extra"] = "Control Ward"

    # alertas
    alerts = []
    events = []
    if lane:
        dl = lane.get("level", 1) - me.get("level", 1)
        if lane.get("level", 1) >= 6 and me.get("level", 1) < 6:
            alerts.append(("bad", f"{lane_name} ya tiene la R y vos no: no pelees hasta tu 6."))
        elif dl >= 2:
            alerts.append(("bad", f"{lane_name} te saca {dl} niveles: jugá seguro y farmeá bajo torre."))
        elif dl <= -2:
            alerts.append(("good", f"Le sacás {-dl} niveles a {lane_name}: es tu momento de presionar."))
        prev_items = set(prev.get("lane_items", []))
        for i in items_of(lane):
            if db.is_legendary(i) and i not in prev_items and prev.get("lane_name") == lane_name:
                events.append(("bad", f"{lane_name} completó {db.name(i)}: respetá su pico de poder."))
        if any(db.name(i) in ANTIHEAL for i in items_of(lane)) and my_champ in ("Illaoi",):
            alerts.append(("neutral", f"{lane_name} compró antiheal: tus curaciones rinden menos."))
        if lane.get("isDead"):
            alerts.append(("good", f"{lane_name} está muerto: pusheá la wave o volvé a base."))
    if sup_cfg:
        names_inv = {db.name(i) for i in my_items}
        if names_inv & SUPPORT_UPGRADED and "Stealth Ward" in names_inv:
            alerts.append(("neutral", "Tu ítem de support ya mejoró: cambiá el trinket a Oracle Lens y limpiá wards."))
        if not any(db.name(i) == "Control Ward" for i in my_items) and gtime > 180:
            alerts.append(("neutral", "No tenés Control Ward: comprá uno en la próxima vuelta."))
    for t in threats[:2]:
        k, d, _ = t["kda"].split("/")
        if int(k) >= 5 and int(k) - int(d) >= 3:
            alerts.append(("bad", f"{t['name']} va {t['kda']}: es la amenaza principal."))
    if buy and buy.get("complete"):
        alerts.append(("good", f"Tenés oro para completar {buy['target']}: volvé a base cuando pushees."))

    # objetivos (aprox., reglas estándar de la Grieta)
    dragon_next, baron_next = 300.0, 1200.0
    for ev in g.get("events", {}).get("Events", []):
        if ev.get("EventName") == "DragonKill":
            dragon_next = ev.get("EventTime", 0) + 300
        elif ev.get("EventName") == "BaronKill":
            baron_next = ev.get("EventTime", 0) + 360
    objectives = [("Dragón", dragon_next - gtime), ("Barón", baron_next - gtime)]

    return {
        "time": gtime,
        "gold": gold,
        "me": {"champ": my_champ, "level": me.get("level", 1), "items": [db.name(i) for i in my_items],
               "cs": me.get("scores", {}).get("creepScore", 0), "kda": "{kills}/{deaths}/{assists}".format(
                   **{k: me.get("scores", {}).get(k, 0) for k in ("kills", "deaths", "assists")})},
        "in_pool": rules is not None,
        "lane": None if not lane else {
            "champ": lane_name, "level": lane.get("level", 1),
            "items": [db.name(i) for i in items_of(lane) if db.name(i) not in ("Stealth Ward", "Oracle Lens", "Farsight Alteration")],
            "spells": [spell_key(lane.get("summonerSpells", {}).get(k)) for k in ("summonerSpellOne", "summonerSpellTwo")],
            "kda": "{kills}/{deaths}/{assists}".format(**{k: lane.get("scores", {}).get(k, 0) for k in ("kills", "deaths", "assists")}),
            "cs": lane.get("scores", {}).get("creepScore", 0),
            "dead": lane.get("isDead", False),
            "ult": ULT_NOTES.get(lane_name),
            "item_ids": items_of(lane),
        },
        "buy": buy,
        "guide": (__import__("support").support_guide(sup_cfg, enemy_sup_name or lane_name,
                                                        {norm(c["name"]): c for c in sup[0]}, sup[1])
                  if sup_cfg else ((lane_mu or {}).get("guide") if rules else None)),
        "support_mode": bool(sup_cfg),
        "ally_adc": ally_adc_name,
        "enemy_adc": None if not sup_cfg else next(({"champ": player_champ(e, dd_alias), "level": e.get("level", 1),
                                                     "items": [db.name(i) for i in items_of(e) if db.name(i) not in ("Stealth Ward", "Oracle Lens", "Farsight Alteration")],
                                                     "kda": "{kills}/{deaths}/{assists}".format(**{k: e.get("scores", {}).get(k, 0) for k in ("kills", "deaths", "assists")})}
                                                    for e in enemies if e.get("position") == "BOTTOM"), None),
        "queue": queue,
        "reasons": {k: v for k, v in reasons.items()},
        "cond_src": cond_src,
        "ap_share": ap_share,
        "threats": threats[:5],
        "alerts": alerts[:5],
        "events": events,
        "lane_items_raw": items_of(lane) if lane else [],
        "objectives": objectives,
    }


def reason_text(item, view):
    why = view["reasons"].get(item, [])
    parts = []
    for k in why:
        if k == "vs_lane":
            if view["lane"]:
                parts.append(f"rush recomendado contra {view['lane']['champ']}")
        elif k == "boots":
            parts.append("botas según el daño rival")
        elif k == "sup_item":
            parts.append("ítem de support (te da oro y wards)")
        else:
            src = view["cond_src"].get(k)
            txt = REASON.get(k, k)
            if src:
                txt += f" ({', '.join(src[:3])})"
            parts.append(txt)
    return "; ".join(parts) or "parte de la build"
