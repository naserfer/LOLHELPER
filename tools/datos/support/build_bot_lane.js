// Uso: node tools/datos/support/build_bot_lane.js  (raw_vs_adc.txt: una línea por support, "adc:Δ2:partidas;..." de Lolalytics)
// Arma data/bot_lane.json. Fuentes: Lolalytics (vs ADC), Data Dragon (rangos), wiki de LoL (kits → ANÁLISIS).
const fs = require('fs');
const RANGE = {};
for (const x of 'Aphelios:550;Ashe:600;Caitlyn:650;Draven:550;Ezreal:550;Jhin:550;Jinx:525;Kai\'Sa:525;Kalista:525;Kog\'Maw:500;Lucian:500;Miss Fortune:550;Nilah:225;Samira:500;Senna:600;Sivir:500;Smolder:550;Tristana:550;Twitch:550;Varus:575;Vayne:550;Xayah:525;Yunara:575;Zeri:550;Corki:550;Ziggs:550;Mel:550;Swain:525;Yasuo:175;Hwei:550;Seraphine:525'.split(';')) {
  const [n, r] = x.split(':');
  RANGE[n] = +r;
}

// Perfil de cada ADC (ANÁLISIS de kits). early: fuerte | medio | debil (cómo pelea la línea antes del 6).
// hooks: qué convierte de su support. ccf = remata tu control; autos = vive de autoataques; kalr = R de Kalista.
const A = (early, mob, hooks, pre, post, ally) => ({ early, mob, hooks, pre, post, ally });
const ADC = {
  Aphelios: A('medio', false, ['autos'], 'Con el arma morada (Gravitum) te enraíza después de pegarte; con la verde (Calibrum) te pega de muy lejos.', 'Su R pega en área y le recarga el arma: no te juntes con tu ADC.', 'No tiene escape: necesita que lo cuides de los engages.'),
  Ashe: A('medio', false, ['autos', 'ccf'], 'Cada auto y su W te ralentizan: no la persigas en campo abierto.', 'Su R es una flecha de stun larga desde lejos: si te pega, su support entra.', 'Su R desde lejos abre la pelea: entrá cuando aterrice.'),
  Caitlyn: A('fuerte', true, ['ccf'], '650 de rango, el más largo: te pega gratis si te acercás. Pisar trampa es raíz + headshot.', 'Su R remata con poca vida: no te quedes bajo de vida en línea; podés pararte en el medio para taparla.', 'Domina la línea de lejos: empujá con ella y poné trampas en tus controles.'),
  Draven: A('fuerte', false, ['autos'], 'Si agarra las hachas girando, el trade lo ganan ellos. Castigá cuando camina a buscar un hacha.', 'Su R va y vuelve por toda la línea: no te quedes en el camino con poca vida.', 'Pelea muy bien temprano: buscá el trade apenas tenga las hachas.'),
  Ezreal: A('medio', true, [], 'Pokea con Q de lejos y tiene E para escapar: engagealo cuando ya gastó la E.', 'Su R cruza el mapa: no te quedes bajo de vida.', 'Pokea y se va: no hace falta que entres vos, jugá a pokear con él.'),
  Jhin: A('medio', false, ['ccf'], 'Cada cuarto tiro pega fuerte: contá sus balas. Su W enraíza a quien su equipo dañó hace poco.', 'Su R son 4 tiros de muy lejos: no camines en línea recta hacia él.', 'Su W enraíza al que vos ya dañaste: pegá primero y después tira él.'),
  Jinx: A('debil', false, ['autos'], 'Pokea con cohetes de lejos; sus trampas (E) te enraízan si las pisás.', 'Su R cruza el mapa y remata: no te quedes bajo de vida.', 'Escala: cuidala en línea y no fuerces peleas temprano.'),
  "Kai'Sa": A('medio', true, ['ccf', 'autos'], 'Con 5 marcas de plasma te saca mucho de un golpe; si su support te controla, ya te marca.', 'Su R salta hacia vos si tenés marcas: no te quedes solo marcado.', 'Tu control le suma marcas de plasma: después de tu control, ella explota antes.'),
  Kalista: A('fuerte', true, ['kalr', 'autos'], 'Muy fuerte al 2-3: sus lanzas (E) se acumulan y salta al pegar.', 'Su R le tira a su support encima: respetá el engage de lejos.', 'Te ata con su Lanza Negra: con su R te tira encima del rival.'),
  "Kog'Maw": A('debil', false, ['autos'], 'Débil antes de la W; con W activa te pega por % de vida desde lejos.', 'Su R es artillería de lejos: pokea mucho.', 'No tiene escape: protegelo y aguantá hasta sus ítems.'),
  Lucian: A('fuerte', true, ['autos'], 'Gana los trades cortos: E y pasiva (dos tiros). Muy fuerte al 2-3.', 'Su R es una ráfaga en línea recta: salí de la línea de tiro.', 'Pelea temprano: entrá con él al 2 y al 3.'),
  'Miss Fortune': A('fuerte', false, ['ccf'], 'Su Q rebota: no te pares atrás de un minion con poca vida.', 'Su R es una canalización en cono que borra: si los agarra juntos, salí para el costado o cortala con control.', 'Controlá vos y que ella ponga la R: sin que nadie la corte, gana la pelea.'),
  Nilah: A('fuerte', true, ['ccf'], 'Es melee: con su support entra al 2-3. Su W esquiva autoataques.', 'Su R jala y cura: no pelees dentro de su círculo.', 'Tus curas y escudos le rinden más: entrá con ella cuando tu control pegue.'),
  Samira: A('fuerte', true, ['ccf', 'autos'], 'Si su support te inmoviliza, su auto la hace saltar hasta vos. Su W bloquea proyectiles.', 'Con estilo S tira la R: usá tu control apenas entra.', 'Si el rival está inmovilizado, su auto la hace saltar hasta él: controlá vos primero.'),
  Sivir: A('medio', false, ['autos'], 'Empuja rápido; su escudo (E) anula una habilidad de engage.', 'Su R da velocidad a todo su equipo: sirve para entrar o para huir.', 'Empuja rápido: aprovechá para mover visión o rotar.'),
  Smolder: A('debil', true, [], 'Débil al principio: escala juntando marcas con sus habilidades.', 'Su R viene de muy lejos: ralentiza y lo cura.', 'Necesita marcas: dejale farmear y no regales trades.'),
  Tristana: A('fuerte', true, ['ccf', 'autos'], 'Fuerte al 2 con E y el salto (W): si salta, entra con todo.', 'Su R te empuja: te saca de la pelea o te mete bajo su torre.', 'Cuando tu control pegue, ella salta con W y pone la E.'),
  Twitch: A('medio', false, ['autos'], 'Con Q se vuelve invisible: puede aparecer por el costado. Su veneno se acumula.', 'Su R le da rango y atraviesa: no te pares en línea con tu ADC.', 'Sale invisible para emboscar: avanzá vos y él aparece.'),
  Varus: A('medio', false, ['ccf'], 'Poke de Q desde lejos; sus marcas (W) suman daño por % de vida.', 'Su R es una cadena: enraíza y se pasa a los que están cerca: separate de tu ADC.', 'Con tu control, su R encadena a los dos rivales.'),
  Vayne: A('debil', true, ['autos'], 'Su E te empuja y si chocás con una pared quedás stuneado: no pelees pegado a muros.', 'Su R la hace invisible al rodar: duele mucho en peleas largas.', 'Débil temprano: protegela hasta sus primeros ítems.'),
  Xayah: A('medio', false, ['autos'], 'Deja plumas en el piso: su E las vuelve a juntar y enraíza si te pegan 3.', 'Su R la hace intocable un instante: no tires tu control justo ahí.', 'Pelea dentro de sus plumas: atraé al rival encima de ellas.'),
  Yunara: A('medio', false, ['autos'], 'Su W ralentiza muchísimo al principio: si te pega, te alcanza todo. Con Q activa sus autos rebotan a los de al lado.', 'Su R (15 s) le da dash y un rayo que ralentiza: respetala mientras dura.', 'Su Q activa pega a todos los de al lado: peleen juntos cerca de los minions.'),
  Zeri: A('medio', true, ['autos'], 'Se mueve muy rápido y te kitea; su Q no gasta maná.', 'Su R le da velocidad y daño en cadena.', 'Le gusta pelear en movimiento: no entres si ella no puede seguirte.'),
  Corki: A('medio', true, [], 'Poke mágico con Q y escapa con W.', 'Su R tira misiles a cada rato: poke constante.', 'Pokea: jugá a pokear con él.'),
  Ziggs: A('medio', true, [], 'Poke de Q desde lejos y su W lo desplaza; rompe torres rápido.', 'Su R viene desde muy lejos.', 'Pokea y rompe torres: empujen y tomen placas.'),
  Swain: A('medio', false, ['ccf'], 'Su E vuelve y te enraíza; con la pasiva te tira hacia él.', 'Su R drena: no te quedes peleando dentro.', 'Su E enraíza: encadená tu control con el suyo.'),
  Mel: A('medio', false, ['ccf'], 'Su W refleja proyectiles: no le tires skillshots cuando la tiene. Su E enraíza.', 'Su R pega desde cualquier lado a quien tenga sus marcas.', 'Su E enraíza: entrá cuando pegue.'),
  Seraphine: A('medio', false, ['ccf'], 'Su E enraíza si ya estás ralentizado.', 'Su R encanta en línea y se alarga al pasar por aliados.', 'Su R se alarga con vos: ponete en la línea de su R.'),
  Yasuo: A('fuerte', true, ['ccf'], 'Su W (muro) bloquea proyectiles. Si su support te levanta, te pone la R.', 'Su R sale después de cualquier levantamiento de su equipo.', 'Cualquier levantamiento tuyo le habilita la R.'),
};

// Lo que aporta cada support a la dupla (ANÁLISIS de kits).
// cc: control que sirve para encadenar. buff: ayuda a los autoataques del ADC (texto ya listo).
const S = (cc, buff) => ({ cc, buff });
const SUP = {
  Thresh: S('Q (gancho)'), Leona: S('E y Q (stun)'), Nami: S('Q (burbuja)', 'E a {adc} antes del trade: sus próximos 3 ataques o habilidades ralentizan y pegan extra.'),
  Blitzcrank: S('Q (gancho)'), Lulu: S('W (polimorfo)', 'W a {adc} en el trade: le da velocidad de ataque y de movimiento.'),
  Alistar: S('W y Q (combo)'), Senna: S('W (raíz)'), Braum: S('Q y tu pasiva (stun con 4 golpes)', 'Pegale vos primero (Q o auto): cada auto de {adc} suma una marca y con 4 el rival queda stun.'),
  Seraphine: S('E (raíz si ya está lento)'), Rell: S('W (salto) y E (stun)'), Rakan: S('W (salto)'), Nautilus: S('Q (gancho)'),
  Janna: S('Q (tornado)', 'Escudo (E) a {adc} justo antes de que pegue: le suma daño de ataque.'),
  Zilean: S('Q doble (stun)', 'E a {adc} cuando entra al trade: llega primero.'), Soraka: S('E (raíz si se queda adentro)'),
  Milio: S('Q (empuje)', 'W a {adc}: más rango para pegar sin entrar.'), Sona: S(null, 'E a {adc}: velocidad para entrar o salir del trade.'),
  "Vel'Koz": S('E (levanta)'), Pyke: S('E (stun al pasar)'), Zyra: S('E (raíz)'), Karma: S('W (raíz)', 'E a {adc}: escudo y velocidad para entrar o salir.'),
  Morgana: S('Q (raíz larga)'), Lux: S('Q (raíz)'), Bard: S('Q (stun contra pared)'), 'Renata Glasc': S('Q (raíz y tiro)'),
  'Tahm Kench': S('W (levanta)'), Yuumi: S(null), Xerath: S('E (stun)'), Swain: S('E (raíz)'), Brand: S('Q con pasiva (stun)'), Pantheon: S('W (stun)'),
};

// Combos con nombre propio para una dupla concreta (pisan a los generados). Solo interacciones del kit.
const PAIR = {};

// Remates de cada ADC sobre tu control (ccf). {cc} = control de tu support.
const CCF = {
  "Kai'Sa": 'Tu {cc} le suma marcas de plasma a Kai\'Sa: entrá vos y ella explota antes.',
  Jhin: 'Pegá primero con tu {cc}: Jhin enraíza con W a quien vos dañaste.',
  Samira: 'Con el rival trabado por tu {cc}, el auto de Samira la hace saltar hasta él; si tu control lo levanta, ella también lo levanta.',
  Caitlyn: 'Si tu {cc} dura más de 1 s, Caitlyn pone la trampa debajo: se arma en 1 s, enraíza y le da headshot.',
  'Miss Fortune': 'Desde el 6: tu {cc} primero y después su R; nadie la corta.',
  Varus: 'Desde el 6: tu {cc} y Varus encadena la R a los dos.',
  Tristana: 'Cuando tu {cc} pegue, Tristana salta con W y pone la E.',
  Nilah: 'Cuando tu {cc} pegue, Nilah entra; tus curas y escudos le rinden más.',
  Ashe: 'Tu {cc} y su W: el rival queda lento y trabado para el trade.',
  Swain: 'Tu {cc} y su E: dos controles seguidos.',
  Mel: 'Tu {cc} y su E: dos controles seguidos.',
  Seraphine: 'Tu {cc} y su E: el rival ya está trabado y la raíz entra segura.',
  Yasuo: 'Si tu control levanta (knock-up), Yasuo pone la R.',
};
const KNOCKUP = new Set(['Alistar', 'Rell', 'Rakan', 'Janna', "Vel'Koz", 'Tahm Kench', 'Blitzcrank', 'Nautilus', 'Thresh']);

// Lolalytics: support (Emerald+, 16.22) vs ADC rival. Δ2 = diferencia de WR propia del cruce, en puntos.
const SLUG = { velkoz: "Vel'Koz", renata: 'Renata Glasc', tahmkench: 'Tahm Kench' };
const pool = JSON.parse(fs.readFileSync(require('path').join(__dirname, '../../../data/pool_support.json'), 'utf8')).pool.map((c) => c.name);
const vs = {};
for (const line of fs.readFileSync(require('path').join(__dirname, 'raw_vs_adc.txt'), 'utf8').trim().split('\n')) {
  const [k, rest] = line.split('=');
  const name = SLUG[k] || pool.find((p) => p.toLowerCase().replace(/[^a-z]/g, '') === k.toLowerCase()) || k;
  vs[name] = {};
  for (const e of rest.split(';')) { const [adc, d, g] = e.split(':'); vs[name][adc] = [+d, +g]; }
}
const missing = pool.filter((p) => !vs[p]);
if (missing.length) throw new Error('faltan ' + missing);

const out = {
  patch: '16.22',
  fuentes: {
    vs_adc: 'Lolalytics, Emerald+, parche 16.22: https://lolalytics.com/lol/<support>/counters/?lane=support&vslane=bottom&tier=emerald_plus (Δ2 = efecto propio del cruce, en puntos de WR; solo cruces con 400+ partidas y |Δ2| ≥ 1)',
    rango: 'Data Dragon 16.22.1 (stats.attackrange)',
    kits: 'Wiki de League of Legends (habilidades) → textos de ANÁLISIS, no de profesionales',
    sinergia: 'op.gg (pool_support.json)',
  },
  nota: 'Todo lo de "adc", "sup", "ccf" y "pair" es ANÁLISIS de kits. No hay material PRO de support: si algún día se agrega, va con "pro": {"fuente": ...}.',
  adc: Object.fromEntries(Object.entries(ADC).map(([n, p]) => [n, Object.assign({ range: RANGE[n] || null }, p)])),
  sup: SUP, ccf: CCF, knockup: [...KNOCKUP], pair: PAIR, vs_adc: vs,
};
fs.writeFileSync(require('path').join(__dirname, '../../../data/bot_lane.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.keys(out.adc).length, 'ADCs;', Object.keys(vs).length, 'supports con datos vs ADC');
