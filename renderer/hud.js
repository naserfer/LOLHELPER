'use strict';
/* Overlay dentro del juego: transparente y sin capturar el mouse (salvo en modo edición). */
const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmt = (t) => (t <= 0 ? 'VIVO' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
let ICONS = {}, LAYOUT = {}, H = null, SIG = '', EDIT = false, deathShownAt = null;

function icon(name, size) {
  const u = ICONS[`item:${norm(name)}`];
  const px = Math.round(size * S());
  const ini = esc(String(name).replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase());
  return `<span class="ic" style="width:${px}px;height:${px}px" title="${esc(name)}">${ini}${u ? `<img src="${esc(u)}" alt="">` : ''}</span>`;
}
function S() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--s')) || 1; }

function place(id, l) {
  const el = document.getElementById(id);
  el.style.left = `${l.x}%`;
  el.style.top = `${l.y}%`;
  el.style.transform = l.anchor === 'center' ? 'translate(-50%, -100%)' : l.anchor === 'right' ? 'translate(-100%, -100%)' : 'translate(0, -100%)';
}
function layout() { for (const [k, id] of [['buy', 'w-buy'], ['death', 'w-death'], ['rule', 'w-rule']]) place(id, LAYOUT[k]); }

function build() {
  const h = H || (EDIT ? sample() : null);
  const buy = document.getElementById('w-buy'), rule = document.getElementById('w-rule'), death = document.getElementById('w-death');
  if (!h) { for (const e of [buy, rule, death]) { e.innerHTML = ''; e.classList.add('hide'); } return; }
  // compra
  const b = h.buy;
  if (b && b.mode === 'full') {
    buy.innerHTML = `<div class="panel buy-full"><div class="row"><span class="k">${b.missing ? 'Próxima compra' : h.dead ? 'Al revivir comprá' : 'Comprá'}</span><span class="cost" data-live="cost">${b.missing ? `faltan ${b.missing}` : `${b.cost} de oro`}</span></div>
      <div class="row" style="margin-top:4px">${b.items.map((n, i) => (i ? '<span class="plus">+</span>' : '') + icon(n, i ? 30 : 36)).join('')}</div>
      <div class="why">${esc(b.complete ? `Completa ${b.target}` : `Hacia ${b.target}`)}${b.why ? ` · ${esc(b.why)}` : ''}</div></div>`;
  } else if (b) {
    const pct = Math.max(0, Math.min(100, 100 * (1 - b.missing / Math.max(1, b.cost))));
    buy.innerHTML = `<div class="panel buy-mini"><div class="row">${icon(b.items[0], 22)}<span class="miss" data-live="miss">faltan ${b.missing}</span></div><div class="bar"><i data-live="bar" style="width:${pct}%"></i></div></div>`;
  } else buy.innerHTML = '';
  buy.classList.toggle('hide', !b);
  // regla del 14
  const r = h.rule;
  rule.innerHTML = r ? `<div class="panel rule"><div class="row"><span class="dot" style="background:var(--${r.ok ? 'good' : 'bad'})"></span><span>${esc(r.text)}</span><b style="color:var(--${r.ok ? 'good' : 'bad'})">${esc(r.value)}</b></div></div>` : '';
  rule.classList.toggle('hide', !r);
  // muerte
  const d = h.death;
  death.innerHTML = d ? `<div class="panel death"><div class="k">Moriste · ${esc(d.title)}</div><div style="margin-top:3px">${esc(d.text)}</div></div>` : '';
  death.classList.toggle('hide', !d);
}
function live() {
  if (!H) return;
  const set = (sel, txt) => { const e = document.querySelector(sel); if (e && e.textContent !== txt) e.textContent = txt; };
  const b = H.buy;
  if (b) {
    set('[data-live="miss"]', `faltan ${b.missing}`);
    set('[data-live="cost"]', b.missing ? `faltan ${b.missing}` : `${b.cost} de oro`);
    const bar = document.querySelector('[data-live="bar"]');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, 100 * (1 - b.missing / Math.max(1, b.cost))))}%`;
  }
}
function sample() {
  return { time: 600, gold: 1300, dead: false, buy: { items: ["Zeke's Convergence"], target: "Zeke's Convergence", cost: 1300, missing: 0, complete: true, mode: 'full', why: 'parte de la build' },
    death: { title: 'Te agarró la jungla', text: 'Antes de avanzar, sabé dónde está la jungla rival.', t: 1 }, rule: { text: 'Muertes antes del 14 ≤ 1', value: '0', ok: true } };
}

/* arrastrar en modo edición */
let drag = null;
document.addEventListener('mousedown', (e) => {
  if (!EDIT) return;
  const w = e.target.closest('.w');
  if (!w) return;
  const r = w.getBoundingClientRect();
  drag = { w, dx: e.clientX, dy: e.clientY, x0: parseFloat(w.style.left), y0: parseFloat(w.style.top), r };
});
document.addEventListener('mousemove', (e) => {
  if (!drag) return;
  const nx = drag.x0 + 100 * (e.clientX - drag.dx) / window.innerWidth;
  const ny = drag.y0 + 100 * (e.clientY - drag.dy) / window.innerHeight;
  drag.w.style.left = `${Math.max(0, Math.min(100, nx))}%`;
  drag.w.style.top = `${Math.max(2, Math.min(100, ny))}%`;
});
document.addEventListener('mouseup', () => {
  if (!drag) return;
  const key = { 'w-buy': 'buy', 'w-death': 'death', 'w-rule': 'rule' }[drag.w.id];
  LAYOUT[key] = Object.assign({}, LAYOUT[key], { x: parseFloat(drag.w.style.left), y: parseFloat(drag.w.style.top) });
  window.ph.hudLayout(LAYOUT);
  drag = null;
});

window.ph.on('icons', (m) => { ICONS = m; SIG = ''; });
window.ph.on('hud-config', (c) => {
  LAYOUT = c.layout; EDIT = c.edit;
  document.documentElement.style.setProperty('--s', String(c.scale));
  document.body.classList.toggle('edit', EDIT);
  layout(); SIG = ''; build();
});
window.ph.on('hud', (m) => {
  H = m.hud;
  if (m.sig !== SIG) { SIG = m.sig; build(); } else live();
});
window.ph.ready('hud');
