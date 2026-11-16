'use strict';
// Grabador de partida: con la API en vivo del juego guarda lo que hiciste hasta el minuto 14
// y el contexto de cada muerte. Un archivo por partida (si se corta la luz, no se pierde lo demás).
const fs = require('fs');
const path = require('path');
const { norm } = require('./util');
const { playerChamp, spellKey, findMe, itemsOf } = require('./ingame');
const { ADCS } = require('./select');
const autopsy = require('./autopsy');

const T14 = 840;
const T8 = 480;   // jungla: primer recorrido y primeros ganks
const MAX_GAP = 60;        // si el overlay no leyó la partida por más de esto antes del 14, no sirve para reglas
const MAX_FIRST_SEEN = 120;
const CONTROL_WARD = 2055;
const POSITION_ROLE = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', UTILITY: 'utility' };

class Recorder {
  constructor(dir) {
    this.dir = dir;
    this.rec = null;
    this.buffer = [];          // últimas lecturas (para saber tu oro justo antes de morir)
    this.lastPoll = 0;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* sin disco: seguimos en memoria */ }
  }

  // g: allgamedata. ctx: {db, alias, gameId, now}
  onPoll(g, ctx) {
    const gd = g.gameData || {};
    if (gd.gameMode && gd.gameMode !== 'CLASSIC') return null;
    if (gd.mapNumber && gd.mapNumber !== 11) return null;
    const t = gd.gameTime || 0;
    const me = findMe(g);
    if (!me) return null;
    const now = ctx.now || Date.now();
    const champ = playerChamp(me, ctx.alias);
    const newGame = !this.rec || (ctx.gameId && this.rec.gameId && ctx.gameId !== this.rec.gameId)
      || t < this.rec.last_t - 30 || this.rec.champ !== champ;
    if (newGame) this._start(t, champ, ctx, now);
    const r = this.rec;
    if (!r.role && POSITION_ROLE[me.position]) r.role = POSITION_ROLE[me.position];
    if (!r.gameId && ctx.gameId) r.gameId = ctx.gameId;
    if (t < T14) r.max_gap = Math.max(r.max_gap, t - r.last_t);
    r.last_t = t;
    r.last_wall = now;

    const players = g.allPlayers || [];
    const team = players.filter((p) => p.team === me.team);
    const sc = me.scores || {};
    const items = itemsOf(me);
    const gold = Math.trunc((g.activePlayer || {}).currentGold || 0);
    const db = ctx.db;

    // Control Wards compradas: cuando sube la cantidad en el inventario.
    const cwNow = (me.items || []).filter((it) => it.itemID === CONTROL_WARD).reduce((s, it) => s + (it.count || 1), 0);
    if (cwNow > r.cw_prev) r.cw_bought += cwNow - r.cw_prev;
    r.cw_prev = cwNow;
    if (r.item1 === null && items.some((i) => db.isLegendary(i))) r.item1 = Math.round(t / 6) / 10;

    const sample = { t, gold, level: me.level || 1, cs: sc.creepScore || 0, k: sc.kills || 0, d: sc.deaths || 0, a: sc.assists || 0,
      ward: sc.wardScore || 0, inv_value: items.reduce((s, i) => s + db.total(i), 0),
      team_kills: team.reduce((s, p) => s + ((p.scores || {}).kills || 0), 0) };
    this.buffer.push(sample);
    if (this.buffer.length > 40) this.buffer.shift();

    let fresh = null;
    const evs = ((g.events || {}).Events || []);
    for (const ev of evs) {
      // Clave estable del evento (no dependemos solo del EventID).
      const key = `${ev.EventName}|${ev.EventTime}|${ev.VictimName || ''}|${ev.KillerName || ''}`;
      if (r.seen.includes(key)) continue;
      r.seen.push(key);
      if (['DragonKill', 'BaronKill', 'HeraldKill', 'AtakhanKill'].includes(ev.EventName)) r.objectives.push(ev.EventTime);
      if (ev.EventName !== 'ChampionKill') continue;
      const victim = autopsy.matchPlayer(players, ev.VictimName);
      if (!victim) continue;
      if (victim === me) {
        fresh = this._death(ev, me, players, ctx);
        r.deaths.push(fresh);
      } else if (ctx.trackAdc !== false && victim.team === me.team && this._isAdc(victim, ctx)) {
        r.adc_deaths.push(ev.EventTime);
      }
    }
    // Objetivo cerca: se decide con los eventos que llegan después (hasta 45 s).
    for (const d of r.deaths) {
      d.objective_near = r.objectives.some((o) => o >= d.t - autopsy.OBJ_AFTER && o <= d.t + autopsy.OBJ_BEFORE);
    }

    // Foto del minuto 8 (solo la usan las reglas de jungla). Las grabaciones viejas no la tienen.
    if (!r.snap8 && t >= T8 && r.first_t <= MAX_FIRST_SEEN) {
      const s = sample;
      r.snap8 = {
        cs8: s.cs, lvl8: s.level,
        kp8: s.team_kills ? Math.min(100, 100 * (s.k + s.a) / s.team_kills) : 0,
        d8: r.deaths.filter((d) => d.t < T8).length,
      };
    }
    if (!r.snap14 && t >= T14) {
      const s = sample;
      r.snap14 = {
        d14: r.deaths.filter((d) => d.t < T14).length,
        kp14: s.team_kills ? Math.min(100, 100 * (s.k + s.a) / s.team_kills) : 0,
        vis14: s.ward,
        cw14: r.cw_bought,
        gold14: s.inv_value + s.gold,
        dg14: r.deaths.filter((d) => d.t < T14 && d.gold >= autopsy.GOLD_LIMIT).length,
      };
    }
    if (fresh || (r.snap14 && !r.saved14) || now - r.saved_at > 30000) {
      if (r.snap14) r.saved14 = true;
      this.save();
    }
    return { rec: r, fresh, now: sample };
  }

  _isAdc(p, ctx) {
    if (p.position === 'BOTTOM') return true;
    return !p.position && ADCS.has(playerChamp(p, ctx.alias));
  }

  _start(t, champ, ctx, now) {
    if (this.rec) this.save();
    this.buffer = [];
    this.rec = {
      v: 1, id: ctx.gameId ? `g${ctx.gameId}` : `w${now}`, gameId: ctx.gameId || null, champ,
      role: null,
      start_wall: now - Math.round(t * 1000), first_t: t, last_t: t, last_wall: now, max_gap: 0,
      cw_prev: 0, cw_bought: 0, item1: null, snap8: null, snap14: null, saved14: false, saved_at: 0,
      deaths: [], adc_deaths: [], objectives: [], seen: [], win: null, duration: null,
    };
  }

  _death(ev, me, players, ctx) {
    const t = ev.EventTime || 0;
    const before = this.buffer.filter((s) => s.t <= t + 0.5);
    const s = before.length ? before[before.length - 1] : this.buffer[this.buffer.length - 1] || {};
    const enemies = players.filter((p) => p.team !== me.team);
    const ids = [ev.KillerName, ...(ev.Assisters || [])];
    const attackers = [];
    for (const n of ids) {
      const p = autopsy.matchPlayer(enemies, n);
      if (!p || attackers.some((a) => a.p === p)) continue;
      const spells = ['summonerSpellOne', 'summonerSpellTwo'].map((k) => spellKey((p.summonerSpells || {})[k]));
      attackers.push({ p, champ: playerChamp(p, ctx.alias), level: p.level || 1,
        jungle: p.position === 'JUNGLE' || spells.includes('SummonerSmite'),
        killer: autopsy.matchPlayer([p], ev.KillerName) === p });
    }
    const lastAdc = this.rec.adc_deaths.filter((x) => x <= t).slice(-1)[0];
    const d = {
      t, gold: s.gold || 0, my_level: s.level || me.level || 1,
      killer_type: autopsy.killerType(ev.KillerName, players),
      attackers: attackers.map(({ champ, level, jungle, killer }) => ({ champ, level, jungle, killer: !!killer })),
      adc_died_before: lastAdc === undefined ? null : Math.round(t - lastAdc),
      objective_near: false,
    };
    return d;
  }

  save() {
    const r = this.rec;
    if (!r) return;
    r.saved_at = Date.now();
    try {
      const out = Object.assign({}, r, { seen: undefined });
      fs.writeFileSync(path.join(this.dir, `${r.id}.json`), JSON.stringify(out));
    } catch (e) { /* ignorar */ }
  }

  // Todas las partidas grabadas.
  loadAll() {
    const out = [];
    let files = [];
    try { files = fs.readdirSync(this.dir).filter((f) => f.endsWith('.json')); } catch (e) { return out; }
    for (const f of files) {
      try { out.push(JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'))); } catch (e) { /* archivo roto */ }
    }
    return out.sort((a, b) => (b.start_wall || 0) - (a.start_wall || 0));
  }

  // Une cada grabación con el resultado del historial del cliente (por id de partida, o campeón + hora).
  linkResults(recs, index) {
    let changed = 0;
    for (const r of recs) {
      if (r.win !== null && r.win !== undefined) continue;
      let hit = r.gameId ? index.find((x) => String(x.id) === String(r.gameId)) : null;
      if (!hit) hit = index.find((x) => norm(x.champ) === norm(r.champ) && Math.abs((x.created || 0) - (r.start_wall || 0)) < 15 * 60000);
      if (hit) {
        r.win = !!hit.win;
        r.duration = hit.duration || null;
        changed++;
        try { fs.writeFileSync(path.join(this.dir, `${r.id}.json`), JSON.stringify(r)); } catch (e) { /* ignorar */ }
      }
    }
    return changed;
  }
}

// Si el overlay estaba abierto desde el principio y no perdió el hilo antes del 14.
function completeEarly(r) {
  return r.first_t <= MAX_FIRST_SEEN && r.max_gap <= MAX_GAP && !!r.snap14;
}

// Fila para las reglas tempranas.
function earlyRow(r) {
  const item1 = r.item1 !== null && r.item1 !== undefined ? r.item1 : Math.max(30, (r.last_t || 0) / 60 + 5);
  return { win: r.win, champ: r.champ, id: r.id, f: Object.assign({}, r.snap14, r.snap8 || {}, { item1 }) };
}

module.exports = { Recorder, completeEarly, earlyRow, T14, T8 };
