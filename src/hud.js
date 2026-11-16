'use strict';
// Qué muestra el overlay dentro del juego. Regla de diseño: poco texto, solo cuando sirve.
//  - Compra: grande cuando podés comprar algo o estás muerto; si no, una pastilla chica con lo que falta.
//  - Muerte: la causa, unos segundos.
//  - Plan del 14: cuántas muertes te quedan, hasta el minuto 14.

function hudPayload(v) {
  if (!v || !('gold' in v)) return null;
  const b = v.buy;
  let buy = null;
  if (b && b.items && b.items.length) {
    const can = b.missing === 0;
    buy = {
      items: b.items.concat(b.extra ? [b.extra] : []), target: b.target, cost: b.cost, missing: b.missing,
      complete: !!b.complete, mode: can || v.me.dead ? 'full' : 'mini',
      why: (v.why || {})[b.target] || '',
    };
  }
  const deathRule = (v.rules_live || []).find((r) => r.key === 'd14' || r.key === 'deaths');
  return {
    time: v.time, gold: v.gold, dead: !!v.me.dead, respawn: Math.round(v.me.respawn || 0),
    buy,
    death: v.death ? { title: v.death.title, text: v.death.text, t: v.death.t } : null,
    rule: deathRule && v.time < 15 * 60 ? { text: deathRule.rule, value: deathRule.value, ok: deathRule.ok, note: deathRule.note } : null,
  };
}

// Firma: si no cambia, el HUD no reconstruye nada (solo actualiza números).
function hudSig(h) {
  if (!h) return 'none';
  return JSON.stringify([h.buy && [h.buy.items, h.buy.mode, h.buy.target], h.dead,
    h.death && h.death.t, h.rule && [h.rule.text, h.rule.value, h.rule.ok]]);
}

// Posiciones por defecto (en % de la pantalla), pensadas para el HUD de League a escala normal.
const DEFAULT_LAYOUT = {
  buy: { x: 72.5, y: 88.3, anchor: 'center' },     // justo arriba de tus ítems
  death: { x: 50, y: 16, anchor: 'center' },
  rule: { x: 98.8, y: 70.5, anchor: 'right' },     // arriba del minimapa
};

module.exports = { hudPayload, hudSig, DEFAULT_LAYOUT };
