// Plan de la comp: una frase, sin mover el score ni los bans.
const { gamePlan } = require('../src/engine/select');
const { hudPayload } = require('../src/hud');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };

const support = (arch, score, delta, adc) => ({
  mode: 'support', ally_adc: adc, ban_sugg: ['Pyke'],
  focus: { score: 4, lane: ['Leona', { score }], syn: adc ? [adc, { delta }] : null, cfg: { arch }, arch },
});

const engage = support('engage', 1.2, 0.4, 'Jinx');
const scoreBefore = engage.focus.score;
const bansBefore = engage.ban_sugg.slice();
ok(gamePlan(engage) === 'Ganás peleando con Jinx. Buscá el all-in.', 'engage con matchup bueno: pelear');
ok(engage.focus.score === scoreBefore && engage.ban_sugg.join() === bansBefore.join(), 'el plan no toca el score ni los bans');

const ench = support('enchanter', 1.2, -1.2, 'Jinx');
ok(gamePlan(ench) === 'Aguantá con Jinx. No pelees hasta el 6.', 'encantador con sinergia mala: aguantar');

const top = { mode: 'top', focus: { score: 2, lane: ['Darius', { score: 0.8 }], cfg: {} } };
ok(gamePlan(top) === 'Ganás peleando: presioná la línea.', 'top sin ADC y matchup positivo: pelear');
ok(gamePlan({ mode: 'top', focus: { lane: ['Darius', { score: -0.4 }], cfg: {} } }) === 'Aguantá: no pelees hasta igualar nivel.', 'top con matchup negativo: aguantar');

const both = hudPayload({
  time: 10, gold: 0, me: { dead: false },
  win_line: 'Aguantá con Jinx. No pelees hasta el 6.',
  orders: [{ pri: 5, text: 'Jugá para Ahri.', until: 40 }, { pri: 3, text: 'Ahri completó Filo Infinito. No pelees.', until: 30 }],
});
ok(both.call === 'Ahri completó Filo Infinito. No pelees.' && !both.death, 'dos frases: queda la de mayor prioridad, y no es una muerte');

const dead = hudPayload({
  time: 10, gold: 0, me: { dead: true },
  death: { title: 'Bajo torre', text: 'no entres', t: 9 },
  orders: [{ pri: 3, text: 'Ahri completó Filo Infinito. No pelees.', until: 30 }],
});
ok(dead.death && dead.death.title === 'Bajo torre' && !dead.call, 'si moriste, el cartel de la muerte gana');

const early = hudPayload({ time: 10, gold: 0, me: { dead: false }, win_line: 'Ganás peleando con Jinx. Buscá el all-in.' });
ok(early.call === 'Ganás peleando con Jinx. Buscá el all-in.', 'el plan entra al overlay antes de los 25 segundos');
const late = hudPayload({ time: 40, gold: 0, me: { dead: false }, win_line: 'Ganás peleando con Jinx. Buscá el all-in.' });
ok(!late.call, 'después de los 25 segundos el plan no sigue en el overlay');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
