'use strict';
// Autopsia de muertes: por qué moriste, inferido del contexto que da la API en vivo del juego.
// Son reglas simples y explicables. Si nada aplica, se dice "sin causa clara" (no se fuerza una).
const { norm } = require('./util');

const GOLD_LIMIT = 1000;      // oro sin gastar que ya alcanza para una parte de ítem
const ADC_WINDOW = 12;        // segundos: tu ADC murió justo antes que vos
const OBJ_BEFORE = 45;        // segundos antes de que se tome un objetivo
const OBJ_AFTER = 10;

// Umbrales de coach (con datos de vida, aliados e ítems; las grabaciones viejas no los tienen y no se usan).
const BURST_HP = 70;          // con 70%+ de vida 3 s antes y muerto: te reventaron de golpe
const LOW_HP = 35;            // debajo de 35% de vida…
const LOW_SECS = 18;          // …durante 18 s o más antes de morir: tenías que volver
const ITEM_GAP = 1500;        // oro en ítems de más del que te mató
const COST = { torre: 1, inhibidor: 2, dragón: 2, heraldo: 2, Atakhan: 3, barón: 4 };
const PLURAL = { torre: 'torres', inhibidor: 'inhibidores', dragón: 'dragones', heraldo: 'heraldos', barón: 'barones', Atakhan: 'Atakhan' };
const countText = (n, k) => (n > 1 ? `${n} ${PLURAL[k] || k}` : k);

const LABELS = {
  sin_vida: { title: 'Te quedaste con poca vida', tip: 'Con tan poca vida, volvé a base o jugá detrás de tu equipo.' },
  reventado: { title: 'Te reventaron de golpe', tip: 'De vida llena a 0 en segundos: te agarraron sin visión o adelantado. Ward antes de avanzar y no camines primero.' },
  equipo: { title: 'Pelea ya perdida', tip: 'Con aliados muertos la pelea ya estaba perdida: retirate en vez de entrar.' },
  items: { title: 'Rival con más ítems', tip: 'No le des pelea pareja a quien tiene mucho más oro en ítems.' },
  cambio: { title: 'Intercambio', tip: 'Te llevaste a alguien: no es un error.' },
  sacrificio: { title: 'Muerte por objetivo', tip: 'Tu equipo se llevó el objetivo: fue un buen cambio.' },
  torre: { title: 'Bajo torre', tip: 'No te quedes ni entres bajo torre rival sin que otro reciba el daño.' },
  jungla: { title: 'Te agarró la jungla', tip: 'Antes de avanzar, sabé dónde está la jungla rival (ward en río o tribush).' },
  superado: { title: 'En inferioridad', tip: 'Te agarraron 3 o más: no entres sin tu equipo cerca.' },
  adc: { title: 'Tu ADC ya había caído', tip: 'Cuando cae tu ADC, retirate: solo no ganás la pelea.' },
  nivel: { title: 'Abajo de nivel', tip: 'Peleaste 2+ niveles abajo: esperá a igualar o a tu equipo.' },
  oro: { title: 'Con oro sin gastar', tip: 'Con +1000 de oro, volvé a base antes de pelear.' },
  objetivo: { title: 'Pelea de objetivo', tip: 'Muerte peleando dragón/barón/heraldo: llegá antes y con visión.' },
  clara: { title: 'Sin causa clara', tip: 'Pelea pareja perdida.' },
};
const PRIORITY = ['torre', 'sin_vida', 'reventado', 'equipo', 'jungla', 'superado', 'adc', 'items', 'nivel', 'oro', 'objetivo'];
const ERRORS = new Set(PRIORITY);

// Todos los nombres con los que puede aparecer un jugador en los eventos.
function namesOf(p) {
  const out = new Set();
  for (const v of [p.riotId, p.riotIdGameName, p.summonerName]) {
    if (!v) continue;
    out.add(norm(v));
    out.add(norm(String(v).split('#')[0]));
  }
  out.delete('');
  return out;
}
function matchPlayer(players, eventName) {
  if (!eventName) return null;
  const a = norm(eventName), b = norm(String(eventName).split('#')[0]);
  return players.find((p) => { const s = namesOf(p); return s.has(a) || s.has(b); }) || null;
}
function killerType(name, players) {
  const n = String(name || '');
  if (/^turret/i.test(n)) return 'turret';
  if (/^minion/i.test(n)) return 'minion';
  if (/^sru_|dragon|baron|herald|atakhan/i.test(n)) return 'monster';
  return matchPlayer(players, n) ? 'champion' : 'unknown';
}

// death: {gold, my_level, killer_type, attackers:[{champ, level, jungle, pos?, items?}], adc_died_before (s|null), objective_near,
//         y en grabaciones nuevas: role, hp_trace [[s, %]], allies_dead, my_items, dead_s, fight {us, mine}, lost [], won []}
// verdict: error (algo para corregir) | cambio (te llevaste a alguien) | sacrificio (tu equipo tomó un objetivo) | neutral
function classify(death, roleHint) {
  const labels = [];
  const champs = death.attackers || [];
  const role = death.role || roleHint || null;
  if (death.killer_type === 'turret') labels.push('torre');
  // Vida antes de morir
  const tr = death.hp_trace || null;
  if (tr && tr.length >= 3) {
    const before = tr.filter(([dt]) => dt <= -2);
    const near = before.filter(([dt]) => dt >= -4);
    if (near.length && Math.max(...near.map(([, h]) => h)) >= BURST_HP) labels.push('reventado');
    const low = before.filter(([dt]) => dt >= -(LOW_SECS + 4));
    const span = low.length ? -Math.min(...low.map(([dt]) => dt)) : 0;
    if (span >= LOW_SECS && low.every(([, h]) => h <= LOW_HP)) labels.push('sin_vida');
  }
  if ((death.allies_dead || 0) >= 2) labels.push('equipo');
  // La jungla rival en la pelea solo es "te agarró la jungla" si no sos el jungla.
  if (role !== 'jungle' && champs.some((a) => a.jungle) && champs.length >= 2) labels.push('jungla');
  if (champs.length >= 3) labels.push('superado');
  if (death.adc_died_before !== null && death.adc_died_before !== undefined && death.adc_died_before <= ADC_WINDOW) labels.push('adc');
  const killer = champs.find((a) => a.killer) || champs[0];
  if (killer && killer.items != null && death.my_items != null && killer.items - death.my_items >= ITEM_GAP) labels.push('items');
  // Nivel: de support siempre estás 1-2 abajo de los que farmean solos. Cuenta si te mató alguien de bot, o en otros roles.
  const lvlFrom = role === 'utility' ? champs.filter((a) => !a.pos || a.pos === 'adc' || a.pos === 'utility') : champs;
  const maxLvl = lvlFrom.reduce((m, a) => Math.max(m, a.level || 0), 0);
  if (lvlFrom.length && maxLvl - (death.my_level || 0) >= 2) labels.push('nivel');
  if ((death.gold || 0) >= GOLD_LIMIT) labels.push('oro');
  if (death.objective_near) labels.push('objetivo');
  // Lo bueno de la muerte
  const won = (death.won || []).filter((k) => COST[k] >= 2);
  const fightUs = (death.fight || {}).us || 0;
  if (won.length) labels.push('sacrificio');
  if (fightUs > 0) labels.push('cambio');
  const errors = labels.filter((l) => ERRORS.has(l));
  const verdict = won.length && !errors.includes('torre') ? 'sacrificio' : fightUs > 0 ? 'cambio' : errors.length ? 'error' : 'neutral';
  const primary = verdict === 'sacrificio' ? 'sacrificio'
    : PRIORITY.find((l) => errors.includes(l)) || (verdict === 'cambio' ? 'cambio' : 'clara');
  return { labels, primary, verdict, cost: costOf(death) };
}

// Lo que costó: tiempo muerto y lo que tomó el rival mientras tanto.
function costOf(death) {
  const lost = death.lost || [];
  const pts = lost.reduce((s, k) => s + (COST[k] || 0), 0) + (death.dead_s || 0) / 20;
  return { dead_s: death.dead_s || null, lost, pts: Math.round(pts * 10) / 10, cara: pts >= 3 };
}
function costText(c) {
  const parts = [];
  if (c.dead_s) parts.push(`${c.dead_s} s muerto`);
  if (c.lost.length) {
    const n = {};
    for (const k of c.lost) n[k] = (n[k] || 0) + 1;
    parts.push(`el rival tomó ${Object.entries(n).map(([k, v]) => countText(v, k)).join(', ')}`);
  }
  return parts.join(' · ');
}

function factsOf(death) {
  const a = death.attackers || [];
  const killer = a.find((x) => x.killer);
  const ordered = killer ? [killer, ...a.filter((x) => x !== killer)] : a;
  const names = ordered.slice(0, 3).map((x) => `${x.champ} ${x.level}`).join(', ');
  const bits = [];
  if (names) bits.push(names);
  else if (death.killer_type === 'turret') bits.push('la torre');
  if (death.my_level) bits.push(`vos ${death.my_level}`);
  if ((death.gold || 0) >= GOLD_LIMIT) bits.push(`${death.gold} de oro`);
  return bits.join(' · ');
}

function actionFor(death, primary) {
  const a = death.attackers || [];
  const j = a.find((x) => x.jungle);
  const killer = a.find((x) => x.killer) || a[0];
  if (primary === 'sacrificio') return `Tu equipo tomó ${(death.won || []).filter((k) => COST[k] >= 2).join(' y ')}: fue un buen cambio.`;
  if (primary === 'cambio') return `Te llevaste ${death.fight.us === 1 ? 'a uno' : `a ${death.fight.us}`} en esa pelea: no es un error.`;
  if (primary === 'sin_vida') return 'Estuviste más de 18 s con menos de 35% de vida antes de morir: volvé a base antes.';
  if (primary === 'reventado') return `Te sacaron toda la vida en un par de segundos${killer ? ` (${killer.champ})` : ''}: no camines primero sin visión.`;
  if (primary === 'equipo') return `Ya había ${death.allies_dead} aliados muertos: la pelea estaba perdida, retirate.`;
  if (primary === 'items') return `${killer.champ} tenía ${Math.round((killer.items - death.my_items) / 100) * 100} de oro más en ítems: no le des pelea pareja.`;
  if (primary === 'jungla') return j ? `${j.champ} estaba en la pelea. Ward en río antes de avanzar.` : LABELS.jungla.tip;
  if (primary === 'oro') return `Tenías ${death.gold} de oro: volvé a base antes de pelear.`;
  if (primary === 'superado') return `Eran ${a.length} contra vos. No entres sin tu equipo.`;
  if (primary === 'nivel') {
    const d = a.reduce((m, x) => Math.max(m, x.level || 0), 0) - (death.my_level || 0);
    return `El que te mató te sacaba ${d} niveles: esperá a igualar o a tu equipo.`;
  }
  if (primary === 'adc') return 'Tu ADC ya había caído. Retirate.';
  if (primary === 'torre') return 'Estabas bajo torre. No entres si otro no recibe el daño.';
  if (primary === 'objetivo') return 'Era pelea de objetivo. Llegá antes, con visión.';
  return LABELS.clara.tip;
}

function tipFor(death, roleHint) {
  const c = classify(death, roleHint);
  let text = actionFor(death, c.primary);
  if (c.verdict === 'cambio' && ERRORS.has(c.primary)) text = `Te llevaste a alguien, pero: ${text.charAt(0).toLowerCase()}${text.slice(1)}`;
  if (c.primary !== 'oro' && c.labels.includes('oro') && c.verdict === 'error') text += ` Y tenías ${death.gold} de oro sin gastar.`;
  return { primary: c.primary, title: LABELS[c.primary].title, text, facts: factsOf(death), labels: c.labels,
    verdict: c.verdict, cost: c.cost, cost_text: costText(c.cost) };
}

const NEXT = {
  sin_vida: (n, tot) => `${n} de ${tot} muertes fueron con poca vida que venías arrastrando. Volvé a base antes.`,
  reventado: (n, tot) => `En ${n} de ${tot} te sacaron toda la vida de golpe. Ward antes de avanzar y no camines primero.`,
  equipo: (n, tot) => `${n} de ${tot} fueron entrando a peleas con aliados ya muertos. Si caen 2, retirate.`,
  items: (n, tot) => `${n} de ${tot} fueron contra alguien con mucho más oro en ítems. No le des pelea pareja.`,
  jungla: (n, tot) => `La jungla rival estuvo en ${n} de ${tot} muertes. Antes de pasar el río, ward.`,
  oro: (n, tot) => `${n} de ${tot} muertes fueron con oro sin gastar. Volvé a base antes de pelear.`,
  superado: (n, tot) => `${n} de ${tot} muertes fueron en inferioridad. No entres si son 3 o más.`,
  adc: (n, tot) => `En ${n} de ${tot} tu ADC ya había caído. Cuando cae, retirate.`,
  torre: (n, tot) => `${n} de ${tot} fueron bajo torre. No entres si otro no tankea.`,
  objetivo: (n, tot) => `${n} de ${tot} fueron en un objetivo. Llegá antes y con visión.`,
  nivel: (n, tot) => `${n} de ${tot} fueron contra alguien 2 niveles arriba. Esperá a igualar o a tu equipo.`,
};
const FOCUS_GAMES = 10;      // el foco mira tus últimas 10 partidas
const MIN_SIDE = 4;          // "qué te hace perder": al menos 4 victorias y 4 derrotas grabadas

// Resumen de coach. recs: grabaciones (cada una con role y deaths).
function summarize(recs) {
  const games = recs.filter((r) => r.deaths).slice().sort((a, b) => (a.start_wall || 0) - (b.start_wall || 0));   // viejas → nuevas
  const rows = games.map((r) => ({ r, ds: r.deaths.map((d) => ({ d, c: classify(d, r.role), tip: null })) }));
  const all = rows.flatMap((x) => x.ds.map((y) => Object.assign({ win: x.r.win }, y)));
  const n = all.length;
  const errorsOf = (row) => row.ds.filter((x) => x.c.verdict === 'error');

  // Conteos (las causas de error, para los patrones de siempre)
  const count = {};
  for (const k of PRIORITY) count[k] = 0;
  for (const { c } of all) if (c.verdict === 'error') for (const l of c.labels) if (ERRORS.has(l)) count[l]++;
  const verdicts = { error: 0, cambio: 0, sacrificio: 0, neutral: 0 };
  for (const { c } of all) verdicts[c.verdict]++;

  const W = rows.filter((x) => x.r.win === true), Lo = rows.filter((x) => x.r.win === false);
  const perGame = (list, label) => (list.length ? list.reduce((s, x) => s + errorsOf(x).filter((y) => y.c.labels.includes(label)).length, 0) / list.length : null);
  const patterns = PRIORITY.filter((k) => count[k] > 0).map((k) => ({
    key: k, title: LABELS[k].title, tip: NEXT[k](count[k], n), n: count[k], pct: n ? 100 * count[k] / n : 0,
    in_wins: perGame(W, k), in_losses: perGame(Lo, k),
  })).sort((a, b) => b.n - a.n);

  // Foco: el error que más te costó en las últimas partidas (frecuencia × lo que costó), no el más común.
  const recent = rows.slice(-FOCUS_GAMES);
  const weight = {};
  const lostBy = {};
  for (const x of recent) for (const y of errorsOf(x)) {
    const k = y.c.primary;
    weight[k] = (weight[k] || 0) + 1 + y.c.cost.pts;
    for (const o of y.c.cost.lost) (lostBy[k] = lostBy[k] || {})[o] = ((lostBy[k] || {})[o] || 0) + 1;
  }
  let focus = null;
  const ranked = Object.entries(weight).sort((a, b) => b[1] - a[1]);
  const pick = ranked.find(([k]) => k !== 'nivel') || ranked[0];
  if (pick) {
    const k = pick[0];
    const times = recent.reduce((s, x) => s + errorsOf(x).filter((y) => y.c.primary === k).length, 0);
    const lost = Object.entries(lostBy[k] || {}).map(([o, v]) => (v > 1 ? countText(v, o) : `1 ${o}`)).join(', ');
    focus = { key: k, title: LABELS[k].title, tip: LABELS[k].tip, times, games: recent.length,
      text: `${times} ${times > 1 ? 'veces' : 'vez'} en tus últimas ${recent.length} partidas${lost ? `; mientras estabas muerto el rival tomó ${lost}` : ''}.` };
  }

  // Progreso: errores por partida, últimas 5 contra las 5 anteriores.
  let progress = null;
  if (rows.length >= 10) {
    const avg = (list) => list.reduce((s, x) => s + errorsOf(x).length, 0) / list.length;
    const before = avg(rows.slice(-10, -5)), now = avg(rows.slice(-5));
    const better = now <= before - 0.5, worse = now >= before + 0.5;
    progress = { before: Math.round(before * 10) / 10, now: Math.round(now * 10) / 10, better, worse,
      text: better ? `Vas mejor: de ${fmt1(before)} a ${fmt1(now)} muertes evitables por partida (últimas 5 contra las 5 anteriores).`
        : worse ? `Vas peor: de ${fmt1(before)} a ${fmt1(now)} muertes evitables por partida. Volvé a tu foco.`
          : `Estable: ${fmt1(now)} muertes evitables por partida en las últimas 5.` };
  }

  // Qué te hace perder: causas que aparecen bastante más en tus derrotas, con muestra mínima.
  const hurts = W.length >= MIN_SIDE && Lo.length >= MIN_SIDE
    ? patterns.filter((p) => p.in_losses - p.in_wins >= 0.5).map((p) => ({ key: p.key, title: p.title,
      text: `${fmt1(p.in_losses)} por partida en tus ${Lo.length} derrotas y ${fmt1(p.in_wins)} en tus ${W.length} victorias.` }))
    : [];

  // Lo que hiciste bien
  const good = [];
  if (verdicts.cambio) good.push(`${verdicts.cambio} muerte${verdicts.cambio > 1 ? 's' : ''} en las que te llevaste a alguien.`);
  if (verdicts.sacrificio) good.push(`${verdicts.sacrificio} muerte${verdicts.sacrificio > 1 ? 's' : ''} que le dieron un objetivo a tu equipo.`);
  let streak = 0;
  for (let i = rows.length - 1; i >= 0 && errorsOf(rows[i]).length === 0; i--) streak++;
  if (streak >= 2) good.push(`${streak} partidas seguidas sin muertes evitables.`);

  const headline = patterns.find((p) => p.key !== 'nivel') || patterns[0] || null;
  const next = focus ? { key: focus.key, text: `${focus.tip} ${focus.text}` } : headline ? { key: headline.key, text: NEXT[headline.key](headline.n, n) } : null;
  return { games: games.length, deaths: n, wins: W.length, losses: Lo.length, patterns, next, focus, progress, hurts, good, verdicts,
    early: all.filter(({ d }) => d.t < 840).length };
}
const fmt1 = (x) => (Math.round(x * 10) / 10).toString().replace('.', ',');

// Revisión de una partida, como la haría un coach: qué fue error, qué fue un buen cambio y la muerte más cara.
function reviewGame(rec) {
  const ds = (rec.deaths || []).map((d) => Object.assign({ t: d.t }, tipFor(d, rec.role)));
  const errors = ds.filter((d) => d.verdict === 'error');
  const costly = errors.slice().sort((a, b) => b.cost.pts - a.cost.pts)[0] || null;
  return { deaths: ds, errors: errors.length, cambios: ds.filter((d) => d.verdict === 'cambio').length,
    sacrificios: ds.filter((d) => d.verdict === 'sacrificio').length,
    costly: costly && costly.cost.pts >= 1 ? { t: costly.t, title: costly.title, cost_text: costly.cost_text } : null };
}

module.exports = { LABELS, classify, tipFor, summarize, reviewGame, costOf, costText, namesOf, matchPlayer, killerType, GOLD_LIMIT, OBJ_BEFORE, OBJ_AFTER };
