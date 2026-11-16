'use strict';
// Firma de una vista: si no cambia, la UI no se redibuja (solo se actualizan reloj, oro y timers).
function viewSig(view, status, coachKey) {
  if (!view) return JSON.stringify(['idle', status, coachKey]);
  if (!('gold' in view)) {
    return JSON.stringify(['select', status, view.lane_enemy, view.ally_adc, view.enemy_adc, view.win_line, view.scout, view.ban_sugg,
      view.recs.map((r) => [r.name, r.score, r.status]), view.focus && view.focus.name, view.enemies.map((e) => e.name)]);
  }
  const b = view.buy || {};
  const l = view.lane || {};
  const ea = view.enemy_adc || {};
  return JSON.stringify(['game', status, view.me.champ, view.me.level, view.me.items, view.me.kda, b.items, b.target,
    (b.missing || 0) > 0, b.extra, view.queue, l.champ, l.level, l.items, l.kda, l.dead, view.alerts.map((a) => a[1]),
    view.threats.map((t) => [t.name, t.kda, t.level]), ea.items, ea.level, ea.kda,
    (view.rules_live || []).map((r) => [r.key, r.ok, r.note]), view.death ? view.death.t : null, view.time >= 16 * 60,
    view.sup_upgrade && [view.sup_upgrade.item, view.sup_upgrade.ready], view.win_line,
    view.bot_plan && [view.bot_plan.label, view.bot_plan.hud], view.jg_plan && [view.jg_plan.label, view.jg_plan.hud], view.time >= 14 * 60,
    (view.orders || []).map((o) => [o.pri, o.text])]);
}
module.exports = { viewSig };
