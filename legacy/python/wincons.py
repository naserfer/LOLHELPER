"""Tus condiciones de victoria, aprendidas de TUS partidas.

Idea: en vez de compararte con un promedio de internet, buscamos en tu historial qué números
separan tus victorias de tus derrotas (ej. "cuando morís 4 o menos ganás 68%, si no 31%").
Con eso:
  1) Después de cada partida: cuáles cumpliste y cuál te costó la partida.
  2) Durante la partida: las que se pueden medir en vivo (muertes, participación, visión) con tu límite.

Cuidado estadístico (son pocas partidas):
  - Cada lado del corte necesita al menos MIN_SIDE partidas.
  - Las winrates se "encogen" hacia 50% (prior de 5 victorias y 5 derrotas) para no creerle a rachas.
  - Solo se muestran reglas con una diferencia grande y se avisa la confianza.
  - Prueba de permutación: mezclamos al azar tus victorias/derrotas muchas veces y vemos qué
    diferencia aparece "por suerte" buscando el mejor corte. La regla solo vale si la tuya es
    más grande que el 95% de esas. Así no te vendemos ruido como si fuera un patrón.
  - Cada número solo puede ir en el sentido que tiene lógica (menos muertes, más visión...).
"""
import random

MIN_SIDE = 7
MIN_GAP = 12.0       # puntos de winrate (ya encogida) entre cumplir y no cumplir
PRIOR = 5

PERMS = 300
# sentido permitido de cada regla
DIRS = {"deaths": ("<=",), "kp": (">=",), "vision_pm": (">=",), "cw": (">=",), "wk": (">=",),
        "dmg_pm": (">=",), "taken_pm": ("<=", ">="), "cc": (">=",)}
# clave: (texto, unidad, formato, se mide en vivo)
FEATURES = {
    "deaths":    ("Muertes", "", "{:.0f}", True),
    "kp":        ("Participación en kills", "%", "{:.0f}", True),
    "vision_pm": ("Visión por minuto", "/min", "{:.1f}", True),
    "cw":        ("Control Wards compradas", "", "{:.0f}", False),
    "wk":        ("Wards rotas", "", "{:.0f}", False),
    "dmg_pm":    ("Daño a campeones por minuto", "/min", "{:.0f}", False),
    "taken_pm":  ("Daño recibido por minuto", "/min", "{:.0f}", False),
    "cc":        ("Segundos de CC aplicados", "s", "{:.0f}", False),
}


def features(me, team, minutes):
    s = me.get("stats", {})
    tk = sum(p.get("stats", {}).get("kills", 0) for p in team) or 1
    m = max(minutes, 1)
    return {
        "deaths": s.get("deaths", 0),
        "kp": min(100.0, 100.0 * (s.get("kills", 0) + s.get("assists", 0)) / tk),
        "vision_pm": s.get("visionScore", 0) / m,
        "cw": s.get("visionWardsBoughtInGame", 0),
        "wk": s.get("wardsKilled", 0),
        "dmg_pm": s.get("totalDamageDealtToChampions", 0) / m,
        "taken_pm": s.get("totalDamageTaken", 0) / m,
        "cc": s.get("timeCCingOthers", 0),
    }


def _shr(w, g):
    return 100.0 * (w + PRIOR) / (g + 2 * PRIOR)


def _cands(vals):
    v = sorted(vals)
    n = len(v)
    return sorted({v[int(n * q / 20)] for q in range(2, 19)})


def _best(xs, wins, key):
    """Mejor corte para un número. xs y wins alineados."""
    n = len(xs)
    best = None
    for t in _cands(xs):
        for d in DIRS[key]:
            ok_g = ok_w = 0
            for x, w in zip(xs, wins):
                if (x <= t) if d == "<=" else (x >= t):
                    ok_g += 1
                    ok_w += w
            no_g, no_w = n - ok_g, sum(wins) - ok_w
            if ok_g < MIN_SIDE or no_g < MIN_SIDE:
                continue
            gap = _shr(ok_w, ok_g) - _shr(no_w, no_g)
            if best is None or gap > best[0]:
                best = (gap, d, t, (ok_w, ok_g), (no_w, no_g))
    return best


def learn(rows, seed=1):
    """rows: [{"win": bool, "f": {feature: valor}}]. Devuelve reglas ordenadas por impacto.

    Control de "patrones de casualidad" (Westfall-Young): en cada mezcla al azar de tus resultados
    tomamos la MAYOR diferencia entre TODOS los números. Una regla vale solo si la tuya le gana al
    95% de esas. Así, aunque probemos 8 números y muchos cortes, la chance de mostrarte una regla
    que es puro azar queda en ~5% para el historial completo, no por cada número."""
    if len(rows) < 2 * MIN_SIDE:
        return []
    wins = [int(r["win"]) for r in rows]
    cols = {k: [r["f"].get(k, 0) for r in rows] for k in FEATURES}
    found = {}
    for k, xs in cols.items():
        b = _best(xs, wins, k)
        if b and b[0] >= MIN_GAP:
            found[k] = b
    if not found:
        return []
    rnd = random.Random(seed)
    null_max = []
    for _ in range(PERMS):
        sh = wins[:]
        rnd.shuffle(sh)
        m = 0.0
        for k, xs in cols.items():
            nb = _best(xs, sh, k)
            if nb and nb[0] > m:
                m = nb[0]
        null_max.append(m)
    rules, hints = [], []
    for k, b in found.items():
        p = (1 + sum(g >= b[0] for g in null_max)) / (PERMS + 1)
        if p > 0.05:
            if p <= 0.3:
                hints.append({"key": k, "gap": b[0], "dir": b[1], "t": b[2], "ok": b[3], "no": b[4],
                              "p": round(p, 3), "conf": "pista"})
            continue
        rules.append({"key": k, "gap": b[0], "dir": b[1], "t": b[2], "ok": b[3], "no": b[4], "p": round(p, 3),
                      "conf": "alta" if p <= 0.01 else "media"})
    rules.sort(key=lambda r: -r["gap"])
    hints.sort(key=lambda r: r["p"])
    # Si casi no hay reglas confirmadas, mostramos 1-2 pistas marcadas como "sin confirmar".
    return (rules + hints[:max(0, 2 - len(rules))])[:5]


def rule_text(r):
    name, unit, fmt, _ = FEATURES[r["key"]]
    op = "≤" if r["dir"] == "<=" else "≥"
    return f"{name} {op} {fmt.format(r['t'])}{unit}"


def wr_of(pair):
    w, g = pair
    return 100.0 * w / g if g else 0.0


def check(rule, value):
    return value <= rule["t"] if rule["dir"] == "<=" else value >= rule["t"]


def review(rules, row):
    """Repaso de una partida contra tus reglas."""
    items = []
    for r in rules:
        v = row["f"].get(r["key"])
        if v is None:
            continue
        items.append({"rule": rule_text(r), "value": FEATURES[r["key"]][2].format(v) + FEATURES[r["key"]][1],
                      "ok": check(r, v), "gap": r["gap"], "wr_ok": wr_of(r["ok"]), "wr_no": wr_of(r["no"])})
    missed = [i for i in items if not i["ok"]]
    key = max(missed, key=lambda i: i["gap"]) if missed else None
    return {"win": row["win"], "champ": row.get("champ"), "items": items,
            "met": sum(i["ok"] for i in items), "total": len(items), "key_miss": key}


def live(rules, g, my_name_match):
    """Valores en vivo (API del juego) para las reglas medibles durante la partida."""
    ap = g.get("allPlayers", [])
    me = next((p for p in ap if my_name_match(p)), None)
    if not me:
        return []
    team = [p for p in ap if p.get("team") == me.get("team")]
    sc = me.get("scores", {})
    tk = sum(p.get("scores", {}).get("kills", 0) for p in team)
    minutes = max(1.0, (g.get("gameData", {}).get("gameTime") or 60) / 60)
    now = {"deaths": sc.get("deaths", 0),
           "kp": 100.0 * (sc.get("kills", 0) + sc.get("assists", 0)) / tk if tk else None,
           "vision_pm": sc.get("wardScore", 0) / minutes if minutes >= 5 else None}
    out = []
    for r in rules:
        name, unit, fmt, is_live = FEATURES[r["key"]]
        if not is_live or now.get(r["key"]) is None:
            continue
        v = now[r["key"]]
        ok = check(r, v)
        if r["key"] == "deaths":
            left = int(r["t"] - v)
            note = f"te quedan {left}" if left > 0 else ("es la última" if left == 0 else "pasaste tu límite: jugá a no morir")
        else:
            note = "vas bien" if ok else "abajo de tu meta"
        out.append({"key": r["key"], "rule": rule_text(r), "value": fmt.format(v) + unit, "ok": ok, "note": note,
                    "wr_ok": round(wr_of(r["ok"])), "wr_no": round(wr_of(r["no"]))})
    return out
