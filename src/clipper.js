'use strict';
// Clips de muertes y jugadas (triple kill o más). El video vive en memoria (renderer/clipper.js); al disco solo van los clips.
//   clips/muertes/  → los de la última partida. Se borran solos al empezar la siguiente.
//   clips/jugadas/  → triples, cuádruples y pentas. Se guardan, con un tope (MAX_JUGADAS), los más viejos se borran.
const fs = require('fs');
const path = require('path');

const MAX_JUGADAS = 30;
const BEFORE_DEATH = 25000, AFTER_DEATH = 5000;
const BEFORE_MULTI = 20000, AFTER_MULTI = 4000;

const CONGRATS = {
  3: ['¡TRIPLE! Esto va directo al grupo de WhatsApp.', '¡Triple kill! Tres menos, ¿quién sigue?', '¡Triple! Hoy el ELO te debe una.'],
  4: ['¡CUÁDRUPLE! La próxima es penta, avisá antes.', '¡Quadra! Le faltó uno para el póster.', '¡Cuádruple! El chat no lo puede creer.'],
  5: ['¡PENTAKILL! Enmarcalo.', '¡PENTA! Esto va al resumen del año.', '¡PENTAKILL! Mandale el clip a tu mamá.'],
};
function congrats(n, seed) {
  const list = CONGRATS[Math.min(5, Math.max(3, n))];
  return list[Math.abs(Math.round(seed || 0)) % list.length];
}
const MULTI_NAME = { 3: 'Triple kill', 4: 'Cuádruple kill', 5: 'Pentakill' };

class Clipper {
  // deps: { dir, createWindow(): win con webContents.send, getSourceId(): Promise<id>, size(): {width,height}, log? }
  constructor(deps) {
    this.d = deps;
    this.dir = deps.dir;
    this.deaths = path.join(this.dir, 'muertes');
    this.plays = path.join(this.dir, 'jugadas');
    for (const p of [this.deaths, this.plays]) { try { fs.mkdirSync(p, { recursive: true }); } catch (e) { /* sin disco */ } }
    this.win = null;
    this.ready = false;
    this.game = null;          // clave de la partida que se está grabando
    this.status = { state: 'apagado' };
    this.pending = new Map();
    this.nextId = 1;
    this.queue = [];
  }

  // Mensajes desde la ventana oculta.
  onMessage(type, data) {
    if (type === 'ready') { this.ready = true; for (const q of this.queue.splice(0)) this._send(...q); }
    else if (type === 'status') {
      if (data.stopped) this.status = { state: 'apagado' };
      else if (data.ok) this.status = { state: 'grabando', hw: data.hw, width: data.width, height: data.height };
      else this.status = { state: 'sin-placa', reason: data.reason, error: data.error };
    } else if (type === 'clip') {
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (!data.ok) { p.resolve(null); return; }
      try {
        fs.writeFileSync(p.file, Buffer.from(data.bytes));
        if (p.meta) fs.writeFileSync(p.file.replace(/\.mp4$/, '.json'), JSON.stringify(Object.assign({ seconds: data.seconds }, p.meta)));
        if (p.kind === 'jugada') this.trimPlays();
        p.resolve(p.file);
      } catch (e) { p.resolve(null); }
    }
  }

  _send(type, data) {
    if (!this.win) this.win = this.d.createWindow();
    if (!this.ready) { this.queue.push([type, data]); return; }
    this.win.webContents.send('clipper', { type, data });
  }

  // Empieza una partida: borra los clips de muertes de la anterior y arranca el buffer en memoria.
  async startGame(key) {
    if (this.game === key) return;
    this.game = key;
    this.clearDeaths();
    try {
      const sourceId = await this.d.getSourceId();
      const { width, height } = this.d.size();
      this._send('start', { sourceId, width, height, fps: 30, bitrate: 6e6, allowSoftware: !!this.d.allowSoftware });
    } catch (e) { this.status = { state: 'sin-captura', error: String(e && e.message || e) }; }
  }

  endGame() {
    if (!this.game) return;
    this.game = null;
    this._send('stop', {});
  }

  clearDeaths() {
    try { for (const f of fs.readdirSync(this.deaths)) fs.unlinkSync(path.join(this.deaths, f)); } catch (e) { /* nada */ }
  }

  trimPlays() {
    try {
      const vids = fs.readdirSync(this.plays).filter((f) => f.endsWith('.mp4'))
        .map((f) => ({ f, t: fs.statSync(path.join(this.plays, f)).mtimeMs })).sort((a, b) => b.t - a.t);
      for (const { f } of vids.slice(MAX_JUGADAS)) {
        fs.unlinkSync(path.join(this.plays, f));
        const j = path.join(this.plays, f.replace(/\.mp4$/, '.json'));
        if (fs.existsSync(j)) fs.unlinkSync(j);
      }
    } catch (e) { /* nada */ }
  }

  // Pide un clip [fromWall, toWall]. Espera a que pase toWall (el buffer tiene que tener esos segundos).
  _clip(kind, file, fromWall, toWall, meta, now) {
    return new Promise((resolve) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, file, kind, meta });
      const wait = Math.max(0, toWall - (now || Date.now()));
      const go = () => this._send('clip', { id, fromWall, toWall });
      if (this.d.timer) this.d.timer(go, wait); else setTimeout(go, wait);
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); resolve(null); } }, wait + 20000);
    });
  }

  deathClip(gameT, wall, now) {
    if (!this.game || this.status.state !== 'grabando') return null;
    const name = deathName(gameT);
    this._clip('muerte', path.join(this.deaths, name), wall - BEFORE_DEATH, wall + AFTER_DEATH, null, now);
    return name;
  }

  multiClip(gameT, n, champ, wall, now) {
    if (!this.game || this.status.state !== 'grabando') return null;
    const stamp = new Date(wall).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const name = `jugada_${stamp}_${String(champ || 'x').replace(/[^A-Za-z]/g, '')}_${n}.mp4`;
    const meta = { kind: 'multi', n, champ, t: gameT, date: new Date(wall).toISOString(), title: MULTI_NAME[Math.min(5, n)] || `${n} kills`, msg: congrats(n, gameT) };
    this._clip('jugada', path.join(this.plays, name), wall - BEFORE_MULTI, wall + AFTER_MULTI, meta, now);
    return name;
  }

  // Jugadas guardadas (más nuevas primero).
  listPlays(limit = 10) {
    try {
      return fs.readdirSync(this.plays).filter((f) => f.endsWith('.json'))
        .map((f) => { try { return Object.assign({ file: f.replace(/\.json$/, '.mp4') }, JSON.parse(fs.readFileSync(path.join(this.plays, f), 'utf8'))); } catch (e) { return null; } })
        .filter((x) => x && fs.existsSync(path.join(this.plays, x.file)))
        .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, limit);
    } catch (e) { return []; }
  }

  hasDeathClip(name) { return !!name && fs.existsSync(path.join(this.deaths, name)); }

  // Ruta segura para pickhelper://clip/<muertes|jugadas>/<archivo>
  resolve(rel) {
    const m = /^(muertes|jugadas)\/([A-Za-z0-9_.-]+\.mp4)$/.exec(String(rel || ''));
    return m ? path.join(this.dir, m[1], m[2]) : null;
  }
}

const deathName = (gameT) => `muerte_${Math.round(gameT)}.mp4`;

module.exports = { Clipper, congrats, deathName, MAX_JUGADAS, BEFORE_DEATH, AFTER_DEATH, CONGRATS };
