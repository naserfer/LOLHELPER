# Arma pool_jungle.json y pool_mid.json para Bitty (mismo formato que pool.json).
import json, sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data")
from raw import NOC_JG, DIANA_JG, DIANA_MID, OVERALL
from knowledge import JG_ARCH, MID_ARCH, PLAN, DYN, THREAT, GENERAL

def parse(txt):
    out = {}
    for line in txt.strip().splitlines():
        n, wr, g = line.split("|"); out[n] = (float(wr), int(g))
    return out

def arch_of(name, table):
    for a, names in table.items():
        if name in names: return a
    return None

def guide(key, enemy, arch_table):
    plan = PLAN[key]
    pre = list(plan["pre6"])
    arch = arch_of(enemy, arch_table)
    if arch: pre.insert(0, DYN[(key, arch)])
    evitar = plan["evitar"]
    if enemy in THREAT:
        pre.append(f"Respetá a {enemy}: {THREAT[enemy][0]}")
        evitar = THREAT[enemy][1]
    return {"src": "analisis", "por": "análisis de kits · números de op.gg Master+", "lv1": plan["lv1"], "pre6": pre,
            "post6": plan["post6"], "evitar": evitar, "labels": plan["labels"]}

def champ(name, role, raw, arch_table, start, runes, spells, skills, boots, builds, start_note=None):
    key = f"{name}|{role}"
    wr, pick = OVERALL[key]
    mus = {}
    for enemy, (w, g) in parse(raw).items():
        shrink = min(1.0, g / 300)
        mus[enemy] = {"wr": w, "games": g, "score": round((w - 50) / 2.5 * shrink, 1), "guide": guide(key, enemy, arch_table)}
    c = {"name": name, "role": role, "blind": round((wr - 50) / 1.5, 1), "tier_wr": wr, "pick": pick, "comp_bonus": {},
         "start": start, "runes": runes, "spells": spells, "skills": skills, "boots": boots, "builds": builds,
         "general": GENERAL[key], "matchups": mus}
    if start_note: c["start_note"] = start_note
    return c

noc = champ("Nocturne", "jungle", NOC_JG, JG_ARCH, ["Scorchclaw Pup", "Health Potion"],
    {"keystone": "Conqueror", "primary": ["Triumph", "Legend: Alacrity", "Last Stand"], "secondary": ["Grisly Mementos", "Ultimate Hunter"]},
    ["Flash", "Smite"], ["Q", "E", "W"], "Plated Steelcaps",
    {"default": {"items": ["Profane Hydra", "Axiom Arc", "Voltaic Cyclosword"]},
     "vs_ad": {"items": ["Experimental Hexplate", "Stridebreaker", "Death's Dance"]},
     "vs_ap": {"items": ["Experimental Hexplate", "Black Cleaver", "Maw of Malmortius"], "boots": "Mercury's Treads"}},
    "Más jugada en Master+: letalidad (Profane Hydra). La de peleador (Hexplate, Stridebreaker, Black Cleaver) tiene más winrate: 54,8% vs 53,6%.")
dj = champ("Diana", "jungle", DIANA_JG, JG_ARCH, ["Scorchclaw Pup", "Health Potion"],
    {"keystone": "Conqueror", "primary": ["Triumph", "Legend: Alacrity", "Coup de Grace"], "secondary": ["Magical Footwear", "Cosmic Insight"]},
    ["Flash", "Smite"], ["Q", "W", "E"], "Sorcerer's Shoes",
    {"default": {"items": ["Dusk and Dawn", "Riftmaker", "Zhonya's Hourglass"]},
     "vs_ad": {"items": ["Dusk and Dawn", "Riftmaker", "Zhonya's Hourglass"], "boots": "Plated Steelcaps"},
     "vs_ap": {"items": ["Dusk and Dawn", "Riftmaker", "Banshee's Veil"], "boots": "Mercury's Treads"}})
dm = champ("Diana", "mid", DIANA_MID, MID_ARCH, ["Doran's Ring", "Health Potion", "Health Potion"],
    {"keystone": "Electrocute", "primary": ["Sudden Impact", "Grisly Mementos", "Treasure Hunter"], "secondary": ["Shield Bash", "Bone Plating"],
     "alt": "Alternativa: Stormraider's Surge (Sorcery) + Resolve (26% de pick)"},
    ["Flash", "Ignite"], ["Q", "E", "W"], "Sorcerer's Shoes",
    {"default": {"items": ["Stormsurge", "Shadowflame", "Zhonya's Hourglass"]},
     "vs_ad": {"items": ["Stormsurge", "Shadowflame", "Zhonya's Hourglass"]},
     "vs_ap": {"items": ["Stormsurge", "Shadowflame", "Banshee's Veil"], "boots": "Mercury's Treads"}})

meta = {"patch": "26.22", "source": "op.gg Master+", "_info": "Winrate por matchup de op.gg Master+ (16.22 = 26.22). score = (wr-50)/2.5, reducido con menos de 300 partidas. Guías: análisis de kits."}
for fname, pool in (("pool_jungle.json", [noc, dj]), ("pool_mid.json", [dm])):
    json.dump(dict(meta, pool=pool), open(os.path.join(DATA, fname), "w"), ensure_ascii=False, indent=1)
    print(fname, [(c["name"], len(c["matchups"]), c["blind"]) for c in pool])
no_arch = [n for n in parse(NOC_JG) | parse(DIANA_JG) if not arch_of(n, JG_ARCH)] + [n for n in parse(DIANA_MID) if not arch_of(n, MID_ARCH)]
print("sin tipo (guía general):", no_arch)
