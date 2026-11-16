# Arma data/pool_udyr.json para Mauri (Udyr jungla), mismo formato que pool_jungle.json.
# Uso: python3 tools/datos/mauri/build.py
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data")
from raw import UDYR_JG, OVERALL
from knowledge import JG_ARCH, PLAN, DYN, THREAT, GENERAL, KEY

def parse(txt):
    out = {}
    for line in txt.strip().splitlines():
        n, wr, g = line.split("|"); out[n] = (float(wr), int(g))
    return out

def arch_of(name):
    for a, names in JG_ARCH.items():
        if name in names: return a
    return None

def guide(enemy):
    plan = PLAN[KEY]
    pre = list(plan["pre6"])
    arch = arch_of(enemy)
    if arch: pre.insert(0, DYN[(KEY, arch)])
    evitar = plan["evitar"]
    if enemy in THREAT:
        pre.append(f"Respetá a {enemy}: {THREAT[enemy][0]}")
        evitar = THREAT[enemy][1]
    return {"src": "analisis", "por": "análisis del kit (wiki de LoL) · números de op.gg Emerald+", "lv1": plan["lv1"], "pre6": pre,
            "post6": plan["post6"], "evitar": evitar, "labels": plan["labels"], "no6": True}

wr, pick = OVERALL[KEY]
mus = {}
for enemy, (w, g) in parse(UDYR_JG).items():
    shrink = min(1.0, g / 300)
    mus[enemy] = {"wr": w, "games": g, "score": round((w - 50) / 2.5 * shrink, 1), "guide": guide(enemy)}

RUNES = {"keystone": "Press the Attack", "primary": ["Triumph", "Legend: Haste", "Coup de Grace"],
         "secondary": ["Magical Footwear", "Approach Velocity"],
         "alt": "Alternativa: Conqueror (24,6% de las partidas en op.gg Emerald+)"}
AD = {"items": ["Spear of Shojin", "Experimental Hexplate", "Death's Dance"], "skills": ["Q", "E", "W"], "boots": "Boots of Swiftness"}
AP = {"items": ["Liandry's Torment", "Dead Man's Plate", "Spirit Visage"], "skills": ["R", "E", "Q"], "boots": "Boots of Swiftness"}
udyr = {"name": "Udyr", "role": "jungle", "blind": round((wr - 50) / 1.5, 1), "tier_wr": wr, "pick": pick, "comp_bonus": {},
        "start": ["Gustwalker Hatchling", "Health Potion"], "runes": RUNES, "spells": ["Flash", "Smite"], "skills": AD["skills"],
        "boots": "Boots of Swiftness",
        "builds": {"default": AD, "ad": AD, "ap": AP,
                   "vs_ad": {"items": AD["items"], "boots": "Plated Steelcaps"},
                   "vs_ap": {"items": AD["items"], "boots": "Mercury's Treads"}},
        "paths": True, "general": GENERAL[KEY], "matchups": mus}

meta = {"patch": "26.22", "source": "op.gg Emerald+",
        "_info": "Winrate por matchup de op.gg Emerald+ (16.22 = 26.22). score = (wr-50)/2.5, reducido con menos de 300 partidas. Guías: análisis del kit."}
json.dump(dict(meta, pool=[udyr]), open(os.path.join(DATA, "pool_udyr.json"), "w"), ensure_ascii=False, indent=1)
print("pool_udyr.json", len(mus), "matchups, blind", udyr["blind"], "sin tipo:", [n for n in mus if not arch_of(n)])
