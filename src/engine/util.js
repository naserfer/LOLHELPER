'use strict';
// Utilidades compartidas (equivalentes a lo que hacía Python).

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Counter de Python: Map con default 0.
class Counter extends Map {
  constructor(src) {
    super();
    if (src instanceof Map) for (const [k, v] of src) this.set(k, v);
    else if (Array.isArray(src)) for (const k of src) this.inc(k);
  }
  g(k) { return this.get(k) || 0; }
  inc(k, n = 1) { this.set(k, this.g(k) + n); }
}

// Compara tuplas como Python (números y strings).
function cmpTuple(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i], y = b[i];
    if (x === y) continue;
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    if (typeof x === 'boolean' || typeof y === 'boolean') return (x ? 1 : 0) - (y ? 1 : 0);
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x) < String(y) ? -1 : 1;
  }
  return 0;
}
const sortBy = (arr, key) => arr.sort((a, b) => cmpTuple(key(a), key(b)));
// Redondeo a 1 decimal como Python (empates al par).
function round1(x) {
  const y = x * 10;
  const f = Math.floor(y);
  if (y - f === 0.5 && y / 10 === x) return (f % 2 === 0 ? f : f + 1) / 10;   // empate exacto
  return Number(x.toFixed(1));
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

// PRNG con semilla (mulberry32) para que las pruebas de permutación sean reproducibles.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rnd) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { norm, Counter, cmpTuple, sortBy, round1, clamp, rng, shuffle };
