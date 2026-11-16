'use strict';
// Autopsia de muertes: por qué moriste, inferido del contexto que da la API en vivo del juego.
// Son reglas simples y explicables. Si nada aplica, se dice "sin causa clara" (no se fuerza una).
const { norm } = require('./util');

const GOLD_LIMIT = 1000;      // oro sin gastar que ya alcanza para una parte de ítem
const ADC_WINDOW = 12;        // segundos: tu ADC murió justo antes que vos
const OBJ_BEFORE = 45;        // segundos antes de que se tome un objetivo
const OBJ_AFTER = 10;

const LABELS = {
  torre: { title: 'Bajo torre', tip: 'No te quedes ni entres bajo torre rival sin que otro reciba el daño.' },
  jungla: { title: 'Te agarró la jungla', tip: 'Antes de avanzar, sabé dónde está la jungla rival (ward en río o tribush).' },
  superado: { title: 'En inferioridad', tip: 'Te agarraron 3 o más: no entres sin tu equipo cerca.' },
  adc: { title: 'Tu ADC ya había caído', tip: 'Cuando cae tu ADC, retirate: solo no ganás la pelea.' },
  nivel: { title: 'Abajo de nivel', tip: 'Peleaste 2+ niveles abajo: esperá a igualar o a tu equipo.' },
  oro: { title: 'Con oro sin gastar', tip: 'Con +1000 de oro, volvé a base antes de pelear.' },
  objetivo: { title: 'Pelea de objetivo', tip: 'Muerte peleando dragón/barón/heraldo: llegá antes y con visión.' },
  clara: { title: 'Sin causa clara', tip: 'Pelea pareja perdida.' },
};
const PRIORITY = ['torre', 'jungla', 'superado', 'adc', 'nivel', 'oro', 'objetivo'];

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

// death: {gold, my_level, killer_type, attackers:[{champ, level, jungle}], adc_died_before (s|null), objective_near}
function classify(death) {
  const labels = [];
  const champs = death.attackers || [];
  if (death.killer_type === 'turret') labels.push('torre');
  if (champs.some((a) => a.jungle) && champs.length >= 2) labels.push('jungla');
  if (champs.length >= 3) labels.push('superado');
  if (death.adc_died_before !== null && death.adc_died_before !== undefined && death.adc_died_before <= ADC_WINDOW) labels.push('adc');
  const maxLvl = champs.reduce((m, a) => Math.max(m, a.level || 0), 0);
  if (champs.length && maxLvl - (death.my_level || 0) >= 2) labels.push('nivel');
  if ((death.gold || 0) >= GOLD_LIMIT) labels.push('oro');
  if (death.objective_near) labels.push('objetivo');
  const primary = PRIORITY.find((l) => labels.includes(l)) || 'clara';
  return { labels, primary };
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
  if (primary === 'jungla') return j ? `${j.champ} estaba en la pelea. Ward en río antes de avanzar.` : LABELS.jungla.tip;
  if (primary === 'oro') return `Tenías ${death.gold} de oro: volvé a base antes de pelear.`;
  if (primary === 'superado') return `Eran ${a.length} contra vos. No entres sin tu equipo.`;
  if (primary === 'nivel') {
    const d = a.reduce((m, x) => Math.max(m, x.level || 0), 0) - (death.my_level || 0);
    return `El más alto te sacaba ${d} niveles. Si era un solo, de support es normal.`;
  }
  if (primary === 'adc') return 'Tu ADC ya había caído. Retirate.';
  if (primary === 'torre') return 'Estabas bajo torre. No entres si otro no recibe el daño.';
  if (primary === 'objetivo') return 'Era pelea de objetivo. Llegá antes, con visión.';
  return LABELS.clara.tip;
}

function tipFor(death) {
  const c = classify(death);
  let text = actionFor(death, c.primary);
  if (c.primary !== 'oro' && c.labels.includes('oro')) text += ` Y tenías ${death.gold} de oro sin gastar.`;
  return { primary: c.primary, title: LABELS[c.primary].title, text, facts: factsOf(death), labels: c.labels };
}

const NEXT = {
  jungla: (n, tot) => `La jungla rival estuvo en ${n} de ${tot} muertes. Antes de pasar el río, ward.`,
  oro: (n, tot) => `${n} de ${tot} muertes fueron con oro sin gastar. Volvé a base antes de pelear.`,
  superado: (n, tot) => `${n} de ${tot} muertes fueron en inferioridad. No entres si son 3 o más.`,
  adc: (n, tot) => `En ${n} de ${tot} tu ADC ya había caído. Cuando cae, retirate.`,
  torre: (n, tot) => `${n} de ${tot} fueron bajo torre. No entres si otro no tankea.`,
  objetivo: (n, tot) => `${n} de ${tot} fueron en un objetivo. Llegá antes y con visión.`,
  nivel: (n, tot) => `${n} de ${tot} te agarraron 2 niveles arriba. Si era el support rival, no pelees; si era un solo, es el ritmo de la línea.`,
};

function summarize(recs) {
  const games = recs.filter((r) => r.deaths);
  const all = [];
  for (const r of games) for (const d of r.deaths) all.push({ d, win: r.win });
  const n = all.length;
  const count = {}, prim = {};
  for (const k of Object.keys(LABELS)) { count[k] = 0; prim[k] = 0; }
  for (const { d } of all) {
    const c = classify(d);
    for (const l of c.labels) count[l]++;
    prim[c.primary]++;
  }
  const byRes = (win) => games.filter((r) => r.win === win);
  const perGame = (list, label) => (list.length
    ? list.reduce((s, r) => s + r.deaths.filter((d) => classify(d).labels.includes(label)).length, 0) / list.length : null);
  const W = byRes(true), Lo = byRes(false);
  const patterns = Object.keys(LABELS).filter((k) => k !== 'clara' && count[k] > 0).map((k) => ({
    key: k, title: LABELS[k].title, tip: `${count[k]} de ${n}. ${NEXT[k](count[k], n)}`, n: count[k], pct: n ? 100 * count[k] / n : 0,
    in_wins: perGame(W, k), in_losses: perGame(Lo, k),
  })).sort((a, b) => b.n - a.n);
  const headline = patterns.find((p) => p.key !== 'nivel') || patterns[0] || null;
  const next = headline ? { key: headline.key, text: NEXT[headline.key](headline.n, n) } : null;
  return { games: games.length, deaths: n, wins: W.length, losses: Lo.length, patterns, primary: prim, next,
    early: all.filter(({ d }) => d.t < 840).length };
}

module.exports = { LABELS, classify, tipFor, summarize, namesOf, matchPlayer, killerType, GOLD_LIMIT, OBJ_BEFORE, OBJ_AFTER };
