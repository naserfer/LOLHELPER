'use strict';
const { norm, Counter, cmpTuple } = require('./util');

// Ítems de Data Dragon: id -> datos, nombre -> id (Grieta del Invocador).
class ItemDB {
  constructor(itemsJson) {
    this.items = new Map();
    this.allow = null; // nombres (norm) de data/items.json; null = sin lista (pruebas de equivalencia)
    this.transforms = new Map();
    this.byName = new Map();
    for (const [sid, it] of Object.entries(itemsJson || {})) {
      const iid = parseInt(sid, 10);
      if (!Number.isFinite(iid) || String(iid) !== sid) continue;
      this.items.set(iid, it);
      const onSr = (it.maps || {})['11'] !== undefined ? it.maps['11'] : true;
      const buyable = (it.gold || {}).purchasable !== undefined ? it.gold.purchasable : true;
      const key = norm(it.name);
      if (onSr && buyable && iid < 10000) {
        if (!this.byName.has(key) || iid < this.byName.get(key)) this.byName.set(key, iid);
      } else if (!this.byName.has(key) && !this.byName.has('~' + key)) {
        this.byName.set('~' + key, iid);
      }
    }
  }
  idOf(name) {
    const k = norm(name);
    if (this.byName.get(k)) return this.byName.get(k);
    return this.byName.get('~' + k) ?? null;
  }
  // Lista fija de ítems vigentes (data/items.json), mantenida a mano.
  setList(list) {
    if (!list || !list.items) return this;
    this.allow = new Set(Object.values(list.items).map(norm));
    this.transforms = new Map(Object.entries(list.transforms || list.transforma || {}).map(([k, v]) => [norm(k), v]));
    return this;
  }
  // Ítem que hay que comprar para llegar a name (Diadem of Songs -> Whispering Circlet).
  toBuy(name) { return this.transforms.get(norm(name)) || name; }
  // ¿Se puede recomendar comprarlo? Con lista: tiene que estar en ella y ser comprable en la Grieta.
  buyable(name) {
    if (!this.allow) return this.idOf(name) !== null;
    const k = norm(name);
    return this.allow.has(k) && !!this.byName.get(k);
  }
  name(iid) { return (this.items.get(iid) || {}).name || `#${iid}`; }
  total(iid) { return ((this.items.get(iid) || {}).gold || {}).total || 0; }
  base(iid) { return ((this.items.get(iid) || {}).gold || {}).base || 0; }
  comps(iid) { return ((this.items.get(iid) || {}).from || []).map((x) => parseInt(x, 10)); }
  tags(iid) { return new Set((this.items.get(iid) || {}).tags || []); }
  isBoots(iid) { return this.tags(iid).has('Boots'); }
  isLegendary(iid) {
    const it = this.items.get(iid) || {};
    return this.total(iid) >= 2200 && !(it.into && it.into.length) && !this.isBoots(iid);
  }
  // Oro que falta para tener iid, consumiendo componentes del inventario (Counter, se modifica).
  remaining(iid, inv) {
    if (inv.g(iid) > 0) { inv.set(iid, inv.g(iid) - 1); return 0; }
    const comps = this.comps(iid);
    if (!comps.length) return this.total(iid);
    let s = this.base(iid);
    for (const c of comps) s += this.remaining(c, inv);
    return s;
  }
  _parts(item, inv) {
    const w = new Counter(inv);
    const out = [];
    for (const c of this.comps(item)) {
      const r = this.remaining(c, w);
      if (r > 0) out.push([r, c]);
    }
    return out;
  }
  // Qué comprar ahora para avanzar hacia target. Devuelve [ids, oroQueFalta, costo].
  planPurchase(target, inv, gold) {
    const need = this.remaining(target, new Counter(inv));
    if (need <= gold) return [[target], 0, need];
    let frontier = [target];
    for (let k = 0; k < 3; k++) {
      let cands = [];
      for (const it of frontier) cands = cands.concat(this._parts(it, inv));
      if (!cands.length) break;
      cands.sort((a, b) => cmpTuple(b, a));
      const buy = [];
      let spend = 0;
      let w = new Counter(inv);
      for (const [, c] of cands) {
        const trial = new Counter(w);
        const r = this.remaining(c, trial);
        if (r > 0 && spend + r <= gold) { buy.push(c); spend += r; w = trial; }
      }
      if (buy.length) return [buy, 0, spend];
      frontier = cands.map(([, c]) => c);
    }
    const cands = this._parts(target, inv);
    let deeper = [];
    for (const [, c] of cands) deeper = deeper.concat(this._parts(c, inv));
    const pool = deeper.length ? deeper : cands;
    if (!pool.length) return [[], Math.max(0, need - gold), need];
    const [r, c] = pool.slice().sort(cmpTuple)[0];
    return [[c], r - gold, r];
  }
}

module.exports = { ItemDB };
