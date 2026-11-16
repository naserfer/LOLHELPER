// Plan de bot lane (support–ADC). Pruebas pensadas para fallar si la idea está mal.
const fs = require('fs');
const botlane = require('../src/engine/botlane');
const select = require('../src/engine/select');
const { hudPayload } = require('../src/hud');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const SUP = JSON.parse(fs.readFileSync('data/pool_support.json', 'utf8'));
const BOT = botlane.BOT;
const cfg = (n) => SUP.pool.find((c) => c.name === n);
const live = (me, adc, es, ea) => select.botPlanLive(SUP.pool, SUP.adc_arch, me, adc, es, ea);

// --- Datos: cada número tiene fuente y muestra
ok(Object.keys(BOT.vs_adc).length === SUP.pool.length, `hay datos vs ADC (Lolalytics) para los ${SUP.pool.length} supports`);
const rows = Object.values(BOT.vs_adc).flatMap((r) => Object.values(r));
ok(rows.every(([d, g]) => g >= 400 && Math.abs(d) >= 1), 'solo cruces con 400+ partidas y efecto de al menos 1 punto');
ok(/lolalytics\.com/.test(BOT.fuentes.vs_adc) && /Data Dragon/.test(BOT.fuentes.rango) && /[Ww]iki/.test(BOT.fuentes.kits), 'cada dato dice de dónde sale');
ok(BOT.adc.Caitlyn.range === 650 && BOT.adc["Kog'Maw"].range === 500, 'rangos de ataque de Data Dragon 16.22.1');

// --- Fallbacks: no falla ni inventa
let p = botlane.plan({ me: cfg('Janna') });
ok(p && !p.known && p.missing.length >= 2 && !p.hud && p.threats.length === 0, `sin picks rivales: plan general, sin amenazas inventadas (${p.missing.join(' · ')})`);
ok(botlane.plan({ me: null }) === null, 'sin support: no hay plan');
p = live('Janna', 'ChampInventado', 'OtroInventado', 'Raro');
ok(p && !p.combo && p.threats.length === 0, 'campeones desconocidos: sin combo ni amenaza');
p = botlane.plan({ me: cfg('Thresh'), allyAdc: 'Jinx', enemyAdc: 'Draven' });
ok(p.missing.includes('falta el support rival') && p.threats.length === 1, 'si falta el support rival lo dice y solo usa lo que hay');

// --- El plan cambia con los picks
const a = live('Janna', 'Jinx', 'Leona', 'Draven');
const b = live('Janna', 'Jinx', 'Soraka', 'Kog\'Maw');
ok(a.hud !== b.hud, `cambia con la línea rival: "${a.hud}" vs "${b.hud}"`);
const c1 = live('Braum', 'Lucian', 'Nautilus', 'Ezreal');
const c2 = live('Braum', 'Ezreal', 'Nautilus', 'Ezreal');
ok(c1.combo && /Lucian/.test(c1.combo.txt) && /4/.test(c1.combo.txt), `Braum + ADC de autos: combo de la pasiva (${c1.combo && c1.combo.txt})`);
ok(!c2.combo, 'Braum + Ezreal (no vive de autos ni remata control): sin combo inventado');
const k = live('Blitzcrank', 'Kalista', 'Thresh', 'Caitlyn');
ok(k.combo && /Kalista/.test(k.combo.txt) && /gancho/.test(k.combo.txt), 'Blitz + Kalista: R de Kalista + tu gancho');
const j = live('Lux', 'Jhin', 'Nami', 'Ashe');
ok(j.combo && /Jhin/.test(j.combo.txt) && /Q \(raíz\)/.test(j.combo.txt), 'Lux + Jhin: tu raíz habilita su W');
const y = live('Lux', 'Yasuo', null, null);
ok(!y.combo, 'Yasuo solo remata levantamientos: con Lux (raíz) no hay combo');

// --- Datos usados: Lolalytics vs ADC mueve el estilo
const bad = botlane.plan({ me: cfg('Rell'), allyAdc: 'Jhin', enemySup: null, enemyAdc: 'Swain' });   // Δ2 −7,1
const good = botlane.plan({ me: cfg('Rell'), allyAdc: 'Jhin', enemySup: null, enemyAdc: 'Twitch' }); // Δ2 +2,4
ok(bad.score < good.score && bad.why.some((w) => w.ref === 'Lolalytics' && /Swain/.test(w.txt)), `el cruce con el ADC rival pesa (${bad.score} vs ${good.score})`);

// --- Historial: pocas partidas no cambian el plan
const base = botlane.plan({ me: cfg('Zilean'), allyAdc: 'Jinx', enemyAdc: 'Ashe' });
const few = botlane.plan({ me: cfg('Zilean'), allyAdc: 'Jinx', enemyAdc: 'Ashe', pair: { g: 3, w: 3 } });
const many = botlane.plan({ me: cfg('Zilean'), allyAdc: 'Jinx', enemyAdc: 'Ashe', pair: { g: 12, w: 10 } });
ok(few.score === base.score && few.why.some((w) => w.src === 'HISTORIAL' && /pocas partidas/.test(w.txt)), '3 partidas: se muestra tu récord pero no cambia el plan');
ok(many.score > base.score && many.score - base.score <= 0.5, `12 partidas (10-2): pesa, pero acotado (${base.score} → ${many.score})`);

// --- Honestidad de etiquetas
const all = [];
for (const s of SUP.pool) for (const adc of Object.keys(BOT.adc)) {
  const q = live(s.name, adc, 'Leona', 'Draven');
  if (q.combo) all.push(q.combo.src);
  for (const t of q.threats.concat(q.post6)) all.push(t.src);
}
ok(all.length > 100 && all.every((x) => x === 'ANÁLISIS'), 'combos, amenazas y post-6 son ANÁLISIS (no hay fuente PRO de support)');
ok(!JSON.stringify(BOT).includes('"pro"'), 'ninguna entrada se marca PRO sin fuente');

// --- En partida: sin números, sin runas, sin timers
const g = live('Janna', 'Jinx', 'Leona', 'Draven');
const txt = JSON.stringify(g);
ok(!('why' in g) && !('score' in g) && !/%|\d+ partidas|runa|timer|dragón|barón/i.test(txt), 'la versión de partida no trae winrates, runas ni timers');
ok(g.hud.length <= 90 && (!g.hud6 || g.hud6.length <= 90), `la línea del overlay es corta (${g.hud.length} caracteres)`);
const h = hudPayload({ time: 60, gold: 500, me: { dead: false }, win_line: g.hud, win_until: 90, orders: [] });
ok(h.call === g.hud, 'el overlay muestra el plan hasta que llegan a la línea (1:30)');
const h2 = hudPayload({ time: 95, gold: 500, me: { dead: false }, win_line: g.hud, win_until: 90, orders: [] });
ok(!h2.call, 'después ya no aparece');

// --- Otros roles intactos
const lane = select.gamePlan({ mode: 'top', focus: { lane: ['Darius', { score: 1 }] } });
ok(lane === 'Ganás peleando: presioná la línea.', 'top/jungla/mid siguen igual');

if (failed) { console.log(`botlane: ${failed} fallas`); process.exit(1); }
console.log('botlane: todo OK');
