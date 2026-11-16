"""Modo support: recomendación según ADC aliado, support y ADC rivales."""
import re

ADCS = {"Aphelios", "Ashe", "Caitlyn", "Draven", "Ezreal", "Jhin", "Jinx", "Kai'Sa", "Kalista", "Kog'Maw",
        "Lucian", "Miss Fortune", "Nilah", "Samira", "Senna", "Sivir", "Smolder", "Tristana", "Twitch", "Varus",
        "Vayne", "Xayah", "Yunara", "Zeri", "Corki", "Ziggs", "Mel", "Swain", "Yasuo", "Hwei", "Seraphine"}


def norm(s):
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def support_guide(cfg, enemy_name, sup_index, dyn):
    """Guía 2v2: plan propio + dinámica por arquetipos + qué respetar del rival."""
    plan = cfg.get("plan", {})
    pre = list(plan.get("pre6", []))
    evitar = None
    por = "análisis de kits · números de op.gg"
    if enemy_name:
        e = sup_index.get(norm(enemy_name))
        if e:
            d = dyn.get(f"{cfg['arch']}|{e['arch']}")
            if d:
                pre.insert(0, d)
            pre.append(f"Respetá a {enemy_name}: {e['threat']['respect']}")
            evitar = e["threat"]["avoid"]
    lv1 = plan.get("lv1", "")
    if len(lv1) > 2 and lv1[0] in "QWE" and lv1[1] == ".":
        lv1 = f"Primer punto en {lv1[0]}. {lv1[2:].strip()}"
    return {"src": "analisis", "por": por, "lv1": lv1, "pre6": pre,
            "post6": plan.get("post6", ""), "evitar": evitar or "Pelear sin tu ADC cerca."}


def analyze_support(session, champs, pool, dyn, arch_label, adc_arch=None, personal=None):
    def cname(cid):
        return champs.get(cid, {}).get("name", f"#{cid}")

    def cdmg(cid):
        return champs.get(cid, {}).get("dmg", "?")

    local = session.get("localPlayerCellId")
    my_team = session.get("myTeam", [])
    their_team = session.get("theirTeam", [])
    bans = set()
    for group in session.get("actions", []):
        for a in group:
            if a.get("type") == "ban" and a.get("completed") and a.get("championId"):
                bans.add(a["championId"])
    b = session.get("bans") or {}
    bans.update(x for x in b.get("myTeamBans", []) + b.get("theirTeamBans", []) if x)

    me = next((p for p in my_team if p.get("cellId") == local), {})
    my_hover = me.get("championId") or me.get("championPickIntent") or 0
    allies = [p for p in my_team if p.get("cellId") != local]
    ally_ids = [p.get("championId") or p.get("championPickIntent") for p in allies]
    ally_ids = [a for a in ally_ids if a]
    adc_p = next((p for p in allies if p.get("assignedPosition") == "bottom"), None)
    ally_adc = None
    ally_adc_locked = False
    if adc_p and (adc_p.get("championId") or adc_p.get("championPickIntent")):
        ally_adc = cname(adc_p.get("championId") or adc_p.get("championPickIntent"))
        ally_adc_locked = bool(adc_p.get("championId"))
    if not ally_adc:  # cola sin roles asignados: el aliado que sea ADC
        ally_adc = next((cname(a) for a in ally_ids if cname(a) in ADCS), None)

    enemies = [p.get("championId") for p in their_team if p.get("championId")]
    enemy_names = [cname(e) for e in enemies]
    sup_set = {norm(c["name"]) for c in pool}
    sup_games = {}
    for c in pool:
        for n, m in c["matchups"].items():
            sup_games[norm(n)] = max(sup_games.get(norm(n), 0), m["games"])
    enemy_sup = next((cname(p["championId"]) for p in their_team
                      if p.get("assignedPosition") == "utility" and p.get("championId")), None)
    if not enemy_sup:
        cands = [n for n in enemy_names if norm(n) in sup_set or sup_games.get(norm(n), 0) >= 1500]
        enemy_sup = max(cands, key=lambda n: sup_games.get(norm(n), 0)) if cands else None
    enemy_adc = next((cname(p["championId"]) for p in their_team
                      if p.get("assignedPosition") == "bottom" and p.get("championId")), None)
    if not enemy_adc:
        enemy_adc = next((n for n in enemy_names if n in ADCS and n != enemy_sup), None)

    enemy_list = [{"name": cname(e), "dmg": cdmg(e)} for e in enemies]
    ad = sum(1 for e in enemy_list if e["dmg"] == "AD") + 0.5 * sum(1 for e in enemy_list if e["dmg"] == "MIX")
    ap = sum(1 for e in enemy_list if e["dmg"] == "AP") + 0.5 * sum(1 for e in enemy_list if e["dmg"] == "MIX")
    taken = bans | set(ally_ids) | set(enemies)
    taken_n = {norm(cname(t)) for t in taken}

    recs = []
    for c in pool:
        mu = {norm(k): (k, v) for k, v in c["matchups"].items()}
        score = (c["tier_wr"] - 50) / 1.5
        lane = None
        if enemy_sup and norm(enemy_sup) in mu:
            lane = mu[norm(enemy_sup)]
            score += 3 * lane[1]["score"]
        syn = None
        if ally_adc:
            syn = next(((k, v) for k, v in c["synergy"].items() if norm(k) == norm(ally_adc)), None)
            if syn:
                score += 2 * max(-3, min(3, syn[1]["delta"] / 1.2))
            elif adc_arch:
                # Dúo poco jugado: estimamos con cómo le va a ese ADC con este tipo de support.
                est = next((v for k, v in adc_arch.items()
                            if k.rsplit("|", 1)[1] == c["arch"] and norm(k.rsplit("|", 1)[0]) == norm(ally_adc)), None)
                if est is not None:
                    syn = (ally_adc, {"delta": est, "est": True})
                    score += 1 * max(-3, min(3, est / 1.2))
        mine = None
        if personal:
            mine = personal.get("by_champ", {}).get(norm(c["name"]))
            if ally_adc:
                pr = personal.get("pairs", {}).get(f"{c['name']}|{ally_adc}")
                if pr:
                    mine = dict(mine or {"g": 0, "w": 0}, pair=pr)
            # Tu propio historial pesa poco y solo con 3+ partidas: confort, no estadística.
            if mine and mine.get("g", 0) >= 3:
                score += max(-1.0, min(1.0, (100.0 * mine["w"] / mine["g"] - 50) / 15))
        cid = next((i for i, v in champs.items() if norm(v.get("name")) == norm(c["name"])), None)
        status = "ok"
        if cid in bans:
            status = "BANEADO"
        elif norm(c["name"]) in taken_n:
            status = "ALIADO" if cid in ally_ids else "RIVAL"
        recs.append({"name": c["name"], "score": round(score, 1), "status": status, "lane": lane,
                     "syn": syn, "cfg": c, "arch": arch_label.get(c["arch"], ""), "mine": mine})
    recs.sort(key=lambda r: (r["status"] != "ok", -r["score"]))

    threat = {}
    for c in pool:
        for n, m in c["matchups"].items():
            if m["games"] >= 500:
                threat.setdefault(n, []).append((-m["score"], c.get("pick", 1)))
    tscore = {n: sum(s * w for s, w in v) / max(1e-6, sum(w for _, w in v)) for n, v in threat.items() if len(v) >= 8}
    ban_sugg = [n for n, t in sorted(tscore.items(), key=lambda x: -x[1]) if t > 0 and norm(n) not in taken_n][:3]

    hover_name = cname(my_hover) if my_hover else None
    focus = next((r for r in recs if hover_name and norm(r["name"]) == norm(hover_name)), None)
    if focus is None:
        focus = next((r for r in recs if r["status"] == "ok"), recs[0] if recs else None)
    index = {norm(c["name"]): c for c in pool}
    if focus:
        focus["guide"] = support_guide(focus["cfg"], enemy_sup, index, dyn)

    shown = [r for r in recs if r["status"] == "ok"][:5]
    if focus and focus not in shown:
        shown.append(focus)
    return {
        "mode": "support",
        "phase": (session.get("timer") or {}).get("phase", ""),
        "enemies": enemy_list,
        "lane_enemy": enemy_sup,
        "enemy_adc": enemy_adc,
        "ally_adc": ally_adc,
        "ally_adc_locked": ally_adc_locked,
        "ad": ad, "ap": ap,
        "build_key": "default",
        "recs": shown,
        "ban_sugg": ban_sugg,
        "focus": focus,
        "adc_hist": (personal or {}).get("with_adc_map", {}).get(ally_adc) if ally_adc else None,
    }
