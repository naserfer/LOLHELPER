// Clips de muertes y jugadas: ciclo por partida, borrado automático, tope de jugadas, rutas seguras y triples.
const fs = require('fs'), os = require('os'), path = require('path');
const { Clipper, congrats, deathName, MAX_JUGADAS } = require('../src/clipper');
const { Recorder } = require('../src/engine/recorder');
const { ItemDB } = require('../src/engine/itemdb');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const tick = () => new Promise((r) => setImmediate(r));

// Ventana falsa: responde a 'clip' con unos bytes.
const sent = [];
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clips'));
let cl;
const fakeWin = { webContents: { send: (ch, m) => {
  sent.push(m);
  if (m.type === 'start') setImmediate(() => cl.onMessage('status', { ok: true, hw: true, width: 1920, height: 1080 }));
  if (m.type === 'clip') setImmediate(() => cl.onMessage('clip', { id: m.data.id, ok: true, bytes: new Uint8Array([1, 2, 3]), seconds: 30 }));
} } };
cl = new Clipper({ dir, createWindow: () => fakeWin, getSourceId: async () => 'screen:0', size: () => ({ width: 1920, height: 1080 }), timer: (fn) => fn() });

(async () => {
  cl.onMessage('ready', {});
  // partida anterior: quedó un clip de muerte
  fs.writeFileSync(path.join(cl.deaths, 'muerte_100.mp4'), 'viejo');
  await cl.startGame('g1');
  await tick();
  ok(!fs.existsSync(path.join(cl.deaths, 'muerte_100.mp4')), 'al empezar una partida se borran los clips de muertes de la anterior');
  ok(sent.some((m) => m.type === 'start' && m.data.fps === 30 && m.data.sourceId === 'screen:0' && m.data.allowSoftware === false),
    'arranca el buffer en memoria (30 fps) y sin permitir codificar con el procesador');
  ok(cl.status.state === 'grabando' && cl.status.hw, 'estado: grabando con la placa de video');

  const now = 1_000_000;
  const name = cl.deathClip(445, now - 2000, now);
  await tick(); await tick();
  const req = sent.find((m) => m.type === 'clip');
  ok(name === deathName(445) && req && req.data.toWall - req.data.fromWall === 30000 && req.data.fromWall === now - 2000 - 25000,
    `clip de muerte: 25 s antes y 5 s después (${name})`);
  ok(fs.existsSync(path.join(cl.deaths, name)), 'el clip se guarda en clips/muertes');

  const play = cl.multiClip(1310, 3, "Kai'Sa", now, now);
  await tick(); await tick();
  const meta = JSON.parse(fs.readFileSync(path.join(cl.plays, play.replace('.mp4', '.json')), 'utf8'));
  ok(/jugada_.*_KaiSa_3\.mp4/.test(play) && meta.title === 'Triple kill' && CONGRATS3(meta.msg), `triple kill guardada con felicitación: "${meta.msg}"`);
  ok(cl.listPlays().length === 1 && cl.listPlays()[0].file === play, 'aparece en "Tus jugadas"');

  // Fin de partida: se apaga el buffer, los clips de la partida quedan para revisar
  cl.endGame();
  ok(sent[sent.length - 1].type === 'stop' && fs.existsSync(path.join(cl.deaths, name)), 'al terminar se corta el buffer; los clips quedan hasta la próxima partida');
  ok(cl.deathClip(500, now, now) === null, 'sin partida no pide clips');

  // Tope de jugadas
  for (let i = 0; i < MAX_JUGADAS + 5; i++) {
    const f = path.join(cl.plays, `jugada_x${String(i).padStart(3, '0')}_A_3.mp4`);
    fs.writeFileSync(f, 'x');
    fs.writeFileSync(f.replace('.mp4', '.json'), JSON.stringify({ date: new Date(2026, 0, 1, 0, i).toISOString(), title: 'Triple kill', msg: 'x' }));
    fs.utimesSync(f, new Date(2026, 0, 1, 0, i), new Date(2026, 0, 1, 0, i));
  }
  cl.trimPlays();
  ok(fs.readdirSync(cl.plays).filter((f) => f.endsWith('.mp4')).length === MAX_JUGADAS, `las jugadas se guardan con tope de ${MAX_JUGADAS} (se borran las más viejas)`);

  // Rutas seguras
  ok(cl.resolve('muertes/muerte_445.mp4') && !cl.resolve('../settings.json') && !cl.resolve('muertes/../../x.mp4') && !cl.resolve('jugadas/a b.mp4'),
    'solo sirve archivos de clips (nada de ../)');

  // Felicitaciones
  ok([3, 4, 5].every((n) => congrats(n, 7).length > 5) && congrats(6, 1) === congrats(5, 1), 'hay felicitaciones para triple, cuádruple y penta (6+ cuenta como penta)');

  // Grabador de partida: muerte con nombre de clip y triple kill tuya
  const rdir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec'));
  const rec = new Recorder(rdir);
  const db = new ItemDB({});
  const me = { riotId: 'Bitty#LAS', championName: 'Diana', team: 'ORDER', position: 'JUNGLE', level: 9, items: [], scores: {} };
  const en = { riotId: 'R1#LAS', championName: 'Ahri', team: 'CHAOS', position: 'MIDDLE', level: 9, items: [], scores: {} };
  const ev = [{ EventName: 'ChampionKill', EventTime: 600, VictimName: 'R1#LAS', KillerName: 'Bitty#LAS', Assisters: [] },
    { EventName: 'Multikill', EventTime: 601, KillerName: 'Bitty#LAS', KillStreak: 3 },
    { EventName: 'Multikill', EventTime: 640, KillerName: 'R1#LAS', KillStreak: 3 },
    { EventName: 'Multikill', EventTime: 650, KillerName: 'Bitty#LAS', KillStreak: 2 },
    { EventName: 'ChampionKill', EventTime: 700, VictimName: 'Bitty#LAS', KillerName: 'R1#LAS', Assisters: [] }];
  const f = (t, evs) => ({ activePlayer: { riotId: 'Bitty#LAS', currentGold: 0 }, allPlayers: [me, en], gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t }, events: { Events: evs } });
  rec.onPoll(f(590, []), { db, alias: {}, now: 1 });
  const r1 = rec.onPoll(f(605, ev.slice(0, 4)), { db, alias: {}, now: 2 });
  ok(r1.multi && r1.multi.n === 3 && rec.rec.multis.length === 1, 'detecta tu triple kill (no la del rival, ni tus dobles)');
  const r2 = rec.onPoll(f(702, ev), { db, alias: {}, now: 3 });
  ok(r2.fresh && r2.fresh.clip === 'muerte_700.mp4', 'cada muerte guarda el nombre de su clip');

  if (failed) { console.log(`clips: ${failed} fallas`); process.exit(1); }
  console.log('clips: todo OK');
})();

function CONGRATS3(msg) { return require('../src/clipper').CONGRATS[3].includes(msg); }
