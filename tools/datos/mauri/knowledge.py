# Udyr (Mauri): guías por análisis del kit (wiki de LoL), no de un pro.
# Kit (wiki): sin definitiva. Q, W, E y R son posturas que mejoran los próximos 2 autos; recastear dentro de 5 s
# la "despierta" (Awakened Spirit, enfriamiento compartido).
#   Q Wilding Claw: velocidad de ataque + daño físico por % de vida máxima (escala con AD). Despertada: rayos mágicos.
#   W Iron Mantle: escudo y robo de vida (escala con AP y vida máxima).
#   E Blazing Stampede: velocidad de movimiento; el primer auto a cada rival lo stunea 0,75 s.
#     Despertada: +75 de alcance y 1,5 s de inmunidad a control.
#   R Wingborne Storm: tormenta de daño mágico alrededor tuyo que ralentiza 15-30% (escala con AP).
import importlib.util, os
_spec = importlib.util.spec_from_file_location("bitty_knowledge", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "bitty", "knowledge.py"))
_bk = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(_bk)
JG_ARCH = _bk.JG_ARCH  # mismos tipos de jungla rival que Bitty

KEY = "Udyr|jungle"

PLAN = {
    KEY: {
        "lv1": "Nivel 1 con la habilidad de tu build: Q si vas AD, R si vas AP. Al 2 la otra, al 3 W y al 4 E.",
        "pre6": ["Gankeá con E: te da velocidad y el primer auto a cada rival lo stunea 0,75 s. Entrá desde la niebla, no caminando por la línea.",
                 "Despertá una postura (recastearla dentro de 5 s) cuando sirve: Q (AD) o R (AP) para ganar un duelo; E para entrar o escapar, porque te da 1,5 s de inmunidad a control.",
                 "Prendé W cuando te pegan: escudo y te curás con cada auto."],
        "post6": "Udyr no tiene definitiva: lo que cambia es tu primer ítem. Con Shojin o Liandry's terminado, peleá dragón y heraldo y, si ganás los duelos, invadí.",
        "evitar": "Perseguir a un rival que ya se te escapó: si gastaste E, no tenés cómo volver a llegar.",
        "labels": ["Inicio", "Antes del primer ítem", "Con tu primer ítem"],
    },
}

DYN = {
    (KEY, "early"): "Udyr se banca los duelos tempranos: si te invade, peleá en tu jungla con E (stun) y la postura despertada. No lo persigas a la suya sin visión.",
    (KEY, "scaler"): "Él escala con ítems: invadilo y gankeá seguido antes de que complete su primer ítem.",
    (KEY, "tank"): "Contra tanques no ganás la pelea rápido: ganale campamentos y objetivos y gankeá antes que él.",
    (KEY, "bruiser"): "Duelo largo parejo: entrá con W lista (escudo y curación) y salí si ya usaste E.",
}

# Qué respetar de cada jungla rival (kit) y qué no hacer.
THREAT = {
    "Lee Sin": ("Si te pega la Q gana el nivel 2-3: peleá cuando la haya gastado.", "Pelear en un pasillo donde te pueda patear con R hacia su equipo."),
    "Jarvan IV": ("Su E-Q te levanta: E despertada te da 1,5 s de inmunidad a control para entrar.", "Quedarte en el borde de su R (te encierra)."),
    "Zac": ("Salta desde muy lejos: no lo persigas, pelealo cuando ya gastó la E.", "Quedarte agrupado cuando tiene el salto cargado."),
    "Nunu & Willump": ("Te ralentiza y te pega fuerte con la bola: ganale campamentos, no la pelea en el río.", "Pelear dentro de su R cargada."),
    "Sejuani": ("Su R stunea a varios: separate y entrá con E despertada.", "Pelear agrupados contra su R."),
    "Maokai": ("Te ata (root) con W y aguanta mucho: no gastes tu E antes de su W.", "Pelear en arbustos con sus brotes."),
    "Elise": ("Su capullo (E) te stunea antes de que llegues: entrá con E despertada (inmunidad a control).", "Pelearla en su jungla nivel 2-3."),
    "Ekko": ("Su W stunea en un círculo: salí del círculo antes de que explote.", "Gastar todo antes de que use R (vuelve atrás)."),
    "Quinn": ("Su Q te deja ciego (tus autos fallan) y su E te empuja: esperá que gaste E para entrar.", "Pegarle autos mientras estás ciego."),
    "Karthus": ("Farmea y te mata con R desde lejos: con poca vida, guardá W (escudo).", "Pelear con poca vida cuando su R está lista."),
    "Master Yi": ("Su Q lo hace intocable: tirá tu stun (E) después de que la use.", "Dejarlo farmear libre."),
    "Kha'Zix": ("Hace mucho daño a quien está aislado: no hagas campamentos solo sin ward.", "Pelear lejos de tu equipo cuando él está invisible."),
}

GENERAL = {
    KEY: "Udyr no tiene definitiva: sus 4 habilidades son posturas que mejoran tus próximos 2 autos, y cada una se puede despertar (recastearla) para un efecto más fuerte. Tu build decide qué subís: AD sube Q, AP sube R. Lo que más cambia la partida es elegir bien AD o AP (mirá la tarjeta).",
}
