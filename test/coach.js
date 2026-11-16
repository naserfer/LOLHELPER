// Autopsia de coach: separar errores de buenas decisiones, leer la vida antes de morir, el costo de cada muerte,
// un solo foco y el progreso. Pruebas pensadas para fallar si la idea está mal.
const fs = require('fs'), os = require('os'), path = require('path');
const autopsy = require('../src/engine/autopsy');
const { Recorder } = require('../src/engine/recorder');
const { ItemDB } = require('../src/engine/itemdb');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const A = (champ, extra) => Object.assign({ champ, level: 8, jungle: false, killer: false }, extra);

// --- 1) El grabador junta vida, equipo, ítems, pelea y costo
const db = new ItemDB({ 3071: { name: 'Black Cleaver', gold: { total: 3000, purchasable: true }, maps: { 11: true } },
  1036: { name: 'Long Sword', gold: { total: 350, purchasable: true }, maps: { 11: true } } });
const P = (name, champ, team, pos, items, extra) => Object.assign({ riotId: `${name}#LAS`, championName: champ, team, position: pos, level: 9,
  items: items.map((i) => ({ itemID: i })), scores: { kills: 0, deaths: 0, assists: 0 }, isDead: false, summonerSpells: {} }, extra);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coach'));
const rec = new Recorder(dir);
const T = 900;
const players = (meDead, alliesDead) => [P('Naser', 'Thresh', 'ORDER', 'UTILITY', [1036], meDead ? { isDead: true, respawnTimer: 34 } : {}),
  P('Tuki', 'Jinx', 'ORDER', 'BOTTOM', [], { isDead: alliesDead >= 1 }), P('Mid', 'Ahri', 'ORDER', 'MIDDLE', [], { isDead: alliesDead >= 2 }),
  P('R1', 'Draven', 'CHAOS', 'BOTTOM', [3071, 3071]), P('R2', 'Leona', 'CHAOS', 'UTILITY', []), P('R3', 'Ahri', 'CHAOS', 'MIDDLE', [])];
const frame = (t, hp, events, meDead, alliesDead) => ({ activePlayer: { riotId: 'Naser#LAS', currentGold: 200, championStats: { currentHealth: hp * 10, maxHealth: 1000 } },
  allPlayers: players(meDead, alliesDead), gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t }, events: { Events: events } });
const evs = [];
for (let t = T - 30; t < T; t += 1) rec.onPoll(frame(t, t < T - 22 ? 90 : 25, evs, false, t > T - 5 ? 2 : 0), { db, alias: {}, now: t });
evs.push({ EventName: 'ChampionKill', EventTime: T - 3, VictimName: 'R2#LAS', KillerName: 'Tuki#LAS', Assisters: ['Naser#LAS'] });
evs.push({ EventName: 'ChampionKill', EventTime: T, VictimName: 'Naser#LAS', KillerName: 'R1#LAS', Assisters: [] });
rec.onPoll(frame(T + 1, 0, evs, true, 2), { db, alias: {}, now: T + 1 });
evs.push({ EventName: 'DragonKill', EventTime: T + 12, KillerName: 'R3#LAS' });
evs.push({ EventName: 'TurretKilled', EventTime: T + 20, TurretKilled: 'Turret_T1_L_03_A', KillerName: 'R1#LAS' });
evs.push({ EventName: 'TurretKilled', EventTime: T + 22, TurretKilled: 'Turret_T2_C_05_A', KillerName: 'Tuki#LAS' });
rec.onPoll(frame(T + 25, 0, evs, true, 1), { db, alias: {}, now: T + 25 });
const d = rec.rec.deaths[0];
ok(d && d.hp_trace && d.hp_trace.length >= 20, `guarda tu vida de los 25 s anteriores (${d && d.hp_trace && d.hp_trace.length} lecturas)`);
ok(d.allies_dead === 2 && d.dead_s === 34 && d.role === 'utility', 'guarda aliados muertos, tiempo muerto y rol');
ok(d.attackers[0].items === 6000 && d.my_items === 350 && d.attackers[0].pos === 'adc', 'guarda el oro en ítems de cada uno');
ok(d.fight && d.fight.us === 1 && d.fight.mine === 1, 've que en la pelea tu equipo mató a uno (con tu asistencia)');
ok(JSON.stringify(d.lost) === JSON.stringify(['dragón', 'torre']), `lo que tomó el rival mientras estabas muerto: ${d.lost} (la torre que tomó tu equipo no cuenta)`);
const tip = autopsy.tipFor(d);
ok(tip.verdict === 'cambio' && /Te llevaste a alguien, pero/.test(tip.text), `una muerte con kill a cambio no se trata como regalada: "${tip.text}"`);
ok(tip.labels.includes('sin_vida') && tip.labels.includes('equipo') && tip.labels.includes('items'), `causas nuevas: ${tip.labels.join(', ')}`);
ok(/34 s muerto/.test(tip.cost_text) && /dragón/.test(tip.cost_text) && tip.cost.cara, `costo: "${tip.cost_text}"`);

// --- 2) Clasificación
const base = { t: 600, gold: 300, my_level: 8, killer_type: 'champion', attackers: [A('Ahri', { killer: true })], adc_died_before: null, objective_near: false };
const c = (x, role) => autopsy.classify(Object.assign({}, base, x), role);
ok(c({ hp_trace: [[-6, 95], [-5, 95], [-4, 92], [-3, 90], [-2, 40], [-1, 10], [0, 0]] }).primary === 'reventado', 'de 90% a 0 en 3 s: te reventaron de golpe');
ok(c({ hp_trace: Array.from({ length: 24 }, (_, i) => [i - 23, 25]) }).primary === 'sin_vida', '20 s con 25% de vida: te quedaste con poca vida');
ok(c({ hp_trace: Array.from({ length: 10 }, (_, i) => [i - 9, 25]) }).primary === 'clara', 'con poca vida solo unos segundos: no se inventa la causa');
ok(c({ won: ['barón'], fight: { us: 0 } }).verdict === 'sacrificio', 'tu equipo tomó el barón: buena muerte');
ok(c({ won: ['torre'] }).verdict !== 'sacrificio', 'una torre sola no justifica morir');
ok(c({ attackers: [A('Ahri', { killer: true, level: 11, pos: 'mid' })], my_level: 8 }, 'utility').labels.includes('nivel') === false,
  'de support, 3 niveles abajo del mid rival no es un error (es normal)');
ok(c({ attackers: [A('Draven', { killer: true, level: 11, pos: 'adc' })], my_level: 8 }, 'utility').labels.includes('nivel'), 'pero contra el ADC de tu línea sí');
const jg = [A('Lee Sin', { killer: true, jungle: true }), A('Ahri')];
ok(!c({ attackers: jg }, 'jungle').labels.includes('jungla') && c({ attackers: jg }, 'utility').labels.includes('jungla'), 'si sos el jungla, "te agarró la jungla" no aplica');
const old = autopsy.classify({ t: 400, gold: 1400, my_level: 6, killer_type: 'champion', attackers: [A('Kai\'Sa', { killer: true, level: 6 })], adc_died_before: null, objective_near: false });
ok(old.labels.join() === 'oro' && old.verdict === 'error', 'grabaciones viejas (sin vida ni pelea): igual que antes');

// --- 3) Resumen de coach: un foco por lo que cuesta, progreso y qué te hace perder
const mk = (i, win, deaths) => ({ id: `g${i}`, start_wall: i * 1e6, role: 'utility', win, deaths });
const cheap = () => Object.assign({}, base, { gold: 1200 });                                   // oro, barato
const costly = () => Object.assign({}, base, { killer_type: 'turret', attackers: [], dead_s: 45, lost: ['barón', 'torre'] });   // torre, cara
const games = [];
for (let i = 0; i < 6; i++) games.push(mk(i, false, [cheap(), cheap(), cheap(), costly()]));
for (let i = 6; i < 12; i++) games.push(mk(i, true, i >= 10 ? [] : [cheap()]));
const s = autopsy.summarize(games);
ok(s.patterns[0].key === 'oro' && s.focus.key === 'torre', `el foco es lo que más cuesta (torre: barón perdido), no lo más frecuente (oro): "${s.focus.title}"`);
ok(/barones/.test(s.focus.text), `el foco dice qué perdiste: "${s.focus.text}"`);
ok(s.progress && s.progress.better && /Vas mejor/.test(s.progress.text), `progreso: "${s.progress && s.progress.text}"`);
ok(s.hurts.some((h) => h.key === 'oro'), `qué te hace perder (6 derrotas, 6 victorias): ${s.hurts.map((h) => `${h.title}: ${h.text}`).join(' | ')}`);
ok(s.good.some((g) => /2 partidas seguidas sin muertes evitables/.test(g)), `lo que hiciste bien: ${s.good.join(' ')}`);
const few = autopsy.summarize(games.slice(0, 5));
ok(!few.progress && few.hurts.length === 0, 'con pocas partidas no saca conclusiones de progreso ni de qué te hace perder');
const rv = autopsy.reviewGame(games[0]);
ok(rv.errors === 4 && rv.costly && rv.costly.title === 'Bajo torre' && /barón/.test(rv.costly.cost_text), `revisión de la partida: la más cara es "${rv.costly && rv.costly.title}" (${rv.costly && rv.costly.cost_text})`);

if (failed) { console.log(`coach: ${failed} fallas`); process.exit(1); }
console.log('coach: todo OK');
