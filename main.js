'use strict';
// Pick Helper: proceso principal de Electron. Corre el motor cada segundo y le manda la vista a la UI.
const { app, BrowserWindow, ipcMain, protocol, screen, globalShortcut, desktopCapturer, net } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { Engine } = require('./src/engine/engine');
const { viewSig } = require('./src/sig');
const { hudPayload, hudSig, DEFAULT_LAYOUT } = require('./src/hud');
const { watchKey } = require('./src/keywatch');
const player = require('./src/player');
const { Clipper } = require('./src/clipper');

const arg = (name) => { const a = process.argv.find((x) => x.startsWith(`--${name}`)); return a ? (a.split('=')[1] || true) : null; };
const COMMON_DEMOS = { idle: { idle: true }, gamedeath: { game: '../test/demo_game_death.json' }, jgdeath: { game: '../test/demo_game_jungle_death.json' } };

// Jugador (Naser o Bitty). En pruebas (--demo, --userdir…) no se pregunta: manda PH_PROFILE o data/profile.json.
const APPDATA = arg('appdata') ? String(arg('appdata')) : app.getPath('appData');
const TESTING = ['demo', 'userdir', 'selftest', 'hudtest'].some((a) => arg(a)) && !arg('choose') && !arg('appdata');
let PLAYER = { id: null, ask: false };
if (!TESTING) {
  let builtId = null;
  try { builtId = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'profile.json'), 'utf8')).id; } catch (e) { /* sin perfil */ }
  PLAYER = arg('choose') ? { id: null, ask: true } : player.resolve({ appData: APPDATA, env: process.env, builtId });
  if (PLAYER.id) process.env.PH_PROFILE = PLAYER.id;
}

protocol.registerSchemesAsPrivileged([{ scheme: 'pickhelper', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);
if (!app.requestSingleInstanceLock() && !arg('demo')) app.quit();

let win = null;
let engine = null;
let lastSig = null;
let lastIconsV = -1;
let busy = false;
let hud = null;            // ventana transparente dentro del juego
let hudReady = false;
let hudHidden = false;     // Alt+Shift+H
let hudEdit = false;       // Alt+Shift+E
let hudGrab = false;       // Tab apretado: los recuadros se pueden arrastrar sin salir del juego
let stopKeyWatch = () => {};
let lastHud = null;
let lastUrls = {};

function bounds() {
  const b = engine.settings.bounds;
  if (arg('size')) { const [w, h] = String(arg('size')).split('x').map(Number); return { width: w, height: h, x: 0, y: 0 }; }
  if (b && screen.getAllDisplays().some((d) => b.x >= d.bounds.x - 50 && b.x < d.bounds.x + d.bounds.width)) return b;
  return { width: 460, height: 860 };
}

function createWindow() {
  win = new BrowserWindow(Object.assign({
    minWidth: 340, minHeight: 260, frame: false, backgroundColor: '#010A13', show: false,
    title: 'Pick Helper', icon: path.join(__dirname, 'renderer', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  }, bounds()));
  win.setAlwaysOnTop(engine.settings.always_on_top !== false, 'screen-saver');
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win.show());
  let t = null;
  const remember = () => { clearTimeout(t); t = setTimeout(() => { if (!win.isMaximized() && !arg('size')) engine.saveSettings({ bounds: win.getBounds() }); }, 500); };
  win.on('move', remember);
  win.on('resize', remember);
  win.on('maximize', () => send('win', { maximized: true }));
  win.on('unmaximize', () => send('win', { maximized: false }));
}

// ------------------------------------------------------------ overlay dentro del juego
function hudLayout() { return Object.assign({}, DEFAULT_LAYOUT, engine.settings.hud_layout || {}); }
function hudDisplay() {
  const all = screen.getAllDisplays();
  return all[engine.settings.hud_display || 0] || screen.getPrimaryDisplay();
}
function hudBounds() {
  if (arg('hudsize')) { const [w, h] = String(arg('hudsize')).split('x').map(Number); return { x: 0, y: 0, width: w, height: h }; }
  return hudDisplay().bounds;
}
function createHud() {
  if (hud && !hud.isDestroyed()) return hud;
  hudReady = false;
  hud = new BrowserWindow(Object.assign({
    frame: false, transparent: true, backgroundColor: '#00000000', resizable: false, movable: false, focusable: false,
    skipTaskbar: true, hasShadow: false, fullscreenable: false, show: false, title: 'Pick Helper HUD',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  }, hudBounds()));
  hud.setAlwaysOnTop(true, 'screen-saver');
  hud.setIgnoreMouseEvents(true);              // los clics pasan al juego
  hud.setVisibleOnAllWorkspaces(true);
  hud.loadFile(path.join(__dirname, 'renderer', 'hud.html'));
  hud.on('closed', () => { hud = null; hudReady = false; });
  return hud;
}
function hudConfig() {
  if (!hud || !hudReady) return;
  const b = hudBounds();
  hud.webContents.send('hud-config', { layout: hudLayout(), edit: hudEdit, scale: Math.max(0.7, Math.min(2, b.height / 1080)) });
}
function setHudEdit(on) {
  if (on) setHudGrab(false);
  hudEdit = on;
  createHud();
  hud.setIgnoreMouseEvents(!on);
  hud.setFocusable(on);
  if (on) { hud.showInactive(); hud.focus(); }
  hudConfig();
  send('win', { hudEdit: on });
}
// Tab apretado: el overlay atrapa el mouse solo sobre un recuadro (el renderer avisa con hud-grab-capture);
// en el resto de la pantalla los clics siguen yendo al juego. Nunca toma el foco.
function setHudGrab(on) {
  if (hudEdit || !hud || !hudReady) on = false;
  if (on && !hud.isVisible()) on = false;
  if (on === hudGrab) return;
  hudGrab = on;
  if (on) hud.setIgnoreMouseEvents(true, { forward: true });
  else hud.setIgnoreMouseEvents(true);
  hud.webContents.send('hud-grab', on);
}
function updateHud(view) {
  const enabled = engine.settings.hud_enabled !== false;
  const h = hudPayload(view);
  if (hudEdit) { if (hud && hudReady) hud.webContents.send('hud', { hud: h, sig: hudSig(h) }); return; }
  if (!h || !enabled || hudHidden) { setHudGrab(false); if (hud && hud.isVisible()) hud.hide(); lastHud = null; return; }
  createHud();
  if (!hudReady) return;
  if (!hud.isVisible()) hud.showInactive();
  hud.webContents.send('hud', { hud: h, sig: hudSig(h) });
  lastHud = h;
}

function send(ch, data) { if (win && !win.isDestroyed()) win.webContents.send(ch, data); }

function payload(view, status, full) {
  const coach = engine.coach;
  const out = { status, live: liveBits(view) };
  if (full) Object.assign(out, { view, coach, history: engine.historyView(), meta: engine.meta, settings: engine.settings,
    plays: engine.clipStore.listPlays(10), clips: clipper ? clipper.status : { state: 'apagado' },
    profile: { id: engine.profile.id, title: engine.profile.title, roles: Object.fromEntries(Object.entries(engine.profile.roles).map(([k, r]) => [k, r.label])) } });
  return out;
}
function liveBits(v) {
  if (!v || !('gold' in v)) return null;
  return { time: v.time, gold: v.gold, missing: v.buy ? v.buy.missing : 0, objectives: v.objectives,
    rules: (v.rules_live || []).map((r) => [r.key, r.value]) };
}

async function tick() {
  if (busy) return;
  busy = true;
  try {
    const offline = arg('offline') ? JSON.parse(fs.readFileSync(String(arg('offline')), 'utf8')) : null;
    const { view, status } = await engine.step({ offlineData: offline });
    if (engine.iconsVersion !== lastIconsV && engine.ddLoaded) {
      lastIconsV = engine.iconsVersion;
      let urls = engine.dd.urls;
      if (arg('icons')) urls = Object.assign({}, urls, JSON.parse(fs.readFileSync(String(arg('icons')), 'utf8')));
      lastUrls = urls;
      send('icons', urls);
      if (hud && hudReady) hud.webContents.send('icons', urls);
      lastSig = null;
    }
    if (!engine.coach) engine.computeCoach();   // el repaso no depende de internet
    const sig = viewSig(view, status, engine.coachKey + '|' + engine.history.version);
    if (sig !== lastSig) { lastSig = sig; send('state', payload(view, status, true)); }
    else send('tick', payload(view, status, false));
    updateHud(view);
    clipTick(view, status);
  } catch (e) {
    send('state', { status: ['off', `Error: ${e.message}`], view: null, coach: engine.coach, history: engine.historyView(), meta: engine.meta, settings: engine.settings });
  } finally { busy = false; }
}

// Primera vez: ventanita "¿Quién sos?". Devuelve el id elegido.
function chooseplayer() {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ width: 440, height: 420, minWidth: 340, minHeight: 300, frame: false, backgroundColor: '#010A13', show: false,
      title: 'Pick Helper', icon: path.join(__dirname, 'renderer', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false } });
    if (arg('size')) { const [sw, sh] = String(arg('size')).split('x').map(Number); w.setBounds({ x: 0, y: 0, width: sw, height: sh }); }
    w.loadFile(path.join(__dirname, 'renderer', 'choose.html'));
    w.once('ready-to-show', () => w.show());
    const onPick = (e, id) => {
      if (!player.PLAYERS[id]) return;
      ipcMain.removeListener('choose-player', onPick);
      player.saveChoice(APPDATA, id);
      resolve({ id, win: w });
    };
    ipcMain.on('choose-player', onPick);
    ipcMain.on('choose-close', () => app.quit());
    ipcMain.handle('players', () => Object.keys(player.PLAYERS).map((id) => {
      const pr = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'profiles', `${id}.json`), 'utf8'));
      const order = [pr.default_role, ...Object.keys(pr.roles).filter((k) => k !== pr.default_role)];
      return { id, title: pr.title, roles: order.map((k) => pr.roles[k].label), default_role: pr.default_role };
    }));
    if (arg('choosetest')) {   // autoprueba: lee la pantalla, elige y termina
      w.webContents.once('did-finish-load', () => setTimeout(async () => {
        const r = await w.webContents.executeJavaScript(`({ text: document.body.innerText, vw: innerWidth,
          wide: [...document.querySelectorAll('body *')].filter((el) => { const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1 || b.left < -1); }).length,
          buttons: [...document.querySelectorAll('[data-pick]')].map((b) => b.dataset.pick) })`);
        await w.webContents.executeJavaScript(`document.querySelector('[data-pick="${String(arg('choosepick') || 'bitty')}"]').click()`);
        await new Promise((ok) => setTimeout(ok, 500));
        r.saved = player.readChoice(APPDATA);
        fs.writeFileSync(String(arg('choosetest')), JSON.stringify(r, null, 1));
        app.exit(0);
      }, 800));
    }
  });
}

let chooserWin = null;
let clipper = null;
let clipGameKey = null, clipIdleSince = 0;

// Clips de muertes y jugadas: ventana oculta que graba en memoria con la placa de video (renderer/clipper.js).
function setupClipper() {
  clipper = new Clipper({
    dir: engine.clipDir,
    allowSoftware: !!arg('clipsoftware'),   // solo pruebas: en la PC real sin placa, los clips se apagan
    createWindow: () => {
      const w = new BrowserWindow({ show: false, width: 320, height: 200, skipTaskbar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
      w.loadFile(path.join(__dirname, 'renderer', 'clipper.html'));
      return w;
    },
    getSourceId: async () => {
      const disp = hudDisplay();
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
      const hit = sources.find((x) => String(x.display_id) === String(disp.id)) || sources[0];
      if (!hit) throw new Error('sin pantallas para capturar');
      return hit.id;
    },
    size: () => {
      const b = hudDisplay().size;
      const k = Math.min(1, 1920 / b.width, 1080 / b.height);
      return { width: Math.round(b.width * k / 2) * 2, height: Math.round(b.height * k / 2) * 2 };
    },
  });
  ipcMain.on('clipper', (e, m) => clipper.onMessage(m.type, m.data));
}
// Una vez por segundo: arrancar/cortar el buffer por partida y pedir los clips.
function clipTick(view, status) {
  if (!clipper) return;
  const on = engine.settings.clips_enabled !== false && (!arg('demo') || arg('clipsoftware'));
  const inGame = status && status[0] === 'ingame' && view && 'gold' in view;
  const key = engine.recorder.rec ? engine.recorder.rec.id : null;
  if (on && inGame && key) {
    clipIdleSince = 0;
    if (clipGameKey !== key) { clipGameKey = key; clipper.startGame(key); }
  } else if (clipGameKey) {
    if (!clipIdleSince) clipIdleSince = Date.now();
    if (!on || Date.now() - clipIdleSince > 30000) { clipper.endGame(); clipGameKey = null; }
  }
  const evs = engine.clipEvents.splice(0);
  if (!on || !inGame) return;
  const now = Date.now();
  for (const ev of evs) {
    const wall = now - Math.max(0, (ev.at - ev.t)) * 1000;   // momento del evento en el reloj
    if (ev.kind === 'death') clipper.deathClip(ev.t, wall, now);
    else if (ev.kind === 'multi') clipper.multiClip(ev.t, ev.n, ev.champ, wall, now);
  }
}
app.whenReady().then(async () => {
  if (PLAYER.ask) {
    const { id, win: w } = await chooseplayer();
    process.env.PH_PROFILE = id;
    PLAYER = { id, ask: false };
    chooserWin = w;   // se cierra recién cuando abre la ventana principal (si no, la app se cerraría sola)
  }
  const demoName = arg('demo');
  const userDir = arg('userdir') ? String(arg('userdir')) : PLAYER.id ? player.userDataFor(APPDATA, PLAYER.id) : app.getPath('userData');
  engine = new Engine({ dataDir: path.join(__dirname, 'data'), userDir, demo: null });
  if (demoName) {
    const demos = Object.assign({}, engine.profile.demos || {}, COMMON_DEMOS);
    engine.demo = demos[demoName] || Object.values(engine.profile.demos)[0];
  }
  if (engine.iconsVersion === undefined) engine.iconsVersion = 0;
  if (arg('coach-fixture')) require('./test/fixture_coach').install(engine, String(arg('coach-fixture')));
  protocol.handle('pickhelper', async (req) => {
    const u = new URL(req.url);
    if (u.host === 'clip' && clipper) {   // pickhelper://clip/muertes/x.mp4 · pickhelper://clip/jugadas/y.mp4
      const file = clipper.resolve(decodeURIComponent(u.pathname.slice(1)));
      if (file && fs.existsSync(file)) return net.fetch(pathToFileURL(file).toString(), { headers: req.headers });
      return new Response('', { status: 404 });
    }
    if (u.host === 'lcu') {
      const r = await engine.lcu.raw(u.pathname);
      if (r) return new Response(r.buf, { headers: { 'content-type': r.type } });
    }
    return new Response('', { status: 404 });
  });
  createWindow();
  if (chooserWin) { chooserWin.destroy(); chooserWin = null; }
  setupClipper();
  if (arg('cliptest')) runCliptest(String(arg('cliptest')));
  ipcMain.on('win', (e, cmd) => {
    if (!win) return;
    if (cmd === 'min') win.minimize();
    else if (cmd === 'max') { if (win.isMaximized()) win.unmaximize(); else win.maximize(); }
    else if (cmd === 'close') { if (hud) hud.destroy(); win.close(); }
    else if (cmd === 'pin') {
      const on = !win.isAlwaysOnTop();
      win.setAlwaysOnTop(on, 'screen-saver');
      engine.saveSettings({ always_on_top: on });
      send('win', { pinned: on });
    }
  });
  ipcMain.on('settings', (e, patch) => { engine.saveSettings(patch); lastSig = null; hudConfig(); });
  ipcMain.on('ready', (e, who) => {
    if (who === 'hud') {
      hudReady = true;
      hud.webContents.send('icons', lastUrls);
      hudConfig();
      return;
    }
    lastSig = null; lastIconsV = -1;
    send('win', { pinned: win.isAlwaysOnTop(), maximized: win.isMaximized(), hudEdit });
  });
  ipcMain.on('hud-layout', (e, layout) => { engine.saveSettings({ hud_layout: layout }); });
  ipcMain.on('switch-player', (e, id) => {
    if (!player.PLAYERS[id] || id === engine.profile.id) return;
    player.saveChoice(APPDATA, id);
    // El .exe portable corre desde una copia temporal que se borra al cerrar: se relanza el .exe original.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE;
    if (exe) app.relaunch({ execPath: exe, args: [] });
    else app.relaunch();
    app.exit(0);
  });
  ipcMain.on('hud-grab-capture', (e, on) => { if (hudGrab && hud) hud.setIgnoreMouseEvents(!on, { forward: true }); });
  ipcMain.on('hud', (e, cmd) => {
    if (cmd === 'edit') setHudEdit(!hudEdit);
    else if (cmd === 'reset') { engine.saveSettings({ hud_layout: null }); hudConfig(); }
    else if (cmd === 'monitor') {
      const n = screen.getAllDisplays().length;
      engine.saveSettings({ hud_display: ((engine.settings.hud_display || 0) + 1) % n });
      if (hud) { hud.setBounds(hudBounds()); hudConfig(); }
    }
    lastSig = null;
  });
  const keys = [['Alt+Shift+H', () => { hudHidden = !hudHidden; if (hudHidden && hud) hud.hide(); }],
    ['Alt+Shift+E', () => setHudEdit(!hudEdit)],
    ['Alt+Shift+R', () => { engine.saveSettings({ hud_layout: null }); hudConfig(); }]];
  for (const [k, fn] of keys) { try { globalShortcut.register(k, fn); } catch (e) { /* tecla ocupada */ } }
  if (engine.settings.hud_tab_drag !== false && !arg('demo')) stopKeyWatch = watchKey('tab', (down) => setHudGrab(down));
  setInterval(tick, 1000);
  tick();
  if (arg('selftest')) runSelftest(String(arg('selftest')));
  if (arg('hudtest')) runHudtest(String(arg('hudtest')));
  if (arg('shot') && !arg('hudtest')) {
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      fs.writeFileSync(String(arg('shot')), img.toPNG());
      app.exit(0);
    }, Number(arg('wait') || 6000));
  }
});
// Autoprueba de la interfaz (solo con --selftest=archivo.json): revisa cada ancho de ventana.
function runSelftest(out) {
  const errors = [];
  win.webContents.on('console-message', (e, level, message) => { if (level >= 2) errors.push(message); });
  win.webContents.on('render-process-gone', (e, d) => errors.push(`renderer: ${d.reason}`));
  win.webContents.on('preload-error', (e, p, err) => errors.push(`preload: ${err.message}`));
  const widths = [340, 460, 800, 1600];
  const results = [];
  const probe = `(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll('#app *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
      .slice(0, 5).map((el) => el.className + ':' + Math.round(el.getBoundingClientRect().right));
    const sc = document.getElementById('scroll');
    const cols = getComputedStyle(document.querySelector('.cols') || document.body).gridTemplateColumns || '';
    const bar = document.getElementById('bar');
    const btns = [...bar.querySelectorAll('button')].map((b) => { const r = b.getBoundingClientRect(); return r.right <= vw + 1 && r.width > 10; });
    return { vw, text: document.getElementById('app').innerText, texts: { bot: (document.querySelector('.card.bot') || {}).innerText }, overflow: sc.scrollWidth > sc.clientWidth + 1, wide,
      cols: cols.split(' ').filter(Boolean).length, buttonsVisible: btns.every(Boolean), status: document.querySelector('#status span').textContent,
      brand: document.querySelector('.brand .name').textContent,
      imgs: document.querySelectorAll('#app .ic').length };
  })()`;
  setTimeout(async () => {
    for (const w of widths) {
      win.setSize(w, 900);
      await new Promise((r) => setTimeout(r, 900));
      results.push(Object.assign({ width: w }, await win.webContents.executeJavaScript(probe)));
    }
    fs.writeFileSync(out, JSON.stringify({ errors, results }, null, 1));
    app.exit(0);
  }, Number(arg('wait') || 5000));
}

// Autoprueba del overlay dentro del juego: posiciones, que no se pise, que deje pasar los clics.
function runHudtest(out) {
  setTimeout(async () => {
    if (arg('hudedit')) setHudEdit(true);
    if (arg('hudgrab')) setHudGrab(true);
    await new Promise((r) => setTimeout(r, 1500));
    const res = { exists: !!hud, visible: !!(hud && hud.isVisible()), focusable: hud ? hud.isFocusable() : null, bounds: hud ? hud.getBounds() : null, grab: hudGrab };
    if (hud) {
      res.boxes = await hud.webContents.executeJavaScript(`[...document.querySelectorAll('.w')].map((w) => { const r = w.getBoundingClientRect();
        return { id: w.id, hidden: w.classList.contains('hide') || !w.innerHTML.trim(), x: r.left, y: r.top, w: r.width, h: r.height, text: w.innerText }; })`);
      res.vw = await hud.webContents.executeJavaScript('[window.innerWidth, window.innerHeight]');
      if (arg('shot')) { const img = await hud.webContents.capturePage(); fs.writeFileSync(String(arg('shot')), img.toPNG()); }
      if (arg('hudgrab')) {   // arrastra la compra 200 px a la izquierda y 100 px arriba, como con Tab + mouse
        res.drag = await hud.webContents.executeJavaScript(`(() => { const w = document.getElementById('w-buy'); const r = w.getBoundingClientRect();
          const at = (t, x, y, el) => (el || document).dispatchEvent(new MouseEvent(t, { bubbles: true, clientX: x, clientY: y }));
          const x = r.left + 10, y = r.top + 10;
          at('mousedown', x, y, w); at('mousemove', x - 200, y - 100, w); at('mouseup', x - 200, y - 100, w);
          const r2 = w.getBoundingClientRect(); return { dx: r2.left - r.left, dy: r2.top - r.top }; })()`);
        await new Promise((r) => setTimeout(r, 300));
        res.layout = engine.settings.hud_layout || null;
        res.ignoring = true;
      }
    }
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    app.exit(0);
  }, Number(arg('wait') || 5000));
}

// Autoprueba de clips: graba la pantalla unos segundos, corta un clip de "muerte" y uno de "triple", y termina.
function runCliptest(out) {
  setTimeout(async () => {
    await clipper.startGame('cliptest');
    await new Promise((r) => setTimeout(r, 7000));
    const now = Date.now();
    const death = clipper.deathClip(123, now - 1000, now);
    const play = clipper.multiClip(456, 3, 'Diana', now - 500, now);
    await new Promise((r) => setTimeout(r, 9000));
    const file = death ? path.join(clipper.deaths, death) : null;
    const res = { status: clipper.status, death, play, deathBytes: file && fs.existsSync(file) ? fs.statSync(file).size : 0,
      plays: clipper.listPlays(), deathsDir: clipper.deaths };
    // Que se reproduzca en la app, por pickhelper://clip (como lo va a ver el jugador).
    res.play_check = await win.webContents.executeJavaScript(`new Promise((r) => { openClip('muertes/${death}', 'prueba', 'texto');
      const v = document.querySelector('#clipmodal video'); v.muted = true;
      v.onloadedmetadata = () => r({ duration: v.duration, w: v.videoWidth, h: v.videoHeight });
      v.onerror = () => r({ error: v.error && v.error.code }); setTimeout(() => r({ timeout: true }), 6000); })`).catch((e) => ({ error: String(e) }));
    res.congrats_check = await win.webContents.executeJavaScript(`(() => { openClip('jugadas/${play}', 'Triple', '', '¡Triple!'); const c = document.querySelector('.congrats'); return c ? c.textContent.trim() : null; })()`).catch(() => null);
    clipper.endGame();
    fs.writeFileSync(out, JSON.stringify(res, null, 1));
    setTimeout(() => app.exit(0), 500);
  }, 1500);
}

app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { globalShortcut.unregisterAll(); stopKeyWatch(); });
