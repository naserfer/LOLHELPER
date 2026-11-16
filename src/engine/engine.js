'use strict';
// Motor: junta cliente, partida en vivo, historial, grabador y autopsia, y arma lo que muestra la UI.
const fs = require('fs');
const path = require('path');
const { norm } = require('./util');
const { LCU, liveGame } = require('./lcu');
const { DataDragon } = require('./ddragon');
const select = require('./select');
const jgplan = require('./jgplan');
const ingame = require('./ingame');
const { History } = require('./history');
const wincons = require('./wincons');
const autopsy = require('./autopsy');
const scout = require('./scout');
const { Recorder, completeEarly, earlyRow, T14, T8 } = require('./recorder');

function migrateHistory(oldDir, newDir) {
  try {
    const files = fs.readdirSync(oldDir).filter((f) => /^history_.*\.json$/.test(f));
    if (!files.length) return;
    fs.mkdirSync(newDir, { recursive: true });
    for (const f of files) if (!fs.existsSync(path.join(newDir, f))) fs.copyFileSync(path.join(oldDir, f), path.join(newDir, f));
  } catch (e) { /* no había nada que migrar */ }
}

const EARLY_NEED = wincons.VALIDATED_NEED;
const STALE_GAME_MS = 20000;
const ROLE_CANON = { support: 'utility', utility: 'utility', middle: 'mid', mid: 'mid', bottom: 'adc', adc: 'adc' };
const HISTORY_ROLE = { utility: 'support', adc: 'adc' };
const canonicalRole = (role) => ROLE_CANON[String(role || '').toLowerCase()] || String(role || '').toLowerCase();
const historyRole = (role) => HISTORY_ROLE[canonicalRole(role)] || canonicalRole(role);

class Engine {
  constructor({ dataDir, userDir, demo = null }) {
    this.dataDir = dataDir;
    this.userDir = userDir;
    this.demo = demo;            // null | {session: file, game: file}
    this.lcu = new LCU();
    this.dd = new DataDragon(path.join(userDir, 'ddragon'));
    // Perfil: qué roles y campeones usa este jugador (naser = top + support, bitty = jungla + mid).
    const pid = process.env.PH_PROFILE || (this.readJson(path.join(dataDir, 'profile.json')) || {}).id || 'naser';
    this.profile = this.readJson(path.join(dataDir, 'profiles', `${pid}.json`));
    this.roles = {};
    this.pool = [];
    this.supPool = []; this.supDyn = {}; this.supLabels = {}; this.supAdcArch = {};
    for (const [role, cfg] of Object.entries(this.profile.roles)) {
      const d = JSON.parse(fs.readFileSync(path.join(dataDir, cfg.pool), 'utf8'));
      const pool = jgplan.mix(d.pool.map((c) => Object.assign({ role: role === 'utility' ? 'utility' : role === 'middle' ? 'mid' : role }, c)));
      this.roles[role] = { kind: cfg.kind, label: cfg.label, pool, meta: `${d.source || '?'} · parche ${d.patch || '?'}` };
      this.pool = this.pool.concat(pool);
      if (cfg.kind === 'support') {
        this.supPool = pool; this.supDyn = d.dyn || {}; this.supLabels = d.arch_label || {}; this.supAdcArch = d.adc_arch || {};
      }
    }
    this.settingsFile = path.join(userDir, 'settings.json');
    this.settings = Object.assign({ rol_por_defecto: this.profile.default_role, always_on_top: true }, this.readJson(this.settingsFile) || {});
    if (!this.roles[this.settings.rol_por_defecto]) this.settings.rol_por_defecto = this.profile.default_role;
    this.meta = this.roles[this.settings.rol_por_defecto].meta;
    this.champs = {};
    // Historial en su propia carpeta. En Windows "cache" es la misma carpeta que "Cache" de Chromium
    // (no distingue mayúsculas), así que lo que guardó la 2.0 ahí se copia a "historial".
    const histDir = path.join(userDir, 'historial');
    migrateHistory(path.join(userDir, 'cache'), histDir);
    this.history = new History(this.lcu, histDir, (cid) => this.champName(cid));
    this.recorder = new Recorder(path.join(userDir, 'partidas'));
    this.lastView = null;
    this.lastGame = null;
    this.gamePrev = {};
    this.heldOrders = [];
    this.scoutLine = null;
    this.scoutKey = '';
    this.gameEvents = [];
    this.gameId = null;
    this.ddLoaded = false;
    this.clientIcons = false;
    this.coach = null;
    this.coachKey = '';
    this.inGameSince = 0;
    this.wasInGame = false;
  }

  readJson(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; } }
  saveSettings(patch) {
    Object.assign(this.settings, patch);
    try { fs.writeFileSync(this.settingsFile, JSON.stringify(this.settings, null, 1)); } catch (e) { /* ignorar */ }
  }
  champName(cid) { return (this.champs[cid] || this.dd.champs[cid] || {}).name || `#${cid}`; }

  async loadData(offlineData) {
    if (this.ddLoaded) return;
    try {
      if (offlineData) this.dd.loadFrom(offlineData); else await this.dd.load();
      this.ddLoaded = true;
    } catch (e) { this.ddError = e.message; }
  }

  async loadChampions() {
    const champs = {};
    for (const [k, v] of Object.entries(this.dd.champs)) champs[k] = Object.assign({}, v);
    try {
      for (const c of (await this.lcu.get('/lol-game-data/assets/v1/champion-summary.json')) || []) {
        if (c.id > 0) champs[c.id] = Object.assign(champs[c.id] || { dmg: '?' }, { name: c.name });
      }
    } catch (e) { /* sin cliente */ }
    return champs;
  }

  selectView(session) {
    const me = (session.myTeam || []).find((p) => p.cellId === session.localPlayerCellId) || {};
    const pos = me.assignedPosition || '';
    const role = this.roles[pos] ? pos : this.settings.rol_por_defecto;
    const r = this.roles[role];
    this.meta = r.meta;
    if (r.kind === 'support') {
      return select.analyzeSupport(session, this.champs, r.pool, this.supDyn, this.supLabels, this.supAdcArch, this.history.summary);
    }
    return select.analyzeLane(session, this.champs, r.pool, role);
  }

  // Agrega lo que la UI necesita y no puede calcular sola (plan del pick elegido).
  decorate(v) {
    if (v && v.focus) {
      v.plan = select.planFor(v.focus, v.build_key);
      v.win_line = select.gamePlan(v);
    }
    return v;
  }

  // Las grabaciones nuevas guardan la posición del juego. En las antiguas, el rol
  // se puede recuperar solo cuando el campeón pertenece a un único pool del perfil.
  coachRoleForRec(rec) {
    const explicit = canonicalRole(rec && rec.role);
    if (explicit && Object.keys(this.roles).some((role) => canonicalRole(role) === explicit)) return explicit;
    const champ = norm((rec || {}).champ);
    if (!champ) return null;
    const matches = Object.entries(this.roles).filter(([, cfg]) => cfg.pool.some((c) => norm(c.name) === champ));
    return matches.length === 1 ? canonicalRole(matches[0][0]) : null;
  }

  // ------------------------------------------------------------- partida en vivo
  gameStep(g, now) {
    const hint = this.lastView ? this.lastView.lane_enemy : null;
    this.gamePrev.track_adc = this.profile.track_adc !== false;
    const gv = ingame.analyzeGame(g, this.pool, this.dd.itemdb, this.dd.dmgByName, this.dd.alias, hint, this.gamePrev,
      [this.supPool, this.supDyn]);
    if (!gv) return null;
    const rec = this.recorder.onPoll(g, { db: this.dd.itemdb, alias: this.dd.alias, gameId: this.gameId, now, trackAdc: this.profile.track_adc });
    if (gv.legend_seen) {
      this.gamePrev.legend_seen = gv.legend_seen;
      this.gamePrev.legend_ready = true;
      delete gv.legend_seen;
    }
    if (gv.jg_seen) { this.gamePrev.jg_seen = gv.jg_seen; delete gv.jg_seen; }
    if ('adc_dead' in gv) {
      this.gamePrev.adc_seen = gv.adc_seen;
      this.gamePrev.adc_dead = gv.adc_dead;
      delete gv.adc_seen;
      delete gv.adc_dead;
    }
    if (gv.lane) {
      this.gamePrev.lane_name = gv.lane.champ;
      this.gamePrev.lane_items = gv.lane_items_raw;
    }
    const born = (gv.orders || []).filter((o) => o.until != null);
    const standing = (gv.orders || []).filter((o) => o.until == null);
    this.heldOrders = (this.heldOrders || []).filter((o) => gv.time <= o.until);
    for (const o of born) {
      if (!this.heldOrders.some((h) => h.pri === o.pri && h.text === o.text)) this.heldOrders.push(o);
    }
    gv.orders = this.heldOrders.concat(standing);
    if (gv.time < 25 && this.scoutLine) gv.orders.push({ pri: 7, text: this.scoutLine });
    if (gv.time < 25 && this.lastView && this.lastView.win_line) gv.win_line = this.lastView.win_line;
    // Support: plan de bot con los picks reales de la partida. En el overlay, una línea corta al empezar
    // (hasta 1:30, cuando llegan a la línea) y otra 20 s al llegar al 6, si el 6 cambia algo.
    // Jungla/mid (Bitty): mismo esquema que el plan de bot.
    if (!gv.support_mode && (gv.role === 'jungle' || gv.role === 'mid')) {
      const me = ingame.findMe(g);
      gv.jg_plan = select.jgPlanLive(this.pool, gv.me.champ, gv.role, g.allPlayers, me && me.team);
      const jp = gv.jg_plan;
      if (jp && (gv.me.level || 1) >= 6 && this.gamePrev.lvl6_at == null) this.gamePrev.lvl6_at = gv.time;
      const at6 = this.gamePrev.lvl6_at;
      if (jp && jp.hud && gv.time < 90) { gv.win_line = jp.hud; gv.win_until = 90; }
      else if (jp && jp.hud6 && at6 != null && gv.time - at6 < 20) { gv.win_line = jp.hud6; gv.win_until = at6 + 20; }
    }
    if (gv.support_mode) {
      gv.bot_plan = select.botPlanLive(this.supPool, this.supAdcArch, gv.me.champ, gv.ally_adc, gv.enemy_sup,
        gv.enemy_adc ? gv.enemy_adc.champ : null);
      const bp = gv.bot_plan;
      if (bp && (gv.me.level || 1) >= 6 && this.gamePrev.lvl6_at == null) this.gamePrev.lvl6_at = gv.time;
      const at6 = this.gamePrev.lvl6_at;
      if (bp && bp.hud && gv.time < 90) { gv.win_line = bp.hud; gv.win_until = 90; }
      else if (bp && bp.hud6 && at6 != null && gv.time - at6 < 20) { gv.win_line = bp.hud6; gv.win_until = at6 + 20; }
    }
    const t = gv.time;
    for (const ev of gv.events) this.gameEvents.push([t, ev]);
    this.gameEvents = this.gameEvents.filter(([et]) => t - et < 75 && et <= t);
    gv.alerts = this.gameEvents.slice().reverse().map(([, ev]) => ev).concat(gv.alerts).slice(0, 6);
    if (rec) {
      const r = rec.rec;
      const last = r.deaths[r.deaths.length - 1];
      if (last && t - last.t < 12 && t >= last.t) gv.death = Object.assign({ t: last.t }, autopsy.tipFor(last));
      gv.rules_live = this.liveRules(g, gv, r, rec.now);
      const early = (this.coach && this.coach.earlyByRole || {})[canonicalRole(gv.role)];
      gv.rules_early = !!(early && early.ready && early.rules.length);
    }
    gv.why = {};
    for (const it of new Set([...(gv.queue || []), ...((gv.buy || {}).also || [])])) gv.why[it] = ingame.reasonText(it, gv);
    return gv;
  }

  liveRules(g, gv, r, now) {
    const coach = this.coach || {};
    const early = (coach.earlyByRole || {})[canonicalRole(gv.role)];
    const t = gv.time;
    if (early && early.ready && early.rules.length && t <= T14 + 60) {
      const out = [];
      const pace = Math.min(1, t / T14);
      const vals = {
        d14: r.deaths.filter((d) => d.t < T14).length,
        dg14: r.deaths.filter((d) => d.t < T14 && d.gold >= autopsy.GOLD_LIMIT).length,
        cw14: r.cw_bought, vis14: now.ward, gold14: now.inv_value + now.gold,
        kp14: now.team_kills ? Math.min(100, 100 * (now.k + now.a) / now.team_kills) : null,
        item1: r.item1 !== null ? r.item1 : t / 60,
        // jungla (foto del 8): en vivo hasta el 8, después queda fija
        cs8: r.snap8 ? r.snap8.cs8 : now.cs, lvl8: r.snap8 ? r.snap8.lvl8 : now.level,
        kp8: r.snap8 ? r.snap8.kp8 : now.team_kills ? Math.min(100, 100 * (now.k + now.a) / now.team_kills) : null,
        d8: r.deaths.filter((d) => d.t < T8).length,
      };
      for (const rule of early.rules) {
        const v = vals[rule.key];
        if (v === null || v === undefined) continue;
        const sp = wincons.EARLY_JG[rule.key];
        let ok, note;
        if (rule.key === 'item1') {
          ok = v <= rule.t;
          note = r.item1 !== null ? (ok ? 'cumplida' : 'tarde') : ok ? `te quedan ${Math.ceil(rule.t - v)} min` : 'ya pasaste tu tiempo';
        } else if (rule.dir === '<=') {
          ok = v <= rule.t;
          const left = Math.floor(rule.t - v);
          note = left > 0 ? `te quedan ${left}` : left === 0 ? 'no te podés pasar' : 'te pasaste: jugá a no morir';
        } else {
          const at8 = /8$/.test(rule.key);
          const goal = rule.t * (at8 ? Math.min(1, t / T8) : pace);
          ok = v >= goal;
          note = `meta al ${at8 ? 8 : 14}: ${wincons.fmtNum(rule.t, sp.fmt)}${sp.unit} · ${ok ? 'vas bien' : 'vas atrás'}`;
        }
        out.push({ key: rule.key, rule: wincons.ruleText(rule, wincons.EARLY_JG), value: wincons.fmtNum(v, sp.fmt) + sp.unit,
          ok, note, wr_ok: Math.round(wincons.wrOf(rule.ok)), wr_no: Math.round(wincons.wrOf(rule.no)), early: true });
      }
      return out;
    }
    // Reglas de partida completa (menos confiables): solo las que se miden en vivo.
    const hs = this.history.summary;
    const historyModel = hs && (hs.rules_by_role || {})[historyRole(gv.role)];
    if (!historyModel || !historyModel.rules || !historyModel.rules.length) return [];
    const minutes = Math.max(1, t / 60);
    const vals = { deaths: now.d, kp: now.team_kills ? 100 * (now.k + now.a) / now.team_kills : null,
      vision_pm: minutes >= 5 ? now.ward / minutes : null };
    const out = [];
    for (const rule of historyModel.rules) {
      const sp = wincons.FULL[rule.key];
      const v = vals[rule.key];
      if (!sp.live || v === null || v === undefined) continue;
      const ok = wincons.check(rule, v);
      let note = ok ? 'vas bien' : 'abajo de tu meta';
      if (rule.key === 'deaths') {
        const left = Math.floor(rule.t - v);
        note = left > 0 ? `te quedan ${left}` : left === 0 ? 'no te podés pasar' : 'te pasaste: jugá a no morir';
      }
      out.push({ key: rule.key, rule: wincons.ruleText(rule), value: wincons.fmtNum(v, sp.fmt) + sp.unit, ok, note,
        wr_ok: Math.round(wincons.wrOf(rule.ok)), wr_no: Math.round(wincons.wrOf(rule.no)), early: false });
    }
    return out;
  }

  // ------------------------------------------------------------- coach (post-partida)
  computeCoach(force = false) {
    const recs = this.recorder.loadAll();
    const hs = this.history.summary;
    const key = `${this.history.version}|${recs.length}|${recs.map((r) => `${r.id}:${r.deaths.length}:${r.win}:${r.role || ''}`).join(',')}`;
    if (!force && key === this.coachKey && this.coach) return this.coach;
    if (hs && hs.index) this.recorder.linkResults(recs, hs.index);
    const usable = recs.filter((r) => completeEarly(r) && r.win !== null && r.win !== undefined);
    const earlyByRole = {};
    for (const [configuredRole, cfg] of Object.entries(this.roles)) {
      const role = canonicalRole(configuredRole);
      const roleRows = usable.filter((r) => this.coachRoleForRec(r) === role)
        .slice().sort((a, b) => (a.start_wall || 0) - (b.start_wall || 0));
      const rows = roleRows.map(earlyRow);
      const model = wincons.learnValidated(rows, wincons.earlySpec(role, rows), 7);
      earlyByRole[role] = Object.assign({ role, label: cfg.label }, model);
    }
    const early = earlyByRole[canonicalRole(this.settings.rol_por_defecto)] || Object.values(earlyByRole)[0]
      || Object.assign({ role: '', label: '' }, wincons.learnValidated([], wincons.EARLY));
    const aut = autopsy.summarize(recs);
    const lastRec = recs[0] || null;
    let last = null;
    if (lastRec) {
      const deaths = lastRec.deaths.slice().sort((a, b) => a.t - b.t).map((d) => Object.assign({ t: d.t }, autopsy.tipFor(d)));
      const role = this.coachRoleForRec(lastRec);
      const roleModel = role ? earlyByRole[role] : null;
      last = { champ: lastRec.champ, role, role_label: roleModel && roleModel.label, win: lastRec.win, deaths, complete: completeEarly(lastRec),
        snap14: lastRec.snap14, item1: lastRec.item1, review_early: null };
      if (roleModel && roleModel.ready && roleModel.rules.length && completeEarly(lastRec)) {
        last.review_early = wincons.review(roleModel.rules, earlyRow(lastRec), wincons.EARLY_JG);
      }
    }
    this.coach = { early, earlyByRole, autopsy: aut, last, recorded: recs.length,
      early_rules_text: Object.fromEntries(Object.entries(earlyByRole).map(([role, model]) => [role,
        model.rules.map((r) => Object.assign({ text: wincons.ruleText(r, wincons.EARLY_JG),
          wr_ok: wincons.wrOf(r.ok), wr_no: wincons.wrOf(r.no) }, r))])) };
    this.coachKey = key;
    return this.coach;
  }

  historyView() {
    const s = this.history.summary;
    if (!s) return { state: this.history.state };
    return {
      state: this.history.state, games: s.games, wins: s.wins, mates: s.mates, champs: s.champs, with_adc: s.with_adc,
      rules: s.rules.map((r) => Object.assign({ text: wincons.ruleText(r), wr_ok: wincons.wrOf(r.ok), wr_no: wincons.wrOf(r.no) }, r)),
      rules_by_role: Object.fromEntries(Object.entries(s.rules_by_role || {}).map(([role, model]) => [role, Object.assign({}, model, {
        rules: model.rules.map((r) => Object.assign({ text: wincons.ruleText(r), wr_ok: wincons.wrOf(r.ok), wr_no: wincons.wrOf(r.no) }, r)),
        candidates: model.candidates.map((r) => Object.assign({ text: wincons.ruleText(r),
          wr_ok: wincons.wrOf(r.validation.ok), wr_no: wincons.wrOf(r.validation.no) }, r)),
      })])),
      rules_n: s.rules_n, rules_role: s.rules_role, last_review: s.last_review,
    };
  }

  // Scout del lobby, sin frenar el pick. Un 404 de un jugador se saltea.
  kickScout(session) {
    const players = [...(session.myTeam || []), ...(session.theirTeam || [])];
    const key = players.map((p) => `${p.puuid || ''}:${p.championId || p.championPickIntent || 0}:${p.assignedPosition || ''}`).join('|');
    if (key === this.scoutKey) return;
    this.scoutKey = key;
    const local = players.find((p) => p.cellId === session.localPlayerCellId);
    const mine = (session.myTeam || []).filter((p) => p.puuid && p !== local);
    Promise.all(mine.map((p) => this.scoutOne(p))).then((rows) => {
      if (this.scoutKey !== key) return;
      this.scoutLine = scout.report(rows.filter(Boolean));
    }).catch(() => {});
  }
  async scoutOne(p) {
    let res;
    try { res = await this.lcu.get(`/lol-match-history/v1/products/lol/${encodeURIComponent(p.puuid)}/matches?begIndex=0&endIndex=19`); }
    catch (e) { return null; }
    const list = ((res || {}).games || {}).games || [];
    const games = [];
    for (const row of list.slice(0, 20)) {
      if (!row.gameId) continue;
      let g;
      try { g = await this.lcu.get(`/lol-match-history/v1/games/${row.gameId}`); } catch (e) { continue; }
      const one = g && scout.fromHistoryGame(g, p.puuid, (cid) => this.champName(cid));
      if (one) games.push(one);
    }
    return { role: scout.roleOf(p.assignedPosition), champ: this.champName(p.championId || p.championPickIntent || 0), games };
  }

  // ------------------------------------------------------------- paso principal
  async step(opts = {}) {
    const now = opts.now || Date.now();
    await this.loadData(opts.offlineData);
    if (!this.clientIcons && !this.demo && this.ddLoaded) {
      this.clientIcons = true;
      this.dd.useClientItemIcons(this.lcu).then((n) => { if (n) this.iconsVersion = (this.iconsVersion || 0) + 1; });
    }
    const g = this.demo && this.demo.game ? this.readJson(path.join(this.dataDir, this.demo.game))
      : this.demo ? null : await liveGame();
    if (g) {
      if (!this.wasInGame) {
        this.wasInGame = true;
        this.gamePrev = {};
        this.heldOrders = [];
        this.gameId = null;
        this.lcu.get('/lol-gameflow/v1/session').then((s) => { this.gameId = ((s || {}).gameData || {}).gameId || null; }).catch(() => {});
      }
      const gv = this.gameStep(g, now);
      if (gv) { this.lastGame = [now, gv]; return { view: gv, status: ['ingame', 'En partida'] }; }
    }
    if (this.lastGame && now - this.lastGame[0] < STALE_GAME_MS) return { view: this.lastGame[1], status: ['ingame', 'En partida'] };
    if (this.wasInGame) {         // terminó la partida
      this.wasInGame = false;
      this.recorder.save();
      this.computeCoach(true);    // la autopsia de la partida que terminó, ya
      this.history.last = 0;      // actualizar historial para saber si ganaste
    }
    if (this.demo) {
      const session = this.readJson(path.join(this.dataDir, this.demo.session || 'demo_session_support.json'));
      if (session && session._champs) {
        for (const [k, v] of Object.entries(session._champs)) this.champs[k] = v;
        delete session._champs;
      }
      if (!Object.keys(this.champs).length) this.champs = Object.assign({}, this.dd.champs);
      if (this.demo.idle) return { view: null, status: ['idle', 'DEMO'] };
      return { view: this.decorate(this.selectView(session)), status: ['live', 'DEMO'] };
    }
    let session;
    try {
      if (!Object.keys(this.champs).length) this.champs = await this.loadChampions();
      session = await this.lcu.get('/lol-champ-select/v1/session');
    } catch (e) {
      if (e.offline) { this.champs = {}; return { view: null, status: ['off', 'Sin cliente'] }; }
      return { view: null, status: ['off', `Error: ${e.message}`] };
    }
    this.history.refresh().then((changed) => { if (changed) this.computeCoach(true); });
    if (!session) {
      let phase = null;
      try { phase = await this.lcu.get('/lol-gameflow/v1/gameflow-phase'); } catch (e) { /* ignorar */ }
      if (this.lastView && ['GameStart', 'InProgress', 'Reconnect', 'WaitingForStats', 'PreEndOfGame'].includes(phase)) {
        return { view: this.lastView, status: ['game', 'En partida'] };
      }
      if (['EndOfGame', 'Lobby', 'None', null, 'Matchmaking', 'ReadyCheck'].includes(phase)) this.lastView = null;
      return { view: null, status: ['idle', 'Esperando champ select'] };
    }
    const view = this.decorate(this.selectView(session));
    view.scout = this.scoutLine || null;
    this.kickScout(session);
    this.lastView = view;
    return { view, status: ['live', 'En champ select'] };
  }
}

module.exports = { Engine, EARLY_NEED };
