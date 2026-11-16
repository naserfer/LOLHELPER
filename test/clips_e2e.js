// Clips de punta a punta en Electron: captura de pantalla → WebCodecs → buffer en memoria → MP4 → se reproduce en la app.
// En Linux no hay placa de video: se fuerza el codificador por software con --clipsoftware (en la PC real, sin placa se apagan).
const { execFileSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const root = path.join(__dirname, '..');
let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const out = path.join(os.tmpdir(), `clip_${Date.now()}.json`);
const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'clipud'));
try {
  execFileSync(path.join(root, 'node_modules', '.bin', 'electron'), ['.', '--no-sandbox', '--demo=idle', '--offline=test/offline.json', `--userdir=${ud}`,
    '--clipsoftware', `--cliptest=${out}`], { cwd: root, timeout: 90000, stdio: 'ignore', env: Object.assign({}, process.env, { LOL_PATH: '/nonexistent' }) });
} catch (e) { /* se revisa abajo */ }
const r = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
ok(r && r.status.state === 'grabando', `graba (${r && JSON.stringify(r.status)})`);
ok(r && r.deathBytes > 10000, `guarda el clip de la muerte (${r && r.deathBytes} bytes)`);
ok(r && r.play_check && r.play_check.duration > 5 && r.play_check.w > 0, `se reproduce en la app (${r && JSON.stringify(r.play_check)})`);
ok(r && r.plays.length === 1 && r.plays[0].title === 'Triple kill' && /🎉/.test(r.congrats_check || ''), `jugada con felicitación sobre el video (${r && r.congrats_check})`);
ok(r && fs.readdirSync(path.join(ud, 'clips')).sort().join() === 'jugadas,muertes', 'al disco solo van los clips (nada de la partida entera)');
if (failed) { console.log(`clips_e2e: ${failed} fallas`); process.exit(1); }
console.log('clips_e2e: todo OK');
