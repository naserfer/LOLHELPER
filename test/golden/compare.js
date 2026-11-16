// Compara la versión JS con la versión Python (mismos datos de entrada).
const fs = require('fs');
const path = require('path');
const { Counter, norm } = require('../../src/engine/util');
const { ItemDB } = require('../../src/engine/itemdb');
const select = require('../../src/engine/select');
const ingame = require('../../src/engine/ingame');
const history = require('../../src/engine/history');
const PY = JSON.parse(fs.readFileSync(path.join(__dirname, 'py_out.json'), 'utf8'));
const items = JSON.parse(fs.readFileSync('test/golden/items_golden.json', 'utf8'));
const db = new ItemDB(items);
const top = JSON.parse(fs.readFileSync('data/pool.json', 'utf8')).pool;
const sp = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));
const alias = {}, dmg = {};
for (const [n, d] of [['Malphite','AP'],['Darius','AD'],['Master Yi','AD'],['Seraphine','AP'],['Miss Fortune','AD'],["Kai'Sa",'MIX'],
  ['Lee Sin','AD'],['Ahri','AP'],['Jinx','AD'],['Leona','AD'],['Garen','AD'],['Illaoi','AD'],['Rell','AD'],['Orianna','AP'],['Thresh','AD']]) { alias[norm(n)] = n; dmg[norm(n)] = d; }

let fails = 0, total = 0;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function near(a, b) { // números con tolerancia, el resto exacto
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-6;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => near(x, b[i]));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a).filter((k) => a[k] !== undefined).sort(), kb = Object.keys(b).filter((k) => b[k] !== undefined).sort();
    return eq(ka, kb) && ka.every((k) => near(a[k], b[k]));
  }
  return a === b;
}
function check(name, js, py) { total++; if (!near(js, py)) { fails++; if (fails < 12) console.log('DIF', name, '\n  js:', JSON.stringify(js).slice(0, 400), '\n  py:', JSON.stringify(py).slice(0, 400)); } }

for (const c of PY.select) {
  const champs = c.champs;
  const v = c.mode === 'support'
    ? select.analyzeSupport(c.session, champs, sp.pool, sp.dyn, sp.arch_label, sp.adc_arch, c.personal)
    : select.analyzeTop(c.session, champs, top);
  const out = { lane_enemy: v.lane_enemy, ban_sugg: v.ban_sugg, ally_adc: v.ally_adc === undefined ? null : v.ally_adc,
    enemy_adc: v.enemy_adc === undefined ? null : v.enemy_adc,
    recs: v.recs.map((r) => [r.name, r.score, r.status, (r.syn || [null])[0]]), focus: v.focus ? v.focus.name : null,
    guide: v.focus ? (c.mode === 'support' ? v.focus.guide : undefined) || null : null, build_key: v.build_key };
  const py = Object.assign({}, c.out);
  if (c.mode !== 'support') { py.guide = null; out.guide = null; }
  check(`select ${c.name}`, out, py);
}
for (const [i, c] of PY.game.entries()) {
  const v = ingame.analyzeGame(c.g, top.concat(sp.pool), db, dmg, alias, null, {}, [sp.pool, sp.dyn]);
  const out = v === null ? null : { buy: v.buy, queue: v.queue, alerts: v.alerts, lane: (v.lane || {}).champ || null,
    threats: v.threats.map((t) => t.name), ap_share: Math.round(v.ap_share * 1e6) / 1e6, guide: v.guide, enemy_adc: v.enemy_adc,
    reasons_target: v.buy ? ingame.reasonText(v.buy.target, v) : null };
  check(`game ${i}`, out, c.out);
}
for (const [i, c] of PY.plan.entries()) check(`plan ${i}`, db.planPurchase(c.t, new Counter(c.inv), c.gold), c.out);
const H = PY.history;
const s = history.summarize(H.games, 'me-puuid', (cid) => H.CH[cid] || '?');
check('history', { games: s.games, wins: s.wins, mates: s.mates, champs: s.champs, with_adc: s.with_adc, pairs: s.pairs, roles: s.roles }, H.out);
console.log(`golden: ${total - fails}/${total} iguales a la versión Python`);
console.log('reglas py:', JSON.stringify(H.rules), '\nreglas js:', JSON.stringify(s.rules.map((r) => [r.key, r.dir, r.t, Math.round(r.gap * 1000) / 1000, r.conf])));
process.exit(fails ? 1 : 0);
