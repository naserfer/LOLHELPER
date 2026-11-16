// La app solo recomienda comprar ítems de data/items.json (lista fija, mantenida a mano).
// Caso real: el Chemtech Putrifier sigue en el item.json de Riot pero ya no se compra, y se recomendaba.
const fs = require('fs');
const { analyzeGame, BUILD_RULES, SUP_SITU } = require('../src/engine/ingame');
const { ItemDB } = require('../src/engine/itemdb');
const { norm } = require('../src/engine/util');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const LIST = JSON.parse(fs.readFileSync('data/items.json', 'utf8'));
const pool = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));

// --- La lista en sí
const ids = Object.keys(LIST.items);
ok(ids.length > 150 && ids.every((i) => /^\d+$/.test(i) && +i < 10000), `items.json tiene ${ids.length} ítems con id numérico de la Grieta`);
ok(!Object.values(LIST.items).some((n) => norm(n) === 'chemtechputrifier'), 'el Chemtech Putrifier no está en la lista');
ok(Object.entries(LIST.transforma || {}).every(([, base]) => Object.values(LIST.items).includes(base)), 'cada transformación apunta a un ítem que sí se compra');

// --- Todos los nombres de ítems que usa el código o los datos existen hoy (o son transformaciones)
const known = new Set([...Object.values(LIST.items), ...Object.keys(LIST.transforma || {})].map(norm));
const used = new Set();
for (const r of Object.values(BUILD_RULES)) {
  for (const [it] of r.options) used.add(it);
  for (const b of Object.values(r.boots)) used.add(b);
}
for (const g of Object.values(SUP_SITU)) for (const [it] of g) used.add(it);
for (const f of fs.readdirSync('data').filter((x) => /^pool.*\.json$/.test(x))) {
  for (const c of JSON.parse(fs.readFileSync(`data/${f}`, 'utf8')).pool) {
    for (const b of Object.values(c.builds || {})) for (const it of b.items || []) used.add(it);
    if (typeof c.boots === 'string') used.add(c.boots);
  }
}
const missing = [...used].filter((n) => !known.has(norm(n)));
ok(missing.length === 0, `ítems usados por la app que ya no existen: ${missing.join(', ') || 'ninguno'}`);

// --- En partida: con datos de Riot como vienen hoy, no se recomienda lo que no se compra
const data = {};
for (const [id, name] of Object.entries(LIST.items)) data[id] = { name, gold: { total: 2300, base: 2300, purchasable: true }, maps: { 11: true } };
data[3865].gold = { total: 400, base: 400, purchasable: true };
data[2055].gold = { total: 75, base: 75, purchasable: true };
// Así lo trae Data Dragon 16.22.1: sigue en la Grieta pero no se puede comprar.
data[3011] = { name: 'Chemtech Putrifier', gold: { total: 1900, base: 500, purchasable: false }, maps: { 11: true }, inStore: false };
data[2530] = { name: 'Diadem of Songs', gold: { total: 2250, base: 2250, purchasable: false }, maps: { 11: true }, inStore: false };
const db = new ItemDB(data).setList(LIST);

const guy = (name, team, pos, items) => ({
  riotId: `${name}#LAS`, championName: name, team, position: pos, level: 9, isDead: false,
  items: (items || []).map((itemID) => ({ itemID })), scores: { kills: 0, deaths: 0, assists: 0 },
});
const game = (me, gold, mine) => ({
  activePlayer: { riotId: `${me}#LAS`, currentGold: gold },
  allPlayers: [guy(me, 'ORDER', 'UTILITY', mine || [3865]), guy('Jinx', 'ORDER', 'BOTTOM'),
    guy('Aatrox', 'CHAOS', 'TOP'), guy('Soraka', 'CHAOS', 'UTILITY'), guy('Vladimir', 'CHAOS', 'MIDDLE'), guy('Warwick', 'CHAOS', 'JUNGLE')],
  gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: 900 },
  events: { Events: [] },
});
const run = (me, gold, mine) => analyzeGame(game(me, gold, mine), pool.pool, db, { jinx: 'AD' }, {}, null, {}, [pool.pool, pool.dyn]);
const recs = (v) => [...((v.buy || {}).items || []), (v.buy || {}).target, ...(v.queue || [])].filter(Boolean);

const nami = run('Nami', 5000);
ok(!recs(nami).some((n) => /chemtech/i.test(n)), `Nami contra curas no recibe Chemtech Putrifier: ${recs(nami).join(', ')}`);
// Ya armada (Atlas, botas, Echoes, Moonstone, Ardent): ahí es cuando aparecía el ítem verde.
const idOf = (n) => Number(Object.keys(LIST.items).find((k) => LIST.items[k] === n));
const built = run('Nami', 5000, [3865, ...['Ionian Boots of Lucidity', 'Echoes of Helia', 'Moonstone Renewer', 'Ardent Censer'].map(idOf)]);
ok(recs(built).length > 0 && !recs(built).some((n) => /chemtech/i.test(n)), `Nami armada contra curas: ${recs(built).join(', ')}`);
const old = new ItemDB(data); // sin lista: como estaba antes (acepta ítems no comprables)
ok(old.buyable('Chemtech Putrifier') && !db.buyable('Chemtech Putrifier'), 'sin la lista el ítem se colaba; con la lista no');
ok(db.toBuy('Diadem of Songs') === 'Whispering Circlet' && db.buyable('Whispering Circlet') && !db.buyable('Diadem of Songs'),
  'Diadem of Songs no se compra: se recomienda Whispering Circlet');

const sera = pool.pool.find((c) => c.name === 'Seraphine');
if (sera && Object.values(sera.builds).some((b) => (b.items || []).includes('Diadem of Songs'))) {
  const v = run('Seraphine', 6000);
  ok(!recs(v).includes('Diadem of Songs'), `Seraphine: no se pide comprar Diadem of Songs (${recs(v).join(', ')})`);
}

if (failed) { console.log(`items_list: ${failed} fallas`); process.exit(1); }
console.log('items_list: todo OK');
