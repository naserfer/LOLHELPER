'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ph', {
  on: (ch, fn) => ipcRenderer.on(ch, (e, data) => fn(data)),
  win: (cmd) => ipcRenderer.send('win', cmd),
  settings: (patch) => ipcRenderer.send('settings', patch),
  ready: (who) => ipcRenderer.send('ready', who || 'main'),
  hudLayout: (l) => ipcRenderer.send('hud-layout', l),
  hud: (cmd) => ipcRenderer.send('hud', cmd),
  hudGrabCapture: (on) => ipcRenderer.send('hud-grab-capture', !!on),
  players: () => ipcRenderer.invoke('players'),
  choosePlayer: (id) => ipcRenderer.send('choose-player', id),
  chooseClose: () => ipcRenderer.send('choose-close'),
  switchPlayer: (id) => ipcRenderer.send('switch-player', id),
});
