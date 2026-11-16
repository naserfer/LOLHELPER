'use strict';
// Qué muestra el overlay dentro del juego. Regla de diseño: poco texto, solo cuando sirve.
//  - Compra: grande cuando podés comprar algo o estás muerto; si no, una pastilla chica con lo que falta.
//  - Muerte: la causa, unos segundos.
//  - Plan del 14: cuántas muertes te quedan, hasta el minuto 14.

function topLine(v) {
  if (v.death && v.me && v.me.dead) return { death: true, title: v.death.title, text: v.death.text, t: v.death.t, ok: v.death.verdict && v.death.verdict !== 'error' };
  const list = (v.orders || []).filter((o) => o && o.text && (o.until == null || v.time <= o.until));
  list.sort((a, b) => a.pri - b.pri);
  if (list.length) return { call: true, text: list[0].text };
  // Por defecto el plan se ve hasta los 25 s; el plan de bot trae su propio límite (inicio de la línea, llegada al 6).
  if (v.win_line && v.time < (v.win_until != null ? v.win_until : 25)) return { call: true, text: v.win_line };
  if (v.death) return { death: true, title: v.death.title, text: v.death.text, t: v.death.t, ok: v.death.verdict && v.death.verdict !== 'error' };
  return null;
}

function hudPayload(v) {
  if (!v || !('gold' in v)) return null;
  const b = v.buy;
  let buy = null;
  if (b && b.items && b.items.length) {
    const can = b.missing === 0;
    buy = {
      items: b.items.concat(b.extra ? [b.extra] : []), target: b.target, cost: b.cost, missing: b.missing,
      complete: !!b.complete, start: !!b.start, mode: can || v.me.dead ? 'full' : 'mini',
      why: (v.why || {})[b.target] || '',
    };
  }
  const up = v.sup_upgrade;
  if (up && up.ready) {
    buy = Object.assign({}, buy || { items: [], target: up.item, cost: 0, missing: 0, complete: true, why: '' }, {
      upgrade: up.item, why: up.why || (buy && buy.why) || '', mode: 'full',
    });
  }
  const deathRule = (v.rules_live || []).find((r) => r.key === 'd14' || r.key === 'deaths');
  const line = topLine(v);
  return {
    time: v.time, gold: v.gold, dead: !!v.me.dead, respawn: Math.round(v.me.respawn || 0),
    buy,
    death: line && line.death ? { title: line.title, text: line.text, t: line.t, ok: !!line.ok } : null,
    call: line && line.call ? line.text : null,
    rule: deathRule && v.time < 15 * 60 ? { text: deathRule.rule, value: deathRule.value, ok: deathRule.ok, note: deathRule.note } : null,
  };
}

// Firma: si no cambia, el HUD no reconstruye nada (solo actualiza números).
function hudSig(h) {
  if (!h) return 'none';
  return JSON.stringify([h.buy && [h.buy.items, h.buy.mode, h.buy.target, h.buy.upgrade], h.dead,
    h.death && h.death.t, h.call, h.rule && [h.rule.text, h.rule.value, h.rule.ok]]);
}

// Posiciones por defecto (en % de la pantalla), pensadas para el HUD de League a escala normal.
const DEFAULT_LAYOUT = {
  buy: { x: 72.5, y: 88.3, anchor: 'center' },     // justo arriba de tus ítems
  death: { x: 50, y: 16, anchor: 'center' },
  rule: { x: 98.8, y: 70.5, anchor: 'right' },     // arriba del minimapa
};

module.exports = { hudPayload, hudSig, DEFAULT_LAYOUT };
