// Mauri (Udyr jungla): decisión AD/AP, pool y fuentes, en partida, arranque con Windows y festejo.
// Pensadas para fallar si la idea está mal (no solo si el código se rompe).
const path = require('path');
const fs = require('fs');
const os = require('os');
const udyr = require('../src/engine/udyr');
const startup = require('../src/startup');
const player = require('../src/player');
let failed = 0, passed = 0;
const ok = (c, msg) => { if (c) passed++; else failed++; console.log(`${c ? 'OK   ' : 'FALLA'} ${msg}`); };
const A = (name, dmg) => ({ name, dmg });

// ---------------------------------------------------------------- decisión AD / AP
{
  const allAd = [A('Darius', 'AD'), A('Talon', 'AD'), A('Jinx', 'AD'), A('Thresh', 'AD')];
  const d = udyr.decide({ allies: allAd, enemies: [A('Gnar', 'AD'), A('Lee Sin', 'AD'), A('Syndra', 'AP'), A("Kai'Sa", 'AD'), A('Leona', 'AD')] });
  ok(d.path === 'AP', 'equipo todo AD y rivales cuerpo a cuerpo → AP');
  ok(d.reasons.some((r) => r.side === 'AP' && /físico/.test(r.txt) && /Darius/.test(r.txt)), 'el porqué nombra a tus aliados AD');
  ok(d.skills[0] === 'R' && d.items[0] === "Liandry's Torment", 'AP sube R y empieza Liandry\'s');
  ok(/^Armá AP: /.test(d.head) && !/\.\.$/.test(d.head), `frase corta bien armada ("${d.head}")`);

  const apTeam = [A('Ahri', 'AP'), A('Lux', 'AP'), A('Brand', 'AP'), A('Jinx', 'AD')];
  const d2 = udyr.decide({ allies: apTeam, enemies: [A('Ahri', 'AP'), A('Jinx', 'AD'), A('Lux', 'AP'), A('Syndra', 'AP'), A('Graves', 'AD')] });
  ok(d2.path === 'AD', 'equipo con mucho AP y rivales blandos → AD');
  ok(d2.skills[0] === 'Q' && d2.items[0] === 'Spear of Shojin', 'AD sube Q y empieza Shojin');

  // El daño de tu equipo pesa más que los rivales: equipo con mucho AP + rivales tanques → igual AD.
  const d3 = udyr.decide({ allies: apTeam, enemies: [A('Malphite', 'AD'), A('Sejuani', 'AD'), A('Leona', 'AD'), A('Ahri', 'AP'), A('Jinx', 'AD')] });
  ok(d3.path === 'AD' && d3.score.AD === 2 && d3.score.AP === 1, 'tu equipo pesa el doble que los rivales');

  // Sin datos (pick a ciegas): AD, y lo dice.
  const d4 = udyr.decide({ allies: [], enemies: [] });
  ok(d4.path === 'AD' && d4.tie && d4.reasons.some((r) => /más jugada/.test(r.txt)), 'sin picks: AD por ser la más jugada, y lo explica');

  // En partida: si ya empezaste un camino, se sigue aunque la composición diga otra cosa.
  const d5 = udyr.decide({ allies: allAd, enemies: [A('Gnar', 'AD'), A('Lee Sin', 'AD'), A('Leona', 'AD')], started: 'AD' });
  ok(d5.path === 'AD' && d5.locked && d5.reasons.some((r) => /Ya empezaste AD/.test(r.txt)), 'camino empezado: no se cambia a mitad');
  ok(/Seguí AD/.test(d5.hud), 'el overlay dice "Seguí AD"');

  const tags = { 'Long Sword': ['Damage'], 'Amplifying Tome': ['SpellDamage'], 'Haunting Guise': ['Health', 'SpellDamage'], 'Gustwalker Hatchling': ['Jungle'], 'Health Potion': ['Consumable'] };
  const tagsOf = (n) => new Set(tags[n] || []);
  ok(udyr.startedPath(['Gustwalker Hatchling', 'Health Potion'], tagsOf) === null, 'con el inicio todavía no hay camino');
  ok(udyr.startedPath(['Gustwalker Hatchling', 'Long Sword'], tagsOf) === 'AD', 'Long Sword → empezó AD');
  ok(udyr.startedPath(['Gustwalker Hatchling', 'Haunting Guise'], tagsOf) === 'AP', 'Haunting Guise → empezó AP');

  const g = udyr.forGame(d);
  ok(!/\d+(,\d+)?%/.test(JSON.stringify(g)) && !/partidas/.test(JSON.stringify(g)), 'en partida: sin winrates ni partidas');
  ok(/\d/.test(d.data) && /op\.gg Emerald\+/.test(d.data), 'en champ select: el dato tiene número y fuente');
}

// ---------------------------------------------------------------- pool, fuentes y plan
{
  const pool = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pool_udyr.json'), 'utf8'));
  const u = pool.pool[0];
  ok(pool.source === 'op.gg Emerald+' && u.name === 'Udyr' && Object.keys(u.matchups).length >= 50, 'pool de Udyr con op.gg Emerald+');
  ok(u.builds.ad.items[0] === 'Spear of Shojin' && u.builds.ap.items[0] === "Liandry's Torment", 'dos builds: AD y AP');
  ok(Object.values(u.matchups).every((m) => m.guide && m.guide.src === 'analisis' && m.guide.no6), 'guías ANÁLISIS y sin "al 6"');
  ok(Object.values(u.matchups).every((m) => !/Nocturne|Diana|Zhonya/.test(JSON.stringify(m.guide))), 'las guías no hablan de otro campeón');

  const jgplan = require('../src/engine/jgplan');
  const mixed = jgplan.mix(JSON.parse(JSON.stringify(pool.pool)).map((c) => Object.assign({ role: 'jungle' }, c)), pool.source);
  const lee = mixed[0].matchups['Lee Sin'];
  ok(lee.sources.length === 3 && lee.sources[0].name === 'op.gg Emerald+', 'Lee Sin: op.gg Emerald+ y Lolalytics de los dos tiers');
  // Emerald+ pesa entero y Master+ a mitad: 1662*53,49 + 2265*54,83 + 0,5*381*55,91.
  const exp = (1662 * 53.49 + 2265 * 54.83 + 0.5 * 381 * 55.91) / (1662 + 2265 + 0.5 * 381);
  ok(Math.abs(lee.wr_mix - Math.round(exp * 10) / 10) < 0.051, `mezcla con el tier de Mauri a peso entero (${lee.wr_mix} ≈ ${exp.toFixed(2)})`);
  // Bitty no cambia: su op.gg es Master+, así que ahí Master+ sigue a peso entero.
  const bpool = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'pool_jungle.json'), 'utf8'));
  const bm = jgplan.mix(bpool.pool.map((c) => Object.assign({ role: 'jungle' }, c)), bpool.source);
  ok(bm[0].matchups['Lee Sin'].sources[0].name === 'op.gg Master+', 'Bitty sigue con op.gg Master+');

  const pl = jgplan.plan({ me: mixed[0], mu: lee, laneEnemy: 'Lee Sin', enemies: { jungle: 'Lee Sin', top: 'Gnar', middle: 'Syndra', bottom: "Kai'Sa" } });
  ok(pl && pl.hud6 === null && pl.post6_label === 'Con tu primer ítem', 'Udyr no tiene línea "Ya sos 6" en el overlay');
  ok(/Emerald\+/.test(pl.fuente), 'el plan dice de dónde salen los datos');
  ok(pl.label === 'JUGÁ MID', `jugá para la línea con mejor dato (Syndra +3,13) → ${pl.label}`);
}

// ---------------------------------------------------------------- en partida (demo)
{
  process.env.PH_PROFILE = 'mauri';
  const { Engine } = require('../src/engine/engine');
  const ud = fs.mkdtempSync(path.join(os.tmpdir(), 'mauri'));
  const e = new Engine({ dataDir: path.join(__dirname, '..', 'data'), userDir: ud });
  e.dd.loadFrom(JSON.parse(fs.readFileSync(path.join(__dirname, 'offline.json'), 'utf8')));
  ok(e.profile.id === 'mauri' && e.roles.jungle && e.roles.jungle.pool[0].name === 'Udyr', 'perfil mauri: jungla con Udyr');
  const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'demo_game_udyr.json'), 'utf8'));
  g.gameData.gameTime = 20;
  let v = e.gameStep(g, Date.now());
  ok(v.udyr && v.udyr.path === 'AP' && v.buy && /Liandry|Haunting/.test(v.buy.target + v.buy.items.join()), 'equipo AD → compra hacia Liandry\'s');
  ok(v.win_line === v.udyr.hud && v.win_until === 45, 'overlay: primero AD/AP (hasta 0:45)');
  ok(/camino AP \(/.test(v.why["Liandry's Torment"]), `el porqué del ítem dice el camino ("${v.why["Liandry's Torment"]}")`);
  g.gameData.gameTime = 60;
  v = e.gameStep(g, Date.now());
  ok(v.win_line && v.win_line !== v.udyr.hud && v.win_until === 90, 'después, el plan de jungla (hasta 1:30)');
  const me = g.allPlayers.find((p) => p.championName === 'Udyr');
  me.items.push({ itemID: 1036, count: 1, slot: 3 });   // Long Sword: empezó AD
  g.gameData.gameTime = 400;
  v = e.gameStep(g, Date.now());
  ok(v.udyr.path === 'AD' && v.udyr.locked && v.queue[0] === 'Spear of Shojin', 'con Long Sword comprada sigue AD (Shojin)');

  // Avisos de jungla: nada de torres, oleadas ni cañones (eso es de las líneas).
  const lee = g.allPlayers.find((p) => p.championName === 'Lee Sin');
  const top = g.allPlayers.find((p) => p.team === me.team && p.position === 'TOP');
  g.events.Events.push({ EventID: 50, EventName: 'ChampionKill', EventTime: 395, VictimName: top.riotId, KillerName: lee.riotId, Assisters: [] });
  lee.level = me.level + 2;
  g.gameData.gameTime = 400;
  v = e.gameStep(g, Date.now());
  const said = JSON.stringify([v.orders, v.alerts]);
  ok(/Jungla rival en top: jugá del otro lado del mapa/.test(said), 'jungla rival visto en top → jugá del otro lado');
  ok(/te saca 2 niveles: no lo pelees; farmeá tu jungla/.test(said), 'nivel de diferencia con consejo de jungla');
  ok(!/bajo torre|Retrocedé|Podés jugar adelante|Cañón|wave/.test(said), 'sin avisos de línea para el jungla');
  lee.level = 6; me.level = 5;
  v = e.gameStep(g, Date.now());
  ok(/ya tiene la R: no lo pelees solo hasta igualarle el nivel/.test(JSON.stringify(v.alerts)) && !/tu 6/.test(JSON.stringify(v.alerts)), 'Udyr no tiene definitiva: no le dice "hasta tu 6"');

  // Festejo: al terminar una partida con triple, la mejor jugada de la partida.
  const { celebrationFor } = require('../src/engine/engine');
  const c = celebrationFor({ id: 'x1', champ: 'Udyr', multis: [{ t: 300, n: 3 }, { t: 900, n: 4 }] }, Date.now());
  ok(c && c.n === 4 && c.title === '¡CUÁDRUPLE KILL!' && c.count === 2 && c.champ === 'Udyr', 'festejo con la mejor jugada de la partida (cuádruple)');
  ok(c && typeof c.msg === 'string' && c.msg.length > 5 && c.id === 'x1|900', 'el festejo trae su frase y un id por partida');
  ok(celebrationFor({ id: 'x2', champ: 'Udyr', multis: [] }, 0) === null && celebrationFor(null, 0) === null, 'sin triple no hay festejo');
  ok(celebrationFor({ id: 'x3', champ: 'Udyr', multis: [{ t: 1, n: 7 }] }, 0).title === '¡PENTAKILL!', 'más de 5 cuenta como penta');
  finish();
}

function finish() {
  // ---------------------------------------------------------------- arranque con Windows
  ok(startup.loginItem({ enabled: true, portableExe: null, packaged: true }) === null, 'sin .exe portable no se registra nada');
  ok(startup.loginItem({ enabled: true, portableExe: 'C:\\x\\PickHelper.exe', packaged: false }) === null, 'en desarrollo no se registra nada');
  const li = startup.loginItem({ enabled: true, portableExe: 'C:\\x\\PickHelper.exe', packaged: true });
  ok(li && li.openAtLogin && li.path === 'C:\\x\\PickHelper.exe' && li.args.includes('--oculta'), 'registra el .exe original y arranca oculta');
  ok(startup.loginItem({ enabled: false, portableExe: 'C:\\x\\PickHelper.exe', packaged: true }).openAtLogin === false, 'apagado: se saca del arranque');
  ok(startup.setting({}, 'arranque_windows') && startup.setting({}, 'bandeja'), 'por defecto: arranca con Windows y queda en la bandeja');
  ok(!startup.setting({ bandeja: false }, 'bandeja'), 'se puede apagar la bandeja');
  ok(startup.shouldPopUp({ hidden: true, wasSelect: false, isSelect: true, settings: {} }), 'escondida + empieza champ select → aparece');
  ok(!startup.shouldPopUp({ hidden: true, wasSelect: true, isSelect: true, settings: {} }), 'no aparece de nuevo si la escondés durante el champ select');
  ok(!startup.shouldPopUp({ hidden: true, wasSelect: false, isSelect: true, settings: { mostrar_en_champ: false } }), 'se puede apagar el aparecer sola');

  // ---------------------------------------------------------------- jugador
  ok(player.PLAYERS.mauri && player.PLAYERS.mauri.dir === 'Pick Helper Mauri', 'Mauri tiene su carpeta (no pisa a Naser ni a Bitty)');
  const ad = fs.mkdtempSync(path.join(os.tmpdir(), 'appd'));
  player.saveChoice(ad, 'mauri');
  ok(player.resolve({ appData: ad, env: {}, builtId: 'naser' }).id === 'mauri', 'elegir Mauri queda guardado');

  console.log(`\n${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}
