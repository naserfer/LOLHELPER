// Actualizar la app no puede borrar ni cambiar tus datos (partidas grabadas, historial, ajustes).
const fs = require('fs'), os = require('os'), path = require('path'), crypto = require('crypto');
const { execFileSync } = require('child_process');
const { FakeRiot, liveFrame, historyGame } = require('./fake_riot');
const { Engine } = require('../src/engine/engine');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const offline = JSON.parse(fs.readFileSync(path.join(__dirname, 'offline.json'), 'utf8'));
const hashDir = (d) => { const out = {}; for (const f of fs.readdirSync(d)) out[f] = crypto.createHash('md5').update(fs.readFileSync(path.join(d, f))).digest('hex'); return out; };

(async () => {
  // 1) "Versión anterior": juega una partida y deja sus datos en la carpeta del usuario.
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lol'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ud'));
  process.env.LOL_PATH = lockDir;
  const riot = new FakeRiot({ lockDir, livePort: 2999 });
  await riot.start();
  const old = new Engine({ dataDir: path.join(__dirname, '..', 'data'), userDir });
  old.saveSettings({ rol_por_defecto: 'utility', always_on_top: false, bounds: { x: 10, y: 20, width: 500, height: 900 } });
  let clock = Date.parse('2026-11-14T22:00:00Z');
  const step = async (eng, dt) => { clock += dt; return eng.step({ now: clock, offlineData: offline }); };
  riot.state.phase = 'InProgress'; riot.state.gameId = 4242;
  for (let t = 5; t <= 900; t += 15) { riot.state.live = liveFrame(t, { deaths: [{ t: 400, killer: 'Rival3', assisters: ['Rival1'], gold: 1300 }], cwAt: [100] }); await step(old, 15000); }
  riot.state.live = null; riot.state.phase = 'EndOfGame';
  riot.state.history = [historyGame(4242, clock - 900e3, true)];
  await step(old, 25000);
  await old.history.refresh(0);
  const before = old.computeCoach(true);
  riot.stop();
  // La 2.0 guardaba el historial en "cache": lo dejamos ahí como lo dejaría ella.
  fs.mkdirSync(path.join(userDir, 'cache'), { recursive: true });
  for (const f of fs.readdirSync(path.join(userDir, 'historial'))) fs.renameSync(path.join(userDir, 'historial', f), path.join(userDir, 'cache', f));
  fs.rmdirSync(path.join(userDir, 'historial'));
  const recDir = path.join(userDir, 'partidas');
  const h1 = hashDir(recDir);
  const settings1 = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
  ok(before.last && before.last.win === true && before.last.deaths.length === 1, 'la versión anterior guardó tu última partida (victoria, 1 muerte analizada)');

  // 2) "Versión nueva" con la misma carpeta.
  const neu = new Engine({ dataDir: path.join(__dirname, '..', 'data'), userDir });
  await neu.loadData(offline);
  const after = neu.computeCoach(true);
  ok(after.last && after.last.win === true && after.last.deaths.length === 1 && after.last.deaths[0].primary === before.last.deaths[0].primary,
    'la versión nueva ve la misma última partida, con su resultado y su autopsia');
  ok(JSON.stringify(after.last.snap14) === JSON.stringify(before.last.snap14), 'la foto del minuto 14 queda igual');
  ok(after.early.have === before.early.have, `el progreso del plan del 14 se conserva (${after.early.have}/20)`);
  ok(JSON.stringify(hashDir(recDir)) === JSON.stringify(h1), 'los archivos de tus partidas no se tocaron');
  ok(neu.settings.always_on_top === false && neu.settings.bounds.width === 500 && neu.settings.rol_por_defecto === 'utility', 'tus ajustes (rol, siempre arriba, tamaño de ventana) se conservan');
  neu.saveSettings({ hud_enabled: true });
  const settings2 = JSON.parse(fs.readFileSync(path.join(userDir, 'settings.json'), 'utf8'));
  ok(Object.keys(settings1).every((k) => JSON.stringify(settings1[k]) === JSON.stringify(settings2[k])), 'guardar un ajuste nuevo no borra los viejos');
  ok(fs.readdirSync(path.join(userDir, 'historial')).some((f) => f.startsWith('history_')), 'el historial que guardó la versión anterior se pasa a su carpeta nueva');
  ok(fs.readdirSync(path.join(userDir, 'cache')).some((f) => f.startsWith('history_')), 'y el original no se borra');

  // 3) La app nueva (ventana real) muestra esa partida.
  const out = path.join(os.tmpdir(), 'up_ui.json');
  try {
    execFileSync(path.join(__dirname, '..', 'node_modules', '.bin', 'electron'), ['.', '--no-sandbox', '--demo=idle', '--offline=test/offline.json',
      `--userdir=${userDir}`, `--selftest=${out}`, '--wait=4000'], { cwd: path.join(__dirname, '..'), timeout: 60000, stdio: 'ignore' });
  } catch (e) { /* abajo */ }
  const ui = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
  ok(ui && /TU ÚLTIMA PARTIDA/i.test(ui.results[0].text) && /Victoria/.test(ui.results[0].text) && /Te agarró la jungla/.test(ui.results[0].text),
    'la ventana nueva muestra tu última partida (Victoria · autopsia)');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  ok(pkg.productName === 'Pick Helper' && pkg.build.appId === 'py.naser.pickhelper', 'mismo nombre de app: Windows usa la misma carpeta %APPDATA%\\Pick Helper');
  console.log(`\n${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
