'use strict';
// Champ select: análisis para top (pool.json) y para support (pool_support.json).
const { norm, sortBy, round1, clamp } = require('./util');
const botlane = require('./botlane');
const jgplan = require('./jgplan');

const ADCS = new Set(["Aphelios", "Ashe", "Caitlyn", "Draven", "Ezreal", "Jhin", "Jinx", "Kai'Sa", "Kalista", "Kog'Maw",
  "Lucian", "Miss Fortune", "Nilah", "Samira", "Senna", "Sivir", "Smolder", "Tristana", "Twitch", "Varus",
  "Vayne", "Xayah", "Yunara", "Zeri", "Corki", "Ziggs", "Mel", "Swain", "Yasuo", "Hwei", "Seraphine"]);

function sessionBasics(session, champs) {
  const cname = (cid) => (champs[cid] || {}).name || `#${cid}`;
  const cdmg = (cid) => (champs[cid] || {}).dmg || '?';
  const bans = new Set();
  for (const group of session.actions || []) for (const a of group) {
    if (a.type === 'ban' && a.completed && a.championId) bans.add(a.championId);
  }
  const b = session.bans || {};
  for (const x of [...(b.myTeamBans || []), ...(b.theirTeamBans || [])]) if (x) bans.add(x);
  const local = session.localPlayerCellId;
  const myTeam = session.myTeam || [];
  const theirTeam = session.theirTeam || [];
  const me = myTeam.find((p) => p.cellId === local) || {};
  return { cname, cdmg, bans, local, myTeam, theirTeam, me };
}

function dmgCount(enemyList) {
  const ad = enemyList.filter((e) => e.dmg === 'AD').length + 0.5 * enemyList.filter((e) => e.dmg === 'MIX').length;
  const ap = enemyList.filter((e) => e.dmg === 'AP').length + 0.5 * enemyList.filter((e) => e.dmg === 'MIX').length;
  return [ad, ap];
}

function cidOf(champs, name) {
  for (const [i, v] of Object.entries(champs)) if (norm(v.name) === norm(name)) return parseInt(i, 10);
  return null;
}

// ------------------------------------------------------------------ top
function analyzeLane(session, champs, pool, role = 'top') {
  const { cname, cdmg, bans, local, myTeam, theirTeam, me } = sessionBasics(session, champs);
  const myHover = me.championId || me.championPickIntent || 0;
  const allies = myTeam.filter((p) => p.cellId !== local).map((p) => p.championId || p.championPickIntent).filter(Boolean);
  const enemies = theirTeam.map((p) => p.championId).filter(Boolean);
  const et = theirTeam.find((p) => p.assignedPosition === role && p.championId);
  const enemyTop = et ? et.championId : null;
  const taken = new Set([...bans, ...allies, ...enemies]);
  const enemyList = enemies.map((e) => ({ name: cname(e), dmg: cdmg(e) }));
  const enemyNames = enemyList.map((e) => e.name);
  const [ad, ap] = dmgCount(enemyList);

  const gamesAsTop = {};
  for (const c of pool) for (const [n, m] of Object.entries(c.matchups)) {
    gamesAsTop[norm(n)] = Math.max(gamesAsTop[norm(n)] || 0, m.games || 0);
  }
  let laneEnemy = null;
  if (enemyTop) laneEnemy = cname(enemyTop);
  else {
    // Sin roles visibles: el rival más probable es el que más partidas tiene en esta posición.
    const minGames = Math.max(...Object.values(gamesAsTop), 0) >= 3000 ? 300 : 100;
    const cands = enemyNames.filter((n) => (gamesAsTop[norm(n)] || 0) >= minGames).map((n) => [gamesAsTop[norm(n)], n]);
    if (cands.length) laneEnemy = sortBy(cands, (x) => x).slice(-1)[0][1];
  }
  let buildKey = 'default';
  if (enemies.length >= 3 && ad >= ap + 2) buildKey = 'vs_ad';
  else if (enemies.length >= 3 && ap >= ad + 2) buildKey = 'vs_ap';

  const recs = [];
  for (const c of pool) {
    const mu = {};
    for (const [k, v] of Object.entries(c.matchups)) mu[norm(k)] = [k, v];
    let score = 0;
    let lane = null;
    if (laneEnemy && mu[norm(laneEnemy)]) { lane = mu[norm(laneEnemy)]; score += 3 * lane[1].score; }
    else if (!laneEnemy) score += c.blind || 0;
    const cb = c.comp_bonus || {};
    score += (cb.AD || 0) * ad + (cb.AP || 0) * ap;
    const cid = cidOf(champs, c.name);
    let status = 'ok';
    if (bans.has(cid)) status = 'BANEADO';
    else if (allies.includes(cid)) status = 'ALIADO';
    else if (enemies.includes(cid)) status = 'RIVAL';
    recs.push({ name: c.name, score: round1(score), status, lane, cfg: c });
  }
  sortBy(recs, (r) => [r.status !== 'ok', -r.score]);

  const threat = {};
  for (const c of pool) for (const [n, m] of Object.entries(c.matchups)) {
    if ((m.games || 0) >= 500) threat[n] = (threat[n] || 0) - m.score;
  }
  const takenNames = new Set([...taken].map((t) => norm(cname(t))));
  const banSugg = sortBy(Object.entries(threat), (x) => [-x[1]])
    .filter(([n, t]) => t > 0 && !takenNames.has(norm(n))).slice(0, 3).map(([n]) => n);

  const hoverName = myHover ? cname(myHover) : null;
  let focus = recs.find((r) => hoverName && norm(r.name) === norm(hoverName)) || null;
  if (!focus) focus = recs.find((r) => r.status === 'ok') || recs[0] || null;
  if (focus && focus.lane && focus.lane[1].guide) focus.guide = focus.lane[1].guide;
  if (focus && (role === 'jungle' || role === 'middle' || role === 'mid')) {
    const enemiesByPos = {};
    for (const p of theirTeam) if (p.assignedPosition && p.championId) enemiesByPos[p.assignedPosition] = cname(p.championId);
    if (role === 'jungle' && laneEnemy) enemiesByPos.jungle = laneEnemy;
    focus.jg = jgplan.plan({ me: focus.cfg, mu: focus.lane ? focus.lane[1] : null, laneEnemy, enemies: enemiesByPos });
  }
  return {
    mode: role, phase: (session.timer || {}).phase || '', enemies: enemyList, lane_enemy: laneEnemy,
    ad, ap, build_key: buildKey, recs, ban_sugg: banSugg, focus,
  };
}

const BUILD_LABEL = { default: 'estándar', vs_ad: 'vs equipo AD', vs_ap: 'vs equipo AP' };

function planFor(f, buildKey) {
  const cfg = f.cfg;
  const m = f.lane ? f.lane[1] : {};
  const build = cfg.builds[buildKey] || cfg.builds.default;
  return {
    start: m.start || cfg.start,
    start_note: m.start ? null : cfg.start_note || null,
    boots: m.boots || build.boots || cfg.boots,
    first: m.first || null,
    build: build.items,
    runes: cfg.runes,
    spells: cfg.spells,
    skills: cfg.skills,
    tip: m.tip || null,
    general: cfg.general,
    pro: m.pro || null,
  };
}

// ------------------------------------------------------------------ support
function supportGuide(cfg, enemyName, supIndex, dyn) {
  const plan = cfg.plan || {};
  const pre = [...(plan.pre6 || [])];
  let evitar = null;
  if (enemyName) {
    const e = supIndex[norm(enemyName)];
    if (e) {
      const d = dyn[`${cfg.arch}|${e.arch}`];
      if (d) pre.unshift(d);
      pre.push(`Respetá a ${enemyName}: ${e.threat.respect}`);
      evitar = e.threat.avoid;
    }
  }
  let lv1 = plan.lv1 || '';
  if (lv1.length > 2 && 'QWE'.includes(lv1[0]) && lv1[1] === '.') lv1 = `Primer punto en ${lv1[0]}. ${lv1.slice(2).trim()}`;
  return { src: 'analisis', por: 'análisis de kits · números de op.gg', lv1, pre6: pre,
    post6: plan.post6 || '', evitar: evitar || 'Pelear sin tu ADC cerca.' };
}

function analyzeSupport(session, champs, pool, dyn, archLabel, adcArch, personal) {
  const { cname, cdmg, bans, local, myTeam, theirTeam, me } = sessionBasics(session, champs);
  const myHover = me.championId || me.championPickIntent || 0;
  const allies = myTeam.filter((p) => p.cellId !== local);
  const allyIds = allies.map((p) => p.championId || p.championPickIntent).filter(Boolean);
  const adcP = allies.find((p) => p.assignedPosition === 'bottom');
  let allyAdc = null;
  let allyAdcLocked = false;
  if (adcP && (adcP.championId || adcP.championPickIntent)) {
    allyAdc = cname(adcP.championId || adcP.championPickIntent);
    allyAdcLocked = Boolean(adcP.championId);
  }
  if (!allyAdc) { const a = allyIds.find((x) => ADCS.has(cname(x))); allyAdc = a ? cname(a) : null; }

  const enemies = theirTeam.map((p) => p.championId).filter(Boolean);
  const enemyNames = enemies.map(cname);
  const supSet = new Set(pool.map((c) => norm(c.name)));
  const supGames = {};
  for (const c of pool) for (const [n, m] of Object.entries(c.matchups)) supGames[norm(n)] = Math.max(supGames[norm(n)] || 0, m.games);
  const es = theirTeam.find((p) => p.assignedPosition === 'utility' && p.championId);
  let enemySup = es ? cname(es.championId) : null;
  if (!enemySup) {
    const cands = enemyNames.filter((n) => supSet.has(norm(n)) || (supGames[norm(n)] || 0) >= 1500);
    if (cands.length) enemySup = cands.reduce((a, b) => ((supGames[norm(b)] || 0) > (supGames[norm(a)] || 0) ? b : a));
  }
  const ea = theirTeam.find((p) => p.assignedPosition === 'bottom' && p.championId);
  let enemyAdc = ea ? cname(ea.championId) : null;
  if (!enemyAdc) enemyAdc = enemyNames.find((n) => ADCS.has(n) && n !== enemySup) || null;

  const enemyList = enemies.map((e) => ({ name: cname(e), dmg: cdmg(e) }));
  const [ad, ap] = dmgCount(enemyList);
  const taken = new Set([...bans, ...allyIds, ...enemies]);
  const takenN = new Set([...taken].map((t) => norm(cname(t))));

  const recs = [];
  for (const c of pool) {
    const mu = {};
    for (const [k, v] of Object.entries(c.matchups)) mu[norm(k)] = [k, v];
    let score = (c.tier_wr - 50) / 1.5;
    let lane = null;
    if (enemySup && mu[norm(enemySup)]) { lane = mu[norm(enemySup)]; score += 3 * lane[1].score; }
    let syn = null;
    if (allyAdc) {
      const hit = Object.entries(c.synergy).find(([k]) => norm(k) === norm(allyAdc));
      if (hit) { syn = hit; score += 2 * clamp(hit[1].delta / 1.2, -3, 3); }
      else if (adcArch) {
        const k = Object.keys(adcArch).find((key) => {
          const i = key.lastIndexOf('|');
          return key.slice(i + 1) === c.arch && norm(key.slice(0, i)) === norm(allyAdc);
        });
        if (k !== undefined) {
          syn = [allyAdc, { delta: adcArch[k], est: true }];
          score += 1 * clamp(adcArch[k] / 1.2, -3, 3);
        }
      }
    }
    let mine = null;
    if (personal) {
      mine = (personal.by_champ || {})[norm(c.name)] || null;
      if (allyAdc) {
        const pr = (personal.pairs || {})[`${c.name}|${allyAdc}`];
        if (pr) mine = Object.assign({ g: 0, w: 0 }, mine || {}, { pair: pr });
      }
      if (mine && (mine.g || 0) >= 3) score += clamp((100 * mine.w / mine.g - 50) / 15, -1, 1);
    }
    const cid = cidOf(champs, c.name);
    let status = 'ok';
    if (bans.has(cid)) status = 'BANEADO';
    else if (takenN.has(norm(c.name))) status = allyIds.includes(cid) ? 'ALIADO' : 'RIVAL';
    recs.push({ name: c.name, score: round1(score), status, lane, syn, cfg: c, arch: archLabel[c.arch] || '', mine });
  }
  sortBy(recs, (r) => [r.status !== 'ok', -r.score]);

  const threat = {};
  for (const c of pool) for (const [n, m] of Object.entries(c.matchups)) {
    if (m.games >= 500) (threat[n] = threat[n] || []).push([-m.score, c.pick || 1]);
  }
  const tscore = [];
  for (const [n, v] of Object.entries(threat)) {
    if (v.length < 8) continue;
    const w = v.reduce((s, [, x]) => s + x, 0);
    tscore.push([n, v.reduce((s, [a, x]) => s + a * x, 0) / Math.max(1e-6, w)]);
  }
  const banSugg = sortBy(tscore, (x) => [-x[1]]).filter(([n, t]) => t > 0 && !takenN.has(norm(n))).slice(0, 3).map(([n]) => n);

  const hoverName = myHover ? cname(myHover) : null;
  let focus = recs.find((r) => hoverName && norm(r.name) === norm(hoverName)) || null;
  if (!focus) focus = recs.find((r) => r.status === 'ok') || recs[0] || null;
  const index = {};
  for (const c of pool) index[norm(c.name)] = c;
  if (focus) {
    focus.guide = supportGuide(focus.cfg, enemySup, index, dyn);
    focus.bot = botlane.plan({
      me: focus.cfg, allyAdc, enemySup, enemySupCfg: enemySup ? index[norm(enemySup)] || null : null, enemyAdc,
      mu: focus.lane ? focus.lane[1] : null, syn: focus.syn ? focus.syn[1] : null,
      pair: focus.mine && focus.mine.pair ? focus.mine.pair : null,
    });
  }
  const shown = recs.filter((r) => r.status === 'ok').slice(0, 5);
  if (focus && !shown.includes(focus)) shown.push(focus);
  return {
    mode: 'support', phase: (session.timer || {}).phase || '', enemies: enemyList, lane_enemy: enemySup,
    enemy_adc: enemyAdc, ally_adc: allyAdc, ally_adc_locked: allyAdcLocked, ad, ap, build_key: 'default',
    recs: shown, ban_sugg: banSugg, focus,
    adc_hist: allyAdc ? ((personal || {}).with_adc_map || {})[allyAdc] || null : null,
  };
}

// Una frase de cómo se gana esta partida. No toca el score ni los bans.
// Support: pelear si el matchup es positivo, la sinergia no baja de -0,5 y el arquetipo inicia.
// Línea: pelear si el matchup es positivo.
function gamePlan(v) {
  if (!v || !v.focus) return null;
  const f = v.focus;
  const mu = f.lane ? f.lane[1].score : null;
  if (v.mode === 'support') {
    if (f.bot && f.bot.known) return f.bot.hud;
    const syn = f.syn ? f.syn[1].delta : null;
    const arch = (f.cfg && f.cfg.arch) || f.arch || '';
    const starts = arch === 'engage' || arch === 'roamer' || arch === 'mage';
    const fight = mu > 0 && (syn === null || syn >= -0.5) && starts;
    const who = v.ally_adc ? ` con ${v.ally_adc}` : '';
    return fight ? `Ganás peleando${who}. Buscá el all-in.` : `Aguantá${who}. No pelees hasta el 6.`;
  }
  if (f.jg && f.jg.known) return f.jg.hud;
  return mu > 0 ? 'Ganás peleando: presioná la línea.' : 'Aguantá: no pelees hasta igualar nivel.';
}

// Plan de bot en partida (cuando no pasó por champ select con la app abierta). Sin historial: en partida no hay números.
function botPlanLive(pool, adcArch, myChamp, allyAdc, enemySup, enemyAdc) {
  const index = {};
  for (const c of pool) index[norm(c.name)] = c;
  const me = index[norm(myChamp)];
  if (!me) return null;
  const hit = (obj, n) => (n ? Object.entries(obj || {}).find(([k]) => norm(k) === norm(n)) : null);
  const mu = hit(me.matchups, enemySup);
  let syn = hit(me.synergy, allyAdc);
  syn = syn ? syn[1] : null;
  if (!syn && allyAdc && adcArch) {
    const k = Object.keys(adcArch).find((key) => key.slice(key.lastIndexOf('|') + 1) === me.arch && norm(key.slice(0, key.lastIndexOf('|'))) === norm(allyAdc));
    if (k !== undefined) syn = { delta: adcArch[k], est: true };
  }
  return botlane.forGame(botlane.plan({ me, allyAdc, enemySup, enemySupCfg: enemySup ? index[norm(enemySup)] || null : null, enemyAdc,
    mu: mu ? mu[1] : null, syn }));
}

// Plan de jungla/mid en partida con las posiciones reales (Live API).
function jgPlanLive(pool, myChamp, role, players, myTeam) {
  const me = pool.find((c) => norm(c.name) === norm(myChamp) && c.role === role) || null;
  if (!me) return null;
  const POS = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'middle', BOTTOM: 'bottom', UTILITY: 'utility' };
  const enemies = {};
  for (const p of players || []) if (p.team !== myTeam && POS[p.position]) enemies[POS[p.position]] = p.championName;
  const rival = role === 'jungle' ? enemies.jungle : enemies.middle;
  const hit = rival ? Object.entries(me.matchups).find(([k]) => norm(k) === norm(rival)) : null;
  return jgplan.forGame(jgplan.plan({ me, mu: hit ? hit[1] : null, laneEnemy: rival, enemies }));
}

const analyzeTop = (s, c, p) => analyzeLane(s, c, p, 'top');
module.exports = { ADCS, analyzeTop, analyzeLane, analyzeSupport, supportGuide, planFor, gamePlan, botPlanLive, jgPlanLive, BUILD_LABEL };
