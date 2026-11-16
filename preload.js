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
});
