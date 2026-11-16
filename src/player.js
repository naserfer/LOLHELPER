'use strict';
// Quién usa la app (Naser o Bitty). Un solo .exe: la primera vez se pregunta y se guarda.
// La elección vive en %APPDATA%\Pick Helper\jugador.json. Cada jugador mantiene su carpeta de datos de siempre:
//   naser → %APPDATA%\Pick Helper        bitty → %APPDATA%\Pick Helper Bitty
// así nadie pierde historial ni grabaciones (no se cambia productName ni appId).
const fs = require('fs');
const path = require('path');

const PLAYERS = {
  naser: { dir: 'Pick Helper' },
  bitty: { dir: 'Pick Helper Bitty' },
};

const choiceFile = (appData) => path.join(appData, 'Pick Helper', 'jugador.json');

function readChoice(appData) {
  try {
    const id = JSON.parse(fs.readFileSync(choiceFile(appData), 'utf8')).id;
    return PLAYERS[id] ? id : null;
  } catch (e) { return null; }
}

function saveChoice(appData, id) {
  if (!PLAYERS[id]) throw new Error(`jugador desconocido: ${id}`);
  const f = choiceFile(appData);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  // Merge, como los ajustes: nunca perder otras claves que se agreguen después.
  let prev = {};
  try { prev = JSON.parse(fs.readFileSync(f, 'utf8')) || {}; } catch (e) { /* nuevo */ }
  fs.writeFileSync(f, JSON.stringify(Object.assign(prev, { id, elegido: new Date().toISOString() }), null, 1));
}

// Orden: PH_PROFILE (desarrollo/pruebas) > lo elegido > el perfil con el que se armó el .exe si no es el de Naser
// (un PickHelper-Bitty.exe viejo sigue siendo de Bitty) > null (hay que preguntar).
function resolve({ appData, env, builtId }) {
  if (env && env.PH_PROFILE && PLAYERS[env.PH_PROFILE]) return { id: env.PH_PROFILE, ask: false };
  const saved = readChoice(appData);
  if (saved) return { id: saved, ask: false };
  if (builtId && builtId !== 'naser' && PLAYERS[builtId]) return { id: builtId, ask: false };
  return { id: null, ask: true };
}

const userDataFor = (appData, id) => path.join(appData, PLAYERS[id].dir);

module.exports = { PLAYERS, resolve, readChoice, saveChoice, choiceFile, userDataFor };
