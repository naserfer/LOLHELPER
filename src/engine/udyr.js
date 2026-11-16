'use strict';
// Udyr (Mauri): ¿AD o AP? Lo que más le cuesta decidir. Se elige por la partida y se explica el porqué.
//  - AD (subís Q, Wilding Claw): daño físico por % de vida máxima y velocidad de ataque. Duelos, objetivos, llegar a carries.
//  - AP (subís R, Wingborne Storm): tormenta mágica en área que ralentiza, más escudo de W, Liandry's quema % de vida.
//    Peleas de equipo metido en el medio, más aguante.
// Criterios (ANÁLISIS, por el kit; en orden de peso):
//  1. Daño de tu equipo (2 puntos): si todos pegan físico, el rival se arma armadura y listo → AP. Si ya hay mucho AP → AD.
//  2. Rivales (1 punto): casi sin tanques ni peleadores → AD (llegás con E y los matás con Q).
//     Mucho cuerpo a cuerpo que se te tira encima → AP (la R les pega a todos y la build AP te hace más tanque).
//  3. Empate → AD: es la más jugada (op.gg Emerald+) y las dos rinden parecido.
// En partida, si ya empezaste un camino (tenés un ítem o componente de AD o de AP), se sigue ese: no se cambia a mitad.
const { norm } = require('./util');

// Junglas, tops y supports que pelean adelante (tanques y peleadores cuerpo a cuerpo).
const FRONT = new Set(['Malphite', 'Ornn', 'Sion', 'Maokai', 'Zac', 'Sejuani', 'Amumu', 'Rammus', 'Nunu & Willump', 'Cho\'Gath',
  'Dr. Mundo', 'Shen', 'Poppy', 'K\'Sante', 'Tahm Kench', 'Skarner', 'Gragas', 'Alistar', 'Leona', 'Nautilus', 'Braum', 'Rell',
  'Taric', 'Galio', 'Volibear', 'Warwick', 'Darius', 'Garen', 'Sett', 'Mordekaiser', 'Illaoi', 'Aatrox', 'Renekton', 'Olaf',
  'Trundle', 'Jax', 'Fiora', 'Irelia', 'Camille', 'Riven', 'Yorick', 'Nasus', 'Tryndamere', 'Wukong', 'Hecarim', 'Vi', 'Xin Zhao',
  'Jarvan IV', 'Lee Sin', 'Viego', 'Briar', 'Udyr', 'Ambessa', 'Zaahen', 'Gwen', 'Kled', 'Urgot', 'Singed', 'Pantheon', 'Yone',
  'Yasuo', 'Diana', 'Rek\'Sai', 'Bel\'Veth', 'Gnar', 'Thresh', 'Blitzcrank', 'Pyke', 'Rakan', 'Swain']);

const ITEMS = {
  AD: ['Spear of Shojin', 'Experimental Hexplate', "Death's Dance"],
  AP: ["Liandry's Torment", "Dead Man's Plate", 'Spirit Visage'],
};
const SKILLS = { AD: ['Q', 'E', 'W'], AP: ['R', 'E', 'Q'] };

// Por qué cada camino, por el kit (wiki de LoL). Se muestra siempre en champ select.
const EXPLAIN = {
  AD: 'AD (subís Q): tu Q pega físico por % de vida máxima y te da velocidad de ataque. Ganás duelos 1v1, matás dragón y heraldo más rápido y llegás a sus carries con E (stun).',
  AP: 'AP (subís R): tu R es una tormenta mágica alrededor tuyo que les pega a todos y los ralentiza, tu W da más escudo y Liandry\'s los quema por % de vida. Rendís en peleas de equipo, metido en el medio, y aguantás más.',
};
// Datos (op.gg Emerald+, ítems de Udyr jungla, 16.22). Solo en champ select: en partida no hay números.
const DATA_LINE = 'En op.gg Emerald+ las dos rinden parecido: Spear of Shojin (AD) 51,9% en 20.974 partidas, la más jugada; Liandry\'s Torment (AP) 50,9% en 10.692. No hay una build que gane siempre: la decide tu partida.';

const dmgOf = (x) => (x && x.dmg) || 'AD';

// allies / enemies: [{ name, dmg: 'AD'|'AP'|'MIX'|'?' }] (sin vos). started: 'AD' | 'AP' | null (ya empezó un camino).
function decide({ allies = [], enemies = [], started = null } = {}) {
  const reasons = [];
  let ap = 0, ad = 0;
  const known = allies.filter((a) => a && a.name && dmgOf(a) !== '?');
  const allyAp = known.reduce((s, a) => s + (dmgOf(a) === 'AP' ? 1 : dmgOf(a) === 'MIX' ? 0.5 : 0), 0);
  const apNames = known.filter((a) => dmgOf(a) === 'AP').map((a) => a.name);
  const adNames = known.filter((a) => dmgOf(a) === 'AD').map((a) => a.name);
  if (known.length >= 2) {
    if (allyAp <= 0.5) {
      ap += 2;
      reasons.push({ side: 'AP', txt: `Tu equipo pega casi todo físico (${adNames.slice(0, 4).join(', ')}): si vos también vas AD, al rival le alcanza con armadura. Tu daño mágico los obliga a armarse de las dos cosas.` });
    } else if (allyAp >= 2.5 || (known.length <= 3 && allyAp >= 2)) {
      ad += 2;
      reasons.push({ side: 'AD', txt: `Tu equipo ya tiene mucho daño mágico (${apNames.slice(0, 4).join(', ')}): con AD equilibrás el daño y no les sirve armarse solo de resistencia mágica.` });
    } else {
      reasons.push({ side: null, txt: 'El daño de tu equipo está equilibrado: esto no define la build.' });
    }
  }
  const foes = enemies.filter((e) => e && e.name);
  const front = foes.filter((e) => FRONT.has(e.name)).map((e) => e.name);
  if (foes.length >= 3) {
    if (front.length <= 1) {
      ad += 1;
      reasons.push({ side: 'AD', txt: `Casi no tienen tanques ni peleadores${front.length ? ` (solo ${front[0]})` : ''}: con E llegás a sus carries y con Q los matás en pocos autos.` });
    } else if (front.length >= 3) {
      ap += 1;
      reasons.push({ side: 'AP', txt: `Tienen mucho cuerpo a cuerpo que pelea encima tuyo (${front.slice(0, 4).join(', ')}): la R les pega a todos alrededor tuyo y la build AP te hace más tanque.` });
    }
  }

  let path = ap > ad ? 'AP' : 'AD';
  let locked = false;
  if (started === 'AD' || started === 'AP') {
    locked = true;
    if (started !== path && (ap !== ad)) reasons.push({ side: started, txt: `Ya empezaste ${started}: seguí ese camino; cambiar a mitad te deja con ítems que no sirven.` });
    path = started;
  }
  const tie = ap === ad && !locked;
  if (tie) reasons.push({ side: 'AD', txt: 'Sin una razón clara para AP, AD es la más jugada y la más simple de pilotear.' });
  const main = reasons.find((r) => r.side === path) || null;
  const short = main ? main.txt.split(':')[0].replace(/ \([^)]*\)/g, '').replace(/\.$/, '') : '';
  const head = `Armá ${path}${short ? `: ${short.charAt(0).toLowerCase()}${short.slice(1)}.` : '.'}`;
  return {
    path, locked, tie, score: { AD: ad, AP: ap }, reasons, head,
    hud: locked ? `Seguí ${path}: subí ${SKILLS[path][0]} primero.` : `Armá ${path} (subí ${SKILLS[path][0]}): ${short ? short.charAt(0).toLowerCase() + short.slice(1) : 'la más jugada'}.`,
    items: ITEMS[path], skills: SKILLS[path], explain: EXPLAIN, data: DATA_LINE,
  };
}

// Qué camino ya empezó, mirando los ítems (nombres) y sus etiquetas de Data Dragon.
// tagsOf(nombre) → Set de etiquetas. SpellDamage = AP; Damage (AD) = AD. Ninguno → null.
function startedPath(itemNames, tagsOf) {
  let ad = 0, ap = 0;
  for (const n of itemNames || []) {
    const t = tagsOf(n) || new Set();
    if (t.has('SpellDamage')) ap++;
    else if (t.has('Damage')) ad++;
  }
  return ap > ad ? 'AP' : ad > ap ? 'AD' : null;
}

// Para la UI: sin números (en partida).
function forGame(d) {
  if (!d) return null;
  return { path: d.path, locked: d.locked, head: d.head, hud: d.hud, items: d.items, skills: d.skills,
    reasons: d.reasons.filter((r) => r.side === d.path), explain: d.explain };
}

const isUdyr = (name) => norm(name) === 'udyr';

module.exports = { decide, startedPath, forGame, isUdyr, FRONT, ITEMS, SKILLS, EXPLAIN, DATA_LINE };
