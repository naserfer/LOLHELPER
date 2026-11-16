'use strict';
// API local del cliente de League (LCU) y API en vivo del juego. Solo lectura.
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// Certificado autofirmado de Riot: solo se acepta para 127.0.0.1.
const agent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

const LOCKFILES = [
  'C:\\Riot Games\\League of Legends\\lockfile',
  'D:\\Riot Games\\League of Legends\\lockfile',
  'C:\\Program Files\\Riot Games\\League of Legends\\lockfile',
  '/Applications/League of Legends.app/Contents/LoL/lockfile',
];

function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 6000, windowsHide: true, maxBuffer: 4 << 20 }, (err, out) => resolve(err ? '' : String(out)));
  });
}

async function findCredentials() {
  // LOL_PATH pisa todo: si está, no se busca el cliente de verdad (las pruebas usan uno falso).
  if (process.env.LOL_PATH) {
    try {
      const parts = fs.readFileSync(path.join(process.env.LOL_PATH, 'lockfile'), 'utf8').trim().split(':');
      if (parts.length >= 4) return [parts[2], parts[3]];
    } catch (e) { /* el falso ya cerró */ }
    return null;
  }
  let out = '';
  if (process.platform === 'win32') {
    out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"name='LeagueClientUx.exe'\" | Select-Object -ExpandProperty CommandLine"]);
  } else {
    out = await run('ps', ['-A', '-o', 'command']);
  }
  const port = /--app-port=(\d+)/.exec(out);
  const token = /--remoting-auth-token=([\w-]+)/.exec(out);
  if (port && token) return [port[1], token[1]];
  const paths = LOCKFILES.slice();
  if (process.env.LOL_PATH) paths.unshift(path.join(process.env.LOL_PATH, 'lockfile'));
  for (const p of paths) {
    try {
      const parts = fs.readFileSync(p, 'utf8').trim().split(':');
      if (parts.length >= 4) return [parts[2], parts[3]];
    } catch (e) { /* siguiente */ }
  }
  return null;
}

function request(url, headers = {}, timeout = 3000, raw = false) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { agent, headers, timeout }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (res.statusCode === 404) return resolve(null);
        if (res.statusCode >= 400) return reject(Object.assign(new Error(`HTTP ${res.statusCode}`), { status: res.statusCode }));
        if (raw) return resolve({ buf, type: res.headers['content-type'] || 'image/png' });
        try { resolve(buf.length ? JSON.parse(buf.toString('utf8')) : null); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

class LCU {
  constructor() { this.port = null; this.auth = null; this.lastTry = 0; }
  async connect() {
    // Buscar el cliente cuesta (PowerShell): como mucho una vez cada 5 segundos.
    if (Date.now() - this.lastTry < 5000) return false;
    this.lastTry = Date.now();
    const c = await findCredentials();
    if (!c) { this.port = null; return false; }
    [this.port] = c;
    this.auth = Buffer.from(`riot:${c[1]}`).toString('base64');
    return true;
  }
  async get(p) {
    if (!this.port && !(await this.connect())) throw Object.assign(new Error('Cliente de League no encontrado'), { offline: true });
    try {
      return await request(`https://127.0.0.1:${this.port}${p}`, { Authorization: `Basic ${this.auth}`, Accept: 'application/json' });
    } catch (e) {
      if (e.status) throw e;
      this.port = null;
      throw Object.assign(new Error('Cliente de League no encontrado'), { offline: true });
    }
  }
  async raw(p) {
    try {
      if (!this.port && !(await this.connect())) return null;
      return await request(`https://127.0.0.1:${this.port}${p}`, { Authorization: `Basic ${this.auth}` }, 6000, true);
    } catch (e) { return null; }
  }
}

const LIVE_URL = 'https://127.0.0.1:2999/liveclientdata/allgamedata';
async function liveGame() {
  try {
    const d = await request(LIVE_URL, {}, 3000);
    return d && d.allPlayers ? d : null;
  } catch (e) { return null; }
}

module.exports = { LCU, liveGame, request };
