// Datos de prueba para ver la pantalla de coach sin un cliente real (solo con --coach-fixture).
const fs = require('fs');
const path = require('path');
const history = require('../src/engine/history');
const { rng } = require('../src/engine/util');

function install(engine, mode) {
  const PY = JSON.parse(fs.readFileSync(path.join(__dirname, 'golden', 'py_out.json'), 'utf8'));
  const H = PY.history;
  engine.history.summary = history.summarize(H.games, 'me-puuid', (cid) => H.CH[cid] || '?');
  engine.history.state = 'ok';
  engine.history.version = 1;
  engine.history.refresh = async () => false;
  const dir = engine.recorder.dir;
  for (const f of fs.readdirSync(dir)) fs.unlinkSync(path.join(dir, f));
  const r = rng(4);
  const n = mode === 'few' ? 7 : 26;
  const champs = ['Thresh', 'Leona', 'Lulu', 'Nautilus'];
  for (let i = 0; i < n; i++) {
    const d14 = Math.floor(r() * 4);
    const win = r() < (d14 <= 1 ? 0.75 : 0.3);
    const deaths = [];
    const nd = d14 + Math.floor(r() * 4);
    for (let k = 0; k < nd; k++) {
      const t = k < d14 ? 200 + r() * 600 : 900 + r() * 900;
      const kind = r();
      deaths.push({ t: Math.round(t), gold: kind < 0.35 ? 1100 + Math.round(r() * 900) : Math.round(r() * 700), my_level: 7,
        killer_type: kind > 0.92 ? 'turret' : 'champion',
        attackers: kind > 0.55 && kind < 0.8 ? [{ champ: 'Lee Sin', level: 8, jungle: true }, { champ: "Kai'Sa", level: 8, jungle: false }]
          : [{ champ: "Kai'Sa", level: kind > 0.8 && kind <= 0.92 ? 10 : 7, jungle: false }],
        adc_died_before: kind > 0.45 && kind < 0.55 ? 4 : null, objective_near: kind > 0.4 && kind < 0.45 });
    }
    const rec = { v: 1, id: `g${9000 + i}`, gameId: 9000 + i, champ: champs[i % 4], start_wall: Date.now() - (i + 1) * 3600e3,
      first_t: 15, last_t: 1800, max_gap: 3, cw_bought: 3, item1: 12 + r() * 6,
      snap14: { d14, kp14: 30 + r() * 40, vis14: 14 + r() * 14 + (win ? 4 : 0), cw14: Math.floor(r() * 4), gold14: 3600 + r() * 1400,
        dg14: deaths.filter((d) => d.t < 840 && d.gold >= 1000).length },
      deaths, adc_deaths: [], objectives: [], win, duration: 1800 };
    if (i === 0) { rec.win = false; }
    fs.writeFileSync(path.join(dir, `${rec.id}.json`), JSON.stringify(rec));
  }
  engine.computeCoach(true);
}
module.exports = { install };
