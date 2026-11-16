'use strict';
/* Primera vez: elegir quién usa la app. Cada jugador mantiene su propia carpeta de datos. */
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NAME = { naser: 'Naser', bitty: 'Bitty' };
document.getElementById('b-close').onclick = () => window.ph.chooseClose();
window.ph.players().then((list) => {
  document.getElementById('list').innerHTML = list.map((p) => `<button data-pick="${esc(p.id)}">
    <span class="ini"><span>${esc((NAME[p.id] || p.id)[0])}</span></span>
    <span><div class="nm">${esc(NAME[p.id] || p.id)}</div><div class="rl">${esc(p.roles.join(' · '))}</div></span></button>`).join('');
  for (const b of document.querySelectorAll('[data-pick]')) b.onclick = () => window.ph.choosePlayer(b.dataset.pick);
});
