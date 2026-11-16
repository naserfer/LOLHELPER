// Simulador del cliente de League (LCU) y de la API en vivo del juego, con HTTPS autofirmado.
// Sirve para probar la app de punta a punta sin League instalado.
const https = require('https');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

function cert() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cert'));
  const key = path.join(dir, 'k.pem');
  const crt = path.join(dir, 'c.pem');
  const args = ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', '/CN=127.0.0.1', '-keyout', key, '-out', crt];
  const bins = ['openssl'];
  if (process.platform === 'win32') {
    bins.push('C:\\Program Files\\Git\\usr\\bin\\openssl.exe', 'C:\\Program Files (x86)\\Git\\usr\\bin\\openssl.exe');
  }
  for (const bin of bins) {
    try {
      execFileSync(bin, args, { stdio: 'ignore' });
      return { key: fs.readFileSync(key), cert: fs.readFileSync(crt) };
    } catch (e) { /* este openssl no está */ }
  }
  if (process.platform === 'win32') {
    const pfx = path.join(dir, 'c.pfx');
    const cmd = `$c = New-SelfSignedCertificate -Subject 'CN=127.0.0.1' -DnsName '127.0.0.1' -KeyExportPolicy Exportable -NotAfter (Get-Date).AddDays(2) -CertStoreLocation Cert:\\CurrentUser\\My; $p = ConvertTo-SecureString -String 'pickhelper' -Force -AsPlainText; Export-PfxCertificate -Cert $c -FilePath '${pfx.replace(/'/g, "''")}' -Password $p | Out-Null; Remove-Item "Cert:\\CurrentUser\\My\\$($c.Thumbprint)"`;
    execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { stdio: 'ignore' });
    return { pfx: fs.readFileSync(pfx), passphrase: 'pickhelper' };
  }
  throw new Error('hace falta openssl para el certificado de prueba');
}

const CH = { Thresh: 412, Jinx: 222, "Kai'Sa": 145, Leona: 89, 'Lee Sin': 64, Ahri: 103, Garen: 86, Malphite: 54, Darius: 122, Orianna: 61, 'Master Yi': 11,
  Nocturne: 3032, Diana: 3008, Syndra: 3042, Graves: 3015 };
const RAW = (n) => `game_character_displayname_${n.replace(/[^A-Za-z]/g, '')}`;

class FakeRiot {
  constructor({ lockDir, livePort = 2999 }) {
    this.lockDir = lockDir;
    this.livePort = livePort;
    this.token = 'tok3n';
    this.state = { phase: 'Lobby', session: null, gameId: null, live: null, history: [], requests: [] };
    this.tls = cert();
  }
  async start() {
    this.lcu = https.createServer(this.tls, (req, res) => this.handleLcu(req, res));
    await new Promise((r) => this.lcu.listen(0, '127.0.0.1', r));
    this.port = this.lcu.address().port;
    fs.mkdirSync(this.lockDir, { recursive: true });
    fs.writeFileSync(path.join(this.lockDir, 'lockfile'), `LeagueClient:1234:${this.port}:${this.token}:https`);
    this.liveSrv = https.createServer(this.tls, (req, res) => this.handleLive(req, res));
    await new Promise((r, j) => { this.liveSrv.once('error', j); this.liveSrv.listen(this.livePort, '127.0.0.1', r); });
  }
  stop() { if (this.lcu) this.lcu.close(); if (this.liveSrv) this.liveSrv.close(); try { fs.unlinkSync(path.join(this.lockDir, 'lockfile')); } catch (e) { /* ya no está */ } }

  json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json' }); res.end(obj === undefined ? '' : JSON.stringify(obj)); }
  handleLcu(req, res) {
    const auth = req.headers.authorization || '';
    if (auth !== `Basic ${Buffer.from(`riot:${this.token}`).toString('base64')}`) return this.json(res, 401, { error: 'auth' });
    const u = req.url;
    this.state.requests.push(`${req.method} ${u}`);
    const s = this.state;
    if (u === '/lol-champ-select/v1/session') return s.session ? this.json(res, 200, s.session) : this.json(res, 404, { message: 'No active delegate' });
    if (u === '/lol-gameflow/v1/gameflow-phase') return this.json(res, 200, s.phase);
    if (u === '/lol-gameflow/v1/session') return this.json(res, 200, { phase: s.phase, gameData: { gameId: s.gameId } });
    if (u === '/lol-summoner/v1/current-summoner') return this.json(res, 200, { puuid: 'me-puuid', gameName: 'Naser', tagLine: 'LAS' });
    if (u === '/lol-game-data/assets/v1/champion-summary.json') return this.json(res, 200, Object.entries(CH).map(([name, id]) => ({ id, name })));
    if (u === '/lol-game-data/assets/v1/items.json') return this.json(res, 200, [{ id: 3190, iconPath: '/lol-game-data/assets/ASSETS/Items/Icons2D/3190_Locket.png' }]);
    if (u.startsWith('/lol-game-data/assets/ASSETS/')) { res.writeHead(200, { 'content-type': 'image/png' }); return res.end(Buffer.from('89504e470d0a1a0a', 'hex')); }
    let m = /^\/lol-match-history\/v1\/products\/lol\/current-summoner\/matches\?begIndex=(\d+)&endIndex=(\d+)$/.exec(u);
    if (m) {
      const list = s.history.slice().sort((a, b) => b.gameCreation - a.gameCreation).slice(+m[1], +m[2] + 1).map((g) => ({ gameId: g.gameId }));
      return this.json(res, 200, { games: { games: list } });
    }
    m = /^\/lol-match-history\/v1\/games\/(\d+)$/.exec(u);
    if (m) { const g = s.history.find((x) => String(x.gameId) === m[1]); return g ? this.json(res, 200, g) : this.json(res, 404, {}); }
    return this.json(res, 404, { message: 'not found' });
  }
  handleLive(req, res) {
    if (!req.url.startsWith('/liveclientdata/allgamedata')) return this.json(res, 404, {});
    if (!this.state.live) return this.json(res, 404, { errorCode: 'RESOURCE_NOT_FOUND' });
    if (this.state.liveDelayMs) return setTimeout(() => this.json(res, 200, this.state.live), this.state.liveDelayMs);
    return this.json(res, 200, this.state.live);
  }

  // ---------- generadores de datos
  static champSelect({ adc = 'Jinx', adcLocked = true, enemySup = 'Leona', enemyAdc = "Kai'Sa", myPick = 0 }) {
    return {
      localPlayerCellId: 4, timer: { phase: 'BAN_PICK' }, actions: [], bans: { myTeamBans: [], theirTeamBans: [] },
      myTeam: [
        { cellId: 0, assignedPosition: 'top', championId: CH.Garen },
        { cellId: 1, assignedPosition: 'jungle', championId: 0 },
        { cellId: 2, assignedPosition: 'middle', championId: CH.Ahri },
        { cellId: 3, assignedPosition: 'bottom', championId: adcLocked ? CH[adc] : 0, championPickIntent: CH[adc] },
        { cellId: 4, assignedPosition: 'utility', championId: myPick, championPickIntent: 0 },
      ],
      theirTeam: [
        { cellId: 5, assignedPosition: '', championId: CH.Darius }, { cellId: 6, assignedPosition: '', championId: CH['Lee Sin'] },
        { cellId: 7, assignedPosition: '', championId: CH.Orianna }, { cellId: 8, assignedPosition: '', championId: CH[enemyAdc] },
        { cellId: 9, assignedPosition: '', championId: CH[enemySup] },
      ],
    };
  }
}

// Partida en vivo: devuelve allgamedata para el segundo t, según un guion.
// script: {deaths:[{t, killer, assisters, gold}], adcDeaths:[t], cwAt:[t], legendaryAt, dragonAt:[t], nameFmt}
function liveFrame(t, script) {
  const fmt = script.nameFmt || 'riot';
  const id = (n) => (fmt === 'plain' ? n : `${n}#LAS`);
  const mk = (name, champ, team, pos, extra = {}) => Object.assign({
    riotId: `${name}#LAS`, riotIdGameName: name, summonerName: fmt === 'old' ? name : `${name}#LAS`, championName: champ,
    rawChampionName: RAW(champ), team, position: pos, level: 1 + Math.min(17, Math.floor(t / 90)), isDead: false, respawnTimer: 0,
    items: [], scores: { kills: 0, deaths: 0, assists: 0, creepScore: Math.floor(t / 20), wardScore: 0 },
    summonerSpells: { summonerSpellOne: { rawDisplayName: 'GeneratedTip_SummonerSpell_SummonerFlash_DisplayName' },
      summonerSpellTwo: { rawDisplayName: `GeneratedTip_SummonerSpell_${pos === 'JUNGLE' ? 'SummonerSmite' : 'SummonerDot'}_DisplayName` } },
  }, extra);
  const myDeaths = (script.deaths || []).filter((d) => d.t <= t);
  const myPos = script.myPos || 'UTILITY';
  const me = mk('Naser', script.myChamp || 'Thresh', 'ORDER', myPos);
  me.scores.deaths = myDeaths.length;
  me.scores.assists = Math.floor(t / 200);
  me.scores.wardScore = Math.round(t / 30 * (script.visionRate || 1));
  const its = [{ itemID: myPos === 'JUNGLE' ? 1102 : 3865, count: 1 }];
  const cw = (script.cwAt || []).filter((x) => x <= t).length;
  if (cw) its.push({ itemID: 2055, count: cw });
  if (script.legendaryAt && t >= script.legendaryAt) its.push({ itemID: script.legendaryId || 3050, count: 1 });
  me.items = its;
  const players = [me,
    mk('Tuki', 'Jinx', 'ORDER', 'BOTTOM'), mk('Mid', 'Ahri', 'ORDER', myPos === 'MIDDLE' ? 'UTILITY' : 'MIDDLE'), mk('Top', 'Garen', 'ORDER', 'TOP'),
    mk('Jg', myPos === 'JUNGLE' ? 'Thresh' : 'Master Yi', 'ORDER', myPos === 'JUNGLE' ? 'UTILITY' : 'JUNGLE'),
    mk('Rival1', "Kai'Sa", 'CHAOS', 'BOTTOM'), mk('Rival2', 'Leona', 'CHAOS', 'UTILITY'), mk('Rival3', 'Lee Sin', 'CHAOS', 'JUNGLE'),
    mk('Rival4', 'Orianna', 'CHAOS', 'MIDDLE'), mk('Rival5', 'Darius', 'CHAOS', 'TOP')];
  players[1].scores.kills = Math.floor(t / 300);
  const ev = [{ EventID: 0, EventName: 'GameStart', EventTime: 0 }];
  let n = 1;
  for (const a of (script.adcDeaths || []).filter((x) => x <= t)) ev.push({ EventID: n++, EventName: 'ChampionKill', EventTime: a, VictimName: id('Tuki'), KillerName: id('Rival1'), Assisters: [] });
  for (const d of myDeaths) ev.push({ EventID: n++, EventName: 'ChampionKill', EventTime: d.t, VictimName: id('Naser'), KillerName: d.killer.startsWith('Turret') ? d.killer : id(d.killer), Assisters: (d.assisters || []).map(id) });
  for (const x of (script.dragonAt || []).filter((y) => y <= t)) ev.push({ EventID: n++, EventName: 'DragonKill', EventTime: x, KillerName: id('Rival3') });
  ev.sort((a, b) => a.EventTime - b.EventTime);
  ev.forEach((e, i) => { e.EventID = i; });     // como el juego real: ids en orden de tiempo
  const goldNow = (myDeaths.find((d) => Math.abs(d.t - t) <= 2) || {}).gold || script.gold || 400;
  return { activePlayer: { riotId: 'Naser#LAS', summonerName: fmt === 'old' ? 'Naser' : 'Naser#LAS', currentGold: goldNow, level: me.level },
    allPlayers: players, events: { Events: ev }, gameData: { gameMode: 'CLASSIC', mapNumber: 11, gameTime: t } };
}

// Partida terminada, como la devuelve el historial del cliente.
function historyGame(gameId, created, win, opts = {}) {
  const parts = [], ids = [];
  const champs = [CH.Thresh, CH.Jinx, CH.Ahri, CH.Garen, CH['Master Yi'], CH["Kai'Sa"], CH.Leona, CH['Lee Sin'], CH.Orianna, CH.Darius];
  for (let i = 0; i < 10; i++) {
    const mine = i === 0;
    parts.push({ participantId: i + 1, teamId: i < 5 ? 100 : 200, championId: champs[i], spell1Id: i === 4 || i === 7 ? 11 : 4, spell2Id: 14,
      stats: { win: i < 5 ? win : !win, kills: mine ? 1 : 3, deaths: mine ? (opts.deaths || 3) : 4, assists: mine ? 10 : 5,
        visionScore: mine ? 40 : 15, wardsKilled: 3, visionWardsBoughtInGame: mine ? 4 : 0, totalDamageDealtToChampions: 9000,
        totalDamageTaken: 15000, timeCCingOthers: 30, item0: mine ? 3877 : 1055 },
      timeline: { lane: i === 1 || i === 0 ? 'BOTTOM' : 'NONE', role: i === 0 ? 'DUO_SUPPORT' : i === 1 ? 'DUO_CARRY' : 'NONE' } });
    ids.push({ participantId: i + 1, player: { puuid: mine ? 'me-puuid' : i === 1 ? 'tuki-puuid' : `p${gameId}-${i}`, gameName: mine ? 'Naser' : i === 1 ? 'Tuki' : `x${i}`, tagLine: 'LAS' } });
  }
  return { gameId, queueId: 420, gameCreation: created, gameDuration: opts.duration || 1700, participants: parts, participantIdentities: ids };
}

module.exports = { FakeRiot, liveFrame, historyGame, CH };
