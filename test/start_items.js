// Inicio de partida: la app recomienda el inicio de tu pool (mascota de jungla, ítem de support + pociones, Doran's),
// contando lo que ya compraste. Caso real: con el ítem de support comprado no recomendaba las 2 pociones.
const fs = require('fs');
const { analyzeGame, reasonText } = require('../src/engine/ingame');
const { ItemDB } = require('../src/engine/itemdb');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const LIST = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const data = {};
for (const [id, name] of Object.entries(LIST.items)) data[id] = { name, gold: { total: 1000, base: 1000, purchasable: true }, maps: { 11: true } };
const price = { 3865: 400, 2003: 50, 1101: 450, 1102: 450, 1103: 450, 1056: 400, 3340: 0 };
for (const [id, g] of Object.entries(price)) data[id].gold = { total: g, base: g, purchasable: true };
const db = new ItemDB(data).setList(LIST);
const idOf = (n) => db.idOf(n);
const load = (f, role) => JSON.parse(fs.readFileSync(`data/${f}`, 'utf8')).pool.map((c) => Object.assign({ role }, c));
const SUP = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));
const JG = load('pool_jungle.json', 'jungle');
const MID = load('pool_mid.json', 'mid');

const P = (name, champ, team, pos, items) => ({ riotId: `${name}#LAS`, championName: champ, team, position: pos, level: 1, isDead: false,
  items: items.map(([n, count]) => ({ itemID: idOf(n), count: count || 1 })), scores: { kills: 0, deaths: 0, assists: 0 } });
const game = (me, gold, t) => ({ activePlayer: { riotId: me.riotId, currentGold: gold }, allPlayers: [me, P('R', 'Leona', 'CHAOS', 'UTILITY', [])],
  gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t }, events: { Events: [] } });

// Support: el caso del bug
const supRun = (items, gold, t) => {
  const me = P('Naser', 'Thresh', 'ORDER', 'UTILITY', items);
  return analyzeGame(game(me, gold, t), SUP.pool, db, {}, {}, null, {}, [SUP.pool, SUP.dyn]);
};
let v = supRun([], 500, 2);
ok(v.buy && v.buy.items.join() === 'World Atlas,Health Potion,Health Potion' && v.buy.missing === 0, `al empezar: ${v.buy && v.buy.items.join(' + ')}`);
v = supRun([['World Atlas'], ['Stealth Ward']], 100, 10);
ok(v.buy && v.buy.items.join() === 'Health Potion,Health Potion' && v.buy.cost === 100 && v.buy.missing === 0, `con el ítem de support ya comprado: ${v.buy && v.buy.items.join(' + ')}`);
v = supRun([['World Atlas'], ['Health Potion', 1]], 50, 15);
ok(v.buy && v.buy.items.join() === 'Health Potion', 'con una poción: recomienda la que falta (cuenta las del inventario)');
v = supRun([['World Atlas'], ['Health Potion', 2]], 0, 20);
ok(!v.buy || !v.buy.start, 'con el inicio completo ya no insiste');
v = supRun([['World Atlas']], 100, 200);
ok(!v.buy || !v.buy.start, 'después de 1:30 no te pide pociones (ya estás en línea)');

// Jungla: mascota
const jgRun = (champ, items, gold) => {
  const me = P('Bitty', champ, 'ORDER', 'JUNGLE', items);
  const g = game(me, gold, 3);
  const view = analyzeGame(g, JG.concat(MID), db, {}, {}, null, {}, null);
  view.role = view.role || 'jungle';
  return view;
};
v = jgRun('Nocturne', [], 500);
ok(v.buy && v.buy.items[0] === 'Scorchclaw Pup' && v.buy.items.includes('Health Potion'), `jungla al empezar: ${v.buy && v.buy.items.join(' + ')}`);
const why = reasonText('Scorchclaw Pup', v);
ok(/87,1%/.test(why) && /op\.gg/.test(why) && /8\.672/.test(why), `dice por qué esa mascota, con fuente: "${why}"`);
v = jgRun('Diana', [['Scorchclaw Pup']], 50);
ok(v.buy && v.buy.items.join() === 'Health Potion', 'Diana con la mascota ya comprada: la poción que falta');
// Mid: Doran's + 2 pociones
const me = P('Bitty', 'Diana', 'ORDER', 'MIDDLE', [["Doran's Ring"]]);
v = analyzeGame(game(me, 100, 5), JG.concat(MID), db, {}, {}, null, {}, null);
ok(v.buy && v.buy.items.join() === 'Health Potion,Health Potion', `mid con Doran's ya comprado: ${v.buy && v.buy.items.join(' + ')}`);

if (failed) { console.log(`start_items: ${failed} fallas`); process.exit(1); }
console.log('start_items: todo OK');
