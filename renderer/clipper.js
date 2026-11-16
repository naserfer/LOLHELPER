'use strict';
/* Grabador de clips (ventana oculta). Nada de programas externos:
 *  - captura de pantalla de Electron (getUserMedia con el id que manda el proceso principal),
 *  - WebCodecs VideoEncoder H.264 con la placa de video (hardwareAcceleration: 'prefer-hardware'),
 *  - buffer circular EN MEMORIA de los últimos ~45 s (no se escribe nada al disco),
 *  - al pedir un clip, arma un MP4 (mp4-muxer) desde el keyframe anterior y se lo manda al principal para guardarlo.
 * Si la placa no puede codificar, los clips se apagan: no vale la pena bajar FPS codificando con el procesador. */
const KEEP_MS = 45000;
const KEY_EVERY = 60;          // un keyframe cada 2 s a 30 fps: el clip puede empezar en cualquiera
let cfg = null, encoder = null, reader = null, running = false, decoderConfig = null, frameN = 0, firstTs = null;
let chunks = [];               // {wall, ts, dur, key, data}

const send = (type, data) => window.ph.clipper(type, data);

async function supported(c) {
  try {
    const r = await VideoEncoder.isConfigSupported(c);
    return !!r.supported;
  } catch (e) { return false; }
}

async function start(opts) {
  if (running) return;
  cfg = opts;
  const w = opts.width, h = opts.height, fps = opts.fps;
  const base = { codec: 'avc1.640028', width: w, height: h, bitrate: opts.bitrate, framerate: fps, avc: { format: 'avc' }, latencyMode: 'realtime' };
  let encCfg = Object.assign({}, base, { hardwareAcceleration: 'prefer-hardware' });
  if (!(await supported(encCfg))) {
    if (!opts.allowSoftware) { send('status', { ok: false, reason: 'no-hw' }); return; }
    encCfg = Object.assign({}, base, { hardwareAcceleration: 'no-preference' });
    if (!(await supported(encCfg))) { send('status', { ok: false, reason: 'no-encoder' }); return; }
  }
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { mandatory: {
      chromeMediaSource: 'desktop', chromeMediaSourceId: opts.sourceId, maxWidth: w, maxHeight: h, maxFrameRate: fps } } });
  } catch (e) { send('status', { ok: false, reason: 'capture', error: String(e && e.message || e) }); return; }
  const track = stream.getVideoTracks()[0];
  encoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (meta && meta.decoderConfig) decoderConfig = meta.decoderConfig;
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      chunks.push({ wall: Date.now(), ts: chunk.timestamp, dur: chunk.duration || Math.round(1e6 / fps), key: chunk.type === 'key', data });
      const cut = Date.now() - KEEP_MS;
      while (chunks.length && chunks[0].wall < cut) chunks.shift();
    },
    error: (e) => send('status', { ok: false, reason: 'encoder', error: String(e && e.message || e) }),
  });
  encoder.configure(encCfg);
  running = true;
  frameN = 0;
  send('status', { ok: true, hw: encCfg.hardwareAcceleration === 'prefer-hardware', width: w, height: h });
  reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
  (async () => {
    while (running) {
      const r = await reader.read();
      if (r.done) break;
      const frame = r.value;
      if (encoder.encodeQueueSize > 4) { frame.close(); continue; }   // si la placa no da abasto, se saltean cuadros
      encoder.encode(frame, { keyFrame: frameN % KEY_EVERY === 0 });
      frameN++;
      frame.close();
    }
  })().catch((e) => send('status', { ok: false, reason: 'read', error: String(e && e.message || e) }));
  window.__stop = () => { try { track.stop(); } catch (e) { /* ya parado */ } };
}

function stop() {
  running = false;
  try { if (window.__stop) window.__stop(); } catch (e) { /* nada */ }
  try { if (encoder && encoder.state !== 'closed') encoder.close(); } catch (e) { /* nada */ }
  encoder = null;
  chunks = [];
  decoderConfig = null;
  send('status', { ok: true, stopped: true });
}

// Clip entre fromWall y toWall (ms de reloj): arranca en el keyframe anterior a fromWall.
async function clip(req) {
  if (!encoder || !decoderConfig) { send('clip', { id: req.id, ok: false, reason: 'sin-buffer' }); return; }
  try { await encoder.flush(); } catch (e) { /* sigue */ }
  let i = chunks.findIndex((c) => c.wall >= req.fromWall);
  if (i < 0) i = 0;
  while (i > 0 && !chunks[i].key) i--;
  while (i < chunks.length && !chunks[i].key) i++;
  const part = chunks.slice(i).filter((c) => c.wall <= req.toWall);
  if (part.length < 10) { send('clip', { id: req.id, ok: false, reason: 'corto' }); return; }
  const muxer = new Mp4Muxer.Muxer({
    target: new Mp4Muxer.ArrayBufferTarget(),
    video: { codec: 'avc', width: cfg.width, height: cfg.height, frameRate: cfg.fps },
    fastStart: 'in-memory', firstTimestampBehavior: 'offset',
  });
  part.forEach((c, k) => muxer.addVideoChunkRaw(c.data, c.key ? 'key' : 'delta', c.ts, c.dur, k === 0 ? { decoderConfig } : undefined));
  muxer.finalize();
  const buf = muxer.target.buffer;
  send('clip', { id: req.id, ok: true, bytes: new Uint8Array(buf), seconds: Math.round((part[part.length - 1].wall - part[0].wall) / 1000) });
}

window.ph.onClipper((type, data) => {
  if (type === 'start') start(data);
  else if (type === 'stop') stop();
  else if (type === 'clip') clip(data);
});
send('ready', {});
