'use strict';
// Data Dragon (datos oficiales de Riot) con caché en disco. Los íconos los muestra el navegador
// de Electron directo desde la CDN (queda en su caché) o desde el cliente vía pickhelper://lcu/...
const fs = require('fs');
const path = require('path');
const { norm } = require('./util');
const { ItemDB } = require('./itemdb');

const DD = 'https://ddragon.leagueoflegends.com';

class DataDragon {
  constructor(dir) {
    this.dir = dir;
    this.version = null;
    this.champs = {};
    this.alias = {};
    this.dmgByName = {};
    this.itemdb = new ItemDB({});
    this.urls = {};
    this.ready = false;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* ignorar */ }
  }
  async cached(fname, url, maxAgeMs) {
    const p = path.join(this.dir, fname);
    try {
      const st = fs.statSync(p);
      if (Date.now() - st.mtimeMs < maxAgeMs) return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { /* no está */ }
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const data = await r.json();
      fs.writeFileSync(p, JSON.stringify(data));
      return data;
    } catch (e) {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
      throw e;
    }
  }
  key(kind, name) { return `${kind}:${norm(name)}`; }
  url(kind, name) { return this.urls[this.key(kind, name)] || null; }

  // Carga desde un objeto ya armado (pruebas / sin internet).
  loadFrom({ version, champion, item, summoner, runes }) {
    this.version = version;
    const v = version;
    for (const c of Object.values(champion.data)) {
      const a = c.info.attack, m = c.info.magic;
      const kind = Math.abs(a - m) <= 1 && Math.min(a, m) >= 4 ? 'MIX' : m > a ? 'AP' : 'AD';
      this.champs[parseInt(c.key, 10)] = { name: c.name, dmg: kind };
      this.alias[norm(c.id)] = c.name;
      this.alias[norm(c.name)] = c.name;
      this.dmgByName[norm(c.name)] = kind;
      this.urls[this.key('champion', c.name)] = `${DD}/cdn/${v}/img/champion/${c.image.full}`;
    }
    this.itemdb = new ItemDB(item.data);
    for (const it of Object.values(item.data)) {
      const best = this.itemdb.idOf(it.name);
      if (best !== null) this.urls[this.key('item', it.name)] = `${DD}/cdn/${v}/img/item/${best}.png`;
    }
    for (const s of Object.values((summoner || { data: {} }).data)) {
      const u = `${DD}/cdn/${v}/img/spell/${s.image.full}`;
      this.urls[this.key('spell', s.name)] = u;
      this.urls[this.key('spell', s.id)] = u;
    }
    for (const tree of runes || []) {
      this.urls[this.key('rune', tree.name)] = `${DD}/cdn/img/${tree.icon}`;
      for (const slot of tree.slots) for (const r of slot.runes) this.urls[this.key('rune', r.name)] = `${DD}/cdn/img/${r.icon}`;
    }
    this.ready = true;
  }

  async load() {
    const versions = await this.cached('versions.json', `${DD}/api/versions.json`, 6 * 3600e3);
    const v = versions[0];
    const [champion, item, summoner, runes] = await Promise.all([
      this.cached(`champion_${v}.json`, `${DD}/cdn/${v}/data/en_US/champion.json`, 1e12),
      this.cached(`item_${v}.json`, `${DD}/cdn/${v}/data/en_US/item.json`, 1e12),
      this.cached(`summoner_${v}.json`, `${DD}/cdn/${v}/data/en_US/summoner.json`, 1e12),
      this.cached(`runes_${v}.json`, `${DD}/cdn/${v}/data/en_US/runesReforged.json`, 1e12),
    ]);
    this.loadFrom({ version: v, champion, item, summoner, runes });
    // Borrar datos de parches viejos.
    try {
      for (const f of fs.readdirSync(this.dir)) if (/_\d+\.\d+\.\d+\.json$/.test(f) && !f.includes(`_${v}.json`)) fs.unlinkSync(path.join(this.dir, f));
    } catch (e) { /* ignorar */ }
  }

  // Íconos de ítems con el arte actual del propio cliente (si está abierto).
  async useClientItemIcons(lcu) {
    try {
      const data = (await lcu.get('/lol-game-data/assets/v1/items.json')) || [];
      const byId = new Map(data.filter((it) => it.iconPath).map((it) => [it.id, it.iconPath]));
      let n = 0;
      for (const [iid, it] of this.itemdb.items) {
        if (this.itemdb.idOf(it.name) === iid && byId.has(iid)) {
          this.urls[this.key('item', it.name)] = `pickhelper://lcu${byId.get(iid)}`;
          n++;
        }
      }
      return n;
    } catch (e) { return 0; }
  }

  // Mapa de íconos que necesita una vista (se manda junto con la vista al renderer).
  iconsFor(names) {
    const out = {};
    for (const [kind, name] of names) {
      const u = this.url(kind, name);
      if (u) out[this.key(kind, name)] = u;
    }
    return out;
  }
}

module.exports = { DataDragon, DD };
