// Pruebas automáticas de la interfaz: cada pantalla, 4 anchos, sin errores ni desbordes.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const root = path.join(__dirname, '..');
const electron = path.join(root, 'node_modules', '.bin', 'electron');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const SCREENS = [
  { name: 'champ select support', demo: 'support', expect: ['TU SUPPORT', 'Jinx', 'RECOMENDADO', 'CÓMO JUGAR LA LÍNEA', 'PLAN', 'BANEÁ', 'PLAN DE BOT CON JINX', 'Fuentes: op.gg', 'Lolalytics'] },
  { name: 'champ select top', demo: 'select', expect: ['TU PICK', 'RIVAL DE TOP', 'RECOMENDADO', 'PLAN'] },
  { name: 'partida top', demo: 'game', expect: ['COMPRÁ AHORA', 'TU RIVAL', 'EQUIPO RIVAL'] },
  { name: 'partida support', demo: 'gamesup', expect: ['COMPRÁ AHORA', 'SUPPORT RIVAL', 'ADC rival', 'ALERTAS', 'PLAN DE BOT'], absent: ['%', 'sinergia', 'pts', 'partidas)'], absentIn: 'bot' },
  { name: 'partida con muerte + plan del 14', demo: 'gamedeath', extra: ['--coach-fixture=full'], expect: ['MORISTE', 'TU PLAN HASTA EL 14', 'Muertes antes del 14', 'te pasaste: jugá a no morir'] },
  { name: 'repaso (con 26 partidas)', demo: 'idle', extra: ['--coach-fixture=full'], expect: ['TU ÚLTIMA PARTIDA', 'AUTOPSIA', 'POR QUÉ MORÍS', 'TU PLAN HASTA EL MINUTO 14', 'CON QUIÉN MÁS JUGASTE', 'menos confiables',
    'TU FOCO PARA LA PRÓXIMA', 'EVITABLE', 'Costo:', 'LO QUE HICISTE BIEN'] },
  { name: 'repaso (con 7 partidas)', demo: 'idle', extra: ['--coach-fixture=few'], expect: ['Faltan 13 partidas completas', 'POR QUÉ MORÍS'] },
  { name: 'sin cliente', demo: null, expect: ['Sin conexión', 'Faltan 20 partidas', 'se carga cuando abras el cliente'] },
];
for (const s of SCREENS) {
  const out = path.join(os.tmpdir(), `ui_${Math.random().toString(36).slice(2)}.json`);
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'uiud'));
  const args = ['.', '--no-sandbox', `--offline=test/offline.json`, `--icons=test/icons.json`, `--userdir=${ud}`, `--selftest=${out}`, '--wait=4000', ...(s.extra || [])];
  if (s.demo) args.push(`--demo=${s.demo}`);
  try { execFileSync(electron, args, { cwd: root, timeout: 90000, stdio: 'ignore', env: Object.assign({}, process.env, { LOL_PATH: '/nonexistent' }) }); } catch (e) { /* revisamos el resultado */ }
  if (!fs.existsSync(out)) { ok(false, `${s.name}: la app no terminó la autoprueba`); continue; }
  const r = JSON.parse(fs.readFileSync(out, 'utf8'));
  const errs = r.errors.filter((e) => !/Electron Security Warning|Autofill/.test(e));
  ok(errs.length === 0, `${s.name}: sin errores de JavaScript${errs.length ? ` (${errs.slice(0, 2).join(' | ')})` : ''}`);
  for (const res of r.results) {
    const miss = s.expect.filter((t) => !res.text.toLowerCase().includes(t.toLowerCase()));
    const bad = [];
    if (miss.length) bad.push(`falta: ${miss.join(', ')}`);
    if (s.absent) {
      const scope = s.absentIn ? (res.texts || {})[s.absentIn] : res.text;
      if (scope === undefined) bad.push(`no encontré la tarjeta "${s.absentIn}"`);
      else {
        const there = s.absent.filter((t) => scope.toLowerCase().includes(t.toLowerCase()));
        if (there.length) bad.push(`en partida no debería mostrar: ${there.join(', ')}`);
      }
    }
    if (res.overflow || res.wide.length) bad.push(`se sale de la ventana: ${res.wide.join(' ')}`);
    if (!res.buttonsVisible) bad.push('botones de la barra cortados');
    const wantCols = res.vw >= 760 ? 2 : 1;
    if (res.cols !== wantCols) bad.push(`columnas ${res.cols} (esperaba ${wantCols})`);
    ok(!bad.length, `${s.name} a ${res.width}px: ${bad.length ? bad.join('; ') : `bien (${res.cols} col., ${res.imgs} íconos)`}`);
  }
}
console.log(`\n${passed} OK, ${failed} fallas`);
process.exit(failed ? 1 : 0);
