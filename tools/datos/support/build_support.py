import json, re
import os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data")
os.chdir(os.path.dirname(os.path.abspath(__file__)))
from sup_knowledge import ARCH, PLAN, THREAT
TIER = {  # op.gg support tier list 16.22 (WR, pick%)
 "Thresh": (51.11, 13.84), "Leona": (51.65, 8.63), "Nami": (51.03, 9.04), "Blitzcrank": (51.19, 7.38),
 "Lulu": (49.85, 13.11), "Alistar": (51.30, 6.82), "Senna": (51.62, 5.71), "Braum": (51.73, 5.12),
 "Seraphine": (50.81, 7.16), "Rell": (51.86, 4.06), "Rakan": (51.28, 4.92), "Nautilus": (49.31, 11.81),
 "Janna": (51.36, 4.50), "Zilean": (51.89, 2.79), "Soraka": (50.87, 4.47), "Milio": (50.06, 6.44),
 "Sona": (51.61, 2.93), "Vel'Koz": (50.94, 3.29), "Pyke": (49.28, 5.69), "Zyra": (50.80, 2.52),
 "Karma": (48.57, 7.83), "Morgana": (49.63, 3.99), "Lux": (48.82, 6.22), "Bard": (49.08, 4.14),
 "Renata Glasc": (49.95, 2.24), "Tahm Kench": (49.82, 2.14), "Yuumi": (47.85, 5.64), "Xerath": (48.53, 2.70),
 "Swain": (48.32, 2.87), "Brand": (48.84, 2.14), "Pantheon": (47.50, 3.24),
}
txt = open("all.txt").read()
C, S, cur = {}, {}, None
for line in txt.splitlines():
    if line.startswith("##"):
        kind, name = line[2], line[4:].strip()
        cur = (C if kind == "C" else S).setdefault(name, {})
        continue
    if "|" in line:
        n, wr, g = line.split("|")
        cur[n.strip()] = (float(wr.replace("%", "")), int(g.replace(",", "")))
# Lado ADC (op.gg /synergies/adc, 16.22): los 10 supports más jugados con cada ADC.
# Completa los pares que la página del support no lista (solo muestra su top 10).
adc = None
for line in open("adc_side.txt").read().splitlines():
    if line.startswith("#"):
        adc = line[1:].strip(); continue
    n, wr, g = line.split("|"); wr, g = float(wr), int(g)
    row = S.setdefault(n.strip(), {})
    if adc not in row or row[adc][1] < g:
        row[adc] = (wr, g)
B, cur = {}, None
for line in open("builds.txt").read().splitlines():
    if line.startswith("#"):
        cur = B.setdefault(line[1:].strip(), {}); continue
    k, v = line.split(":", 1); cur[k.strip()] = v.strip()

def score(wr, g, base=50.0):
    s = (wr - base) / 2.5
    if g < 300: s *= g / 300
    return round(max(-3, min(3, s)), 2)

# fuerza propia de cada ADC: promedio ponderado de (WR con el support - promedio del support)
from collections import defaultdict
acc = defaultdict(lambda: [0.0, 0])
for sup, rows in S.items():
    if sup not in TIER: continue
    for adc, (wr, g) in rows.items():
        acc[adc][0] += (wr - TIER[sup][0]) * g; acc[adc][1] += g
ADC_EFF = {a: v[0] / v[1] for a, v in acc.items() if v[1]}

SHARDS = {"Adaptive Force", "Health Scaling", "Ability Haste", "Attack Speed"}
BOOT_FIX = {"Ionian Boots of Lucidity": "Ionian Boots of Lucidity"}
pool = []
for name, (avg, pick) in TIER.items():
    b = B[name]
    core = [x.strip() for x in b["CORE"].split(">")]
    core = [x for x in core if x != "Tear of the Goddess"][:3]
    ks, sec = b["KEYSTONE"].split("|"); ks = ks.strip(); sec = sec.split(":", 1)[1].strip()
    runes = [r.strip() for r in b["RUNES"].split(",") if r.strip() and r.strip() not in SHARDS]
    lv1, pre6, post6 = PLAN[name]
    mus = {}
    for opp, (wr, g) in C.get(name, {}).items():
        mus[opp] = {"wr": wr, "games": g, "score": score(wr, g)}
    syn = {}
    for adc, (wr, g) in S.get(name, {}).items():
        d = wr - avg - ADC_EFF.get(adc, 0.0)
        if g < 1000: d *= g / 1000
        syn[adc] = {"wr": wr, "games": g, "delta": round(d, 2)}
    pool.append({
        "name": name, "role": "support", "arch": ARCH[name], "tier_wr": avg, "pick": pick,
        "blind": 1 if avg >= 51 else 0,
        "start": ["World Atlas", "Health Potion", "Health Potion"],
        "boots": b["BOOTS"],
        "runes": {"keystone": ks, "primary": runes[:3], "secondary": runes[3:5], "alt": f"Secundaria: {sec}"},
        "spells": [s.strip() for s in b["SPELLS"].split("+")],
        "skills": [s.strip() for s in b["SKILLS"].split(">")],
        "builds": {"default": {"items": core}, "vs_ad": {"items": core}, "vs_ap": {"items": core}},
        "general": f"Nivel 1: {lv1}",
        "plan": {"lv1": lv1, "pre6": pre6, "post6": post6},
        "threat": {"respect": THREAT[name][0], "avoid": THREAT[name][1]},
        "comp_bonus": {"AD": 0, "AP": 0},
        "matchups": mus,
        "synergy": syn,
    })
from sup_knowledge import DYN, ARCH_LABEL
# Para pares sin estadística de dúo: promedio (ponderado por partidas) de la sinergia de ese ADC
# con cada tipo de support. Es una estimación, se muestra como tal.
est = defaultdict(lambda: [0.0, 0])
for p in pool:
    for a, sy in p["synergy"].items():
        e = est[(a, p["arch"])]; e[0] += sy["delta"] * sy["games"]; e[1] += sy["games"]
ADC_ARCH = {f"{a}|{arch}": round(v[0] / v[1], 2) for (a, arch), v in est.items() if v[1] >= 3000}
out = {"adc_arch": ADC_ARCH, "dyn": {f"{a}|{b}": t for (a, b), t in DYN.items()}, "arch_label": ARCH_LABEL, "_info": "Supports: op.gg Emerald+ parche 16.22 (26.22). matchups = WR vs support rival; synergy = WR con ese ADC (delta vs su promedio). Guías = análisis de kits.",
       "patch": "26.22", "source": "op.gg Emerald+ (support)", "role": "utility", "pool": pool}
json.dump(out, open(os.path.join(DATA, "pool_support.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(pool), "supports;", sum(len(p["matchups"]) for p in pool), "matchups;", sum(len(p["synergy"]) for p in pool), "sinergias")
for p in pool[:3]:
    print(p["name"], p["builds"]["default"]["items"], p["runes"]["keystone"], sorted(p["synergy"].items(), key=lambda x:-x[1]["delta"])[:2])
