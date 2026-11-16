# Corre la versión Python sobre fixtures y guarda resultados para comparar con la versión JS.
import sys, json, random, copy
import os; _R = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, os.path.join(_R, "..", "..", "legacy", "python")); sys.path.insert(0, "/home/claude/testkit")
import overlay, support, ingame, history, wincons
from collections import Counter
OUT = {}
items = json.load(open("/home/claude/testkit/items.json"))
db = ingame.ItemDB(items)
D = "/home/claude/lol_overlay/"
pool_top = json.load(open(D+"pool.json"))["pool"]; sp = json.load(open(D+"pool_support.json"))
alias = {}; dmg = {}
for n, d in [("Malphite","AP"),("Darius","AD"),("Master Yi","AD"),("Seraphine","AP"),("Miss Fortune","AD"),("Kai'Sa","MIX"),
             ("Lee Sin","AD"),("Ahri","AP"),("Jinx","AD"),("Leona","AD"),("Garen","AD"),("Illaoi","AD"),("Rell","AD"),("Orianna","AP"),("Thresh","AD")]:
    alias[overlay.norm(n)] = n; dmg[overlay.norm(n)] = d

def sel_cases():
    cases = []
    for f in ("demo_session.json", "demo_session_support.json"):
        s = json.load(open(D+f)); cases.append((f, s))
    # variantes de support: cambiar ADC aliado y support rival
    s = json.load(open(D+"demo_session_support.json"))
    rnd = random.Random(5)
    champs = {int(k): v for k, v in s["_champs"].items()}
    extra = {96: "Kog'Maw", 432: "Bard", 412: "Thresh", 117: "Lulu", 81: "Ezreal", 51: "Caitlyn", 111: "Nautilus", 25: "Morgana"}
    for k, v in extra.items(): champs[k] = {"name": v, "dmg": "AD"}
    for i in range(12):
        t = copy.deepcopy(s); t["_champs"] = {str(k): v for k, v in champs.items()}
        for p in t["myTeam"]:
            if p.get("assignedPosition") == "bottom": p["championId"] = rnd.choice([96, 81, 51, 0]); p["championPickIntent"] = rnd.choice([96, 81])
        for p in t["theirTeam"]:
            if p.get("assignedPosition") == "utility" or i % 3 == 0: p["championId"] = rnd.choice([432, 412, 111, 25, 0])
        if i % 4 == 0:
            for p in t["myTeam"] + t["theirTeam"]: p["assignedPosition"] = ""
        cases.append((f"sup_var_{i}", t))
    return cases

personal = {"by_champ": {"thresh": {"g": 5, "w": 4}, "leona": {"g": 4, "w": 1}}, "pairs": {"Thresh|Kog'Maw": {"g": 3, "w": 2}},
            "with_adc_map": {"Kog'Maw": {"g": 6, "w": 4}}}
OUT["select"] = []
for name, s in sel_cases():
    s = copy.deepcopy(s); champs = {int(k): v for k, v in s.pop("_champs").items()}
    me = next((p for p in s["myTeam"] if p["cellId"] == s["localPlayerCellId"]), {})
    if me.get("assignedPosition") == "top" or name == "demo_session.json":
        v = overlay.analyze(s, champs, pool_top)
    else:
        v = support.analyze_support(s, champs, sp["pool"], sp["dyn"], sp["arch_label"], adc_arch=sp.get("adc_arch"),
                                    personal=personal if "var" in name else None)
    OUT["select"].append({"name": name, "session": s, "champs": {str(k): v_ for k, v_ in champs.items()},
        "personal": personal if "var" in name else None, "mode": v.get("mode", "top"),
        "out": {"lane_enemy": v["lane_enemy"], "ban_sugg": v["ban_sugg"], "ally_adc": v.get("ally_adc"), "enemy_adc": v.get("enemy_adc"),
                "recs": [[r["name"], r["score"], r["status"], (r.get("syn") or [None])[0]] for r in v["recs"]],
                "focus": v["focus"]["name"] if v["focus"] else None,
                "guide": v["focus"].get("guide") if v["focus"] else None, "build_key": v["build_key"]}})

# ingame fuzz
OUT["game"] = []
rnd = random.Random(11)
ids = [int(k) for k in items]
for base in ("demo_game.json", "demo_game_support.json"):
    g0 = json.load(open(D+base))
    for i in range(40):
        g = copy.deepcopy(g0)
        g["activePlayer"]["currentGold"] = rnd.randint(0, 4500)
        for p in g["allPlayers"]:
            if rnd.random() < 0.6:
                p["items"] = [{"itemID": rnd.choice(ids)} for _ in range(rnd.randint(0, 5))]
            p["level"] = rnd.randint(1, 14)
            p["scores"]["kills"] = rnd.randint(0, 9)
        g["gameData"]["gameTime"] = rnd.randint(100, 1800)
        v = ingame.analyze_game(g, pool_top + sp["pool"], db, dmg, alias, lane_hint=None, prev={}, sup=(sp["pool"], sp["dyn"]))
        OUT["game"].append({"g": g, "out": None if v is None else {
            "buy": v["buy"], "queue": v["queue"], "alerts": v["alerts"], "lane": (v["lane"] or {}).get("champ"),
            "threats": [t["name"] for t in v["threats"]], "ap_share": round(v["ap_share"], 6),
            "guide": v["guide"], "enemy_adc": v["enemy_adc"], "reasons_target": ingame.reason_text(v["buy"]["target"], v) if v["buy"] else None}})

# itemdb plan fuzz
OUT["plan"] = []
legend = [i for i in ids if db.total(i) >= 1000]
for i in range(300):
    t = rnd.choice(legend); inv = [rnd.choice(ids) for _ in range(rnd.randint(0, 4))]; gold = rnd.randint(0, 3500)
    ids_, miss, cost = db.plan_purchase(t, Counter(inv), gold)
    OUT["plan"].append({"t": t, "inv": inv, "gold": gold, "out": [ids_, miss, cost]})

# history summarize (sin reglas: el azar de la permutación es distinto)
import fake_hist
games = sorted(fake_hist.realistic(seed=8), key=lambda g: -g["gameCreation"])
s = history.summarize(games, "me-puuid", lambda c: fake_hist.CH.get(c, "?"))
OUT["history"] = {"games": games, "CH": {str(k): v for k, v in fake_hist.CH.items()},
    "out": {k: s[k] for k in ("games", "wins", "mates", "champs", "with_adc", "pairs", "roles")},
    "rules": [(r["key"], r["dir"], r["t"], round(r["gap"], 3), r["conf"]) for r in s["rules"]]}
json.dump(OUT, open("/home/claude/pickhelper/test/golden/py_out.json", "w"))
print("ok", len(OUT["select"]), len(OUT["game"]), len(OUT["plan"]))
