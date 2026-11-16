'use strict';
// Plan de bot lane para la dupla support–ADC: cómo jugar la línea, qué combo buscar, qué respetar y qué cambia en el 6.
// Cada línea dice de dónde sale: DATOS (op.gg / Lolalytics, con partidas), ANÁLISIS (kits) o HISTORIAL (tus partidas).
// No hay material PRO de support: si una entrada trae "pro", se muestra como PRO con su fuente.
const { norm, clamp } = require('./util');
const BOT = require('../../data/bot_lane.json');

const STYLE = {
  allin: { label: 'ALL-IN', text: 'Buscá el all-in' },
  poke: { label: 'POKE', text: 'Pokeá y trades cortos' },
  hold: { label: 'AGUANTAR', text: 'Aguantá hasta el 6' },
  protect: { label: 'PROTEGER', text: 'Protegé a tu ADC' },
};
const MIN_GAMES_PERSONAL = 5;   // con menos partidas tu historial se muestra, pero no cambia el plan
const PRIOR = 5;                // tu WR con la dupla se encoge hacia 50% con 5 victorias y 5 derrotas imaginarias

const find = (obj, name) => {
  if (!name || !obj) return null;
  const k = Object.keys(obj).find((x) => norm(x) === norm(name));
  return k === undefined ? null : obj[k];
};
const fmt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1).replace('.', ',')}`;
const games = (g) => Number(g).toLocaleString('es');

// Cuánto pesa un número de op.gg/Lolalytics según la muestra: entero desde 1000 partidas.
const weight = (g) => clamp((g || 0) / 1000, 0, 1);

/**
 * @param {object} p  { me: cfg de pool_support, allyAdc, enemySup, enemySupCfg, enemyAdc, mu: {wr,games,score}?,
 *                      syn: {delta, games?, est?}?, pair: {g,w}?, dyn: {} }
 * @returns plan o null si no hay support.
 */
function plan(p) {
  const me = p.me;
  if (!me) return null;
  const why = [];
  const missing = [];
  let s = 0;

  // 1) Tu support contra el support rival (op.gg)
  if (p.enemySup && p.mu) {
    const w = weight(p.mu.games);
    s += p.mu.score * w;
    why.push({ src: 'DATOS', ref: 'op.gg', txt: `${me.name} vs ${p.enemySup}: ${fmt(p.mu.wr - 50)} pts (${games(p.mu.games)} partidas)` });
  } else if (p.enemySup) missing.push(`sin datos de ${me.name} vs ${p.enemySup}`);
  else missing.push('falta el support rival');

  // 2) Tu support contra el ADC rival (Lolalytics, Δ2)
  const vsRow = find(BOT.vs_adc, me.name);
  const vs = p.enemyAdc && vsRow ? find(vsRow, p.enemyAdc) : null;
  if (vs) {
    const [d2, g] = vs;
    s += (d2 / 2.5) * weight(g);
    why.push({ src: 'DATOS', ref: 'Lolalytics', txt: `${me.name} vs ${p.enemyAdc} (ADC): ${fmt(d2)} pts propios del cruce (${games(g)} partidas)` });
  } else if (p.enemyAdc && vsRow) {
    why.push({ src: 'DATOS', ref: 'Lolalytics', txt: `${me.name} vs ${p.enemyAdc} (ADC): cruce parejo (menos de 1 punto o pocas partidas)` });
  } else if (!p.enemyAdc) missing.push('falta el ADC rival');

  // 3) Sinergia con tu ADC (op.gg o estimada por tipo)
  if (p.allyAdc && p.syn) {
    const d = p.syn.delta;
    s += clamp(d / 1.2, -1, 1) * (p.syn.est ? 0.5 : 1);
    why.push({ src: 'DATOS', ref: p.syn.est ? 'op.gg (estimado por tipo)' : 'op.gg',
      txt: `Dupla ${me.name} + ${p.allyAdc}: ${fmt(d)} pts de sinergia${p.syn.est ? ' (estimada por tipo de support)' : ''}` });
  } else if (!p.allyAdc) missing.push('falta tu ADC');

  // 4) Perfil de los ADCs (ANÁLISIS de kits)
  const ally = find(BOT.adc, p.allyAdc);
  const foe = find(BOT.adc, p.enemyAdc);
  if (ally) s += ally.early === 'fuerte' ? 0.4 : ally.early === 'debil' ? -0.4 : 0;
  if (foe) s += foe.early === 'fuerte' ? -0.4 : foe.early === 'debil' ? 0.4 : 0;
  if (p.allyAdc && !ally) missing.push(`sin perfil de ${p.allyAdc}`);
  if (p.enemyAdc && !foe) missing.push(`sin perfil de ${p.enemyAdc}`);

  // 5) Tu historial con esta dupla: se muestra siempre, pesa solo con 5+ partidas y encogido hacia 50%.
  const pr = p.pair;
  if (pr && pr.g) {
    const adj = (pr.w + PRIOR) / (pr.g + 2 * PRIOR);
    const counts = pr.g >= MIN_GAMES_PERSONAL;
    if (counts) s += clamp((adj - 0.5) * 4, -0.5, 0.5);
    why.push({ src: 'HISTORIAL', ref: 'tus partidas',
      txt: `Vos con ${p.allyAdc}: ${pr.w}-${pr.g - pr.w}${counts ? '' : ' (pocas partidas: no cambia el plan)'}` });
  }

  // Estilo según tu tipo de support y cómo viene la línea.
  const arch = me.arch;
  const starts = arch === 'engage' || arch === 'roamer';
  const ranged = arch === 'mage' || arch === 'marksman';
  let style;
  if (s >= 0.6) style = starts ? 'allin' : ranged || arch === 'enchanter' ? 'poke' : 'allin';
  else if (s <= -0.6) style = (ally && ally.early === 'debil') || arch === 'enchanter' || arch === 'warden' ? 'protect' : 'hold';
  else style = starts ? 'allin' : ranged ? 'poke' : 'protect';
  const st = STYLE[style];
  const known = Boolean(p.enemySup || p.enemyAdc);
  const head = style === 'allin' && s < 0.6
    ? 'Buscá el all-in solo con ventaja (nivel 2 primero o sin Flash)'
    : st.text + (style === 'hold' && p.allyAdc ? ` con ${p.allyAdc}` : '');

  // Combo con tu ADC (solo interacciones del kit; si no hay, no se muestra).
  const sup = find(BOT.sup, me.name) || {};
  let combo = null;
  const pairTxt = p.allyAdc ? find(BOT.pair, `${me.name}|${p.allyAdc}`) : null;
  if (pairTxt) combo = pairTxt;
  else if (ally && ally.hooks.includes('kalr') && (starts || arch === 'warden')) {
    combo = `Kalista te ata con su Lanza Negra: desde su 6, su R te tira encima del rival y entrás con tu ${sup.cc || 'control'}.`;
  } else if (ally && ally.hooks.includes('ccf') && sup.cc && find(BOT.ccf, p.allyAdc)) {
    const t = find(BOT.ccf, p.allyAdc);
    const knock = (BOT.knockup || []).some((x) => norm(x) === norm(me.name));
    if (norm(p.allyAdc) !== 'yasuo' || knock) combo = t.replace('{cc}', sup.cc);
  }
  if (!combo && ally && ally.hooks.includes('autos') && sup.buff) combo = sup.buff.replace('{adc}', p.allyAdc);

  // Amenaza: del ADC rival (kit) y del support rival (guía existente).
  const threats = [];
  if (foe) threats.push({ who: p.enemyAdc, txt: foe.pre });
  if (p.enemySupCfg && p.enemySupCfg.threat) threats.push({ who: p.enemySup, txt: p.enemySupCfg.threat.respect });

  // Después del 6: solo si alguna R cambia la línea.
  const post = [];
  if (me.plan && me.plan.post6 && (starts || arch === 'warden' || arch === 'mage')) post.push({ who: me.name, txt: me.plan.post6 });
  if (foe && foe.post) post.push({ who: p.enemyAdc, txt: foe.post });

  // Línea del overlay: corta, sin números.
  const first = (t) => t.split(/[:;.]/)[0].trim();
  const hudThreat = foe ? `${p.enemyAdc}: ${first(foe.pre)}.` : '';
  const hud = known ? `${st.label}. ${hudThreat}`.trim() : null;
  const hud6 = foe && foe.post ? `Ya son 6. ${p.enemyAdc}: ${first(foe.post)}.` : (post[0] ? `Ya sos 6. ${first(post[0].txt)}.` : null);

  return {
    style, label: st.label, head, score: Math.round(s * 10) / 10, known,
    why, missing,
    combo: combo ? { txt: combo, src: 'ANÁLISIS', ref: 'kits (wiki de LoL)' } : null,
    threats: threats.map((t) => Object.assign(t, { src: 'ANÁLISIS', ref: 'kits' })),
    post6: post.map((t) => Object.assign(t, { src: 'ANÁLISIS', ref: 'kits' })),
    hud, hud6,
  };
}

// Versión para la partida: sin números (ni winrates, ni sinergias, ni tu récord).
function forGame(pl) {
  if (!pl) return null;
  return { style: pl.style, label: pl.label, head: pl.head, combo: pl.combo, threats: pl.threats, post6: pl.post6, hud: pl.hud, hud6: pl.hud6 };
}

module.exports = { plan, forGame, STYLE, BOT };
