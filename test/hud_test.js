// Pruebas del overlay dentro del juego.
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const { hudPayload, hudSig } = require('../src/hud');
const root = path.join(__dirname, '..');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };

// --- lógica (sin ventana)
const base = { time: 500, gold: 900, me: { dead: false, respawn: 0 }, objectives: [['Dragón', 200], ['Barón', 700]], why: {} };
const v = (o) => Object.assign({}, base, o);
let h = hudPayload(v({ buy: { items: ['Ruby Crystal'], target: 'Locket', cost: 400, missing: 0, complete: false, also: [] } }));
ok(h.buy.mode === 'full', 'si te alcanza para comprar, la compra se muestra grande');
h = hudPayload(v({ buy: { items: ['Locket'], target: 'Locket', cost: 2200, missing: 1300, complete: false, also: [] } }));
ok(h.buy.mode === 'mini', 'si no te alcanza, queda una pastilla chica con lo que falta');
h = hudPayload(v({ me: { dead: true, respawn: 12 }, buy: { items: ['Locket'], target: 'Locket', cost: 2200, missing: 1300, also: [] } }));
ok(h.buy.mode === 'full', 'si estás muerto, se muestra grande (es cuando mirás la tienda)');
h = hudPayload(v({ objectives: [['Dragón', 45], ['Barón', 700]], buy: null }));
ok(!('objectives' in h) && !('setup' in h), 'no muestra timers de objetivos (el juego ya los tiene en el mapa)');
h = hudPayload(v({ time: 600, rules_live: [{ key: 'd14', rule: 'Muertes antes del 14 ≤ 1', value: '0', ok: true }], buy: null }));
ok(!!h.rule, 'muestra tu regla de muertes hasta el minuto 14');
h = hudPayload(v({ time: 1000 + 600, rules_live: [{ key: 'd14', rule: 'x', value: '0', ok: true }], buy: null }));
ok(!h.rule, 'después del 15 la regla desaparece');
ok(hudPayload(null) === null && hudPayload({ mode: 'support', recs: [] }) === null, 'fuera de la partida no hay overlay');
let changes = 0, last = null;
for (let i = 0; i < 60; i++) {
  const s = hudSig(hudPayload(v({ time: 500 + i, gold: 900 + i, objectives: [['Dragón', 200 - i], ['Barón', 700 - i]],
    buy: { items: ['Locket'], target: 'Locket', cost: 2200, missing: 1300 - i, also: [] } })));
  if (s !== last) { changes++; last = s; }
}
ok(changes === 1, `el overlay no se reconstruye cada segundo (${changes} reconstrucción en 60 s; los números se actualizan solos)`);

// --- ventana real
function run(demo, size, extra = []) {
  const out = path.join(os.tmpdir(), `hud_${Math.random().toString(36).slice(2)}.json`);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'hudud'));
  try {
    execFileSync(path.join(root, 'node_modules', '.bin', 'electron'), ['.', '--no-sandbox', `--demo=${demo}`, '--offline=test/offline.json', '--icons=test/icons.json',
      `--userdir=${ud}`, '--coach-fixture=full', `--hudsize=${size}`, `--hudtest=${out}`, '--wait=4500', ...extra], { cwd: root, timeout: 60000, stdio: 'ignore' });
  } catch (e) { /* se revisa abajo */ }
  return fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
for (const size of ['1366x768', '1920x1080', '2560x1440']) {
  for (const demo of ['gamedeath', 'gamesup']) {
    const r = run(demo, size);
    if (!r) { ok(false, `${demo} ${size}: no corrió`); continue; }
    const [W, Hh] = r.vw;
    const vis = r.boxes.filter((b) => !b.hidden);
    const out = vis.filter((b) => b.x < 0 || b.y < 0 || b.x + b.w > W + 1 || b.y + b.h > Hh + 1);
    const ov = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) if (overlap(vis[i], vis[j])) ov.push(`${vis[i].id}/${vis[j].id}`);
    const bad = [];
    if (!r.visible) bad.push('no se ve');
    if (r.focusable) bad.push('roba el foco al juego');
    if (out.length) bad.push(`se sale: ${out.map((b) => b.id).join(',')}`);
    if (ov.length) bad.push(`se pisan: ${ov.join(',')}`);
    if (!vis.some((b) => b.id === 'w-buy')) bad.push('no muestra la compra');
    if (r.boxes.some((b) => b.id === 'w-obj')) bad.push('todavía hay timers de objetivos');
    if (demo === 'gamedeath' && !vis.some((b) => b.id === 'w-death')) bad.push('no muestra el aviso de muerte');
    const area = vis.reduce((s, b) => s + b.w * b.h, 0) / (W * Hh) * 100;
    if (area > 6) bad.push(`ocupa mucho (${area.toFixed(1)}% de la pantalla)`);
    ok(!bad.length, `${demo} a ${size}: ${bad.length ? bad.join('; ') : `bien (${vis.length} recuadros, ${area.toFixed(1)}% de la pantalla, no toma el foco)`}`);
  }
}
const e = run('gamesup', '1920x1080', ['--hudedit']);
ok(e && e.focusable === true && e.boxes.every((b) => !b.hidden || b.id === 'w-death'), 'modo acomodar: se puede arrastrar (toma el mouse) y muestra los recuadros');
const outside = run('support', '1920x1080');
ok(outside && (!outside.exists || !outside.visible), 'en champ select el overlay del juego no aparece');
console.log(`\n${passed} OK, ${failed} fallas`);
process.exit(failed ? 1 : 0);
