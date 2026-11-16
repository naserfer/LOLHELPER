// Uso: node tools/datos/mauri/build_lolalytics.js → data/mauri_lolalytics.json
// raw_lolalytics.txt: una línea por página de Lolalytics (16.22), "campeón|rol|vs_rol|tier=...".
//   mismo rol (jungla vs jungla, mid vs mid): "rival:wr:Δ2:partidas"  (todas las que lista Lolalytics, 100+ partidas)
//   contra otra línea (jungla vs top/mid/bot, mid vs jungla): "rival:Δ2:partidas" (solo 300+ partidas y |Δ2| ≥ 1)
// URL: https://lolalytics.com/lol/<campeón>/counters/?lane=<rol>&vslane=<vs_rol>&tier=<tier>
const fs = require('fs');
const path = require('path');
const NAME = { udyr: 'Udyr' };
const ROLE = { jungle: 'jungle', middle: 'mid' };
const out = {
  patch: '16.22',
  fuente: 'Lolalytics (https://lolalytics.com/lol/<campeón>/counters/?lane=<rol>&vslane=<rival>&tier=<tier>)',
  nota: 'same: mismo rol, [wr, Δ2, partidas] por tier (emerald_plus = mismo nivel que op.gg; master_plus = menos partidas, otro nivel). lanes: tu campeón contra el que juega cada línea, [Δ2, partidas] en Emerald+.',
  same: {}, lanes: {},
};
for (const line of fs.readFileSync(path.join(__dirname, 'raw_lolalytics.txt'), 'utf8').trim().split('\n')) {
  const [head, rest] = line.split('=');
  const [c, lane, vs, tier] = head.split('|');
  const key = `${NAME[c]}|${ROLE[lane]}`;
  const rows = {};
  for (const e of rest.split(';')) {
    const p = e.split(':');
    if (lane === vs) rows[p[0]] = [+p[1], +p[2], +p[3]];
    else rows[p[0]] = [+p[1], +p[2]];
  }
  if (lane === vs) (out.same[key] = out.same[key] || {})[tier] = rows;
  else (out.lanes[key] = out.lanes[key] || {})[vs] = rows;
}
fs.writeFileSync(path.join(__dirname, '..', '..', '..', 'data', 'mauri_lolalytics.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out.same), Object.keys(out.lanes).map((k) => `${k}: ${Object.keys(out.lanes[k])}`));
