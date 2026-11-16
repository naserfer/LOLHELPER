# Guías por análisis de kits (no son de un pro). Se arman: plan del campeón + dinámica según el
# tipo de rival + qué respetar de ese rival puntual.

# ---------------------------------------------------------------- tipos de rival
JG_ARCH = {
    # fuertes temprano: invaden, pelean nivel 2-4, gankean pronto
    "early": ["Lee Sin", "Xin Zhao", "Rek'Sai", "Elise", "Nidalee", "Kindred", "Shaco", "Rengar", "Kha'Zix", "Qiyana",
              "Talon", "Naafiri", "Jarvan IV", "Pantheon", "Jayce", "Graves", "Vi", "Zed", "Quinn", "Taliyah", "Ekko"],
    # farmean y escalan
    "scaler": ["Karthus", "Master Yi", "Shyvana", "Lillia", "Bel'Veth", "Fiddlesticks", "Kayn", "Evelynn", "Zyra",
               "Diana", "Nocturne", "Gwen"],
    # tanques de engage
    "tank": ["Sejuani", "Zac", "Amumu", "Rammus", "Nunu & Willump", "Skarner", "Cho'Gath", "Gragas", "Ivern"],
    # peleadores de cuerpo a cuerpo que ganan duelos largos
    "bruiser": ["Viego", "Hecarim", "Wukong", "Darius", "Aatrox", "Ambessa", "Udyr", "Warwick", "Briar", "Sylas", "Volibear", "Trundle", "Olaf", "Jax"],
}
MID_ARCH = {
    "mage": ["Syndra", "Viktor", "Orianna", "Xerath", "Lux", "Anivia", "Azir", "Hwei", "Vel'Koz", "Mel", "Aurelion Sol",
             "Cassiopeia", "Malzahar", "Veigar", "Annie", "Taliyah", "Vex", "Lissandra", "Ryze", "Twisted Fate", "Zoe", "Ahri", "Aurora"],
    "assassin": ["Zed", "Talon", "Akali", "Katarina", "Fizz", "Qiyana", "LeBlanc", "Kassadin", "Ekko", "Akshan", "Naafiri"],
    "fighter": ["Yasuo", "Yone", "Sylas", "Irelia", "Galio", "Pantheon", "Jayce", "Kayle", "Vladimir"],
}

# ---------------------------------------------------------------- plan de cada campeón
PLAN = {
    "Nocturne|jungle": {
        "lv1": "Empezá Q y limpiá rápido: Nocturne no gana duelos tempranos contra invasores, su fuerza llega al 6.",
        "pre6": ["Hacé un recorrido de full clear o 3 campamentos + ganke a una línea con CC (tu E necesita que el rival no pueda escaparse del rango).",
                 "Ganke solo si el rival está empujado: entrá por el costado con Q y guardá E para cuando intente escapar.",
                 "Usá W para bloquear la habilidad clave del rival (stun, root, pull), no apenas empieza la pelea."],
        "post6": "Al 6 cambia todo: con R buscá al carry rival que esté lejos de su equipo o a la línea que perdió Flash. Antes de usar R, avisá a tu equipo con un ping.",
        "evitar": "Pelear 1v1 nivel 2-3 contra un jungla de duelo temprano o entrar con R a una pelea 1v3 sin tu equipo cerca.",
        "labels": ["Inicio", "Hasta el 6", "Desde el 6 (R)"],
    },
    "Diana|jungle": {
        "lv1": "Empezá Q, después W y E. Diana limpia muy rápido: full clear y primera vuelta lista para gankear al nivel 4.",
        "pre6": ["Tu combo es Q y después E a la marca de luna: si la Q no pega, no entres.",
                 "Gankeá líneas donde el rival no tenga escape (sin Flash o empujado): Q desde la niebla, E, W y pegá.",
                 "Diana farmea más rápido que casi todos: si no hay ganke claro, seguí limpiando y tomá ventaja de oro."],
        "post6": "Al 6 tu R junta a varios rivales: buscá peleas en el río y en objetivos donde estén juntos. Entrá después de que gasten su CC.",
        "evitar": "Entrar primera a una pelea sin Q marcada ni Zhonya, o pelear en espacios abiertos contra rivales con mucho CC.",
        "labels": ["Inicio", "Hasta el 6", "Desde el 6 (R)"],
    },
    "Diana|mid": {
        "lv1": "Empezá Q y farmeá con Q a distancia; tu primer pico es el nivel 3 (Q-E-W con Electrocute).",
        "pre6": ["Antes del 3 no pelees: muchos mid te ganan el intercambio corto.",
                 "Al 3, si la Q marca al rival: E, W y autoataques. Si la Q falla, retirate.",
                 "Empujá la ola y avisá a tu jungla antes de moverte; Diana roamea bien después del 6."],
        "post6": "Al 6 tenés all-in: Q, E, R y Flash si hace falta. Con Zhonya podés entrar a 2 rivales. Ayudá en dragón y heraldo con tu R.",
        "evitar": "Pelear antes del 3 o quedarte en línea larga contra un mago que te gasta con poke a distancia.",
        "labels": ["Nivel 1", "Hasta el 6", "Desde el 6"],
    },
}

# Dinámica: (mi campeón|rol, tipo de rival) -> consejo principal.
DYN = {
    ("Nocturne|jungle", "early"): "Ese jungla te gana nivel 2-4: no lo invadas y poné ward en tu buff contrario al empezar. Contra-gankeá donde él gankee.",
    ("Nocturne|jungle", "scaler"): "Él escala mejor que vos en duelos largos: invadilo con prioridad de línea antes del 6 y gankeá seguido para que no farmee.",
    ("Nocturne|jungle", "tank"): "No lo podés matar en peleas: ganale objetivos y matá a sus carries. Guardá W para su engage.",
    ("Nocturne|jungle", "bruiser"): "Le gana el duelo largo a Nocturne: no lo peleés 1v1 en su jungla. Pelealo con tu línea al lado o cuando use su habilidad de engage.",
    ("Diana|jungle", "early"): "Ese jungla es más fuerte que vos temprano: full clear seguro con ward en la entrada de tu jungla y no pelees antes del 4.",
    ("Diana|jungle", "scaler"): "Igualás o ganás en ritmo de farm: tomá su campamento cuando aparezca del otro lado del mapa y presioná objetivos al 6.",
    ("Diana|jungle", "tank"): "Su engage te pone en peligro: entrá después de que use su CC y comprá Zhonya temprano.",
    ("Diana|jungle", "bruiser"): "Gana duelos largos: Q-E-R y salí, no te quedes pegando. Peleá en grupo donde tu R pegue a varios.",
    ("Diana|mid", "mage"): "El mago te gana con poke antes del 3: farmeá con Q, no te expongas, y al 3 o al 6 entrá cuando gaste su habilidad principal.",
    ("Diana|mid", "assassin"): "Línea de quién gasta primero: no uses E sin Q marcada. W absorbe su burst; al 6 ganás el all-in si la Q pega.",
    ("Diana|mid", "fighter"): "Pelea larga: Electrocute y ganchos cortos con Q-E y salí. No le des la pelea extendida.",
}

# Qué respetar de cada rival puntual (respect) y qué no hacer (avoid).
THREAT = {
    # junglas
    "Lee Sin": ("Gana el nivel 2-3 y puede invadirte con Q: ward en tu buff y no le regales el primer duelo.", "Pelear en un pasillo donde te pueda patear con R hacia su equipo."),
    "Jarvan IV": ("Gankea fuerte nivel 3 con E-Q (knockup): ward el río antes del minuto 3.", "Quedarte en el borde de su R (te encierra)."),
    "Qiyana": ("Mucho daño explosivo y su R contra paredes: no pelees cerca de muros.", "Agruparte en un pasillo donde su R pegue a varios."),
    "Graves": ("Gana duelos cortos y farmea rápido: no lo pelees en su jungla.", "Pelearlo de cerca cuando tiene las dos balas cargadas."),
    "Viego": ("Gana pelea larga y se vuelve el campeón que mata: no le dejes resets.", "Dejar a un aliado bajo de vida que Viego pueda poseer."),
    "Kha'Zix": ("Hace mucho daño a quien está aislado: nunca te quedes solo en tu jungla.", "Hacer campamentos solo sin ward cuando no sabés dónde está."),
    "Sylas": ("Puede robar tu R; pelea fuerte a corto plazo.", "Usar tu R cuando Sylas la puede robar contra tu equipo."),
    "Hecarim": ("Llega rápido con E y te tira para atrás: no lo dejes cargar velocidad en línea recta.", "Pelear en terreno abierto donde corre en línea."),
    "Talon": ("Gankea por encima de los muros: ward en lugares raros.", "Quedarte en el río sin visión."),
    "Naafiri": ("Ráfaga fuerte temprano con sus perros: no pelees en desventaja de vida.", "Pelear de cerca cuando tiene todos los perros."),
    "Wukong": ("Su clon te confunde y su R levanta a varios.", "Agruparte con tu equipo cuando tiene R lista."),
    "Master Yi": ("Si farmea tranquilo te gana el juego: invadilo temprano.", "Pelear cuando tiene Q (se vuelve intocable) disponible."),
    "Vi": ("Su R marca a uno y no se puede evitar: guardá W de Nocturne o Zhonya para eso.", "Ser el carry aislado al que va a buscar."),
    "Kayn": ("Débil antes de su forma; muy fuerte después.", "Dejarlo farmear libre los primeros 10 minutos."),
    "Ekko": ("Daño explosivo y vuelve atrás con R: guardá algo para después de su R.", "Gastar todo antes de que use R."),
    "Rengar": ("Salta desde arbustos: limpiá con Oracle Lens.", "Caminar cerca de arbustos sin visión."),
    "Lillia": ("Escala y gana peleas largas corriendo: forzá peleas cortas temprano.", "Perseguirla en pelea larga."),
    "Elise": ("Muy fuerte nivel 2-3 y gankea temprano: no la invadas.", "Pelearla en su jungla antes del 6."),
    "Shaco": ("Te invade con trampas: ward y limpiá cajas antes de entrar a su jungla.", "Seguirlo cuando se hace invisible."),
    "Nidalee": ("Te gasta con lanzas y gana duelos tempranos.", "Pelear con poca vida contra su lanza."),
    "Evelynn": ("Invisible desde el 6: comprá Control Ward y llevá Oracle.", "Caminar sola por la jungla después del 6."),
    "Xin Zhao": ("Gana el duelo temprano y te tira para arriba.", "Pelearlo 1v1 antes del 6."),
    "Kindred": ("Gana duelos y se lleva marcas de tu jungla.", "Dejarla tomar las marcas en tus campamentos."),
    "Bel'Veth": ("Escala muy fuerte: presionala temprano.", "Dejarla tomar heraldo/barón gratis."),
    "Karthus": ("Farmea y te mata desde la base con R: guardá Zhonya o W.", "Pelear con poca vida cuando su R está lista."),
    "Zac": ("Engage desde muy lejos: guardá movilidad.", "Quedarte junto a tu equipo cuando él salta."),
    "Sejuani": ("Su R stunea a varios: separate.", "Pelear agrupados contra su R."),
    "Rek'Sai": ("Gana el nivel 2-3 y aparece debajo de la tierra.", "Hacer campamentos sin ward cerca de su túnel."),
    # mids
    "Ahri": ("Su E (encantamiento) corta tu all-in: entrá cuando la gaste.", "Usar E de Diana con su E lista."),
    "Syndra": ("Mucho poke y su E te stunea: entrá desde el costado.", "Caminar en línea recta hacia ella."),
    "Zed": ("Su R te marca: W de Diana justo cuando reaparece detrás tuyo.", "Pelear con media vida cuando tiene R."),
    "Katarina": ("Resetea con kills: guardá tu R para cortar su R.", "Dejar que use R sin interrumpir."),
    "Galio": ("Te gana la línea con escudo mágico y roamea con R.", "Pelearlo cuando tiene escudo pasivo."),
    "Akali": ("Se esconde en su humo: el Control Ward la revela.", "Perseguirla dentro del humo."),
    "Viktor": ("Mucho daño a distancia y escala: entrá al 3/6 cuando gastó su W.", "Pararte en su campo de gravedad."),
    "Orianna": ("Su bola marca dónde pega: no te quedes cerca de la bola.", "Entrar al rango de su R con tu equipo junto."),
    "Yone": ("Gana peleas largas y su R te junta: guardá Zhonya.", "Pelear en línea recta contra su R."),
    "LeBlanc": ("Daño explosivo y vuelve atrás: entrá después de su W.", "Gastar todo antes de que regrese."),
    "Yasuo": ("Su muro bloquea tu Q: esperá a que lo gaste.", "Tirar Q cuando tiene el muro listo."),
    "Lissandra": ("Te congela y te corta el all-in.", "Entrar primera contra su R."),
    "Twisted Fate": ("Roamea al 6: avisá a tus líneas cuando falta.", "Seguirlo sin visión."),
    "Fizz": ("Esquiva tu combo con E: entrá después de que la use.", "Pelear de cerca cuando tiene E."),
    "Kassadin": ("Débil antes del 6, fuerte después: ganale la línea temprano.", "Dejarlo farmear libre."),
    "Xerath": ("Poke enorme: farmeá con Q y entrá al 6 por el costado.", "Quedarte en su rango largo."),
    "Malzahar": ("Su R te suprime: Zhonya o W después.", "Pelear sin tu equipo cuando tiene R."),
    "Anivia": ("Su pared te corta el all-in.", "Entrar cuando tiene el muro listo."),
}

GENERAL = {
    "Nocturne|jungle": "Nocturne es un jungla de picos: débil en duelos tempranos, muy fuerte al 6 con R. Planificá tu primer recorrido para estar cerca de una línea con prioridad al 6. El W bloquea una habilidad: usalo contra el CC más importante del rival.",
    "Diana|jungle": "Diana tiene un clear muy rápido y peleas en grupo excelentes con R. Juntá ventaja de oro limpiando bien y buscá peleas de objetivo donde los rivales estén juntos.",
    "Diana|mid": "Diana mid gana con all-ins al 3 y al 6. Contra magos de poke, sobreviví la línea y ganá con roams. Contra asesinos, la que gaste primero pierde.",
}
