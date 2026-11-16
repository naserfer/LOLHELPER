# Datos crudos de Udyr jungla, parche 16.22 (consultados el 16/11/2026).
# Mauri no dijo su rango: se usa Emerald+ (Udyr se juega poco y en Master+ hay muy pocas partidas por cruce).

# op.gg Emerald+: https://op.gg/lol/champions/udyr/counters/jungle?tier=emerald_plus  (rival|wr de Udyr|partidas)
UDYR_JG = """Lee Sin|53.49|1662
Viego|50.71|1276
Jarvan IV|50.24|1256
Kayn|49.70|1161
Graves|52.95|1137
Wukong|51.11|1123
Qiyana|58.02|1048
Lillia|49.66|1043
Hecarim|50.96|942
Master Yi|51.19|924
Shyvana|54.17|888
Cho'Gath|48.97|878
Kha'Zix|52.87|872
Sylas|50.41|853
Ekko|47.42|833
Talon|50.98|763
Shaco|52.74|730
Briar|49.43|706
Rengar|52.29|700
Vi|52.22|653
Evelynn|53.81|643
Naafiri|48.87|618
Nocturne|51.71|613
Diana|53.11|514
Bel'Veth|52.75|510
Xin Zhao|50.42|480
Kindred|52.69|465
Elise|46.83|457
Warwick|50.11|455
Zac|44.47|443
Nunu & Willump|45.69|383
Taliyah|51.19|379
Sejuani|47.34|376
Zed|54.39|342
Jayce|53.57|336
Fiddlesticks|48.06|335
Amumu|48.40|312
Nidalee|56.38|298
Zyra|54.04|285
Darius|52.90|259
Rek'Sai|51.97|229
Trundle|47.73|220
Karthus|49.07|216
Rammus|49.30|213
Gwen|51.18|211
Volibear|50.00|190
Skarner|51.89|185
Ivern|48.09|183
Quinn|43.43|175
Pantheon|47.70|174
Zaahen|51.76|170
Ambessa|50.98|153
Aatrox|55.03|149
Maokai|44.85|136
Jax|50.76|132
Dr. Mundo|50.41|121
Gragas|49.57|115
Sion|48.60|107
Shen|45.10|102
Teemo|55.06|89
Locke|51.22|82
Malphite|44.44|81
Fizz|55.71|70"""

# Lolalytics Emerald+ (https://lolalytics.com/lol/udyr/build/?lane=jungle&tier=emerald_plus): 53,06% en 44.494 partidas, 1,74% de pick.
OVERALL = {"Udyr|jungle": (53.06, 1.74)}

# op.gg Emerald+, página de build e ítems (https://op.gg/lol/champions/udyr/items/jungle?tier=emerald_plus).
# Cada número: % de partidas que lo compran, winrate y partidas. Un ítem lo compran más en partidas largas, así que su
# winrate no es "la build que gana": sirve para ver qué se juega, no para elegir.
ITEMS = {
    "Spear of Shojin": (54.10, 51.88, 20974),
    "Death's Dance": (36.93, 55.28, 14320),
    "Liandry's Torment": (27.58, 50.92, 10692),
    "Experimental Hexplate": (24.28, 53.81, 9413),
    "Dead Man's Plate": (22.29, 55.88, 8644),
    "Spirit Visage": (17.75, 56.23, 6883),
    "Trinity Force": (11.54, 50.61, 4475),
    "Riftmaker": (6.59, 57.44, 2554),
}
# Primera opción de runas (op.gg): Press the Attack 39,29% de las partidas (52,00%); Conqueror 24,62% (51,28%).
# Inicio: Gustwalker Hatchling 43,99% + con poción 26,23% = 70,2% (16.755 + 9.989 partidas).
# Botas: Boots of Swiftness 41,39% (53,29%), Plated Steelcaps 27,64%, Mercury's Treads 27,56%.
# Habilidades: Q > E > W la más jugada (52,50%). Lolalytics "mejor winrate": R > E > Q (54,82%, 4.728 partidas).
