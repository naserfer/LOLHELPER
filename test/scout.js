// Scout del lobby, sin cliente: racha, one-trick y a quién jugarle. Un vacío no rompe nada.
const { report, fromHistoryGame, roleOf } = require('../src/engine/scout');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };

const losses = (n, champ) => Array.from({ length: n }, () => ({ win: false, champ }));
const record = (wins, n, champ) => Array.from({ length: n }, (_, i) => ({ win: i < wins, champ }));

const text = report([
  { role: 'adc', champ: 'Jinx', games: losses(3, 'Jinx') },
  { role: 'mid', champ: 'Ahri', games: record(8, 10, 'Ahri') },
]);
ok(text === 'Tu ADC, Jinx, viene de 3 derrotas. El mid lockeó Ahri y ganó 8 de 10. Jugá para el mid.', `scout: ${text}`);

const otp = report([{ role: 'jungla', champ: 'Nocturne', games: record(16, 20, 'Nocturne').map((g, i) => (i < 13 ? g : { win: g.win, champ: 'Diana' })) }]);
ok(otp && otp.includes('one-trick (13 de 20)') && otp.includes('Jugá para el jungla'), `one-trick: ${otp}`);

ok(report([]) === null && report([null].filter(Boolean)) === null, 'si nadie responde, no hay frase');
ok(roleOf('utility') === 'support' && roleOf('bottom') === 'adc', 'el rol sale de la posición del cliente');

const g = {
  participantIdentities: [{ participantId: 1, player: { puuid: 'adc' } }, { participantId: 2, player: { puuid: 'otro' } }],
  participants: [{ participantId: 1, championId: 222, stats: { win: false } }, { participantId: 2, championId: 103, stats: { win: true } }],
};
ok(JSON.stringify(fromHistoryGame(g, 'adc', (id) => (id === 222 ? 'Jinx' : '?'))) === JSON.stringify({ win: false, champ: 'Jinx' }), 'lee la partida del puuid pedido');
ok(fromHistoryGame(g, 'nadie', () => '?') === null, 'un puuid que no está se saltea');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
