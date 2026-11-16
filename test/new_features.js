// Pruebas del paso 4: diseñadas para FALLAR si las ideas nuevas estuvieran mal.
const wincons = require('../src/engine/wincons');
const autopsy = require('../src/engine/autopsy');
const { Recorder, completeEarly } = require('../src/engine/recorder');
const { ItemDB } = require('../src/engine/itemdb');
const { rng } = require('../src/engine/util');
const { viewSig } = require('../src/sig');
const os = require('os'), fs = require('fs'), path = require('path');
let failed = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'OK  ' : 'FALLA'} ${msg}`); if (!cond) failed++; };
const normal = (r) => Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r());
const sigm = (x) => 1 / (1 + Math.exp(-x));

// ---------- T1: causa al revés
function gen(seed, causal) {
  const r = rng(seed), rows = [];
  for (let i = 0; i < 60; i++) {
    const S = normal(r);                                   // nivel de equipo oculto
    const d14 = Math.floor(r() * 5);
    const win = r() < sigm(1.6 * S - (causal ? 0.9 * (d14 - 2) : 0));
    const deaths = Math.max(0, Math.round(5 - 2.2 * S + normal(r) * 1.2));   // consecuencia de ir ganando
    rows.push({ win, full: { deaths, kp: 30 + r() * 50, vision_pm: 0.8 + r() * 1.6, cw: Math.floor(r() * 8), wk: Math.floor(r() * 8),
      dmg_pm: 150 + r() * 250, taken_pm: 300 + r() * 500, cc: r() * 60 },
      early: { d14, kp14: r() * 80, vis14: 5 + r() * 25, cw14: Math.floor(r() * 4), gold14: 3000 + r() * 2500,
        item1: 11 + r() * 8, dg14: Math.floor(r() * 2) } });
  }
  return rows;
}
let trapFull = 0, falseEarly = 0, foundCausal = 0;
const N = 30;
for (let s = 1; s <= N; s++) {
  const rows = gen(s, false);
  const full = wincons.learn(rows.map((x) => ({ win: x.win, f: x.full })), wincons.FULL, s, 200).filter((r) => r.conf !== 'pista');
  const early = wincons.learn(rows.map((x) => ({ win: x.win, f: x.early })), wincons.EARLY, s, 200).filter((r) => r.conf !== 'pista');
  if (full.some((r) => r.key === 'deaths')) trapFull++;
  if (early.length) falseEarly++;
  const c = gen(1000 + s, true);
  const ce = wincons.learn(c.map((x) => ({ win: x.win, f: x.early })), wincons.EARLY, s, 200).filter((r) => r.conf !== 'pista');
  if (ce.some((r) => r.key === 'd14')) foundCausal++;
}
console.log(`T1  reglas de partida completa que caen en la trampa (muertes por ir ganando): ${trapFull}/${N}`);
console.log(`T1  reglas tempranas falsas cuando lo temprano no influye: ${falseEarly}/${N}`);
console.log(`T1  regla real encontrada cuando morir antes del 14 sí hace perder: ${foundCausal}/${N}`);
ok(trapFull >= N * 0.6, 'el control demuestra que el problema era real (la versión vieja cae en la trampa)');
ok(falseEarly <= N * 0.1, 'las reglas tempranas no inventan patrones (≤10%)');
ok(foundCausal >= N * 0.5, 'las reglas tempranas encuentran el patrón real en al menos la mitad');

// ---------- T2: autopsia con causas conocidas
const db = new ItemDB(JSON.parse(fs.readFileSync('test/items_test.json', 'utf8')));
function player(name, champ, team, pos, level, spells, fmt) {
  const p = { championName: champ, rawChampionName: `game_character_displayname_${champ}`, team, position: pos, level,
    scores: { kills: 0, deaths: 0, assists: 0, wardScore: 0, creepScore: 0 }, items: [], isDead: false,
    summonerSpells: { summonerSpellOne: { rawDisplayName: `GeneratedTip_SummonerSpell_${spells[0]}_DisplayName` },
      summonerSpellTwo: { rawDisplayName: `GeneratedTip_SummonerSpell_${spells[1]}_DisplayName` } } };
  if (fmt === 'riot') { p.riotId = `${name}#LAS`; p.riotIdGameName = name; p.summonerName = `${name}#LAS`; }
  else if (fmt === 'old') { p.summonerName = name; }
  else { p.riotId = `${name}#LAS`; p.riotIdGameName = name; }
  return p;
}
const r2 = rng(99);
let wrong = 0, cases = 0;
const evName = (n, fmt) => (fmt === 'tag' ? `${n}#LAS` : n);
for (let i = 0; i < 48; i++) {
  const fmt = ['riot', 'old', 'new'][i % 3], efmt = i % 2 ? 'tag' : 'plain';
  const kind = ['torre', 'jungla', 'superado', 'adc', 'nivel', 'oro', 'clara', 'objetivo', 'raro'][i % 9];
  const me = player('Naser', 'Thresh', 'ORDER', 'UTILITY', 6, ['SummonerFlash', 'SummonerDot'], fmt);
  const adc = player('Tuki', 'Jinx', 'ORDER', 'BOTTOM', 6, ['SummonerFlash', 'SummonerHeal'], fmt);
  const eAdc = player('Rival1', 'Kaisa', 'CHAOS', 'BOTTOM', kind === 'nivel' ? 9 : 6, ['SummonerFlash', 'SummonerHeal'], fmt);
  const eSup = player('Rival2', 'Leona', 'CHAOS', 'UTILITY', 6, ['SummonerFlash', 'SummonerDot'], fmt);
  const eJg = player('Rival3', 'LeeSin', 'CHAOS', 'JUNGLE', 6, ['SummonerSmite', 'SummonerFlash'], fmt);
  const eMid = player('Rival4', 'Ahri', 'CHAOS', 'MIDDLE', 6, ['SummonerFlash', 'SummonerDot'], fmt);
  const players = [me, adc, eAdc, eSup, eJg, eMid];
  const gold = kind === 'oro' ? 1400 : 300;
  const tDeath = 400;
  const events = [{ EventID: 1, EventName: 'GameStart', EventTime: 0 }];
  let killer = evName('Rival1', efmt), assisters = [];
  const expected = new Set();
  if (kind === 'torre') { killer = 'Turret_T200_L_03_A'; expected.add('torre'); }
  if (kind === 'jungla') { killer = evName('Rival3', efmt); assisters = [evName('Rival2', efmt)]; expected.add('jungla'); }
  if (kind === 'superado') { assisters = [evName('Rival2', efmt), evName('Rival4', efmt)]; expected.add('superado'); }
  if (kind === 'adc') { events.push({ EventID: 2, EventName: 'ChampionKill', EventTime: tDeath - 5, VictimName: evName('Tuki', efmt), KillerName: evName('Rival1', efmt), Assisters: [] }); expected.add('adc'); }
  if (kind === 'nivel') expected.add('nivel');
  if (kind === 'oro') expected.add('oro');
  if (kind === 'objetivo') { events.push({ EventID: 9, EventName: 'DragonKill', EventTime: tDeath + 20, KillerName: evName('Rival3', efmt) }); expected.add('objetivo'); }
  if (kind === 'raro') killer = 'SomethingWeird_123';
  events.push({ EventID: 3, EventName: 'ChampionKill', EventTime: tDeath, VictimName: evName('Naser', efmt), KillerName: killer, Assisters: assisters });
  const ap = { currentGold: gold };
  if (fmt === 'old') ap.summonerName = 'Naser'; else ap.riotId = 'Naser#LAS';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec'));
  const rec = new Recorder(dir);
  const base = { activePlayer: ap, allPlayers: players, gameData: { gameMode: 'CLASSIC', mapNumber: 11 } };
  rec.onPoll(Object.assign({}, base, { gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: tDeath - 1 }, events: { Events: events.filter((e) => e.EventTime < tDeath - 1) } }), { db, alias: {}, now: 1 });
  const res = rec.onPoll(Object.assign({}, base, { activePlayer: Object.assign({}, ap, { currentGold: gold }), gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: tDeath + 30 }, events: { Events: events } }), { db, alias: {}, now: 2 });
  const d = res.rec.deaths[0];
  cases++;
  if (!d) { wrong++; console.log('  sin muerte detectada:', kind, fmt, efmt); continue; }
  const c = autopsy.classify(d);
  const got = new Set(c.labels);
  const same = got.size === expected.size && [...expected].every((x) => got.has(x));
  if (!same) { wrong++; console.log('  distinto:', kind, fmt, efmt, 'esperado', [...expected], 'obtenido', c.labels); }
  if (kind === 'raro' && c.primary !== 'clara') { wrong++; console.log('  forzó una causa en un caso raro'); }
}
console.log(`T2  autopsia: ${cases - wrong}/${cases} bien clasificadas`);
ok(wrong <= cases * 0.1, 'la autopsia clasifica bien (≤10% de error) y no fuerza causas');

// ---------- T3: grabación con huecos
function simulate(polls) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec'));
  const rec = new Recorder(dir);
  const me = player('Naser', 'Thresh', 'ORDER', 'UTILITY', 6, ['SummonerFlash', 'SummonerDot'], 'riot');
  const en = player('Rival1', 'Kaisa', 'CHAOS', 'BOTTOM', 6, ['SummonerFlash', 'SummonerHeal'], 'riot');
  const events = [];
  let out;
  for (const t of polls) {
    if (t >= 500 && !events.length) events.push({ EventID: 1, EventName: 'ChampionKill', EventTime: 495, VictimName: 'Naser', KillerName: 'Rival1', Assisters: [] });
    me.scores.wardScore = t / 40;
    out = rec.onPoll({ activePlayer: { riotId: 'Naser#LAS', currentGold: 500 }, allPlayers: [me, en], events: { Events: events },
      gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t } }, { db, alias: {}, now: t * 1000 });
  }
  return out.rec;
}
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const late = simulate(range(540, 900));
const gap30 = simulate(range(1, 470).concat(range(500, 900)));
const gap90 = simulate(range(1, 400).concat(range(490, 900)));
ok(!completeEarly(late), 'partida en la que el overlay entra en el minuto 9: no se usa para reglas tempranas');
ok(completeEarly(gap30) && gap30.deaths.length === 1, 'juego sin responder 30 s: se usa y no se pierde la muerte');
ok(!completeEarly(gap90), 'juego sin responder 90 s antes del 14: no se usa');
ok(late.deaths.length === 1, 'aunque entre tarde, igual registra la muerte para la autopsia');

// ---------- T4: no titilar
const G = JSON.parse(fs.readFileSync('data/demo_game_support.json', 'utf8'));
const { analyzeGame } = require('../src/engine/ingame');
const sp = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));
let renders = 0, last = null;
for (let i = 0; i < 100; i++) {
  G.gameData.gameTime = 455 + i;
  G.activePlayer.currentGold = 980 + (i % 3);   // el oro cambia un poco sin cambiar la compra
  const v = analyzeGame(G, sp.pool, db, {}, {}, null, {}, [sp.pool, sp.dyn]);
  const s = viewSig(v, ['ingame', 'En partida'], '');
  if (s !== last) { renders++; last = s; }
}
console.log(`T4  redibujos en 100 lecturas sin cambios reales: ${renders}`);
ok(renders <= 1, 'la ventana no se redibuja si no cambió nada importante');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
