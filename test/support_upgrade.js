// La evolución del ítem de support depende del campeón y de la partida, no de una frase fija.
const { supportUpgrade, analyzeGame } = require('../src/engine/ingame');
const { ItemDB } = require('../src/engine/itemdb');
const fs = require('fs');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const cfg = (name, arch) => ({ name, arch });
const up = (name, arch, cond) => supportUpgrade(cfg(name, arch), cond || {});

ok(up('Leona', 'engage').item === 'Solstice Sleigh', 'Leona evoluciona a Solstice Sleigh: el CC se repite en la pelea');
ok(up('Leona', 'engage', { squishy: true }).item === 'Solstice Sleigh', 'Leona no cambia a Celestial solo porque el rival no tiene tanques');
ok(up('Nautilus', 'engage', { squishy: true }).item === 'Solstice Sleigh', 'Nautilus tampoco: su CC es de pelea, no un pick desde la niebla');
ok(up('Blitzcrank', 'engage', { squishy: true }).item === 'Celestial Opposition', 'Blitz contra un equipo sin tanques: el primer golpe desde la niebla');
ok(up('Thresh', 'engage', { squishy: true }).item === 'Celestial Opposition', 'Thresh igual, cuando el rival no se armó tanque');
ok(up('Blitzcrank', 'engage', { tanky: true, squishy: false }).item === 'Solstice Sleigh', 'Blitz contra tanques: el CC se repite, vuelve Solstice');
ok(up('Nami', 'enchanter', { tanky: true }).item === 'Dream Maker', 'Nami se queda en Dream Maker aunque el rival sea tanque');
ok(up('Soraka', 'enchanter').item === 'Dream Maker', 'Soraka cura: Dream Maker');
ok(up('Karma', 'enchanter').item === 'Dream Maker', 'Karma sin tanques: el escudo vale más que el daño');
ok(up('Karma', 'enchanter', { tanky: true }).item === "Zaz'Zak's Realmspike", 'Karma contra tanques: la explosión pega % de vida');
ok(up('Seraphine', 'enchanter', { tanky: true }).item === "Zaz'Zak's Realmspike", 'Seraphine contra tanques también pasa a Zaz\'Zak');
ok(up('Zilean', 'enchanter').item === "Zaz'Zak's Realmspike", 'Zilean no cura ni escuda: no se le recomienda Dream Maker');
ok(up('Brand', 'mage', { ally_auto: true }).item === "Zaz'Zak's Realmspike", 'Brand pega con habilidades, no con el auto del ADC');
ok(up('Brand', 'mage', { tanky: true }).key === 'zaz_tank', 'contra tanques el porqué de Zaz\'Zak es la vida máxima');
ok(up('Lux', 'mage', { ally_auto: true }).item === 'Dream Maker', 'Lux con un ADC de autos: el escudo le pone la burbuja');
ok(up('Lux', 'mage', { ally_auto: true, tanky: true }).item === "Zaz'Zak's Realmspike", 'Lux contra tanques vuelve al daño, aunque el ADC pegue con autos');
ok(up('Lux', 'mage').item === "Zaz'Zak's Realmspike", 'Lux sin ADC de autos: Zaz\'Zak');
ok(up('Morgana', 'mage', { ally_auto: true }).item === 'Dream Maker', 'Morgana con ADC de autos: el escudo negro lleva la burbuja');
ok(up('Senna', 'marksman', { tanky: true }).item === 'Bloodsong', 'Senna marca con el auto: Bloodsong');
ok(up('Pyke', 'engage', { squishy: true }).item === 'Bloodsong', 'Pyke no cae en Celestial: el auto después de la habilidad es su pasiva de ítem');
ok(up('Pantheon', 'engage').item === 'Bloodsong', 'Pantheon evoluciona a Bloodsong');
ok(up('Bard', 'roamer').item === 'Celestial Opposition', 'Bard que no está pegado a un ADC de autos: entra desde la niebla');
ok(up('Bard', 'roamer', { ally_auto: true }).item === 'Dream Maker', 'Bard con ADC de autos: la curación le pone la burbuja');
ok(up('Rakan', 'engage', { ally_auto: true }).item === 'Dream Maker', 'Rakan con ADC de autos: escuda y la burbuja queda en él');
ok(up('Rakan', 'engage').item === 'Solstice Sleigh', 'Rakan sin ese ADC: el engage cura y da velocidad');

// En la partida: se ve la evolución, y la compra de oro no se reemplaza (la prueba de oro contra Python sigue igual).
const pool = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));
const db = new ItemDB({
  3866: { name: 'Runic Compass', gold: { total: 400, purchasable: true }, maps: { 11: true } },
  3867: { name: 'Bounty of Worlds', gold: { total: 400, purchasable: true }, maps: { 11: true } },
  3869: { name: 'Celestial Opposition', gold: { total: 400, purchasable: true }, maps: { 11: true } },
  3068: { name: 'Sunfire Aegis', gold: { total: 2700, purchasable: true }, maps: { 11: true }, tags: ['Armor'] },
  3065: { name: 'Spirit Visage', gold: { total: 2900, purchasable: true }, maps: { 11: true }, tags: ['SpellBlock'] },
  3075: { name: 'Thornmail', gold: { total: 2700, purchasable: true }, maps: { 11: true }, tags: ['Armor'] },
  3050: { name: "Zeke's Convergence", gold: { total: 2200, base: 900, purchasable: true }, maps: { 11: true }, from: [] },
});
const guy = (name, team, pos, items) => ({
  riotId: `${name}#LAS`, championName: name, team, position: pos, level: 9,
  items: items.map((itemID) => ({ itemID })), scores: { kills: 0, deaths: 0, assists: 0 },
});
function game(meItem, enemies) {
  return {
    activePlayer: { riotId: 'Naser#LAS', currentGold: 500 },
    allPlayers: [guy('Rell', 'ORDER', 'UTILITY', [meItem]), guy('Jinx', 'ORDER', 'BOTTOM', []), ...enemies],
    gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: 700 },
    events: { Events: [] },
  };
}
const squish = [guy('Ashe', 'CHAOS', 'BOTTOM', []), guy('Ahri', 'CHAOS', 'MIDDLE', [])];
const tanks = [guy('Malphite', 'CHAOS', 'TOP', [3068, 3065]), guy('Amumu', 'CHAOS', 'JUNGLE', [3075]), guy('Leona', 'CHAOS', 'UTILITY', [3068])];
const quest = analyzeGame(game(3866, squish), pool.pool, db, { jinx: 'AD' }, {}, null, {}, [pool.pool, pool.dyn]);
ok(quest && quest.sup_upgrade && quest.sup_upgrade.item === 'Solstice Sleigh' && quest.sup_upgrade.ready === false,
  'con Runic Compass ya dice Solstice Sleigh, y todavía no se puede elegir');
const ready = analyzeGame(game(3867, squish), pool.pool, db, { jinx: 'AD' }, {}, null, {}, [pool.pool, pool.dyn]);
ok(ready.sup_upgrade.ready === true && ready.buy && ready.buy.target !== 'Solstice Sleigh',
  'con Bounty of Worlds está lista, y la compra de oro sigue siendo otra cosa');
ok(!(ready.queue || []).includes('Solstice Sleigh'), 'la evolución no entra en la cola de oro: es gratis');
const done = analyzeGame(game(3869, squish), pool.pool, db, { jinx: 'AD' }, {}, null, {}, [pool.pool, pool.dyn]);
ok(done.sup_upgrade === null, 'si ya evolucionó, no recomienda otra');

function blitz(itemsOnEnemy) {
  const g = game(3867, [guy('Ashe', 'CHAOS', 'BOTTOM', itemsOnEnemy)]);
  g.allPlayers[0].championName = 'Blitzcrank';
  return analyzeGame(g, pool.pool, db, {}, {}, null, {}, [pool.pool, pool.dyn]);
}
const { hudPayload } = require('../src/hud');
const hudReady = hudPayload({ time: 700, gold: 400, me: { dead: false }, buy: { items: ["Zeke's Convergence"], target: "Zeke's Convergence", cost: 900, missing: 500, also: [] },
  sup_upgrade: { item: 'Solstice Sleigh', why: 'cada control', ready: true }, why: {} });
ok(hudReady.buy.upgrade === 'Solstice Sleigh' && hudReady.buy.mode === 'full', 'cuando ya se puede elegir, el overlay la muestra grande y gratis');
const hudWait = hudPayload({ time: 700, gold: 400, me: { dead: false }, buy: { items: ['Ruby Crystal'], target: "Zeke's Convergence", cost: 400, missing: 0, also: [] },
  sup_upgrade: { item: 'Solstice Sleigh', why: 'cada control', ready: false }, why: {} });
ok(!hudWait.buy.upgrade && hudWait.buy.target === "Zeke's Convergence", 'antes de Bounty of Worlds el overlay sigue mostrando la compra de oro');
ok(blitz([]).sup_upgrade.item === 'Celestial Opposition', 'en la partida, Blitz sin tanques rivales: Celestial');
ok(blitz([3068, 3065, 3075]).sup_upgrade.item === 'Solstice Sleigh', 'en la partida, Blitz con tres legendarios de tanque: Solstice');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
