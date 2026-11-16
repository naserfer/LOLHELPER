// ADC caído, aliado con oro, jungla vista en un kill y ventana de cañón.
const { analyzeGame, nextCannon } = require('../src/engine/ingame');
const { viewSig } = require('../src/sig');
const { ItemDB } = require('../src/engine/itemdb');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };
const db = new ItemDB({
  3089: { name: "Rabadon's Deathcap", gold: { total: 3600, purchasable: true }, maps: { 11: true }, tags: ['SpellDamage'] },
  3865: { name: 'World Atlas', gold: { total: 400, purchasable: true }, maps: { 11: true } },
});
const P = (name, champ, team, pos, extra) => Object.assign({
  riotId: `${name}#LAS`, championName: champ, team, position: pos, level: 8, isDead: false,
  items: [], scores: { kills: 0, deaths: 0, assists: 0 },
}, extra);
const game = (me, others, t, events) => ({
  activePlayer: { riotId: me.riotId, currentGold: 100 },
  allPlayers: [me, ...others],
  gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t },
  events: { Events: events || [] },
});
const run = (g, prev) => analyzeGame(g, [], db, {}, {}, null, prev || {}, [[], {}]);
const pri = (v, n) => (v.orders || []).filter((o) => o.pri === n);

const me = P('Naser', 'Thresh', 'ORDER', 'UTILITY');
const jinx = P('Tuki', 'Jinx', 'ORDER', 'BOTTOM');
const ahri = P('Mid', 'Ahri', 'ORDER', 'MIDDLE');
const leona = P('Leo', 'Leona', 'CHAOS', 'UTILITY');
const lee = P('Jg', 'Lee Sin', 'CHAOS', 'JUNGLE');

const alive = run(game(me, [jinx, ahri, leona, lee], 400), { legend_ready: true, legend_seen: [] });
ok(pri(alive, 1).length === 0, 'con el ADC vivo no hay aviso');
const dead = run(game(me, [Object.assign({}, jinx, { isDead: true }), ahri, leona, lee], 420), {
  legend_ready: true, legend_seen: [], adc_seen: true, adc_dead: false, track_adc: true,
});
ok(pri(dead, 1).length === 1 && pri(dead, 1)[0].text === 'Jinx cayó. No pelees.', `ADC caído: ${(pri(dead, 1)[0] || {}).text}`);
const still = run(game(me, [Object.assign({}, jinx, { isDead: true }), ahri, leona, lee], 425), {
  legend_ready: true, legend_seen: [], adc_seen: dead.adc_seen, adc_dead: dead.adc_dead, track_adc: true,
});
ok(pri(still, 1).length === 0, 'si sigue muerto, no se repite el aviso');
const bitty = run(game(me, [Object.assign({}, jinx, { isDead: true }), ahri, leona, lee], 420), {
  legend_ready: true, legend_seen: [], adc_seen: true, adc_dead: false, track_adc: false,
});
ok(pri(bitty, 1).length === 0, 'Bitty no avisa por el ADC: track_adc está en falso');

ahri.items = [{ itemID: 3089 }];
const ahead = run(game(me, [jinx, ahri, leona, lee], 500), { legend_ready: true, legend_seen: [3089] });
ok(pri(ahead, 5).length === 1 && pri(ahead, 5)[0].text === 'Jugá para Ahri. Va adelante.', `aliado adelante: ${(pri(ahead, 5)[0] || {}).text}`);
jinx.items = [{ itemID: 3089 }];
ahri.items = [];
const adcAhead = run(game(me, [jinx, ahri, leona, lee], 500), { legend_ready: true, legend_seen: [3089] });
ok(pri(adcAhead, 5).length === 0, 'si el que va adelante es tu ADC, no se dice nada');
ahri.items = [{ itemID: 3865 }];
jinx.items = [];
const atlas = run(game(me, [jinx, ahri, leona, lee], 500), { legend_ready: true, legend_seen: [] });
ok(pri(atlas, 5).length === 0, 'el ítem de support no cuenta como oro de ventaja');

const kill = { EventName: 'ChampionKill', EventTime: 300, VictimName: 'Tuki#LAS', KillerName: 'Leo#LAS', Assisters: ['Jg#LAS'] };
const seenJg = run(game(me, [jinx, ahri, leona, lee], 305, [kill]), { legend_ready: true, legend_seen: [] });
ok(pri(seenJg, 2).length === 1 && pri(seenJg, 2)[0].text === 'Jungla enemigo en bot. Retrocedé.', `jungla en tu línea: ${(pri(seenJg, 2)[0] || {}).text}`);
const again = run(game(me, [jinx, ahri, leona, lee], 310, [kill]), { legend_ready: true, legend_seen: [], jg_seen: seenJg.jg_seen });
ok(pri(again, 2).length === 0, 'el mismo kill en el sondeo siguiente no repite la frase');
const topKill = { EventName: 'ChampionKill', EventTime: 300, VictimName: 'Top#LAS', KillerName: 'Jg#LAS', Assisters: [] };
const topP = P('Top', 'Garen', 'CHAOS', 'TOP');
const far = run(game(me, [jinx, ahri, leona, lee, topP], 305, [topKill]), { legend_ready: true, legend_seen: [] });
ok(pri(far, 2)[0] && pri(far, 2)[0].text === 'Jungla enemigo en top. Podés jugar adelante.', `jungla en la otra punta: ${(pri(far, 2)[0] || {}).text}`);
const blank = P('Nadie', 'Garen', 'CHAOS', '');
const noPos = { EventName: 'ChampionKill', EventTime: 300, VictimName: 'Nadie#LAS', KillerName: 'Jg#LAS', Assisters: [] };
const hidden = run(game(me, [jinx, ahri, leona, lee, blank], 305, [noPos]), { legend_ready: true, legend_seen: [] });
ok(pri(hidden, 2).length === 0, 'sin posición no hay frase');

ok(nextCannon(120) === 125 && nextCannon(126) === 215 && nextCannon(900) === 935, `cañones: 2:00 → ${nextCannon(120)}, después → ${nextCannon(126)}, al 15 → ${nextCannon(900)}`);
const topMe = P('Naser', 'Malphite', 'ORDER', 'TOP');
const darius = P('Dar', 'Darius', 'CHAOS', 'TOP', { isDead: true });
const wave = run(game(topMe, [darius], 120), { legend_ready: true, legend_seen: [] });
ok(pri(wave, 4).length === 1 && pri(wave, 4)[0].text === 'Darius está muerto. Empujá y basá.', `cañón con el rival muerto: ${(pri(wave, 4)[0] || {}).text}`);
const later = run(game(topMe, [darius], 140), { legend_ready: true, legend_seen: [] });
ok(pri(later, 4).length === 0, 'entre 2:06 y 2:20 el cañón no está a 25 segundos');
const deadMe = run(game(Object.assign({}, topMe, { isDead: true }), [darius], 120), { legend_ready: true, legend_seen: [] });
ok(pri(deadMe, 4).length === 0, 'si vos estás muerto, no dice que pushees');
const sigA = viewSig(run(game(topMe, [P('Dar', 'Darius', 'CHAOS', 'TOP')], 126), { legend_ready: true, legend_seen: [] }), ['ingame', 'x'], '');
const sigB = viewSig(run(game(topMe, [P('Dar', 'Darius', 'CHAOS', 'TOP')], 140), { legend_ready: true, legend_seen: [] }), ['ingame', 'x'], '');
ok(sigA === sigB, 'entre 2:06 y 2:20 la firma no cambia solo porque pasa el reloj');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
