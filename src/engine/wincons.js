'use strict';
// Condiciones de victoria aprendidas de TUS partidas, con control de "patrones de casualidad".
//
// Para cada número buscamos el corte que más separa tus victorias de tus derrotas. Como probar
// muchos números y cortes siempre encuentra algo por suerte, hacemos una prueba de permutación
// tipo Westfall-Young: mezclamos tus resultados al azar PERMS veces y en cada mezcla tomamos la
// MAYOR diferencia entre TODOS los números. Una regla vale solo si la tuya supera al 95% de esas.
const { rng, shuffle } = require('./util');

const MIN_SIDE = 7;
const MIN_GAP = 12.0;
const PRIOR = 5;
const PERMS = 300;
const TRAIN_RATIO = 0.65;
const TRAIN_MIN = 20;
const VALIDATION_MIN_SIDE = 5;
const VALIDATED_NEED = Math.ceil(TRAIN_MIN / TRAIN_RATIO);

// Números de toda la partida (historial del cliente). Pueden ser consecuencia de ir ganando.
const FULL = {
  deaths: { label: 'Muertes', unit: '', fmt: 0, dirs: ['<='], live: true },
  kp: { label: 'Participación en kills', unit: '%', fmt: 0, dirs: ['>='], live: true },
  vision_pm: { label: 'Visión por minuto', unit: '/min', fmt: 1, dirs: ['>='], live: true },
  cw: { label: 'Control Wards compradas', unit: '', fmt: 0, dirs: ['>='], live: false },
  wk: { label: 'Wards rotas', unit: '', fmt: 0, dirs: ['>='], live: false },
  dmg_pm: { label: 'Daño a campeones por minuto', unit: '/min', fmt: 0, dirs: ['>='], live: false },
  taken_pm: { label: 'Daño recibido por minuto', unit: '/min', fmt: 0, dirs: ['<=', '>='], live: false },
  cc: { label: 'Segundos de CC aplicados', unit: 's', fmt: 0, dirs: ['>='], live: false },
};

// Números hasta el minuto 14 (grabados en vivo). Los controlás antes de que la partida se defina.
const EARLY = {
  d14: { label: 'Muertes antes del 14', unit: '', fmt: 0, dirs: ['<='], live: true },
  kp14: { label: 'Participación en kills al 14', unit: '%', fmt: 0, dirs: ['>='], live: true },
  vis14: { label: 'Visión al 14', unit: '', fmt: 0, dirs: ['>='], live: true },
  cw14: { label: 'Control Wards compradas antes del 14', unit: '', fmt: 0, dirs: ['>='], live: true },
  gold14: { label: 'Oro al 14 (ítems + bolsillo)', unit: '', fmt: 0, dirs: ['>='], live: true },
  item1: { label: 'Primer ítem legendario', unit: ' min', fmt: 1, dirs: ['<='], live: true },
  dg14: { label: 'Muertes con +1000 de oro antes del 14', unit: '', fmt: 0, dirs: ['<='], live: true },
};

// Jungla: además de lo del 14, la foto del minuto 8. Solo se usa si TODAS las partidas del rol la tienen
// (las grabaciones viejas no la traen y rellenarlas con 0 inventaría reglas).
const EARLY_JG = Object.assign({}, EARLY, {
  cs8: { label: 'Campamentos y minions al minuto 8', unit: '', fmt: 0, dirs: ['>='], live: true },
  lvl8: { label: 'Nivel al minuto 8', unit: '', fmt: 0, dirs: ['>='], live: true },
  kp8: { label: 'Participación en kills al 8', unit: '%', fmt: 0, dirs: ['>='], live: true },
  d8: { label: 'Muertes antes del 8', unit: '', fmt: 0, dirs: ['<='], live: true },
});
const earlySpec = (role, rows) => (role === 'jungle' && rows.length && rows.every((r) => r.f && r.f.cs8 !== undefined) ? EARLY_JG : EARLY);

function features(me, team, minutes) {
  const s = me.stats || {};
  const tk = team.reduce((a, p) => a + ((p.stats || {}).kills || 0), 0) || 1;
  const m = Math.max(minutes, 1);
  return {
    deaths: s.deaths || 0,
    kp: Math.min(100, 100 * ((s.kills || 0) + (s.assists || 0)) / tk),
    vision_pm: (s.visionScore || 0) / m,
    cw: s.visionWardsBoughtInGame || 0,
    wk: s.wardsKilled || 0,
    dmg_pm: (s.totalDamageDealtToChampions || 0) / m,
    taken_pm: (s.totalDamageTaken || 0) / m,
    cc: s.timeCCingOthers || 0,
  };
}

const shr = (w, g) => 100 * (w + PRIOR) / (g + 2 * PRIOR);

function cands(vals) {
  const v = vals.slice().sort((a, b) => a - b);
  const n = v.length;
  const out = new Set();
  for (let q = 2; q < 19; q++) out.add(v[Math.floor(n * q / 20)]);
  return [...out].sort((a, b) => a - b);
}

function best(xs, wins, dirs, thr) {
  const n = xs.length;
  const totalW = wins.reduce((a, b) => a + b, 0);
  let out = null;
  for (const t of thr) {
    for (const d of dirs) {
      let okG = 0, okW = 0;
      for (let i = 0; i < n; i++) {
        if (d === '<=' ? xs[i] <= t : xs[i] >= t) { okG++; okW += wins[i]; }
      }
      const noG = n - okG, noW = totalW - okW;
      if (okG < MIN_SIDE || noG < MIN_SIDE) continue;
      const gap = shr(okW, okG) - shr(noW, noG);
      if (!out || gap > out.gap) out = { gap, dir: d, t, ok: [okW, okG], no: [noW, noG] };
    }
  }
  return out;
}

// rows: [{win, f:{clave: valor}}]. spec: FULL o EARLY.
function learn(rows, spec = FULL, seed = 1, perms = PERMS) {
  if (rows.length < 2 * MIN_SIDE) return [];
  const wins = rows.map((r) => (r.win ? 1 : 0));
  const cols = {}, thr = {};
  for (const k of Object.keys(spec)) {
    cols[k] = rows.map((r) => (r.f[k] === undefined || r.f[k] === null ? 0 : r.f[k]));
    thr[k] = cands(cols[k]);
  }
  const found = {};
  for (const k of Object.keys(spec)) {
    const b = best(cols[k], wins, spec[k].dirs, thr[k]);
    if (b && b.gap >= MIN_GAP) found[k] = b;
  }
  if (!Object.keys(found).length) return [];
  const rnd = rng(seed);
  const nullMax = [];
  const sh = wins.slice();
  for (let p = 0; p < perms; p++) {
    shuffle(sh, rnd);
    let m = 0;
    for (const k of Object.keys(spec)) {
      const nb = best(cols[k], sh, spec[k].dirs, thr[k]);
      if (nb && nb.gap > m) m = nb.gap;
    }
    nullMax.push(m);
  }
  const rules = [], hints = [];
  for (const [k, b] of Object.entries(found)) {
    const pv = (1 + nullMax.filter((g) => g >= b.gap).length) / (perms + 1);
    const r = { key: k, gap: b.gap, dir: b.dir, t: b.t, ok: b.ok, no: b.no, p: Math.round(pv * 1000) / 1000 };
    if (pv > 0.05) { if (pv <= 0.3) hints.push(Object.assign(r, { conf: 'pista' })); continue; }
    rules.push(Object.assign(r, { conf: pv <= 0.01 ? 'alta' : 'media' }));
  }
  rules.sort((a, b) => b.gap - a.gap);
  hints.sort((a, b) => a.p - b.p);
  return rules.concat(hints.slice(0, Math.max(0, 2 - rules.length))).slice(0, 5);
}

const fmtNum = (v, d) => (d ? Number(v).toFixed(d) : String(Math.round(v)));
function ruleText(r, spec = FULL) {
  const s = spec[r.key];
  return `${s.label} ${r.dir === '<=' ? '≤' : '≥'} ${fmtNum(r.t, s.fmt)}${s.unit}`;
}
const wrOf = ([w, g]) => (g ? 100 * w / g : 0);
const check = (r, v) => (r.dir === '<=' ? v <= r.t : v >= r.t);

// Aprende con las partidas viejas y mide el patrón en las más nuevas. Las filas deben
// venir en orden cronológico (vieja → nueva). Solo una regla que se sostenga fuera de
// la muestra de entrenamiento queda habilitada para el coach en vivo.
function learnValidated(rows, spec = FULL, seed = 1) {
  const trainN = Math.floor(rows.length * TRAIN_RATIO);
  const training = rows.slice(0, trainN);
  const validation = rows.slice(trainN);
  const trainWins = training.filter((r) => r.win).length;
  const trainLosses = training.length - trainWins;
  const validationWins = validation.filter((r) => r.win).length;
  const validationLosses = validation.length - validationWins;
  const ready = training.length >= TRAIN_MIN
    && validationWins >= VALIDATION_MIN_SIDE && validationLosses >= VALIDATION_MIN_SIDE;
  const candidates = training.length >= TRAIN_MIN
    ? learn(training, spec, seed)
    : [];
  const evaluated = candidates.map((rule) => {
    let okW = 0, okN = 0, noW = 0, noN = 0;
    const indexes = [];
    for (let i = 0; i < validation.length; i++) {
      const row = validation[i];
      const value = row.f[rule.key];
      if (value === undefined || value === null) continue;
      indexes.push(i);
      if (check(rule, value)) { okN++; okW += row.win ? 1 : 0; }
      else { noN++; noW += row.win ? 1 : 0; }
    }
    const wrOk = wrOf([okW, okN]);
    const wrNo = wrOf([noW, noN]);
    const enough = okN >= VALIDATION_MIN_SIDE && noN >= VALIDATION_MIN_SIDE;
    const status = !enough ? 'pendiente' : 'no_sostenida';
    return Object.assign({}, rule, { validation: {
      status, ok: [okW, okN], no: [noW, noN], wr_ok: wrOk, wr_no: wrNo,
      gap: wrOk - wrNo, min_side: VALIDATION_MIN_SIDE, indexes,
    } });
  });
  // Hay hasta cinco reglas candidatas; compara el mejor resultado de cada
  // permutación para no confirmar una regla solo por probar varias.
  const testable = evaluated.filter((r) => r.validation.status !== 'pendiente');
  if (testable.length) {
    const labels = validation.map((r) => r.win ? 1 : 0);
    const shuffled = labels.slice();
    const rnd = rng((seed || 1) + 1009);
    const groups = testable.map((rule) => ({
      rule,
      good: new Set(rule.validation.indexes.filter((i) => check(rule, validation[i].f[rule.key]))),
      indexes: rule.validation.indexes,
    }));
    const nullMax = [];
    for (let p = 0; p < PERMS; p++) {
      shuffle(shuffled, rnd);
      let maxGap = 0;
      for (const group of groups) {
        let okW = 0, okN = 0, noW = 0, noN = 0;
        for (const i of group.indexes) {
          if (group.good.has(i)) { okN++; okW += shuffled[i]; }
          else { noN++; noW += shuffled[i]; }
        }
        maxGap = Math.max(maxGap, wrOf([okW, okN]) - wrOf([noW, noN]));
      }
      nullMax.push(maxGap);
    }
    for (const rule of testable) {
      const p = (1 + nullMax.filter((gap) => gap >= rule.validation.gap).length) / (PERMS + 1);
      rule.validation.p = Math.round(p * 1000) / 1000;
      if (rule.validation.gap > 0 && p <= 0.05) rule.validation.status = 'sostenida';
    }
  }
  for (const rule of evaluated) delete rule.validation.indexes;
  const rules = evaluated.filter((r) => r.validation.status === 'sostenida').map((r) =>
    Object.assign({}, r, { train: { ok: r.ok, no: r.no }, ok: r.validation.ok, no: r.validation.no }));
  return {
    have: rows.length, need: VALIDATED_NEED,
    train_n: training.length, train_wins: trainWins, train_losses: trainLosses,
    validation_n: validation.length, validation_wins: validationWins, validation_losses: validationLosses,
    ready, rules, candidates: evaluated,
  };
}

function review(rules, row, spec = FULL) {
  const items = [];
  for (const r of rules) {
    const v = row.f[r.key];
    if (v === undefined || v === null) continue;
    items.push({ rule: ruleText(r, spec), value: fmtNum(v, spec[r.key].fmt) + spec[r.key].unit, ok: check(r, v),
      gap: r.gap, wr_ok: wrOf(r.ok), wr_no: wrOf(r.no), conf: r.conf });
  }
  const missed = items.filter((i) => !i.ok);
  const key = missed.length ? missed.reduce((a, b) => (b.gap > a.gap ? b : a)) : null;
  return { win: row.win, champ: row.champ, items, met: items.filter((i) => i.ok).length, total: items.length, key_miss: key };
}

module.exports = { FULL, EARLY, EARLY_JG, earlySpec, MIN_SIDE, TRAIN_RATIO, TRAIN_MIN, VALIDATION_MIN_SIDE, VALIDATED_NEED,
  features, learn, learnValidated, ruleText, wrOf, check, review, fmtNum };
