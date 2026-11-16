'use strict';
// Vista en partida: lee la Live Client Data API del juego (https://127.0.0.1:2999), detecta tu campeón
// y tu rival, y calcula qué comprar con tu oro actual. Solo lee lo que el propio juego expone.
const { norm, Counter, sortBy } = require('./util');
const { supportGuide, ADCS } = require('./select');
const autopsy = require('./autopsy');

const LIVE_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';

// Próximo cañón. Wave 1 a los 65 s, después cada 30. Cañón en la 3.ª y cada 3 hasta el
// minuto 15, cada 2 hasta el 25, y después todas. Sin cuenta regresiva en el texto.
function nextCannon(t) {
  for (let n = 1; n < 80; n++) {
    const tw = 65 + (n - 1) * 30;
    if (tw < t) continue;
    const cannon = tw < 900 ? n % 3 === 0 : tw < 1500 ? n % 2 === 0 : true;
    if (cannon) return tw;
  }
  return null;
}

const ANTIHEAL = new Set(["Executioner's Calling", 'Bramble Vest', 'Thornmail', 'Mortal Reminder', 'Chempunk Chainsword',
  'Oblivion Orb', 'Morellonomicon', 'Chemtech Putrifier']);
const HEALERS = new Set(['Aatrox', 'Darius', 'Vladimir', 'Sylas', 'Fiora', 'Warwick', 'Dr. Mundo', 'Olaf', 'Soraka', 'Yuumi',
  'Sona', 'Nami', 'Swain', 'Illaoi', 'Briar', 'Irelia', 'Volibear', 'Trundle', 'Nasus', 'Udyr',
  'Sett', 'Gwen', 'Kayn', 'Senna', 'Milio', 'Renata Glasc', 'Seraphine']);
const AUTO_ATTACKERS = new Set(['Master Yi', 'Tryndamere', 'Jax', 'Fiora', 'Vayne', "Kog'Maw", "Kai'Sa", 'Jinx', 'Twitch',
  'Kalista', 'Xayah', 'Zeri', 'Varus', 'Ashe', 'Aphelios', 'Draven', 'Miss Fortune', 'Tristana',
  'Sivir', 'Caitlyn', 'Lucian', 'Samira', 'Nilah', "Bel'Veth", 'Kindred', 'Yasuo', 'Yone',
  'Gwen', 'Kayle', 'Quinn', 'Smolder', 'Corki', 'Ezreal', 'Graves']);
const ULT_NOTES = {
  Darius: 'R hace daño verdadero y se resetea: no pelees bajo de vida.',
  Garen: 'R hace más daño cuanto menos vida tenés: alejate bajo el 40%.',
  Mordekaiser: 'R te aísla 1v1 en otra dimensión: no le pelees con la vida baja.',
  Sett: 'R te puede tirar encima de tu equipo; cuidado cerca de su jungla.',
  Illaoi: 'R crea tentáculos en todo el área: salí de la zona apenas la usa.',
  Fiora: 'R marca 4 vitales; si las rompe, se cura todo su equipo.',
  Camille: 'R te encierra en un área: guardá Flash.',
  Malphite: 'R es engage instantáneo: no te agrupes con tu equipo.',
  Jax: 'Su E bloquea autoataques; esperá a que la gaste.',
  Aatrox: 'R le da curación extra y revive al matar: no pelees largo.',
  Yone: 'R atraviesa en línea y te tira para arriba.',
  Renekton: 'R le da vida y daño extra por varios segundos.',
  Kennen: 'R stunea a todos los que quedan cerca: separate.',
  Teemo: 'R: hongos invisibles en el mapa; comprá Oracle Lens.',
  Sion: 'R: carga imparable desde lejos, mirá el minimapa.',
  Nasus: 'R le da vida y reduce tu armadura/resistencia.',
  Tryndamere: 'R lo hace inmortal 5 s: alejate y peleá después.',
  Kayle: 'Nivel 6 y 11 son sus picos; matala antes del 11.',
  Gwen: 'W la hace intocable desde afuera del área: entrá con ella.',
  Gangplank: 'R cubre área en todo el mapa; sus barriles hacen mucho daño.',
};
const BUILD_RULES = {
  Malphite: {
    boots: { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: 'Plated Steelcaps' },
    options: [['Sunfire Aegis', { default: 3 }], ['Thornmail', { heal: 3, auto: 2, ad_heavy: 2 }],
      ['Frozen Heart', { auto: 3, ad_heavy: 2 }], ["Randuin's Omen", { crit: 4, ad_heavy: 1 }],
      ['Kaenic Rookern', { ap_heavy: 4, ap_fed: 2 }], ['Force of Nature', { ap_heavy: 3 }],
      ["Jak'Sho, The Protean", { default: 1 }]],
  },
  Garen: {
    boots: { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: "Berserker's Greaves" },
    options: [['Stridebreaker', { default: 5 }], ['Phantom Dancer', { default: 3 }],
      ['Mortal Reminder', { heal: 4, tanky: 2 }], ["Lord Dominik's Regards", { tanky: 3 }],
      ["Sterak's Gage", { default: 2, lane_fed: 1 }], ["Dead Man's Plate", { ad_heavy: 2, lane_fed: 1 }],
      ['Force of Nature', { ap_heavy: 3, ap_fed: 1 }], ["Randuin's Omen", { crit: 3 }]],
  },
  Illaoi: {
    boots: { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: 'Plated Steelcaps' },
    options: [['Black Cleaver', { default: 5 }], ['Iceborn Gauntlet', { default: 3 }],
      ["Sterak's Gage", { default: 2, lane_fed: 1 }], ['Chempunk Chainsword', { heal: 4 }],
      ["Death's Dance", { ad_heavy: 2, lane_fed: 1 }], ['Spirit Visage', { ap_heavy: 2 }],
      ['Force of Nature', { ap_heavy: 3, ap_fed: 1 }], ["Randuin's Omen", { crit: 3 }]],
  },
};
// Bitty: Nocturne y Diana (por rol, porque Diana arma distinto en jungla y en mid).
Object.assign(BUILD_RULES, {
  'Nocturne|jungle': {
    boots: { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: 'Plated Steelcaps' },
    options: [['Profane Hydra', { default: 4, squishy: 2 }], ['Experimental Hexplate', { default: 3, tanky: 2 }],
      ['Axiom Arc', { default: 2, squishy: 2 }], ['Stridebreaker', { default: 1, tanky: 2 }], ['Black Cleaver', { tanky: 4, default: 1 }],
      ['Voltaic Cyclosword', { squishy: 2, default: 1 }], ["Lord Dominik's Regards", { tanky: 3 }], ["Death's Dance", { ad_heavy: 3, ad_fed: 1 }],
      ['Maw of Malmortius', { ap_heavy: 3, ap_fed: 2 }], ['Guardian Angel', { default: 1, lane_fed: 1 }], ["Serpent's Fang", { shields: 3 }],
      ['Mortal Reminder', { heal: 4 }]],
  },
  'Diana|jungle': {
    boots: { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: "Sorcerer's Shoes" },
    options: [['Dusk and Dawn', { default: 6 }], ['Riftmaker', { default: 5 }], ["Zhonya's Hourglass", { default: 4, ad_fed: 2, ad_heavy: 1 }],
      ["Rabadon's Deathcap", { default: 2 }], ['Shadowflame', { default: 2, squishy: 1 }], ['Void Staff', { tanky: 4 }],
      ["Banshee's Veil", { ap_fed: 3, ap_heavy: 1 }], ["Liandry's Torment", { tanky: 2 }], ['Morellonomicon', { heal: 3 }]],
  },
  'Diana|mid': {
    boots: { ad: "Sorcerer's Shoes", ap: "Mercury's Treads", default: "Sorcerer's Shoes" },
    options: [['Stormsurge', { default: 6 }], ['Shadowflame', { default: 5 }], ["Zhonya's Hourglass", { default: 4, ad_fed: 2, ad_heavy: 1 }],
      ["Rabadon's Deathcap", { default: 3 }], ['Void Staff', { tanky: 4 }], ["Banshee's Veil", { ap_fed: 3, ap_heavy: 1 }],
      ['Morellonomicon', { heal: 3 }], ['Lich Bane', { default: 1 }]],
  },
});
Object.assign(ULT_NOTES, {
  'Lee Sin': 'R te patea hacia su equipo: no te pares entre él y sus aliados.',
  'Jarvan IV': 'R te encierra en un círculo: guardá Flash o una habilidad de escape.',
  Viego: 'Cuando mata, posee al muerto y resetea: no dejes aliados bajos de vida.',
  "Kha'Zix": 'Hace muchísimo daño a quien está aislado.',
  Rengar: 'R lo hace invisible y salta: Oracle Lens o Control Ward.',
  Hecarim: 'R espanta (fear) a todos los que alcanza.',
  Zed: 'R te marca y explota después: tené Zhonya o W lista.',
  Syndra: 'R hace más daño cuantas más esferas tenga.',
  Ahri: 'R le da 3 dashes: no la persigas.',
  Katarina: 'R gira y hace daño en área: interrumpila con CC.',
  Akali: 'Su humo la hace invisible: Control Ward la revela.',
  Yasuo: 'Su muro bloquea proyectiles y su R necesita un knockup.',
  Galio: 'R le permite llegar a cualquier aliado: avisá cuando falta.',
  LeBlanc: 'R copia su última habilidad: doble daño explosivo.',
  Fizz: 'R tira un tiburón: si te pega, alejate del área.',
  Karthus: 'R pega a todo el mapa: Zhonya si estás bajo de vida.',
  Evelynn: 'Invisible y con R ejecuta a los que tienen poca vida.',
});
const POS_ROLE = { TOP: 'top', JUNGLE: 'jungle', MIDDLE: 'mid', BOTTOM: 'adc', UTILITY: 'utility' };

const HARD_CC = new Set(['Leona', 'Nautilus', 'Thresh', 'Blitzcrank', 'Alistar', 'Rell', 'Rakan', 'Morgana', 'Lux', 'Zyra',
  'Amumu', 'Sejuani', 'Malphite', 'Ashe', 'Varus', 'Lissandra', 'Annie', 'Vi', 'Jarvan IV', 'Maokai',
  'Skarner', 'Pantheon', 'Braum', 'Taric', 'Zac', 'Ornn', 'Galio', 'Kennen', 'Twisted Fate', 'Veigar',
  'Neeko', 'Seraphine', 'Sona', 'Swain', 'Warwick', 'Xin Zhao', 'Poppy', 'Vex', 'Cassiopeia', 'Renekton',
  'Sett', 'Rammus', 'Nunu & Willump', 'Lillia', 'Wukong', 'Mordekaiser', 'Yasuo', 'Yone', 'Diana']);
const SHIELDERS = new Set(['Lulu', 'Janna', 'Karma', 'Milio', 'Seraphine', 'Sona', 'Nami', 'Yuumi', 'Renata Glasc', 'Rakan',
  'Braum', 'Taric', 'Lux', 'Ivern']);
const SUPPORT_ITEMS = new Set(['World Atlas', 'Runic Compass', 'Bounty of Worlds', 'Celestial Opposition', 'Dream Maker',
  'Solstice Sleigh', "Zaz'Zak's Realmspike", 'Bloodsong']);
const SUPPORT_UPGRADED = new Set([...SUPPORT_ITEMS].filter((x) => x !== 'World Atlas' && x !== 'Runic Compass'));
const SUPPORT_FINAL = new Set(['Celestial Opposition', 'Dream Maker', 'Solstice Sleigh', "Zaz'Zak's Realmspike", 'Bloodsong']);
// Campeones que curan o escudan a un aliado: son los que prenden la burbuja de Dream Maker.
const HEAL_SHIELD = new Set(['Nami', 'Lulu', 'Janna', 'Soraka', 'Sona', 'Milio', 'Karma', 'Yuumi',
  'Renata Glasc', 'Seraphine', 'Rakan', 'Lux', 'Morgana', 'Bard']);
const PICK_HOOK = new Set(['Blitzcrank', 'Thresh']);
const POKE_ENCHANT = new Set(['Karma', 'Seraphine']);
const SHIELD_MAGE = new Set(['Lux', 'Morgana']);
const UPGRADE_ITEM = {
  blood: 'Bloodsong', zaz: "Zaz'Zak's Realmspike", zaz_tank: "Zaz'Zak's Realmspike",
  dream: 'Dream Maker', dream_carry: 'Dream Maker', celestial: 'Celestial Opposition', sleigh: 'Solstice Sleigh',
};
const UPGRADE_WHY = {
  blood: 'después de una habilidad, tu auto marca al rival y recibe más daño de todos',
  zaz: 'tu habilidad explota y suma daño mágico',
  zaz_tank: 'el rival se está armando tanque: la explosión pega un % de su vida máxima',
  dream: 'cuando curás o escudás, la burbuja le baja el daño a ese aliado',
  dream_carry: 'tu escudo o curación le pone la burbuja a tu ADC, que pega con autos',
  celestial: 'entrás desde la niebla: el primer golpe deja una zona que los frena',
  sleigh: 'cada control que pegás da velocidad y cura a los aliados de al lado',
};
const SUP_SITU = {
  engage: [['Thornmail', { heal: 3, auto: 2 }], ['Frozen Heart', { auto: 3, ad_heavy: 1 }],
    ["Randuin's Omen", { crit: 3 }], ['Abyssal Mask', { ap_heavy: 3 }], ['Kaenic Rookern', { ap_fed: 3 }],
    ['Redemption', { default: 1 }], ["Mikael's Blessing", { cc: 2 }]],
  enchanter: [["Mikael's Blessing", { cc: 3 }], ['Redemption', { default: 2 }],
    ['Staff of Flowing Water', { ally_ap: 2 }],
    ['Ardent Censer', { ally_auto: 2 }], ['Locket of the Iron Solari', { ap_fed: 2 }]],
  mage: [["Zhonya's Hourglass", { ad_fed: 3 }], ["Banshee's Veil", { ap_fed: 3 }],
    ['Morellonomicon', { heal: 3 }], ['Void Staff', { tanky: 3 }], ["Rabadon's Deathcap", { default: 1 }]],
  fighter: [['Mortal Reminder', { heal: 3 }], ["Serpent's Fang", { shields: 3 }],
    ['Edge of Night', { ap_fed: 2 }], ['Guardian Angel', { default: 1 }]],
};
const ARCH_GROUP = { engage: 'engage', warden: 'engage', roamer: 'engage', enchanter: 'enchanter', mage: 'mage', marksman: 'fighter' };
const FIGHTERS = new Set(['Pyke', 'Pantheon', 'Senna']);
const TRINKETS = new Set(['Stealth Ward', 'Oracle Lens', 'Farsight Alteration']);

function supportRules(cfg) {
  const grp = FIGHTERS.has(cfg.name) ? 'fighter' : ARCH_GROUP[cfg.arch] || 'engage';
  const core = cfg.builds.default.items;
  const opts = core.map((it, i) => [it, { default: 6 - i }]);
  const have = new Set(core);
  for (const [it, w] of SUP_SITU[grp]) if (!have.has(it)) opts.push([it, w]);
  const boots = cfg.boots;
  let b;
  if (grp === 'engage') b = { ad: 'Plated Steelcaps', ap: "Mercury's Treads", default: boots };
  else if (grp === 'mage') b = { ad: boots, ap: boots !== "Sorcerer's Shoes" ? "Mercury's Treads" : boots, default: boots };
  else b = { ad: boots, ap: boots, default: boots };
  return { boots: b, options: opts, group: grp };
}

// Evolución gratis de Bounty of Worlds. Sale del kit (qué pasiva podés prender) y del
// contexto de esta partida. Es análisis de las pasivas, no una guía de un pro.
function supportUpgrade(cfg, cond) {
  cond = cond || {};
  const name = cfg.name;
  const arch = cfg.arch;
  let key;
  if (FIGHTERS.has(name) || arch === 'marksman') key = 'blood';
  else if (name === 'Bard' && cond.ally_auto) key = 'dream_carry';
  else if (name === 'Bard') key = 'celestial';
  else if (SHIELD_MAGE.has(name) && cond.ally_auto && !cond.tanky) key = 'dream_carry';
  else if (arch === 'mage' || (arch === 'enchanter' && !HEAL_SHIELD.has(name)) || (POKE_ENCHANT.has(name) && cond.tanky)) key = cond.tanky ? 'zaz_tank' : 'zaz';
  else if (arch === 'enchanter' || (name === 'Rakan' && cond.ally_auto)) key = 'dream';
  else if (PICK_HOOK.has(name) && cond.squishy) key = 'celestial';
  else key = 'sleigh';
  return { item: UPGRADE_ITEM[key], key, why: UPGRADE_WHY[key] };
}

const REASON = {
  heal: 'el rival se cura mucho', auto: 'pegan con autoataques', ad_heavy: 'equipo rival mayormente AD',
  ap_heavy: 'equipo rival con mucho AP', ap_fed: 'hay un AP muy fuerte', crit: 'tienen ítems de crítico',
  tanky: 'el rival se está armando tanque', lane_fed: 'tu rival de línea va adelante', default: 'parte de la build',
  cc: 'el rival tiene mucho control duro', ad_fed: 'hay un AD muy fuerte', shields: 'el rival tiene escudos',
  ally_ap: 'tu equipo tiene mucho daño mágico', ally_auto: 'tu ADC pega con autoataques',
  squishy: 'los rivales casi no tienen ítems de tanque',
};

function playerChamp(p, alias) {
  if (!p) return null;
  const m = /displayname_(\w+)/.exec(p.rawChampionName || '');
  if (m && alias[norm(m[1])]) return alias[norm(m[1])];
  return p.championName || '?';
}
function spellKey(s) {
  const m = /SummonerSpell_(Summoner[A-Za-z0-9]+)_/.exec((s || {}).rawDisplayName || '');
  return m ? m[1] : (s || {}).displayName || '';
}
const kdaOf = (p) => { const s = p.scores || {}; return `${s.kills || 0}/${s.deaths || 0}/${s.assists || 0}`; };
const itemsOf = (p) => (p.items || []).map((it) => it.itemID).filter(Boolean);

// Encuentra al jugador local entre allPlayers (Riot ID / nombre viejo).
function findMe(g) {
  const ap = g.activePlayer || {};
  const players = g.allPlayers || [];
  const myId = ap.riotId || ap.summonerName;
  let me = players.find((p) => (p.riotId || p.summonerName) === myId);
  if (!me && players.length) me = players.find((p) => p.summonerName === ap.summonerName) || players[0];
  return me || null;
}

function analyzeGame(g, pool, db, champDmg, alias, laneHint, prev, sup) {
  prev = prev || {};
  const ap_ = g.activePlayer || {};
  const players = g.allPlayers || [];
  const me = findMe(g);
  if (!me) return null;
  const myTeam = me.team;
  const myChamp = playerChamp(me, alias);
  const enemies = players.filter((p) => p.team !== myTeam);
  const gold = Math.trunc(ap_.currentGold || 0);
  const gtime = (g.gameData || {}).gameTime || 0;
  const itemValue = (p) => itemsOf(p).reduce((s, i) => s + db.total(i), 0);
  const pc = (p) => playerChamp(p, alias);

  let lane = null;
  const pos = me.position || '';
  if (pos) lane = enemies.find((e) => e.position === pos) || null;
  if (!lane && laneHint) lane = enemies.find((e) => norm(pc(e)) === norm(laneHint)) || null;
  if (!lane) {
    const tops = {};
    for (const c of pool) for (const [n, m] of Object.entries(c.matchups)) tops[norm(n)] = Math.max(tops[norm(n)] || 0, m.games || 0);
    const cand = sortBy(enemies.slice(), (e) => [-(tops[norm(pc(e))] || 0)]);
    const minG = Math.max(...Object.values(tops), 0) >= 3000 ? 300 : 100;
    lane = cand.length && (tops[norm(pc(cand[0]))] || 0) >= minG ? cand[0] : null;
  }

  let ad = 0, ap = 0, tankItems = 0;
  const healSrc = [], critSrc = [], autoSrc = [], apFed = [], threats = [];
  for (const e of enemies) {
    const name = pc(e);
    const sc = e.scores || {};
    const val = itemValue(e) + 300 * (sc.kills || 0) + 300 + 100 * (e.level || 1);
    const dmg = champDmg[norm(name)] || 'AD';
    const its = itemsOf(e);
    const has = (i, tags) => tags.some((t) => db.tags(i).has(t));
    const adItems = its.filter((i) => has(i, ['Damage', 'CriticalStrike', 'AttackSpeed', 'ArmorPenetration'])).reduce((s, i) => s + db.total(i), 0);
    const apItems = its.filter((i) => has(i, ['SpellDamage', 'MagicPenetration'])).reduce((s, i) => s + db.total(i), 0);
    const shareAp = adItems + apItems > 0 ? apItems / (adItems + apItems) : ({ AP: 1, MIX: 0.5 }[dmg] || 0);
    ad += val * (1 - shareAp);
    ap += val * shareAp;
    if (HEALERS.has(name) || its.some((i) => has(i, ['LifeSteal', 'SpellVamp']))) healSrc.push(name);
    if (its.some((i) => db.tags(i).has('CriticalStrike'))) critSrc.push(name);
    if (AUTO_ATTACKERS.has(name)) autoSrc.push(name);
    if (shareAp >= 0.6 && (sc.kills || 0) >= 4) apFed.push(name);
    tankItems += its.filter((i) => has(i, ['Armor', 'SpellBlock']) && db.isLegendary(i)).length;
    threats.push({ name, value: val, kda: kdaOf(e), dmg: shareAp >= 0.6 ? 'AP' : shareAp <= 0.4 ? 'AD' : 'MIX',
      level: e.level || 1, dead: !!e.isDead, respawn: e.respawnTimer || 0 });
  }
  const total = ad + ap || 1;
  const apShare = ap / total;
  sortBy(threats, (t) => [-t.value]);

  const laneName = lane ? pc(lane) : null;
  const laneFed = !!(lane && (((lane.scores || {}).kills || 0) >= 3 || (lane.level || 1) - (me.level || 1) >= 2
    || itemValue(lane) - itemValue(me) >= 1500));
  const cond = {
    default: true,
    heal: healSrc.length >= 2 || healSrc.includes(laneName),
    auto: autoSrc.length >= 2,
    ad_heavy: apShare <= 0.4,
    ap_heavy: apShare >= 0.55,
    ap_fed: apFed.length > 0,
    crit: critSrc.length > 0,
    tanky: tankItems >= 3,
    squishy: tankItems <= 1,
    lane_fed: laneFed,
  };
  const allies = players.filter((p) => p.team === myTeam && p !== me);
  const enemyNames = enemies.map(pc);
  const ccSrc = enemyNames.filter((n) => HARD_CC.has(n));
  const adFed = threats.filter((t) => t.dmg !== 'AP' && parseInt(t.kda.split('/')[0], 10) >= 4).map((t) => t.name);
  const allyAdc = allies.find((a) => a.position === 'BOTTOM') || null;
  const allyAdcName = allyAdc ? pc(allyAdc) : null;
  const allyAp = allies.filter((a) => champDmg[norm(pc(a))] === 'AP').length;
  const enemySup = enemies.find((e) => e.position === 'UTILITY') || null;
  const enemySupName = enemySup ? pc(enemySup) : null;
  Object.assign(cond, {
    cc: ccSrc.length >= 3, ad_fed: adFed.length > 0, shields: enemyNames.some((n) => SHIELDERS.has(n)),
    ally_ap: allyAp >= 2, ally_auto: !!(allyAdcName && AUTO_ATTACKERS.has(allyAdcName)),
  });
  const condSrc = { heal: healSrc, auto: autoSrc, crit: critSrc, ap_fed: apFed, cc: ccSrc, ad_fed: adFed,
    shields: enemyNames.filter((n) => SHIELDERS.has(n)), ally_auto: allyAdcName ? [allyAdcName] : [] };

  const myRole = POS_ROLE[me.position] || '';
  let rules = BUILD_RULES[`${myChamp}|${myRole}`] || BUILD_RULES[myChamp] || null;
  let supCfg = null;
  if (!rules && sup) {
    supCfg = sup[0].find((c) => c.name === myChamp) || null;
    if (supCfg) rules = supportRules(supCfg);
  }
  const myItems = itemsOf(me);
  const inv = new Counter(myItems);
  let buy = null;
  let queue = [];
  const reasons = {};
  let laneMu = null;
  if (rules) {
    const scored = rules.options.map(([item, w], i) => {
      const s = Object.entries(w).reduce((a, [k, v]) => a + (cond[k] ? v : 0), 0);
      const why = Object.keys(w).filter((k) => k !== 'default' && cond[k]);
      return [-s, i, item, why];
    });
    sortBy(scored, (x) => [x[0], x[1]]);
    const order = scored.map((x) => x[2]);
    for (const [, , it, why] of scored) reasons[it] = why;
    const cfg = pool.find((c) => c.name === myChamp && c.role === myRole) || pool.find((c) => c.name === myChamp);
    if (cfg && laneName && !supCfg) {
      const hit = Object.entries(cfg.matchups).find(([n]) => norm(n) === norm(laneName));
      laneMu = hit ? hit[1] : null;
    }
    if (laneMu && laneMu.first) {
      const f = laneMu.first[0];
      const idx = order.indexOf(f);
      if (idx >= 0) order.splice(idx, 1);
      order.unshift(f);
      reasons[f] = ['vs_lane', ...(reasons[f] || [])];
    }
    const b = rules.boots;
    const laneDmg = laneName ? champDmg[norm(laneName)] || 'AD' : 'AD';
    let boots;
    if (cond.ap_heavy || (laneDmg === 'AP' && apShare >= 0.45)) boots = b.ap;
    else if (cond.ad_heavy || laneDmg === 'AD') boots = myChamp !== 'Garen' || laneFed || cond.auto ? b.ad : b.default;
    else boots = b.default;
    if (laneMu && laneMu.boots && !cond.ap_heavy) boots = laneMu.boots;
    order.splice(1, 0, boots);
    reasons[boots] = ['boots'];

    const haveNames = new Set(myItems.map((i) => norm(db.name(i))));
    const hasT2 = myItems.some((i) => db.isBoots(i) && db.total(i) > 300);
    for (const it0 of order) {
      const it = db.toBuy(it0);
      if (haveNames.has(norm(it)) || haveNames.has(norm(it0))) continue;
      if (it0 === boots && hasT2) continue;
      if (!db.buyable(it) || queue.includes(it)) continue;
      if (it !== it0) reasons[it] = reasons[it0];
      queue.push(it);
    }
    if (supCfg && !myItems.some((i) => SUPPORT_ITEMS.has(db.name(i))) && db.buyable('World Atlas')) {
      queue.unshift('World Atlas');
      reasons['World Atlas'] = ['sup_item'];
    }
    queue = queue.slice(0, 4);
    if (queue.length) {
      const tid = db.idOf(queue[0]);
      const [ids, missing, cost0] = db.planPurchase(tid, inv, gold);
      buy = { target: queue[0], items: ids.map((i) => db.name(i)), missing, cost: cost0,
        complete: ids.length === 1 && ids[0] === tid && missing === 0, also: [] };
      if (buy.complete) {
        const inv2 = new Counter(inv);
        db.remaining(tid, inv2);
        inv2.inc(tid);
        let gold2 = gold - cost0;
        for (const nxt of queue.slice(1, 3)) {
          const nid = db.idOf(nxt);
          if (nid === null || gold2 < 300) break;
          const [ids2, miss2, cost2] = db.planPurchase(nid, inv2, gold2);
          if (miss2 || !ids2.length) break;
          buy.items.push(...ids2.map((i) => db.name(i)));
          buy.also.push(nxt);
          buy.cost += cost2;
          gold2 -= cost2;
          if (ids2.length === 1 && ids2[0] === nid) { db.remaining(nid, inv2); inv2.inc(nid); }
          else { for (const i of ids2) inv2.inc(i); break; }
        }
      }
      const left = gold - (missing === 0 ? buy.cost : 0);
      if (missing === 0 && left >= 75 && !myItems.some((i) => norm(db.name(i)) === 'controlward') && db.buyable('Control Ward')) {
        buy.extra = 'Control Ward';
      }
    }
  }

  // La evolución se elige gratis en el menú cuando el ítem ya es Bounty of Worlds.
  // No entra en la cola de oro: la compra de componentes sigue igual.
  let supUpgrade = null;
  if (supCfg) {
    const names = myItems.map((i) => db.name(i));
    if (!names.some((n) => SUPPORT_FINAL.has(n))) {
      const pick = supportUpgrade(supCfg, cond);
      supUpgrade = { item: pick.item, why: pick.why, key: pick.key, ready: names.includes('Bounty of Worlds') };
    }
  }

  const alerts = [];
  const events = [];
  if (lane) {
    const dl = (lane.level || 1) - (me.level || 1);
    if ((lane.level || 1) >= 6 && (me.level || 1) < 6) alerts.push(['bad', `${laneName} ya tiene la R y vos no: no pelees hasta tu 6.`]);
    else if (dl >= 2) alerts.push(['bad', `${laneName} te saca ${dl} niveles: jugá seguro y farmeá bajo torre.`]);
    else if (dl <= -2) alerts.push(['good', `Le sacás ${-dl} niveles a ${laneName}: es tu momento de presionar.`]);
    const prevItems = new Set(prev.lane_items || []);
    for (const i of itemsOf(lane)) {
      if (db.isLegendary(i) && !prevItems.has(i) && prev.lane_name === laneName) events.push(['bad', `${laneName} completó ${db.name(i)}: respetá su pico de poder.`]);
    }
    if (itemsOf(lane).some((i) => ANTIHEAL.has(db.name(i))) && myChamp === 'Illaoi') alerts.push(['neutral', `${laneName} compró antiheal: tus curaciones rinden menos.`]);
    if (lane.isDead) alerts.push(['good', `${laneName} está muerto: pusheá la wave o volvé a base.`]);
  }
  // Cualquier rival, una vez por ítem. El primer sondeo solo anota lo que ya traían.
  const seen = new Set(prev.legend_seen || []);
  const first = !prev.legend_ready;
  const fresh = [];
  for (const e of enemies) {
    const name = pc(e);
    const val = (threats.find((t) => t.name === name) || {}).value || 0;
    for (const id of itemsOf(e)) {
      if (!db.isLegendary(id)) continue;
      if (first || seen.has(id)) { if (first) seen.add(id); continue; }
      fresh.push({ id, name, lane: !!(laneName && name === laneName), value: val });
    }
  }
  const orders = [];
  if (fresh.length) {
    fresh.sort((a, b) => (b.lane - a.lane) || (b.value - a.value) || (a.id - b.id));
    const pick = fresh[0];
    seen.add(pick.id);
    orders.push({ pri: 3, text: `${pick.name} completó ${db.name(pick.id)}. No pelees.`, until: gtime + 20 });
  }
  const legendSeen = [...seen];

  // ADC aliado acaba de caer: 15 s, solo support, y solo el cambio de vivo a muerto.
  let adcSeen = !!prev.adc_seen;
  let adcDead = !!prev.adc_dead;
  if (myRole === 'utility' && prev.track_adc !== false && !me.isDead) {
    const adcP = allies.find((a) => a.position === 'BOTTOM')
      || allies.find((a) => !a.position && ADCS.has(pc(a)));
    if (adcP) {
      const dead = !!adcP.isDead;
      if (adcSeen && !adcDead && dead) orders.push({ pri: 1, text: `${pc(adcP)} cayó. No pelees.`, until: gtime + 15 });
      adcSeen = true;
      adcDead = dead;
    }
  }

  // Jungla enemiga vista en un kill. Sin coordenadas: la línea es la de la víctima.
  const jgSeen = new Set(prev.jg_seen || []);
  const jg = enemies.find((e) => e.position === 'JUNGLE');
  if (jg) {
    const spotOf = { TOP: 'top', MIDDLE: 'mid', BOTTOM: 'bot' };
    const mine = { TOP: 'top', MIDDLE: 'mid', BOTTOM: 'bot', UTILITY: 'bot' }[me.position] || '';
    for (const ev of ((g.events || {}).Events || [])) {
      if (ev.EventName !== 'ChampionKill') continue;
      const key = `${ev.EventName}|${ev.EventTime}|${ev.VictimName || ''}|${ev.KillerName || ''}`;
      if (jgSeen.has(key)) continue;
      jgSeen.add(key);
      const victim = autopsy.matchPlayer(players, ev.VictimName);
      const killer = autopsy.matchPlayer(players, ev.KillerName);
      const assists = (ev.Assisters || []).map((n) => autopsy.matchPlayer(players, n)).filter(Boolean);
      let where = '';
      if (victim && victim !== jg && (killer === jg || assists.includes(jg))) where = victim.position || '';
      else if (victim === jg && killer && killer.position && killer.position !== 'JUNGLE') where = killer.position;
      const spot = spotOf[where];
      if (!spot) continue;
      const text = mine === spot ? `Jungla enemigo en ${spot}. Retrocedé.` : `Jungla enemigo en ${spot}. Podés jugar adelante.`;
      orders.push({ pri: 2, text, until: (ev.EventTime || gtime) + 20 });
    }
  }

  // Aliado vivo que le saca 1500 de oro al resto. El ítem de support no cuenta. Si es tu ADC, nada.
  const worth = (p) => itemsOf(p).reduce((s, id) => s + (SUPPORT_ITEMS.has(db.name(id)) ? 0 : db.total(id)), 0)
    + 300 * ((p.scores || {}).kills || 0);
  const ranked = allies.filter((a) => !a.isDead).map((a) => ({
    name: pc(a), w: worth(a), adc: a.position === 'BOTTOM' || (!a.position && ADCS.has(pc(a))),
  })).sort((a, b) => b.w - a.w);
  if (ranked.length >= 2 && !ranked[0].adc && ranked[0].w >= ranked[1].w + 1500) {
    orders.push({ pri: 5, text: `Jugá para ${ranked[0].name}. Va adelante.` });
  }

  // Cañón a 25 s o menos, y te alcanza para cerrar o el rival de línea está muerto. Si vos estás muerto, no se dice.
  if (!me.isDead) {
    const nc = nextCannon(gtime);
    if (nc != null && nc - gtime <= 25) {
      if (buy && buy.complete && buy.missing === 0 && buy.target) orders.push({ pri: 4, text: `Cañón en camino. Pusheá y basá: te alcanza para ${buy.target}.` });
      else if (lane && lane.isDead && laneName) orders.push({ pri: 4, text: `${laneName} está muerto. Empujá y basá.` });
    }
  }

  if (supCfg) {
    const namesInv = new Set(myItems.map((i) => db.name(i)));
    if ([...namesInv].some((n) => SUPPORT_UPGRADED.has(n)) && namesInv.has('Stealth Ward')) alerts.push(['neutral', 'Tu ítem de support ya mejoró: cambiá el trinket a Oracle Lens y limpiá wards.']);
    if (!myItems.some((i) => db.name(i) === 'Control Ward') && gtime > 180) alerts.push(['neutral', 'No tenés Control Ward: comprá uno en la próxima vuelta.']);
  }
  for (const t of threats.slice(0, 2)) {
    const [k, d] = t.kda.split('/').map(Number);
    if (k >= 5 && k - d >= 3) alerts.push(['bad', `${t.name} va ${t.kda}: es la amenaza principal.`]);
  }
  if (buy && buy.complete) alerts.push(['good', `Tenés oro para completar ${buy.target}: volvé a base cuando pushees.`]);

  let dragonNext = 300, baronNext = 1200;
  for (const ev of ((g.events || {}).Events || [])) {
    if (ev.EventName === 'DragonKill') dragonNext = (ev.EventTime || 0) + 300;
    else if (ev.EventName === 'BaronKill') baronNext = (ev.EventTime || 0) + 360;
  }
  const objectives = [['Dragón', dragonNext - gtime], ['Barón', baronNext - gtime]];

  let guide = null;
  if (supCfg) {
    const idx = {};
    for (const c of sup[0]) idx[norm(c.name)] = c;
    guide = supportGuide(supCfg, enemySupName || laneName, idx, sup[1]);
  } else if (rules) guide = (laneMu || {}).guide || null;

  const enemyAdcP = supCfg ? enemies.find((e) => e.position === 'BOTTOM') : null;
  return {
    time: gtime, gold,
    me: { champ: myChamp, level: me.level || 1, items: myItems.map((i) => db.name(i)),
      cs: (me.scores || {}).creepScore || 0, kda: kdaOf(me), dead: !!me.isDead, respawn: me.respawnTimer || 0 },
    in_pool: rules !== null, role: myRole,
    lane: !lane ? null : {
      champ: laneName, level: lane.level || 1,
      items: itemsOf(lane).map((i) => db.name(i)).filter((n) => !TRINKETS.has(n)),
      spells: ['summonerSpellOne', 'summonerSpellTwo'].map((k) => spellKey((lane.summonerSpells || {})[k])),
      kda: kdaOf(lane), cs: (lane.scores || {}).creepScore || 0, dead: !!lane.isDead,
      ult: ULT_NOTES[laneName] || null, item_ids: itemsOf(lane),
    },
    buy, guide, support_mode: !!supCfg, ally_adc: allyAdcName,
    enemy_adc: enemyAdcP ? { champ: pc(enemyAdcP), level: enemyAdcP.level || 1,
      items: itemsOf(enemyAdcP).map((i) => db.name(i)).filter((n) => !TRINKETS.has(n)), kda: kdaOf(enemyAdcP) } : null,
    queue, reasons, cond_src: condSrc, ap_share: apShare, threats: threats.slice(0, 5),
    alerts: alerts.slice(0, 5), events, lane_items_raw: lane ? itemsOf(lane) : [], objectives,
    sup_upgrade: supUpgrade, orders, legend_seen: legendSeen, legend_ready: true,
    jg_seen: [...jgSeen], adc_seen: adcSeen, adc_dead: adcDead,
  };
}

function reasonText(item, view) {
  const why = (view.reasons || {})[item] || [];
  const parts = [];
  for (const k of why) {
    if (k === 'vs_lane') { if (view.lane) parts.push(`rush recomendado contra ${view.lane.champ}`); }
    else if (k === 'boots') parts.push('botas según el daño rival');
    else if (k === 'sup_item') parts.push('ítem de support (te da oro y wards)');
    else {
      const src = (view.cond_src || {})[k];
      let txt = REASON[k] || k;
      if (src && src.length) txt += ` (${src.slice(0, 3).join(', ')})`;
      parts.push(txt);
    }
  }
  return parts.join('; ') || 'parte de la build';
}

module.exports = { BUILD_RULES, SUP_SITU, LIVE_URL, analyzeGame, reasonText, playerChamp, spellKey, findMe, itemsOf, supportUpgrade, nextCannon, SUPPORT_ITEMS, SUPPORT_UPGRADED };
