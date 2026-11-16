// Interfaz de la versión de Bitty: cada pantalla, 4 anchos.
process.env.PH_PROFILE = 'bitty';
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const SCREENS = [
  { name: 'champ select jungla', demo: 'select', expect: ['PICK HELPER · BITTY', 'JUNGLA RIVAL', 'Lee Sin', 'Nocturne', 'Diana', 'CÓMO JUGARLE AL JUNGLA', 'INICIO', 'HECHIZOS', 'BUILD', 'Conqueror', 'PLAN DE JUNGLA', 'Lolalytics', 'op.gg Master+'] },
  { name: 'champ select mid', demo: 'mid', expect: ['RIVAL DE MID', 'Ahri', 'Diana', 'CÓMO JUGAR LA LÍNEA', 'Electrocute', 'PLAN DE MID'] },
  { name: 'partida Nocturne', demo: 'game', expect: ['Nocturne', 'JUNGLA RIVAL', 'Lee Sin', 'COMPRÁ', 'PLAN DE JUNGLA'], absent: ['%', 'partidas', 'pts'] },
  { name: 'partida con muerte', demo: 'jgdeath', expect: ['MORISTE'] },
  { name: 'repaso sin cliente', demo: null, expect: ['Sin conexión', 'Jungla', 'Mid', 'Faltan 20'] },
];
for (const s of SCREENS) {
  const out = path.join(os.tmpdir(), `uib_${Math.random().toString(36).slice(2)}.json`);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'uibud'));
  const args = ['.', '--no-sandbox', '--offline=test/offline.json', '--icons=test/icons.json', `--userdir=${ud}`, `--selftest=${out}`, '--wait=4000'];
  if (s.demo) args.push(`--demo=${s.demo}`);
  try { execFileSync(path.join(root, 'node_modules', '.bin', 'electron'), args, { cwd: root, timeout: 90000, stdio: 'ignore', env: Object.assign({}, process.env, { LOL_PATH: '/nonexistent' }) }); } catch (e) { /* abajo */ }
  if (!fs.existsSync(out)) { ok(false, `${s.name}: no terminó`); continue; }
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  const errs = r.errors.filter((e) => !/Electron Security Warning|Autofill/.test(e));
  ok(!errs.length, `${s.name}: sin errores de JavaScript${errs.length ? ` (${errs[0]})` : ''}`);
  for (const res of r.results) {
    const text = res.text + ' ' + res.status + ' ' + (res.brand || '');
    const miss = s.expect.filter((t) => !text.toLowerCase().includes(t.toLowerCase()));
    const bad = [];
    if (miss.length) bad.push(`falta: ${miss.join(', ')}`);
    if (s.absent) {   // en partida, la tarjeta del plan no muestra números
      const card = (res.texts || {}).bot;
      if (card === undefined) bad.push('no está la tarjeta del plan');
      else { const there = s.absent.filter((t) => card.includes(t)); if (there.length) bad.push(`en partida muestra: ${there.join(', ')}`); }
    }
    if (res.overflow || res.wide.length) bad.push('se sale de la ventana');
    if (!res.buttonsVisible) bad.push('botones cortados');
    ok(!bad.length, `${s.name} a ${res.width}px: ${bad.length ? bad.join('; ') : 'bien'}`);
  }
}
console.log(`\n${passed} OK, ${failed} fallas`);
process.exit(failed ? 1 : 0);
