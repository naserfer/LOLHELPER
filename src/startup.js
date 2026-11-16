'use strict';
// Arranque con Windows y bandeja (al lado del reloj).
//  - Al prender la PC, Windows abre el .exe con --oculta: la app arranca escondida y queda el ícono en la bandeja.
//  - Cerrar (X) la esconde en la bandeja: el overlay, los clips y el coach siguen andando. "Salir" la cierra de verdad.
//  - Si estaba escondida y empieza un champ select, la ventana aparece sola (sin robar el foco).
// El .exe portable corre desde una copia temporal que se borra al cerrar: para el arranque se registra el .exe
// original (PORTABLE_EXECUTABLE_FILE), no process.execPath.

const HIDDEN_ARG = '--oculta';

// Qué registrar en Windows. null = no tocar nada (desarrollo, pruebas o sin .exe).
function loginItem({ enabled, portableExe, packaged }) {
  if (!packaged || !portableExe) return null;
  return { openAtLogin: !!enabled, path: portableExe, args: [HIDDEN_ARG] };
}

// Ajustes por defecto: arranca con Windows y se esconde en la bandeja (pedido del usuario).
const DEFAULTS = { arranque_windows: true, bandeja: true, mostrar_en_champ: true };
const setting = (settings, key) => (settings && settings[key] !== undefined ? settings[key] !== false : DEFAULTS[key]);

// ¿Hay que mostrar la ventana escondida? Solo al pasar de "no champ select" a "champ select".
function shouldPopUp({ hidden, wasSelect, isSelect, settings }) {
  return !!(hidden && isSelect && !wasSelect && setting(settings, 'mostrar_en_champ'));
}

module.exports = { HIDDEN_ARG, loginItem, DEFAULTS, setting, shouldPopUp };
