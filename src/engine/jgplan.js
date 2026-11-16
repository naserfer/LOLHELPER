'use strict';
// Bitty (jungla y mid) y Mauri (Udyr jungla): segunda fuente de datos y plan de partida.
//  - mix(): mezcla el WR de cada matchup de op.gg Master+ con Lolalytics Master+ (mismo peso) y Lolalytics Emerald+
//    (medio peso: más partidas, pero otro nivel). El score usa la mezcla; se guardan las fuentes para mostrarlas.
//  - plan(): jungla → con qué línea jugar (tu jungla contra el que juega cada línea, Lolalytics Emerald+), duelo con el
//    jungla rival, qué respetar y qué cambia en el 6. Mid → cuánto respetar al jungla rival.
// Cada línea dice de dónde sale: DATOS (con fuente y partidas) o ANÁLISIS (kits). No hay material PRO para estos campeones.
const { norm, round1 } = require('./util');
// Lolalytics de cada perfil, juntos (las claves son "Campeón|rol").
const BL = { same: {}, lanes: {} };
for (const f of ['bitty_lolalytics.json', 'mauri_lolalytics.json']) {
  const d = require(`../../data/${f}`);
  Object.assign(BL.same, d.same);
  Object.assign(BL.lanes, d.lanes);
}

const LANE = { top: 'top', middle: 'mid', bottom: 'bot' };
const FUENTE = {
  'Udyr|jungle': 'Fuentes: op.gg Emerald+ y Lolalytics (Emerald+ y Master+, este último a mitad de peso) · kit de la wiki (ANÁLISIS). No hay guías PRO de Udyr.',
};
const EMERALD_WEIGHT = 0.5;
const fmt = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1).replace('.', ',')}`;
const pct = (x) => `${x.toFixed(1).replace('.', ',')}%`;
const games = (g) => Number(g).toLocaleString('es');
const find = (obj, name) => {
  if (!obj || !name) return null;
  const k = Object.keys(obj).find((x) => norm(x) === norm(name));
  return k === undefined ? null : obj[k];
};
const keyOf = (c) => `${c.name}|${c.role === 'middle' ? 'mid' : c.role}`;
const first = (t) => String(t || '').split(/[:;.]/)[0].trim();

// opgg: de qué tier son los números de op.gg del pool ("op.gg Master+" o "op.gg Emerald+"). El tier de Lolalytics que
// coincide pesa entero; el otro, a mitad de peso (otro nivel de juego).
function mix(pool, opgg = 'op.gg Master+') {
  const emeraldBase = /emerald/i.test(opgg);
  for (const c of pool) {
    const same = BL.same[keyOf(c)];
    if (!same) continue;
    for (const [enemy, m] of Object.entries(c.matchups)) {
      const src = [{ name: opgg, wr: m.wr, games: m.games, w: 1 }];
      const mp = find(same.master_plus, enemy);
      const em = find(same.emerald_plus, enemy);
      if (mp) src.push({ name: 'Lolalytics Master+', wr: mp[0], games: mp[2], w: emeraldBase ? EMERALD_WEIGHT : 1 });
      if (em) src.push({ name: 'Lolalytics Emerald+', wr: em[0], games: em[2], w: emeraldBase ? 1 : EMERALD_WEIGHT });
      const n = src.reduce((s, x) => s + x.games * x.w, 0);
      const wr = src.reduce((s, x) => s + x.wr * x.games * x.w, 0) / Math.max(1, n);
      m.score_opgg = m.score;
      m.wr_mix = round1(wr);
      m.games_mix = Math.round(n);
      m.score = round1(((wr - 50) / 2.5) * Math.min(1, n / 300));
      m.sources = src.map(({ name, wr: w, games: g }) => ({ name, wr: w, games: g }));
    }
  }
  return pool;
}

function sourcesText(m) {
  if (!m || !m.sources) return m ? `op.gg ${pct(m.wr)} (${games(m.games)} partidas)` : '';
  return m.sources.map((s) => `${s.name} ${pct(s.wr)} (${games(s.games)})`).join(' · ');
}

// p: { me: cfg, mu: matchup vs rival de línea (o jungla rival si sos jungla), laneEnemy, enemies: {top, jungle, middle, bottom, utility} }
function plan(p) {
  const me = p.me;
  if (!me) return null;
  const key = keyOf(me);
  const lanes = BL.lanes[key];
  if (!lanes) return null;   // solo Bitty (Nocturne/Diana jungla, Diana mid) y Mauri (Udyr jungla)
  const e = p.enemies || {};
  const why = [];
  const missing = [];
  let head = null, hud = null, label = null;
  const threats = [];
  const guide = (p.mu && p.mu.guide) || null;

  if (me.role === 'jungle') {
    const rows = [];
    for (const [pos, lab] of Object.entries(LANE)) {
      const enemy = e[pos];
      if (!enemy) { missing.push(`falta el ${lab} rival`); continue; }
      const r = find(lanes[pos], enemy);
      rows.push({ pos, lab, enemy, d2: r ? r[0] : 0, g: r ? r[1] : null });
    }
    rows.sort((a, b) => b.d2 - a.d2);
    for (const r of rows) {
      why.push({ src: 'DATOS', ref: 'Lolalytics Emerald+',
        txt: r.g ? `${me.name} jungla vs ${r.enemy} (${r.lab}): ${fmt(r.d2)} pts propios del cruce (${games(r.g)} partidas)`
          : `${me.name} jungla vs ${r.enemy} (${r.lab}): sin diferencia clara (menos de 1 punto o pocas partidas)` });
    }
    const best = rows[0];
    const worst = rows[rows.length - 1];
    if (best && best.d2 >= 1) {
      label = `JUGÁ ${best.lab.toUpperCase()}`;
      head = `Jugá para ${best.lab}: tu ${me.name} rinde bien contra ${best.enemy}.`;
      hud = `Jugá para ${best.lab} (${best.enemy}).`;
    } else if (rows.length) {
      label = 'SIN LÍNEA CLARA';
      head = 'Ninguna línea se destaca en los datos: gankeá la que esté empujada y sin Flash.';
      hud = 'Gankeá la línea empujada y sin Flash.';
    }
    if (worst && worst !== best && worst.d2 <= -1) {
      threats.push({ who: worst.enemy, src: 'DATOS', txt: `Tu ${me.name} rinde peor contra él (${worst.lab}): no gastes tus primeros ganks ahí.` });
    }
    // Duelo con el jungla rival (op.gg + Lolalytics mezclados)
    if (e.jungle && p.mu) {
      const s = p.mu.score;
      // El WR es de toda la partida, no del duelo del nivel 2-3 (eso lo dice el análisis del kit, abajo).
      // Qué hacer en el early lo dice el kit (guía, ANÁLISIS); esto es solo cómo termina la partida en los datos.
      const duel = s >= 0.6 ? `En los datos te va mejor contra ${e.jungle}: el early lo decide el kit (abajo), pero la partida larga te favorece.`
        : s <= -0.6 ? `En los datos te va peor contra ${e.jungle}: jugá seguro y contra-gankeá donde aparezca.`
          : `Contra ${e.jungle} los datos están parejos: decide el early (abajo).`;
      if (!rows.length) {
        label = s >= 0.6 ? 'PARTIDA A FAVOR' : s <= -0.6 ? 'PARTIDA EN CONTRA' : 'PAREJO';
        head = duel.split(':')[0] + '.';
        hud = s >= 0.6 ? `Contra ${e.jungle}: la partida larga te favorece.` : s <= -0.6 ? `Contra ${e.jungle}: jugá seguro.` : null;
      } else threats.unshift({ who: e.jungle, src: 'DATOS', txt: duel });
      why.unshift({ src: 'DATOS', ref: 'op.gg + Lolalytics', txt: `${me.name} vs ${e.jungle}: ${sourcesText(p.mu)}` });
    } else if (!e.jungle) missing.push('falta el jungla rival');
  } else {
    // Diana mid: el que más la castiga en línea es el jungla rival.
    const jg = e.jungle;
    if (p.mu && p.laneEnemy) why.push({ src: 'DATOS', ref: 'op.gg + Lolalytics', txt: `${me.name} vs ${p.laneEnemy}: ${sourcesText(p.mu)}` });
    if (jg) {
      const r = find(lanes.jungle, jg);
      if (r) why.push({ src: 'DATOS', ref: 'Lolalytics Emerald+', txt: `${me.name} mid vs ${jg} (jungla): ${fmt(r[0])} pts propios del cruce (${games(r[1])} partidas)` });
      if (r && r[0] <= -1) {
        label = 'RESPETÁ AL JUNGLA';
        head = `Respetá a ${jg}: con ward en el río no empujes sin saber dónde está.`;
        hud = `Respetá a ${jg}: ward en el río.`;
        threats.push({ who: jg, src: 'DATOS', txt: 'Es de los junglas que más castigan a Diana mid: jugá con visión y guardá Flash.' });
      } else if (r && r[0] >= 1) {
        label = 'EMPUJÁ Y ROTÁ';
        head = `${jg} no te castiga tanto: empujá y rotá con tu jungla.`;
        hud = `${jg} no te castiga tanto: empujá y rotá.`;
      } else {
        label = 'JUGÁ CON VISIÓN';
        head = `Sin diferencia clara con ${jg}: ward en el río antes del 3, cuando más ganks hay.`;
        hud = 'Ward en el río antes del 3.';
      }
    } else missing.push('falta el jungla rival');
  }

  if (guide) {
    const resp = (guide.pre6 || []).find((x) => /^Respetá a /.test(x));
    if (resp) threats.push({ who: resp.replace(/^Respetá a ([^:]+):.*/, '$1'), src: 'ANÁLISIS', txt: resp.replace(/^Respetá a [^:]+:\s*/, '') });
  }
  const post6 = guide && guide.post6 ? [{ who: me.name, src: 'ANÁLISIS', txt: guide.post6 }] : [];
  let t6 = post6.length ? post6[0].txt.replace(/^Al 6[^:]*:\s*/, '') : '';
  t6 = t6.split('.')[0].trim();
  const lower = t6.length > 1 && t6[1] === t6[1].toLowerCase() && t6[1] !== t6[1].toUpperCase();   // no tocar "Q, E, R…"
  // Udyr no tiene definitiva: al 6 no cambia nada (no6), así que no hay línea del 6 en el overlay.
  const no6 = !!(guide && guide.no6);
  const hud6 = t6 && !no6 ? `Ya sos 6: ${lower ? t6.charAt(0).toLowerCase() + t6.slice(1) : t6}.` : null;
  return {
    role: me.role, label: label || 'PLAN', head: head || 'Elegí rivales para armar el plan.', known: Boolean(head),
    why, missing, threats, post6, hud: head ? hud || null : null, hud6,
    post6_label: no6 ? ((guide.labels || [])[2] || 'Más adelante') : null, fuente: FUENTE[key] || null,
  };
}

// En partida: sin números.
function forGame(pl) {
  if (!pl) return null;
  return { role: pl.role, label: pl.label, head: pl.head, threats: pl.threats.filter((t) => t.src === 'ANÁLISIS' || !/\d/.test(t.txt)),
    post6: pl.post6, hud: pl.hud, hud6: pl.hud6, post6_label: pl.post6_label };
}

module.exports = { mix, plan, forGame, sourcesText, BL };
