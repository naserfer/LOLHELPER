// Simulador en tiempo real para probar el .exe: lobby → champ select → partida (acelerada) → fin.
const { FakeRiot, liveFrame, historyGame } = require('./fake_riot');
const lockDir = process.argv[2];
const riot = new FakeRiot({ lockDir });
const t0 = Date.now();
const log = (m) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] ${m}`);
const JG = process.env.SIM_ROLE === 'jungle';
const jgSession = () => {
  const s = FakeRiot.champSelect({ adc: 'Jinx', adcLocked: true });
  s.localPlayerCellId = 1;
  s.myTeam[1] = { cellId: 1, assignedPosition: 'jungle', championId: 0, championPickIntent: 3032 };
  s.myTeam[4] = { cellId: 4, assignedPosition: 'utility', championId: 412 };
  s.theirTeam = [['top', 122], ['jungle', 64], ['middle', 3042], ['bottom', 145], ['utility', 89]].map(([p, c], i) => ({ cellId: 5 + i, assignedPosition: p, championId: c }));
  return s;
};
const script = { deaths: [{ t: 300, killer: 'Rival3', assisters: ['Rival1'], gold: 1500 }, { t: 700, killer: 'Rival1', gold: 200 }],
  adcDeaths: [695], cwAt: [200], legendaryAt: 700, dragonAt: [720] };
if (JG) Object.assign(script, { myChamp: 'Nocturne', myPos: 'JUNGLE', legendaryId: 6698 });
(async () => {
  await riot.start();
  riot.state.history = [historyGame(101, Date.now() - 864e5, true), historyGame(102, Date.now() - 8e7, false)];
  log(`LCU en puerto ${riot.port}`);
  let phase = '';
  setInterval(() => {
    const e = (Date.now() - t0) / 1000;
    let p;
    if (e < 20) p = 'lobby'; else if (e < 40) p = 'champ'; else if (e < 95) p = 'game'; else p = 'end';
    if (p !== phase) { phase = p; log(`fase: ${p}`); }
    const s = riot.state;
    if (p === 'lobby') { s.phase = 'Lobby'; s.session = null; s.live = null; }
    if (p === 'champ') { s.phase = 'ChampSelect'; s.session = JG ? jgSession() : FakeRiot.champSelect({ adc: 'Jinx', adcLocked: e > 30 }); }
    if (p === 'game') { s.phase = 'InProgress'; s.session = null; s.gameId = 777; s.live = liveFrame(Math.round((e - 40) * 17), script); }
    if (p === 'end') {
      s.phase = 'EndOfGame'; s.live = null;
      if (!s.history.some((g) => g.gameId === 777)) s.history.push(historyGame(777, Date.now() - 1000e3, false));
    }
  }, 250);
})();
