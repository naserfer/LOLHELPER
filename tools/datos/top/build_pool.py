"""Genera lol_overlay/pool.json a partir de datos de op.gg y Lolalytics (parche 16.22, Emerald+)."""
import json
import sys
import os
DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "data")
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lane_guides import G as LANE_GUIDES
from pro_data import MALPHITE_PRO, MALPHITE_PRO_NOTES, GAREN_PRO

R2 = ["Doran's Ring", "Health Potion", "Health Potion"]
HELM = ["Doran's Helm", "Health Potion"]
SH = ["Doran's Shield", "Health Potion"]
BL = ["Doran's Blade", "Health Potion"]

# ---- Winrates por matchup (op.gg, top, Emerald+). (wr, games)
MALPHITE_WR = {
 "Jayce": (56.62, 5505), "Sylas": (45.91, 3768), "Yone": (52.84, 3486), "Aatrox": (53.87, 2894),
 "Mordekaiser": (47.09, 2646), "Gnar": (55.20, 2594), "Teemo": (52.52, 2321), "Darius": (49.15, 2289),
 "Jax": (51.37, 2184), "Irelia": (56.29, 2137), "Dr. Mundo": (46.02, 2123), "Renekton": (52.46, 2072),
 "Garen": (51.14, 1975), "Fiora": (54.72, 1972), "Gangplank": (48.82, 1950), "Sion": (43.42, 1838),
 "Sett": (52.51, 1834), "Tryndamere": (57.39, 1765), "Ambessa": (53.91, 1753), "Nasus": (50.00, 1730),
 "Pantheon": (52.68, 1699), "Ornn": (46.83, 1627), "Camille": (51.84, 1605), "Yasuo": (54.81, 1549),
 "Cho'Gath": (46.92, 1509), "Akali": (51.77, 1501), "Shen": (46.87, 1263), "Gwen": (50.73, 1234),
 "K'Sante": (51.96, 1201), "Zaahen": (50.43, 1164), "Volibear": (53.75, 1094), "Riven": (55.49, 1038),
 "Olaf": (50.73, 962), "Kayle": (55.66, 936), "Urgot": (54.90, 929), "Kennen": (51.24, 890),
 "Vayne": (62.09, 831), "Gragas": (52.72, 808), "Illaoi": (45.32, 801), "Tahm Kench": (46.15, 793),
 "Yorick": (54.08, 784), "Trundle": (56.27, 718), "Rumble": (49.78, 681), "Singed": (45.82, 622),
 "Kled": (48.79, 580), "Vladimir": (50.35, 568), "Heimerdinger": (48.72, 429), "Warwick": (47.88, 424),
 "Swain": (43.38, 385), "Quinn": (53.00, 383), "Maokai": (45.68, 324), "Aurora": (49.03, 308),
 "Wukong": (53.06, 294), "Anivia": (45.58, 283), "Lissandra": (44.65, 271), "Master Yi": (54.58, 262),
 "Ryze": (49.81, 257), "Varus": (59.29, 253), "Poppy": (52.07, 242), "Malzahar": (52.29, 218),
 "Udyr": (51.59, 157),
}
GAREN_WR = {
 "Jax": (55.46, 4259), "Darius": (46.70, 3966), "Camille": (47.11, 2806), "Mordekaiser": (49.03, 2566),
 "Sett": (50.24, 2542), "Yone": (52.85, 2365), "Renekton": (52.32, 2265), "K'Sante": (55.15, 2205),
 "Aatrox": (50.71, 2120), "Nasus": (54.48, 2087), "Malphite": (48.79, 1976), "Kayle": (45.79, 1828),
 "Shen": (50.28, 1812), "Gangplank": (48.15, 1649), "Fiora": (46.56, 1630), "Ornn": (50.59, 1613),
 "Ambessa": (53.14, 1609), "Gnar": (49.75, 1576), "Volibear": (50.38, 1570), "Zaahen": (52.29, 1440),
 "Jayce": (52.65, 1394), "Irelia": (52.49, 1368), "Akali": (52.81, 1352), "Sion": (51.76, 1337),
 "Dr. Mundo": (54.49, 1325), "Tryndamere": (46.76, 1311), "Teemo": (47.88, 1295), "Pantheon": (50.77, 1294),
 "Riven": (53.83, 1213), "Cho'Gath": (50.00, 1166), "Olaf": (51.09, 1147), "Singed": (50.04, 1133),
 "Yasuo": (54.04, 1051), "Gwen": (53.50, 985), "Illaoi": (53.81, 944), "Urgot": (46.43, 939),
 "Yorick": (52.25, 867), "Gragas": (51.89, 794), "Tahm Kench": (51.33, 752), "Trundle": (50.77, 711),
 "Kled": (50.66, 681), "Vayne": (48.44, 673), "Kennen": (50.08, 591), "Rumble": (49.48, 574),
 "Warwick": (47.91, 503), "Heimerdinger": (53.57, 420), "Vladimir": (53.00, 400), "Poppy": (52.43, 370),
 "Quinn": (47.16, 352), "Wukong": (51.94, 283), "Sylas": (52.23, 247), "Anivia": (50.83, 240),
 "Swain": (50.65, 231), "Maokai": (46.36, 220), "Udyr": (44.09, 220), "Master Yi": (50.24, 209),
 "Aurora": (46.38, 207), "Lissandra": (49.71, 175), "Ryze": (46.47, 170), "Varus": (52.76, 163),
 "Malzahar": (52.52, 139),
}
ILLAOI_WR = {
 "Yone": (49.56, 1721), "Mordekaiser": (44.34, 1662), "Sett": (49.57, 1612), "Renekton": (54.88, 1556),
 "Darius": (51.86, 1450), "Aatrox": (49.22, 1412), "Jax": (55.82, 1324), "Garen": (48.51, 1177),
 "Volibear": (54.92, 1169), "Malphite": (51.50, 1136), "Nasus": (49.01, 1110), "Ornn": (50.71, 990),
 "Fiora": (47.92, 962), "K'Sante": (57.84, 944), "Gangplank": (48.87, 929), "Shen": (50.00, 928),
 "Camille": (51.90, 869), "Jayce": (52.51, 857), "Teemo": (42.61, 819), "Ambessa": (51.90, 736),
 "Irelia": (48.74, 714), "Yorick": (54.07, 701), "Cho'Gath": (52.35, 682), "Zaahen": (54.64, 679),
 "Tryndamere": (47.56, 677), "Pantheon": (54.74, 654), "Sion": (47.93, 653), "Yasuo": (45.24, 630),
 "Urgot": (47.04, 625), "Kayle": (45.77, 614), "Gnar": (50.41, 613), "Olaf": (52.45, 612),
 "Gwen": (47.44, 605), "Dr. Mundo": (52.35, 596), "Gragas": (52.71, 516), "Tahm Kench": (52.50, 501),
 "Singed": (45.61, 467), "Riven": (52.21, 452), "Akali": (54.96, 413), "Kled": (53.32, 407),
 "Trundle": (51.06, 378), "Vayne": (48.48, 363), "Varus": (44.12, 306), "Warwick": (51.71, 292),
 "Kennen": (53.14, 271), "Vladimir": (45.19, 270), "Heimerdinger": (50.39, 256), "Rumble": (53.78, 238),
 "Wukong": (54.98, 211), "Poppy": (52.44, 164), "Malzahar": (38.26, 149), "Udyr": (51.37, 146),
 "Sylas": (58.16, 141), "Anivia": (44.12, 136), "Swain": (49.22, 128), "Master Yi": (50.42, 119),
 "Zac": (47.46, 118), "Quinn": (45.95, 111), "Lissandra": (45.26, 95), "Aurora": (42.11, 95),
 "Ryze": (47.73, 88), "Corki": (56.25, 80),
}

# ---- Datos por matchup de Lolalytics (solo muestras >= 300 partidas para el inicial)
MALPHITE_MU = {
 "Darius": dict(start=R2, first=["Frozen Heart"], boots="Plated Steelcaps"),
 "Sett": dict(start=HELM, first=["Frozen Heart"], boots="Plated Steelcaps"),
 "Mordekaiser": dict(start=HELM, first=["Kaenic Rookern"]),
 "Garen": dict(start=HELM, first=["Sunfire Aegis", "Thornmail"], boots="Plated Steelcaps"),
 "Sion": dict(start=SH, boots="Plated Steelcaps"),
 "Teemo": dict(start=R2, first=["Stormsurge"], boots="Sorcerer's Shoes"),
 "Sylas": dict(start=R2, first=["Sunfire Aegis"]),
 "Jax": dict(start=HELM, first=["Hollow Radiance"]),
 "Aatrox": dict(start=R2, first=["Malignance"]),
 "Yone": dict(start=SH, first=["Frozen Heart", "Thornmail"]),
 "Fiora": dict(start=R2, first=["Frozen Heart"], boots="Plated Steelcaps"),
 "Camille": dict(start=R2, boots="Plated Steelcaps"),
 "Kennen": dict(start=R2, boots="Mercury's Treads"),
 "Illaoi": dict(start=R2, boots="Plated Steelcaps"),
}
GAREN_MU = {
 "Darius": dict(start=BL, first=["Stridebreaker"], boots="Berserker's Greaves"),
 "Sett": dict(start=SH, first=["Stridebreaker"], boots="Boots of Swiftness"),
 "Malphite": dict(start=SH, first=["Youmuu's Ghostblade"], boots="Boots of Swiftness"),
 "Yone": dict(start=BL, first=["Stridebreaker"], boots="Boots of Swiftness"),
 "Teemo": dict(first=["Stridebreaker"], boots="Boots of Swiftness"),
 "Camille": dict(first=["Stridebreaker"], boots="Boots of Swiftness"),
 "Kayle": dict(first=["Stridebreaker"]),
}
ILLAOI_MU = {
 "Sett": dict(start=BL, first=["Iceborn Gauntlet"]),
 "Darius": dict(start=SH, first=["Black Cleaver"], boots="Mercury's Treads"),
 "Malphite": dict(start=BL),
 "Jax": dict(start=BL, boots="Mercury's Treads"),
 "Mordekaiser": dict(boots="Mercury's Treads"),
 "Aatrox": dict(first=["Black Cleaver"]),
}

# ---- Tips de línea (criterio de juego, no estadística)
TIPS = {
 "Malphite": {
  "Darius": "No dejes que te atraiga con la E. Q + cometa y alejate; nunca trades largos (5 stacks).",
  "Sett": "Retrocedé ante su W cargada. Pokealo con Q, no le aceptes all-ins temprano.",
  "Mordekaiser": "Daño mágico y su R te aísla. Farmeá seguro, pedí ganks antes de su 6.",
  "Garen": "Q para cortarle la regeneración. Alejate cuando viene con su Q (silencio).",
  "Sion": "Línea difícil por datos. Esquivá su Q cargada y no lo dejes splitear libre.",
  "Teemo": "Con Doran's Ring ganás el poke. Q cada vez que esté el cometa.",
  "Sylas": "Te roba el R. Jugá la línea con poke y guardá R para cuando lo gaste.",
  "Jax": "Usá E cuando active su Counter Strike. No pelees mientras dure.",
  "Aatrox": "Esquivá los bordes de sus Q y pokealo con Q + cometa.",
  "Yone": "Q cuando vuelve de su E. Armadura y R cuando entra.",
  "Fiora": "Buen matchup por datos: poke con Q, no le regales parries con la E.",
  "Camille": "Pokeá con Q; cuando entre con su E, respondé con tu E.",
  "Kennen": "Poke de rango AP: Mercury's y farmeá. Tu R gana las peleas.",
  "Illaoi": "Malo por datos. Nunca pelees dentro de sus tentáculos ni de su R. Esquivá su E.",
  "Gangplank": "Pokea con barriles. Farmeá y ganá en teamfights.",
  "Vayne": "Muy bueno por datos: Q para ralentizarla y all-in nivel 6.",
  "Dr. Mundo": "Malo por datos: escala bien y te ignora. Jugá al R en teamfights.",
  "Ornn": "Malo por datos. Línea pasiva, prioridad en roaming con TP.",
  "Cho'Gath": "Malo por datos. Esquivá su Q, línea de farmeo.",
  "Shen": "Malo por datos: te supera en la línea. Vigilá su R a otras líneas.",
  "Tryndamere": "Muy bueno por datos: tu E le destruye la velocidad de ataque.",
 },
 "Garen": {
  "Darius": "Malo por datos. Q entra, E, salí. Nunca te quedes con 5 stacks; usá arbustos para resetear la pasiva.",
  "Jax": "Muy bueno por datos. Peleá cuando gasta su E (Counter Strike).",
  "Camille": "Malo por datos. Silenciala con Q cuando entra con su E.",
  "Mordekaiser": "Q para silenciarlo antes de su combo.",
  "Sett": "No te quedes frente a su W cargada.",
  "Yone": "Bueno por datos. Q cuando vuelve de su E.",
  "Malphite": "Te pokea con Q. Trades cortos con Q + E y salí.",
  "Kayle": "Malo por datos. Matala antes del 11; después te gana.",
  "Fiora": "Malo por datos. No le regales parries; trades cortos.",
  "Teemo": "Q para alcanzarlo; farmeá seguro y no lo persigas por los hongos.",
  "Tryndamere": "Malo por datos. Guardá tu R hasta que termine su R.",
  "Nasus": "Bueno por datos: presionalo temprano para que no farmee stacks.",
  "K'Sante": "Muy bueno por datos.",
  "Illaoi": "Bueno por datos. Esquivá su E y sacala de sus tentáculos con Q.",
 },
 "Illaoi": {
  "Mordekaiser": "Malo por datos: su R te saca de tus tentáculos. Peleá antes de su 6.",
  "Teemo": "Muy malo por datos. Farmeá seguro y pedí ganks.",
  "Darius": "Bueno por datos. E + tentáculos, evitá su E fuera de tu zona.",
  "Sett": "Peleá en tentáculos y retrocedé ante su W.",
  "Jax": "Muy bueno por datos. Peleá dentro de tus tentáculos cuando gaste su E.",
  "Renekton": "Muy bueno por datos.",
  "K'Sante": "Muy bueno por datos.",
  "Garen": "Su Q te silencia: mantenete dentro de tus tentáculos.",
  "Malphite": "Le ganás la línea. Cuidado con su R desde lejos.",
  "Yone": "Esquiva tu R con su E. Esperá que la gaste.",
  "Yasuo": "Malo por datos: su Wind Wall bloquea tu E.",
  "Kayle": "Malo por datos. Presionala temprano.",
  "Fiora": "Su W parea tu E/R. Jugá paciente.",
 },
}


def score_of(wr, games):
    s = (wr - 50) / 2.5
    if games < 300:
        s *= games / 300  # poca muestra: confiar menos
    return round(max(-3, min(3, s)), 1)


def matchups(wr_table, mu_table, tips, pro=None, pro_notes=None):
    pro, pro_notes = pro or {}, pro_notes or {}
    out = {}
    for champ, (wr, g) in wr_table.items():
        m = {"wr": wr, "games": g, "score": score_of(wr, g)}
        m.update(mu_table.get(champ, {}))
        if champ in tips:
            m["tip"] = tips[champ]
        if champ in pro:
            diff, start, ks, rush, spell = pro[champ]
            p = {"diff": diff, "start": start, "keystone": ks}
            if rush:
                p["rush"] = rush
            if spell:
                p["spell"] = spell
            if champ in pro_notes:
                p["note"] = pro_notes[champ]
            m["pro"] = p
        out[champ] = m
    return out


def add_guides(cfg):
    for opp, g in LANE_GUIDES.get(cfg["name"], {}).items():
        m = cfg["matchups"].get(opp)
        if m is not None:
            m["guide"] = g
            m.pop("tip", None)
    return cfg


pool = {
 "_info": "Datos de op.gg (winrate por matchup, Emerald+) y Lolalytics (ítem inicial, botas y primer ítem por matchup, solo muestras >= 300). score = (winrate - 50) / 2.5. Los tips son criterio de juego.",
 "patch": "26.22",
 "source": "op.gg + Lolalytics, Emerald+",
 "pro_source": "Federals1 (Challenger) — planillas de matchups 26.x",
 "pool": [
  {
   "name": "Malphite", "role": "top", "blind": 1,
   "comp_bonus": {"AD": 0.3, "AP": -0.3},
   "start": R2,
   "runes": {"keystone": "Arcane Comet", "primary": ["Manaflow Band", "Transcendence", "Scorch"],
             "secondary": ["Second Wind", "Overgrowth"], "alt": "Alternativa: Grasp of the Undying + Sorcery (más winrate, menos pick)"},
   "spells": ["Flash", "Teleport"],
   "skills": ["Q", "E", "W"],
   "boots": "Plated Steelcaps",
   "builds": {
    "default": {"items": ["Sunfire Aegis", "Thornmail", "Frozen Heart"]},
    "vs_ad": {"items": ["Sunfire Aegis", "Thornmail", "Frozen Heart"]},
    "vs_ap": {"items": ["Sunfire Aegis", "Kaenic Rookern", "Frozen Heart"], "boots": "Mercury's Treads"}
   },
   "general": "Primeros 4 niveles sos débil: farmeá tranquilo. Muchas líneas se ganan solo spameando Q con cometa. Contra campeones con mucho sustain (Nasus, Mundo) el poke no alcanza. El rush depende del rival: Thornmail, Frozen Heart, Kaenic Rookern contra AP, hasta Malignance. R al carry o a 3+ agrupados.",
   "matchups": matchups(MALPHITE_WR, MALPHITE_MU, TIPS["Malphite"], MALPHITE_PRO, MALPHITE_PRO_NOTES)
  },
  {
   "name": "Garen", "role": "top", "blind": 1,
   "comp_bonus": {"AD": 0, "AP": 0},
   "start": SH,
   "start_note": "Doran's Blade: menos pick, más winrate",
   "runes": {"keystone": "Conqueror", "primary": ["Triumph", "Legend: Haste", "Last Stand"],
             "secondary": [], "alt": "Secundaria: Sorcery"},
   "spells": ["Flash", "Ignite"],
   "skills": ["E", "Q", "W"],
   "boots": "Berserker's Greaves",
   "builds": {
    "default": {"items": ["Stridebreaker", "Phantom Dancer", "Mortal Reminder"]},
    "vs_ad": {"items": ["Stridebreaker", "Phantom Dancer", "Dead Man's Plate"]},
    "vs_ap": {"items": ["Stridebreaker", "Phantom Dancer", "Mortal Reminder"], "boots": "Mercury's Treads"}
   },
   "general": "Tu pasiva te cura si no recibís daño: salí de la línea un rato y volvés lleno. Q para entrar o escapar, R para ejecutar (daño verdadero).",
   "matchups": matchups(GAREN_WR, GAREN_MU, TIPS["Garen"], GAREN_PRO)
  },
  {
   "name": "Illaoi", "role": "top", "blind": 0,
   "comp_bonus": {"AD": 0, "AP": 0},
   "start": BL,
   "runes": {"keystone": "Grasp of the Undying", "primary": ["Bone Plating", "Overgrowth"],
             "secondary": ["Presence of Mind", "Last Stand"], "alt": "Alternativa: Conqueror + Resolve"},
   "spells": ["Flash", "Teleport"],
   "skills": ["E", "Q", "W"],
   "boots": "Plated Steelcaps",
   "builds": {
    "default": {"items": ["Black Cleaver", "Iceborn Gauntlet", "Sterak's Gage"]},
    "vs_ad": {"items": ["Black Cleaver", "Iceborn Gauntlet", "Sterak's Gage"]},
    "vs_ap": {"items": ["Black Cleaver", "Iceborn Gauntlet", "Spirit Visage"], "boots": "Mercury's Treads"}
   },
   "general": "Peleá siempre cerca de tus tentáculos. E primero: si pega, pelea; si no, retrocedé. R en peleas con varios enemigos.",
   "matchups": matchups(ILLAOI_WR, ILLAOI_MU, TIPS["Illaoi"])
  },
 ],
}
for c in pool["pool"]:
    add_guides(c)
json.dump(pool, open(os.path.join(DATA, "pool.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
for c in pool["pool"]:
    print(c["name"], len(c["matchups"]), "matchups")
