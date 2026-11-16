// Mejoras de Bitty: segunda fuente (Lolalytics), plan de jungla/mid, guías de Locke y Zaahen y foto del minuto 8.
const fs = require('fs'), os = require('os'), path = require('path');
const jgplan = require('../src/engine/jgplan');
const select = require('../src/engine/select');
const wincons = require('../src/engine/wincons');
const { Recorder, earlyRow, T8 } = require('../src/engine/recorder');
const { ItemDB } = require('../src/engine/itemdb');
const { rng } = require('../src/engine/util');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const load = (f, role) => jgplan.mix(JSON.parse(fs.readFileSync(`data/${f}`, 'utf8')).pool.map((c) => Object.assign({ role }, c)));
const JG = load('pool_jungle.json', 'jungle');
const MID = load('pool_mid.json', 'mid');
const noc = JG.find((c) => c.name === 'Nocturne'), dj = JG.find((c) => c.name === 'Diana'), dm = MID[0];

// --- 1) Dos fuentes
const lee = noc.matchups['Lee Sin'];
ok(lee.sources.length === 3 && lee.sources[0].name === 'op.gg Master+' && lee.sources.some((s) => s.name === 'Lolalytics Master+'),
  `Nocturne vs Lee Sin con 3 fuentes: ${lee.sources.map((s) => `${s.name} ${s.wr}% (${s.games})`).join(' · ')}`);
const expect = (49.74 * 567 + 53.13 * 992 + 53.06 * 7130 * 0.5) / (567 + 992 + 7130 * 0.5);
ok(Math.abs(lee.wr_mix - expect) < 0.05 && lee.games_mix === Math.round(567 + 992 + 3565), `mezcla ponderada por partidas, Emerald+ a mitad de peso (${lee.wr_mix}%)`);
ok(lee.score_opgg === -0.1 && lee.score > lee.score_opgg, `con más datos cambia el score: ${lee.score_opgg} (solo op.gg) → ${lee.score}`);
const onlyOp = Object.values(noc.matchups).filter((m) => m.sources.length === 1);
ok(onlyOp.every((m) => m.score === m.score_opgg), 'si Lolalytics no tiene el cruce, queda igual que antes');
const top = load('pool.json', 'top');
ok(top.every((c) => Object.values(c.matchups).every((m) => !m.sources)), 'top de Naser no se toca');

// --- 2) Plan de jungla
const full = jgplan.plan({ me: noc, mu: lee, enemies: { jungle: 'Lee Sin', top: 'Shen', middle: 'Malzahar', bottom: 'Samira' } });
ok(full.known && /mid/.test(full.head) && /Malzahar/.test(full.head), `con todas las líneas elige la mejor en los datos: "${full.head}"`);
ok(full.why.filter((w) => w.ref === 'Lolalytics Emerald+').length === 3 && full.why.every((w) => w.src === 'DATOS'), 'cada línea con su número y fuente');
ok(full.threats.some((t) => t.who === 'Samira' && t.src === 'DATOS'), 'avisa la línea donde peor rinde (Samira, bot)');
ok(full.threats.some((t) => t.src === 'ANÁLISIS' && /Lee Sin|Q/.test(t.txt)), 'suma la amenaza del kit del jungla rival');
ok(full.threats.filter((t) => /En los datos/.test(t.txt)).length === 1, 'la frase de los datos aparece una sola vez');
const swap = jgplan.plan({ me: noc, mu: lee, enemies: { jungle: 'Lee Sin', top: 'Shen', middle: 'Ahri', bottom: 'Jinx' } });
ok(swap.head !== full.head, `cambia con las líneas rivales: "${swap.head}"`);
const none = jgplan.plan({ me: noc, mu: null, enemies: {} });
ok(none && !none.known && !none.hud && none.missing.length === 4, 'sin rivales: no inventa plan');
const onlyJg = jgplan.plan({ me: dj, mu: dj.matchups['Lee Sin'], enemies: { jungle: 'Lee Sin' } });
ok(onlyJg.known && /Lee Sin/.test(onlyJg.head), `solo con el jungla rival ya hay plan: "${onlyJg.head}"`);
ok(!onlyJg.threats.some((t) => t.src === 'DATOS'), 'y no la repite abajo');
ok(!/invad|contestá/i.test(onlyJg.head), 'los datos de partida completa no dan órdenes de early (eso es del kit)');
ok(jgplan.plan({ me: top[0], mu: null, enemies: {} }) === null, 'top (Naser) no tiene plan de jungla');

// --- 3) Diana mid vs jungla rival
const aat = jgplan.plan({ me: dm, mu: dm.matchups.Ahri, laneEnemy: 'Ahri', enemies: { jungle: 'Aatrox', middle: 'Ahri' } });   // Δ2 −5,88
const ren = jgplan.plan({ me: dm, mu: dm.matchups.Ahri, laneEnemy: 'Ahri', enemies: { jungle: 'Rengar', middle: 'Ahri' } });   // Δ2 +3,45
ok(/Respetá a Aatrox/.test(aat.head) && /Rengar/.test(ren.head) && ren.label !== aat.label, `Diana mid: respeta a Aatrox y no a Rengar ("${aat.label}" / "${ren.label}")`);

// --- 4) En partida, sin números
const g = jgplan.forGame(full);
ok(!JSON.stringify(g).match(/\d+ partidas|%|pts/) && !('why' in g), 'en partida no hay winrates ni partidas');
ok(g.hud && g.hud.length <= 60 && g.hud6 && g.hud6.length <= 110, `líneas del overlay cortas: "${g.hud}" / "${g.hud6}"`);
const live = select.jgPlanLive(JG, 'Nocturne', 'jungle', [
  { team: 'ORDER', position: 'JUNGLE', championName: 'Nocturne' }, { team: 'CHAOS', position: 'JUNGLE', championName: 'Lee Sin' },
  { team: 'CHAOS', position: 'MIDDLE', championName: 'Malzahar' }, { team: 'CHAOS', position: 'TOP', championName: 'Shen' },
  { team: 'CHAOS', position: 'BOTTOM', championName: 'Samira' }], 'ORDER');
ok(live && live.hud === g.hud, 'en partida usa los picks reales de la Live API');

// --- 5) Locke y Zaahen con kit verificado
const zg = dj.matchups.Zaahen.guide, lg = dm.matchups.Locke.guide;
ok(zg.pre6.some((x) => /Respetá a Zaahen/.test(x) && /W/.test(x)) && /inmune/.test(zg.evitar), 'Zaahen: guía con su kit (W que stunea y tira, R inmune)');
ok(lg.pre6.some((x) => /Respetá a Locke/.test(x) && /vida/.test(x)) && /tótem|remata/.test(lg.evitar), 'Locke: guía con su kit (autos por vida faltante, R que remata)');

// --- 6) Foto del minuto 8
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rec8'));
const rec = new Recorder(dir);
const db = new ItemDB({});
const me = { riotId: 'Bitty#LAS', championName: 'Nocturne', team: 'ORDER', position: 'JUNGLE', level: 5, scores: { creepScore: 62, kills: 1, assists: 2 }, items: [] };
const frame = (t, cs, lvl) => ({ activePlayer: { riotId: 'Bitty#LAS', currentGold: 300 }, allPlayers: [Object.assign({}, me, { level: lvl, scores: Object.assign({}, me.scores, { creepScore: cs }) })],
  gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t }, events: { Events: [] } });
rec.onPoll(frame(20, 0, 1), { db, alias: {}, now: 1 });
for (let t = 40; t < T8; t += 30) rec.onPoll(frame(t, Math.round(t / 8), 3), { db, alias: {}, now: t });
ok(!rec.rec.snap8, 'antes del 8 no hay foto');
rec.onPoll(frame(T8 + 2, 64, 6), { db, alias: {}, now: 999 });
ok(rec.rec.snap8 && rec.rec.snap8.cs8 === 64 && rec.rec.snap8.lvl8 === 6, `al 8 guarda campamentos/minions y nivel (${JSON.stringify(rec.rec.snap8)})`);

// Reglas: solo se usa la foto del 8 si todas las partidas del rol la tienen.
const R = rng(9);
const rows = [];
for (let i = 0; i < 60; i++) {
  const cs8 = 40 + Math.round(R() * 40);
  const win = cs8 >= 60 ? R() < 0.8 : R() < 0.25;
  rows.push({ win, f: { d14: Math.round(R() * 3), kp14: 40 + R() * 30, vis14: 10 + R() * 10, cw14: 1, gold14: 4500, dg14: 0, item1: 15, cs8, lvl8: 5, kp8: 40, d8: 0 } });
}
ok(wincons.earlySpec('jungle', rows) === wincons.EARLY_JG, 'jungla con foto del 8 en todas: usa las reglas del 8');
const mixed = rows.slice(0, 40).concat(rows.slice(40).map((r) => ({ win: r.win, f: Object.assign({}, r.f, { cs8: undefined }) })));
ok(wincons.earlySpec('jungle', mixed) === wincons.EARLY, 'con grabaciones viejas sin foto del 8: no rellena con 0, usa las del 14');
ok(wincons.earlySpec('utility', rows) === wincons.EARLY, 'support no usa la foto del 8');
const model = wincons.learnValidated(rows, wincons.EARLY_JG, 7);
ok(model.rules.some((r) => r.key === 'cs8'), `aprende la regla real del 8: ${model.rules.map((r) => wincons.ruleText(r, wincons.EARLY_JG)).join(' | ')}`);
ok(earlyRow({ win: true, snap14: { d14: 1 }, snap8: { cs8: 50 }, item1: 14 }).f.cs8 === 50, 'la fila del coach incluye la foto del 8');

if (failed) { console.log(`bitty_plus: ${failed} fallas`); process.exit(1); }
console.log('bitty_plus: todo OK');
