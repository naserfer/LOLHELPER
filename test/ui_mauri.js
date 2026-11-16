// Interfaz de la versión de Mauri (Udyr jungla): cada pantalla, 4 anchos.
// En partida la tarjeta AD/AP no muestra winrates ni partidas ("% de vida máxima" del kit sí puede estar).
process.env.PH_PROFILE = 'mauri';
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const SCREENS = [
  { name: 'champ select Udyr', demo: 'select', expect: ['PICK HELPER · MAURI', 'JUNGLA RIVAL', 'Lee Sin', 'Udyr', '¿AD o AP?', 'ARMÁ AP', 'Por qué AP', 'Y AD, cuándo',
    'Spear of Shojin', 'op.gg Emerald+', 'PLAN DE JUNGLA', 'CON TU PRIMER ÍTEM', 'Press the Attack', 'camino AP'], udyrHas: ['físico', 'Liandry'] },
  { name: 'partida Udyr', demo: 'game', expect: ['Udyr', '¿AD o AP?', 'ARMÁ AP', 'PLAN DE JUNGLA', 'camino AP'], absentUdyr: [/\d+(,\d+)?%/, /partidas/, /op\.gg/, /Y AD, cuándo/] },
  { name: 'repaso sin cliente', demo: null, expect: ['Sin conexión', 'Jungla (Udyr)', 'Faltan 20', 'Cambiar a Naser', 'Cambiar a Bitty', 'Iniciar con Windows'] },
];
for (const s of SCREENS) {
  const out = path.join(os.tmpdir(), `uim_${Math.random().toString(36).slice(2)}.json`);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'uimud'));
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
    const card = (res.texts || {}).udyr;
    if (s.udyrHas || s.absentUdyr) {
      if (card === undefined) bad.push('no está la tarjeta AD/AP');
      else {
        const lack = (s.udyrHas || []).filter((t) => !card.includes(t));
        if (lack.length) bad.push(`a la tarjeta le falta: ${lack.join(', ')}`);
        const there = (s.absentUdyr || []).filter((t) => t.test(card)).map(String);
        if (there.length) bad.push(`en partida la tarjeta muestra: ${there.join(', ')}`);
      }
    }
    if (res.overflow || res.wide.length) bad.push('se sale de la ventana');
    if (!res.buttonsVisible) bad.push('botones cortados');
    ok(!bad.length, `${s.name} a ${res.width}px: ${bad.length ? bad.join('; ') : 'bien'}`);
  }
}
console.log(`\n${passed} OK, ${failed} fallas`);
process.exit(failed ? 1 : 0);
