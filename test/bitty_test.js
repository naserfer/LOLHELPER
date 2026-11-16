// Pruebas de la versión de Bitty (jungla: Nocturne/Diana, mid: Diana).
process.env.PH_PROFILE = 'bitty';
const fs = require('fs'), os = require('os'), path = require('path');
const { FakeRiot, liveFrame, historyGame, CH } = require('./fake_riot');
const { Engine } = require('../src/engine/engine');
const { hudPayload } = require('../src/hud');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const offline = JSON.parse(fs.readFileSync(path.join(__dirname, 'offline.json'), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function session(myPos, { enemyRoles = true, hover = 0, enemies = ['Darius', 'Lee Sin', 'Syndra', "Kai'Sa", 'Leona'], bans = [] } = {}) {
  const pos = ['top', 'jungle', 'middle', 'bottom', 'utility'];
  const mine = { top: 'Garen', jungle: 'Graves', middle: 'Ahri', bottom: 'Jinx', utility: 'Thresh' };
  return { localPlayerCellId: pos.indexOf(myPos), timer: { phase: 'BAN_PICK' }, actions: [], bans: { myTeamBans: bans, theirTeamBans: [] },
    myTeam: pos.map((p, i) => ({ cellId: i, assignedPosition: p, championId: p === myPos ? 0 : CH[mine[p]], championPickIntent: p === myPos ? hover : 0 })),
    theirTeam: enemies.map((c, i) => ({ cellId: 5 + i, assignedPosition: enemyRoles ? pos[i] : '', championId: CH[c] })) };
}

(async () => {
  const lockDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lol'));
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ud'));
  process.env.LOL_PATH = lockDir;
  const riot = new FakeRiot({ lockDir });
  await riot.start();
  const eng = new Engine({ dataDir: path.join(__dirname, '..', 'data'), userDir });
  ok(eng.profile.id === 'bitty' && eng.settings.rol_por_defecto === 'jungle', 'perfil de Bitty: rol por defecto jungla');
  ok(Object.keys(eng.roles).join(',') === 'jungle,middle' && eng.pool.length === 3, 'roles: jungla (Nocturne, Diana) y mid (Diana)');
  let clock = Date.parse('2026-11-15T20:00:00Z');
  const step = async (dt = 1000) => { clock += dt; return eng.step({ now: clock, offlineData: offline }); };
  riot.state.history = [historyGame(1, clock - 86400e3, true)];

  // champ select jungla
  riot.state.phase = 'ChampSelect';
  riot.state.session = session('jungle');
  let r = await step();
  ok(r.view && r.view.mode === 'jungle', 'rol asignado jungla → recomienda entre Nocturne y Diana jungla');
  ok(r.view.lane_enemy === 'Lee Sin', 'detecta al jungla rival (Lee Sin)');
  ok(r.view.recs.map((x) => x.name).sort().join(',') === 'Diana,Nocturne', `recomienda solo sus campeones: ${r.view.recs.map((x) => `${x.name} ${x.score}`).join(', ')}`);
  ok(r.view.recs[0].lane && r.view.recs[0].lane[1].games > 300, 'usa el matchup real de op.gg Master+ contra ese jungla');
  ok(r.view.focus.guide && r.view.focus.guide.labels[0] === 'Inicio' && /Lee Sin/.test(r.view.focus.guide.pre6.join(' ')), 'guía de jungla (inicio, hasta el 6, desde el 6) con lo específico de Lee Sin');
  ok(r.view.plan && r.view.plan.spells.includes('Smite'), `plan: ${r.view.plan.start.join(' + ')} · ${r.view.plan.build.join(' → ')}`);
  // sin roles visibles: igual adivina el jungla rival
  riot.state.session = session('jungle', { enemyRoles: false });
  r = await step();
  ok(r.view.lane_enemy === 'Lee Sin', 'sin roles visibles, adivina igual al jungla rival (Lee Sin)');
  // hover de Diana
  riot.state.session = session('jungle', { hover: CH.Diana });
  r = await step();
  ok(r.view.focus.name === 'Diana', 'si Bitty hovea Diana, muestra el plan de Diana');
  // champ select mid
  riot.state.session = session('middle', { enemies: ['Darius', 'Graves', 'Syndra', "Kai'Sa", 'Leona'] });
  r = await step();
  ok(r.view.mode === 'middle' && r.view.lane_enemy === 'Syndra' && r.view.recs.length === 1 && r.view.recs[0].name === 'Diana', 'rol mid → Diana mid contra Syndra');
  ok(r.view.plan.spells.includes('Ignite') && r.view.plan.runes.keystone === 'Electrocute', 'Diana mid: Electrocute + Ignite (distinto a la jungla)');
  // rol sin asignar → jungla por defecto
  const blind = session('jungle'); for (const p of blind.myTeam) p.assignedPosition = ''; for (const p of blind.theirTeam) p.assignedPosition = '';
  riot.state.session = blind;
  r = await step();
  ok(r.view.mode === 'jungle', 'normales sin rol: usa jungla por defecto');

  // partida como Nocturne jungla
  riot.state.session = null; riot.state.phase = 'InProgress'; riot.state.gameId = 555;
  const script = { myChamp: 'Nocturne', myPos: 'JUNGLE', deaths: [{ t: 200, killer: 'Rival3', assisters: [], gold: 300 }, { t: 480, killer: 'Rival2', assisters: ['Rival1', 'Rival3'], gold: 1200 }],
    adcDeaths: [470], cwAt: [300], legendaryAt: 720, legendaryId: 6698, gold: 1300 };
  let view, toast = null;
  for (let t = 5; t <= 900; t += 10) {
    riot.state.live = liveFrame(t, script);
    r = await step(10000);
    if (t === 5) await sleep(40);
    view = r.view;
    if (view.death && !toast && view.death.t === 480) toast = view.death;
  }
  ok(view.me.champ === 'Nocturne' && view.role === 'jungle', 'en partida detecta Nocturne jungla');
  ok(view.lane && view.lane.champ === 'Lee Sin', 'rival directo: el jungla enemigo (Lee Sin)');
  ok(view.in_pool && view.queue.length >= 2, `compra de Nocturne: ${view.buy ? view.buy.items.join(' + ') : '—'} → cola ${view.queue.join(', ')}`);
  ok(view.guide && view.guide.labels[0] === 'Inicio', 'guía de jungla en partida');
  ok(toast && toast.labels.includes('superado') && toast.labels.includes('oro') && !toast.labels.includes('adc'), `autopsia sin la regla de ADC (es de support): ${toast && toast.labels.join(', ')}`);
  const h = hudPayload(view);
  ok(h && h.buy, 'overlay del juego: muestra la compra');
  const rec = eng.recorder.rec;
  ok(rec.snap14 && rec.snap14.d14 === 2 && rec.item1 >= 12 && rec.item1 <= 12.2, `foto del 14 de Nocturne: ${JSON.stringify(rec.snap14)} · primer legendario ${rec.item1} min`);

  // partida como Diana mid
  riot.state.live = null; riot.state.phase = 'EndOfGame'; riot.state.history.push(historyGame(555, clock - 900e3, true));
  await step(25000);
  riot.state.phase = 'InProgress'; riot.state.gameId = 556;
  riot.state.live = liveFrame(400, { myChamp: 'Diana', myPos: 'MIDDLE', gold: 1400 });
  r = await step(30000);
  ok(r.view.me.champ === 'Diana' && r.view.role === 'mid', 'en partida detecta Diana mid');
  const q = r.view.queue.join(',');
  ok(/Stormsurge|Shadowflame/.test(q) && !/Dusk and Dawn/.test(q), `Diana mid arma de mid (no de jungla): ${q}`);
  riot.state.live = liveFrame(400, { myChamp: 'Diana', myPos: 'JUNGLE', gold: 1400 });
  riot.state.gameId = 557;
  r = await step(40000);
  ok(/Dusk and Dawn|Riftmaker/.test(r.view.queue.join(',')), `Diana jungla arma de jungla: ${r.view.queue.join(',')}`);

  // datos separados de la app de Naser
  const pkgB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'build', 'bitty.json'), 'utf8'));
  ok(pkgB.extraMetadata.productName === 'Pick Helper Bitty' && pkgB.appId !== 'py.naser.pickhelper', 'app separada: guarda sus datos en %APPDATA%\\Pick Helper Bitty');
  riot.stop();
  console.log(`\n${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
