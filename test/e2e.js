// Prueba de punta a punta del motor contra un cliente y un juego simulados (HTTPS real, puertos reales).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { FakeRiot, liveFrame, historyGame } = require('./fake_riot');
const { Engine } = require('../src/engine/engine');
const { viewSig } = require('../src/sig');

let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const offline = JSON.parse(fs.readFileSync(path.join(__dirname, 'offline.json'), 'utf8'));

(async () => {
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lol'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ud'));
  process.env.LOL_PATH = lockDir;
  const riot = new FakeRiot({ lockDir });
  const eng = new Engine({ dataDir: path.join(__dirname, '..', 'data'), userDir });
  let clock = Date.parse('2026-11-15T12:00:00Z');
  const step = async (dt = 1000) => { clock += dt; return eng.step({ now: clock, offlineData: offline }); };

  // 1) Sin cliente
  let r = await step();
  ok(r.status[0] === 'off' && r.view === null, `sin cliente abierto: estado "${r.status[1]}"`);

  // 2) Cliente abierto, en el lobby, con historial
  await riot.start();
  riot.state.history = [historyGame(101, clock - 86400e3, true), historyGame(102, clock - 80000e3, false), historyGame(103, clock - 70000e3, true)];
  eng.lcu.lastTry = 0;
  r = await step();
  ok(r.status[0] === 'idle', `cliente abierto: estado "${r.status[1]}"`);
  await eng.history.refresh(0);
  ok(eng.history.state === 'ok' && eng.history.summary.games === 3 && eng.history.summary.wins === 2, `historial leído del cliente: ${eng.history.summary && eng.history.summary.games} partidas, ${eng.history.summary && eng.history.summary.wins} ganadas`);
  ok(eng.history.summary.mates.some((m) => m.name === 'Tuki#LAS' && m.g === 3), 'detecta con quién jugaste (Tuki#LAS, 3 partidas)');
  ok((eng.history.summary.with_adc[0] || {}).key === 'Jinx', 'detecta tu ADC en tus partidas de support (Jinx)');

  // 3) Champ select de support: ADC en hover y después lockeado
  riot.state.phase = 'ChampSelect';
  riot.state.session = FakeRiot.champSelect({ adc: 'Jinx', adcLocked: false });
  r = await step();
  ok(r.view && r.view.mode === 'support', 'champ select con rol support → modo support');
  ok(r.view.ally_adc === 'Jinx' && !r.view.ally_adc_locked, 'toma el ADC aliado en hover (Jinx, sin lockear)');
  ok(r.view.lane_enemy === 'Leona' && r.view.enemy_adc === "Kai'Sa", `adivina la línea rival sin roles: ${r.view.enemy_adc} + ${r.view.lane_enemy}`);
  ok(r.view.recs.length >= 5 && r.view.recs.every((x) => x.status === 'ok'), `recomienda ${r.view.recs.length} supports disponibles`);
  ok(!!r.view.plan && r.view.plan.build.length >= 3, 'arma el plan del support recomendado (build, runas, hechizos)');
  ok(r.view.adc_hist && r.view.adc_hist.g === 3, 'muestra tu récord con Jinx desde el historial (3 partidas)');
  riot.state.session = FakeRiot.champSelect({ adc: 'Jinx', adcLocked: true });
  r = await step();
  ok(r.view.ally_adc_locked === true, 'detecta cuando el ADC lockea');
  const banned = FakeRiot.champSelect({});
  banned.bans.theirTeamBans = [r.view.recs[0] ? { Thresh: 412 }.Thresh : 0];
  riot.state.session = banned;
  r = await step();
  ok(!r.view.recs.some((x) => x.name === 'Thresh' && x.status === 'ok'), 'no recomienda un support baneado (Thresh)');

  // 4) Partida: el juego tarda en arrancar y luego corre hasta el 15
  riot.state.session = null;
  riot.state.phase = 'InProgress';
  riot.state.gameId = 777;
  const script = { deaths: [{ t: 300, killer: 'Rival3', assisters: ['Rival1'], gold: 1500 }, { t: 700, killer: 'Rival1', assisters: [], gold: 200 }],
    adcDeaths: [695], cwAt: [200, 610], legendaryAt: 700, dragonAt: [720] };
  r = await step();
  ok(r.view && 'gold' in r.view === false && r.status[0] === 'game', 'partida cargando (sin API en vivo todavía): sigue mostrando el champ select');
  let sawToast = null, toastGone = false, sigChanges = 0, lastSig = null, view;
  for (let t = 5; t <= 905; t += 5) {
    riot.state.live = liveFrame(t, script);
    if (t === 5) await sleep(50);
    r = await step(5000);
    if (t === 10) await sleep(50);        // deja que llegue el id de partida del cliente
    view = r.view;
    if (view && view.death && !sawToast) sawToast = { t, d: view.death };
    if (sawToast && t > 330 && t < 600 && !view.death) toastGone = true;
    const s = viewSig(view, r.status, '');
    if (s !== lastSig) { sigChanges++; lastSig = s; }
  }
  ok(r.status[0] === 'ingame' && view.me.champ === 'Thresh', 'en partida: detecta tu campeón (Thresh)');
  ok(view.lane && view.lane.champ === 'Leona', 'detecta tu rival de línea (Leona)');
  ok(view.enemy_adc && view.enemy_adc.champ === "Kai'Sa", 'muestra el ADC rival');
  ok(view.buy && view.buy.items.length > 0, `recomienda una compra: ${view.buy && view.buy.items.join(' + ')}`);
  ok(sawToast && sawToast.t >= 300 && sawToast.t <= 310, `aviso de muerte en el momento (t=${sawToast && sawToast.t}s)`);
  ok(sawToast && sawToast.d.labels.includes('jungla') && sawToast.d.labels.includes('oro'), `causa de la 1ª muerte: ${sawToast && sawToast.d.labels.join(', ')}`);
  ok(toastGone, 'el aviso desaparece solo a los pocos segundos');
  ok(sigChanges < 40, `la ventana se redibujó ${sigChanges} veces en 180 lecturas (solo cuando cambió algo)`);
  const rec = eng.recorder.rec;
  ok(rec.gameId === 777, `la grabación tiene el id de partida del cliente (${rec.gameId})`);
  ok(rec.snap14 && rec.snap14.d14 === 2 && rec.snap14.cw14 === 2 && rec.snap14.dg14 === 1, `foto del minuto 14: ${JSON.stringify(rec.snap14)}`);
  ok(rec.item1 === 11.7, `primer legendario al minuto ${rec.item1}`);
  const d2 = rec.deaths[1];
  ok(d2 && d2.adc_died_before === 5 && d2.objective_near === true, `2ª muerte: tu ADC cayó ${d2 && d2.adc_died_before}s antes, cerca del dragón`);

  // 5) El juego deja de responder 10 s: no salta a otra pantalla
  riot.state.liveDelayMs = 4000;
  r = await step(3000);
  ok(r.status[0] === 'ingame', 'si el juego no responde unos segundos, sigue mostrando la partida (no titila)');
  riot.state.liveDelayMs = 0;

  // 6) Fin de partida → historial con la partida → resultado y autopsia
  riot.state.live = null;
  riot.state.phase = 'EndOfGame';
  riot.state.history.push(historyGame(777, clock - 900e3, false));
  r = await step(25000);
  ok(r.status[0] === 'idle' && r.view === null, 'al terminar vuelve a la pantalla de repaso');
  await eng.history.refresh(0);
  const coach = eng.computeCoach(true);
  ok(coach.last && coach.last.win === false, `une la grabación con el resultado (${coach.last && coach.last.win === false ? 'derrota' : '?'})`);
  ok(coach.last.deaths.length === 2 && coach.last.deaths[0].primary === 'jungla', `autopsia de la última partida: ${coach.last.deaths.map((d) => d.title).join(' / ')}`);
  ok(coach.early.have === 1 && !coach.early.ready && coach.early.need === 20, `progreso del plan del 14: ${coach.early.have}/${coach.early.need}`);
  ok(coach.autopsy.deaths === 2, 'el resumen de "por qué morís" suma las muertes grabadas');

  // 7) 21 partidas más con un patrón real (morir 2+ antes del 14 hace perder) → aparecen las reglas del 14
  let gid = 800;
  for (let k = 0; k < 21; k++) {
    gid++;
    riot.state.gameId = gid;
    riot.state.phase = 'InProgress';
    const bad = k % 3 !== 0;   // dos de cada tres partidas mueren poco
    const deaths = bad ? [{ t: 400, killer: 'Rival1', gold: 300 }] : [{ t: 250, killer: 'Rival3', assisters: ['Rival1'], gold: 1200 }, { t: 500, killer: 'Rival1', gold: 300 }, { t: 650, killer: 'Rival2', assisters: ['Rival1'], gold: 300 }];
    const sc = { deaths, cwAt: [200], legendaryAt: 760 + k, visionRate: 1 + (k % 5) / 10 };
    for (let t = 2; t <= 860; t += 20) {
      riot.state.live = liveFrame(t, sc);
      r = await step(20000);
      if (t === 2) await sleep(30);
    }
    riot.state.live = null;
    riot.state.phase = 'EndOfGame';
    const win = bad ? k % 4 !== 1 : k === 0;
    riot.state.history.push(historyGame(gid, clock - 900e3, win));
    r = await step(25000);
  }
  await eng.history.refresh(0);
  const c2 = eng.computeCoach(true);
  ok(c2.early.have === 22 && c2.early.ready, `con ${c2.early.have} partidas completas se activan las reglas del 14`);
  ok(c2.early.rules.some((x) => x.key === 'd14' || x.key === 'dg14'), `aprende la regla real: ${c2.early_rules_text.map((x) => `${x.text} (${x.conf})`).join('; ')}`);

  // 8) La partida siguiente muestra tu plan hasta el 14 en vivo
  riot.state.gameId = 999;
  riot.state.phase = 'InProgress';
  riot.state.live = liveFrame(120, { deaths: [] });
  r = await step(1000);
  ok(r.view.rules_live && r.view.rules_live.length && r.view.rules_early, `en partida: ${r.view.rules_live.map((x) => `${x.rule} → ${x.value} (${x.note})`).join(' | ')}`);

  // 9) Formatos de nombre viejos (summonerName sin #)
  const sc3 = { nameFmt: 'old', deaths: [{ t: 130, killer: 'Rival1', gold: 100 }] };
  riot.state.live = liveFrame(140, sc3);
  r = await step(20000);
  ok(eng.recorder.rec.deaths.length === 1, 'reconoce tu muerte aunque el juego use nombres sin #TAG');

  // 10) Cliente se cierra
  riot.stop();
  riot.state.live = null;
  r = await step(30000);
  eng.lcu.lastTry = 0;
  r = await step(1000);
  ok(r.status[0] === 'off', 'si cerrás el cliente, avisa "Sin cliente"');

  const reqs = riot.state.requests;
  ok(reqs.length > 50 && reqs.every((u) => u.startsWith('GET ')), `solo lee: ${reqs.length} pedidos al cliente, todos GET`);
  console.log(`\n${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(2); });
