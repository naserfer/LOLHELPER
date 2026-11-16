'use strict';
// Tu historial: lee tus últimas partidas desde el cliente de League (local, sin API key).
//   /lol-summoner/v1/current-summoner
//   /lol-match-history/v1/products/lol/current-summoner/matches?begIndex=&endIndex=
//   /lol-match-history/v1/games/{gameId}
const fs = require('fs');
const path = require('path');
const { norm } = require('./util');
const wincons = require('./wincons');
const { ADCS } = require('./select');

const SR_QUEUES = new Set([400, 420, 430, 440, 480, 490]);
const MAX_GAMES = 100;
const PAGE = 20;
const SUPPORT_ITEM_IDS = new Set([3865, 3866, 3867, 3869, 3870, 3871, 3876, 3877]);
const SMITE = 11;

function role(p) {
  const st = p.stats || {};
  for (let i = 0; i < 7; i++) if (SUPPORT_ITEM_IDS.has(st[`item${i}`])) return 'support';
  if (p.spell1Id === SMITE || p.spell2Id === SMITE) return 'jungle';
  const tl = p.timeline || {};
  const lane = String(tl.lane || '').toUpperCase(), r = String(tl.role || '').toUpperCase();
  if (lane === 'BOTTOM' || lane === 'BOT') return r.includes('SUPPORT') ? 'support' : 'adc';
  return { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', MID: 'mid' }[lane] || '';
}

function summarize(games, puuid, champName) {
  const tot = { g: 0, w: 0 };
  const mates = {}, champs = {}, withAdc = {}, pair = {}, roles = {};
  const feats = [], index = [];
  const bump = (o, k, init) => (o[k] = o[k] || Object.assign({}, init));
  for (const gm of games) {
    if (!SR_QUEUES.has(gm.queueId) || (gm.gameDuration || 0) < 300) continue;
    const ids = {};
    for (const pi of gm.participantIdentities || []) ids[pi.participantId] = pi.player || {};
    const meId = Object.keys(ids).find((i) => ids[i].puuid === puuid);
    const parts = {};
    for (const p of gm.participants || []) parts[p.participantId] = p;
    const me = meId !== undefined ? parts[meId] : null;
    if (!me) continue;
    const win = !!(me.stats || {}).win;
    tot.g++; tot.w += win;
    const myChamp = champName(me.championId);
    const s = me.stats || {};
    const c = bump(champs, myChamp, { g: 0, w: 0, k: 0, d: 0, a: 0 });
    c.g++; c.w += win; c.k += s.kills || 0; c.d += s.deaths || 0; c.a += s.assists || 0;
    const myRole = role(me);
    roles[myRole || '?'] = (roles[myRole || '?'] || 0) + 1;
    const allies = Object.entries(parts).filter(([pid, p]) => p.teamId === me.teamId && String(pid) !== String(meId)).map(([, p]) => p);
    feats.push({ win, role: myRole, champ: myChamp, id: gm.gameId, f: wincons.features(me, allies.concat([me]), (gm.gameDuration || 0) / 60) });
    index.push({ id: gm.gameId, created: gm.gameCreation || 0, champ: myChamp, win, duration: gm.gameDuration || 0 });
    for (const p of allies) {
      const pl = ids[p.participantId] || {};
      const key = pl.puuid || pl.summonerName;
      if (!key) continue;
      const m = bump(mates, key, { g: 0, w: 0, name: '' });
      m.g++; m.w += win;
      const name = pl.gameName || pl.summonerName || '?';
      m.name = pl.tagLine ? `${name}#${pl.tagLine}` : name;
    }
    if (myRole === 'support') {
      const adc = allies.find((p) => role(p) === 'adc') || allies.find((p) => ADCS.has(champName(p.championId)) && role(p) !== 'jungle');
      if (adc) {
        const an = champName(adc.championId);
        const wa = bump(withAdc, an, { g: 0, w: 0 }); wa.g++; wa.w += win;
        const pr = bump(pair, `${myChamp}|${an}`, { g: 0, w: 0 }); pr.g++; pr.w += win;
      }
    }
  }
  const rows = (d, minG = 1) => Object.entries(d).filter(([, v]) => v.g >= minG)
    .map(([k, v]) => Object.assign({}, v, { key: k })).sort((a, b) => b.g - a.g || b.w - a.w);
  const mainRole = Object.keys(roles).sort((a, b) => roles[b] - roles[a])[0] || '';
  const same = feats.filter((r) => r.role === mainRole);
  const base = same.length >= 2 * wincons.MIN_SIDE + 6 ? same : feats;
  const rules = wincons.learn(base, wincons.FULL);
  const last = feats.length && rules.length ? wincons.review(rules, feats[0]) : null;
  const byChamp = {};
  for (const [k, v] of Object.entries(champs)) byChamp[norm(k)] = v;
  return {
    rules, rules_n: base.length, rules_role: base === same ? mainRole : 'todos', last_review: last,
    games: tot.g, wins: tot.w, mates: rows(mates, 2).slice(0, 8), champs: rows(champs).slice(0, 8),
    with_adc: rows(withAdc).slice(0, 8), pairs: pair, by_champ: byChamp, with_adc_map: withAdc, roles, index,
  };
}

class History {
  constructor(lcu, cacheDir, champName) {
    this.lcu = lcu;
    this.cacheDir = cacheDir;
    this.champName = champName;
    this.summary = null;
    this.version = 0;
    this.state = 'pendiente';
    this.last = 0;
    this.busy = false;
  }
  // Si ya hay una lectura en curso, devuelve esa misma (no lee dos veces a la vez).
  refresh(minInterval = 600000) {
    if (this.busy) return this.inflight;
    if (Date.now() - this.last < minInterval) return Promise.resolve(false);
    this.busy = true;
    this.inflight = this._refresh();
    return this.inflight;
  }

  async _refresh() {
    try {
      this.state = 'cargando';
      const me = (await this.lcu.get('/lol-summoner/v1/current-summoner')) || {};
      const puuid = me.puuid;
      if (!puuid) { this.state = 'sin cuenta'; return false; }
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const file = path.join(this.cacheDir, `history_${puuid.slice(0, 12)}.json`);
      let cache = {};
      try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { cache = {}; }
      const idsList = [];
      for (let beg = 0; beg < MAX_GAMES; beg += PAGE) {
        const res = (await this.lcu.get(`/lol-match-history/v1/products/lol/current-summoner/matches?begIndex=${beg}&endIndex=${beg + PAGE - 1}`)) || {};
        const lst = ((res.games || {}).games) || [];
        const fresh = lst.map((g) => g.gameId).filter((id) => id && !idsList.includes(id));
        if (!fresh.length) break;
        idsList.push(...fresh);
      }
      for (const gid of idsList) {
        if (cache[String(gid)]) continue;
        const g = await this.lcu.get(`/lol-match-history/v1/games/${gid}`);
        if (g) cache[String(gid)] = g;
      }
      const keep = new Set(idsList.map(String));
      const trimmed = {};
      for (const [k, v] of Object.entries(cache)) if (keep.has(k)) trimmed[k] = v;
      if (Object.keys(trimmed).length) cache = trimmed;
      fs.writeFileSync(file, JSON.stringify(cache));
      const games = Object.values(cache).sort((a, b) => (b.gameCreation || 0) - (a.gameCreation || 0));
      this.summary = summarize(games, puuid, this.champName);
      this.state = 'ok';
      this.version++;
      return true;
    } catch (e) {
      this.state = `error: ${e.message}`;
      return false;
    } finally {
      this.last = Date.now();
      this.busy = false;
    }
  }
}

module.exports = { History, summarize, role };
