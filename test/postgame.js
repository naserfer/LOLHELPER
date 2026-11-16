// El post-game nombra la muerte y elige una sola cosa para la próxima.
const { tipFor, summarize } = require('../src/engine/autopsy');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };

const jungla = tipFor({
  t: 215, gold: 400, my_level: 6, killer_type: 'champion',
  attackers: [{ champ: 'Lee Sin', level: 9, jungle: true, killer: true }, { champ: 'Ezreal', level: 7, jungle: false }],
  adc_died_before: null, objective_near: false,
});
ok(jungla.primary === 'jungla' && jungla.title === 'Te agarró la jungla', 'la causa sigue siendo jungla');
ok(jungla.facts.includes('Lee Sin 9') && jungla.facts.includes('vos 6'), `la fila nombra quién y el nivel: ${jungla.facts}`);
ok(jungla.text.includes('Lee Sin'), `el aviso nombra a la jungla: ${jungla.text}`);

const vieja = tipFor({
  t: 100, gold: 200, my_level: 5, killer_type: 'champion',
  attackers: [{ champ: 'Leona', level: 6, jungle: false }, { champ: 'Lee Sin', level: 7, jungle: true }],
  adc_died_before: null, objective_near: false,
});
ok(vieja.facts.includes('Leona 6') && vieja.facts.includes('Lee Sin 7'), 'una grabación vieja, sin decir quién dio el golpe, igual lista a los que estaban');

const oro = tipFor({ t: 400, gold: 1400, my_level: 8, killer_type: 'champion', attackers: [{ champ: 'Ahri', level: 9, jungle: false, killer: true }], adc_died_before: null, objective_near: false });
ok(oro.facts.includes('1400 de oro'), 'el oro sin gastar entra en la fila');

function muerte(labels) {
  const attackers = [];
  if (labels.includes('jungla')) attackers.push({ champ: 'Lee Sin', level: 9, jungle: true }, { champ: 'Ezreal', level: 7, jungle: false });
  else attackers.push({ champ: 'Ezreal', level: 9, jungle: false });
  return {
    gold: labels.includes('oro') ? 1500 : 100,
    my_level: labels.includes('nivel') ? 4 : 8,
    killer_type: 'champion', attackers, adc_died_before: null, objective_near: false,
  };
}
const recs = [];
for (let i = 0; i < 4; i++) recs.push({ win: false, deaths: [muerte(['jungla', 'nivel'])] });
for (let i = 0; i < 2; i++) recs.push({ win: true, deaths: [muerte(['nivel'])] });
const sum = summarize(recs);
ok(sum.next && sum.next.key === 'jungla', `para la próxima no elige el nivel: ${sum.next && sum.next.key}`);
ok(sum.next.text.includes('4') && /jungla/i.test(sum.next.text), `la frase tiene el número: ${sum.next && sum.next.text}`);
ok(sum.patterns.find((p) => p.key === 'jungla').tip.includes('4 de 6'), 'la barra dice cuántas muertes, no el consejo genérico');

console.log(failed ? `\n${failed} prueba(s) fallaron` : '\nTodas las pruebas pasaron');
process.exit(failed ? 1 : 0);
