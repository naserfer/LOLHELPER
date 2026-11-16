// Elegir jugador al abrir por primera vez (un solo .exe para Naser y Bitty) sin perder datos de nadie.
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const player = require('../src/player');
const root = path.join(__dirname, '..');
let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };

// --- lógica
const ad = fs.mkdtempSync(path.join(os.tmpdir(), 'appdata'));
ok(player.resolve({ appData: ad, env: {}, builtId: 'naser' }).ask === true, 'primera vez (nada elegido): pregunta');
ok(player.resolve({ appData: ad, env: {}, builtId: 'bitty' }).id === 'bitty', 'un PickHelper-Bitty.exe viejo sigue siendo de Bitty sin preguntar');
ok(player.resolve({ appData: ad, env: { PH_PROFILE: 'naser' }, builtId: 'naser' }).id === 'naser', 'PH_PROFILE (desarrollo) manda');
player.saveChoice(ad, 'bitty');
ok(player.resolve({ appData: ad, env: {}, builtId: 'naser' }).id === 'bitty', 'después de elegir, no vuelve a preguntar');
ok(player.userDataFor(ad, 'bitty') === path.join(ad, 'Pick Helper Bitty') && player.userDataFor(ad, 'naser') === path.join(ad, 'Pick Helper'),
  'cada jugador usa su carpeta de siempre (Pick Helper / Pick Helper Bitty): no se pierde historial');
fs.writeFileSync(player.choiceFile(ad), JSON.stringify({ id: 'bitty', otra: 1 }));
player.saveChoice(ad, 'naser');
ok(JSON.parse(fs.readFileSync(player.choiceFile(ad), 'utf8')).otra === 1, 'guardar la elección no borra otras claves');
let threw = false; try { player.saveChoice(ad, 'cualquiera'); } catch (e) { threw = true; }
ok(threw, 'no acepta jugadores inventados');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
ok(pkg.productName === 'Pick Helper' && pkg.build.appId === 'py.naser.pickhelper', 'productName y appId sin cambios');

// --- ventana real (necesita DISPLAY)
if (process.env.DISPLAY) {
  for (const [size, pick] of [['340x420', 'bitty'], ['440x420', 'naser']]) {
    const ad2 = fs.mkdtempSync(path.join(os.tmpdir(), 'appdata'));
    const out = path.join(os.tmpdir(), `choose_${Math.random().toString(36).slice(2)}.json`);
    try {
      execFileSync(path.join(root, 'node_modules', '.bin', 'electron'), ['.', '--no-sandbox', '--choose', `--appdata=${ad2}`, `--choosetest=${out}`,
        `--choosepick=${pick}`, `--size=${size}`], { cwd: root, timeout: 60000, stdio: 'ignore', env: Object.assign({}, process.env, { PH_PROFILE: '' }) });
    } catch (e) { /* se revisa abajo */ }
    const r = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
    ok(r && /Quién sos/.test(r.text) && /Naser/.test(r.text) && /Bitty/.test(r.text) && /Support/.test(r.text) && /Jungla/.test(r.text),
      `${size}: pregunta quién sos (Naser support, Bitty jungla)`);
    ok(r && r.wide === 0, `${size}: nada se sale de la ventana`);
    ok(r && r.saved === pick, `${size}: al elegir ${pick} queda guardado (${r && r.saved})`);
  }
  // Bitty ya elegido: abre con su perfil y guarda en su carpeta (no en la de Naser).
  const ad3 = fs.mkdtempSync(path.join(os.tmpdir(), 'appdata'));
  player.saveChoice(ad3, 'bitty');
  const out3 = path.join(os.tmpdir(), `st_${Math.random().toString(36).slice(2)}.json`);
  try {
    execFileSync(path.join(root, 'node_modules', '.bin', 'electron'), ['.', '--no-sandbox', `--appdata=${ad3}`, `--selftest=${out3}`, '--offline=test/offline.json',
      '--icons=test/icons.json', '--wait=3000'], { cwd: root, timeout: 60000, stdio: 'ignore', env: Object.assign({}, process.env, { PH_PROFILE: '', LOL_PATH: '/nonexistent' }) });
  } catch (e) { /* se revisa abajo */ }
  const r3 = fs.existsSync(out3) ? JSON.parse(fs.readFileSync(out3, 'utf8')) : null;
  const brand = r3 && r3.results && r3.results[0] && r3.results[0].brand;
  ok(brand && /BITTY/.test(brand), `con Bitty elegido abre su perfil (${brand})`);
  ok(fs.existsSync(path.join(ad3, 'Pick Helper Bitty', 'settings.json')) && !fs.existsSync(path.join(ad3, 'Pick Helper', 'settings.json')),
    'los datos de Bitty van a "Pick Helper Bitty"');
}
if (failed) { console.log(`player: ${failed} fallas`); process.exit(1); }
console.log('player: todo OK');
