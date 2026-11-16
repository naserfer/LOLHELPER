'use strict';
/* Festejo al terminar una partida con triple, cuádruple o penta. Todo dibujado acá (canvas + CSS), sin archivos.
   Secuencia: oscurece → rayos de luz → impacto (flash, temblor, onda expansiva, rayos eléctricos, chispas) →
   el título cae de golpe → aparecen las kills una por una → tu campeón con anillos hextech → frase → fuegos
   artificiales y confeti hasta que lo cerrás (o 14 s). En penta, todo en arcoíris y el doble de fuegos.
   window.celebrate({ n, title, msg, champ, clip }) lo dispara; app.js lo llama cuando llega 'celebrate'. */
(function () {
  const GOLD = ['#F0E6D2', '#C8AA6E', '#F4C874', '#FFE7A3', '#FFFFFF'];
  const HEX = ['#0AC8B9', '#5BE0FF', '#C8AA6E', '#F0E6D2'];
  const MAGIC = ['#FF4FD8', '#9B5CFF', '#5BE0FF', '#FFE066'];
  let running = null;

  function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------------------------------------------------------------- sonido (sintetizado, bajito)
  function sound(n) {
    try {
      const A = new (window.AudioContext || window.webkitAudioContext)();
      const master = A.createGain(); master.gain.value = 0.22; master.connect(A.destination);
      const t0 = A.currentTime + 0.05;
      // golpe: ruido filtrado + grave que cae
      const len = A.sampleRate * 0.6, buf = A.createBuffer(1, len, A.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const noise = A.createBufferSource(); noise.buffer = buf;
      const lp = A.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(3000, t0); lp.frequency.exponentialRampToValueAtTime(200, t0 + 0.5);
      noise.connect(lp).connect(master); noise.start(t0 + 0.35);
      const boom = A.createOscillator(), bg = A.createGain();
      boom.type = 'sine'; boom.frequency.setValueAtTime(140, t0 + 0.35); boom.frequency.exponentialRampToValueAtTime(38, t0 + 1.1);
      bg.gain.setValueAtTime(0.0001, t0 + 0.34); bg.gain.exponentialRampToValueAtTime(1, t0 + 0.37); bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.3);
      boom.connect(bg).connect(master); boom.start(t0 + 0.34); boom.stop(t0 + 1.4);
      // subida antes del golpe
      const rise = A.createOscillator(), rg = A.createGain();
      rise.type = 'sawtooth'; rise.frequency.setValueAtTime(110, t0); rise.frequency.exponentialRampToValueAtTime(880, t0 + 0.34);
      rg.gain.setValueAtTime(0.0001, t0); rg.gain.exponentialRampToValueAtTime(0.12, t0 + 0.3); rg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.36);
      rise.connect(rg).connect(master); rise.start(t0); rise.stop(t0 + 0.4);
      // campanitas: una por kill, y el acorde final
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
      for (let i = 0; i < n; i++) {
        const o = A.createOscillator(), g = A.createGain(), at = t0 + 0.9 + i * 0.22;
        o.type = 'triangle'; o.frequency.value = notes[i % notes.length];
        g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(0.5, at + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);
        o.connect(g).connect(master); o.start(at); o.stop(at + 1);
      }
      const end = t0 + 0.9 + n * 0.22 + 0.1;
      for (const f of [523.25, 659.25, 783.99, 1046.5]) {
        const o = A.createOscillator(), g = A.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, end); g.gain.exponentialRampToValueAtTime(0.25, end + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, end + 2.2);
        o.connect(g).connect(master); o.start(end); o.stop(end + 2.3);
      }
      setTimeout(() => A.close().catch(() => {}), 6000);
    } catch (e) { /* sin audio */ }
  }

  // ---------------------------------------------------------------- partículas
  function makeFx(canvas, n) {
    const ctx = canvas.getContext('2d');
    const P = [], R = [], B = [];   // partículas, ondas, rayos
    let W = 0, H = 0, dpr = 1, hue = 0;
    const rainbow = n >= 5;
    function size() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = canvas.clientWidth; H = canvas.clientHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    size();
    const pick = (a) => a[(Math.random() * a.length) | 0];
    const color = (pal) => (rainbow ? `hsl(${(hue + Math.random() * 90) % 360},100%,65%)` : pick(pal));
    function spark(x, y, k, pal, speed, opts = {}) {
      for (let i = 0; i < k; i++) {
        const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.9);
        P.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - (opts.up || 0), life: 1, decay: 0.006 + Math.random() * 0.014,
          r: opts.r || 1 + Math.random() * 2.4, c: color(pal), g: opts.g == null ? 0.06 : opts.g, trail: opts.trail !== false, px: x, py: y });
      }
    }
    function confetti(k) {
      for (let i = 0; i < k; i++) {
        P.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 1.5, vy: 1 + Math.random() * 2.2,
          life: 1, decay: 0.0025, w: 4 + Math.random() * 6, h: 7 + Math.random() * 8, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
          c: color(rainbow ? MAGIC : GOLD.concat(HEX)), conf: true, g: 0.015 });
      }
    }
    function wave(x, y, c, speed, width) { R.push({ x, y, r: 10, v: speed, a: 1, c, w: width }); }
    function bolt(x, y) {
      const a = Math.random() * Math.PI * 2, len = Math.max(W, H) * (0.35 + Math.random() * 0.4);
      const pts = [[x, y]];
      let cx = x, cy = y;
      const steps = 14;
      for (let i = 1; i <= steps; i++) {
        const t = (i / steps) * len;
        cx = x + Math.cos(a) * t + (Math.random() - 0.5) * 38; cy = y + Math.sin(a) * t + (Math.random() - 0.5) * 38;
        pts.push([cx, cy]);
      }
      B.push({ pts, life: 1, c: rainbow ? `hsl(${hue},100%,75%)` : pick(['#BDF4FF', '#FFFFFF', '#F4C874']) });
    }
    function firework() {
      const x = W * (0.12 + Math.random() * 0.76), y = H * (0.1 + Math.random() * 0.45);
      const pal = pick([GOLD, HEX, MAGIC]);
      spark(x, y, 70, pal, 4.2, { g: 0.045 });
      wave(x, y, pick(pal), 3.5, 2);
    }
    function impact() {
      const x = W / 2, y = H * 0.36;
      spark(x, y, 260, GOLD, 9, { g: 0.08 });
      spark(x, y, 120, HEX, 6, { g: 0.03 });
      wave(x, y, '#F4C874', 9, 6); wave(x, y, '#5BE0FF', 6, 3); wave(x, y, '#FFFFFF', 12, 2);
      for (let i = 0; i < 9; i++) bolt(x, y);
    }
    function frame() {
      hue = (hue + 2) % 360;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = R.length - 1; i >= 0; i--) {
        const w = R[i];
        w.r += w.v; w.v *= 0.985; w.a -= 0.012;
        if (w.a <= 0) { R.splice(i, 1); continue; }
        ctx.strokeStyle = w.c; ctx.globalAlpha = w.a; ctx.lineWidth = w.w;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      }
      for (let i = B.length - 1; i >= 0; i--) {
        const b = B[i];
        b.life -= 0.05;
        if (b.life <= 0) { B.splice(i, 1); continue; }
        ctx.globalAlpha = b.life * (0.6 + Math.random() * 0.4);
        ctx.strokeStyle = b.c; ctx.lineWidth = 2.5; ctx.shadowColor = b.c; ctx.shadowBlur = 16;
        ctx.beginPath(); b.pts.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        ctx.shadowBlur = 0;
      }
      for (let i = P.length - 1; i >= 0; i--) {
        const p = P[i];
        p.px = p.x; p.py = p.y;
        p.vx *= p.conf ? 0.995 : 0.975; p.vy = p.vy * (p.conf ? 0.995 : 0.975) + p.g;
        p.x += p.vx; p.y += p.vy; p.life -= p.decay;
        if (p.life <= 0 || p.y > H + 40) { P.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.4));
        if (p.conf) {
          ctx.globalCompositeOperation = 'source-over';
          p.rot += p.vr;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.abs(Math.cos(p.rot * 2)) + 0.2);
          ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
          ctx.globalCompositeOperation = 'lighter';
        } else {
          ctx.strokeStyle = p.c; ctx.lineWidth = p.r; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(p.px - p.vx * 2, p.py - p.vy * 2); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
    return { size, frame, impact, firework, confetti, bolt: () => bolt(W / 2, H * 0.36), count: () => P.length };
  }

  // ---------------------------------------------------------------- escena
  function celebrate(c) {
    if (!c || !c.n) return;
    if (running) running.close(true);
    const n = Math.max(3, Math.min(5, c.n | 0));
    const root = el('div', `fest n${n}`);
    root.innerHTML = `<div class="fest-bg"></div><div class="fest-rays"></div><canvas class="fest-fx"></canvas><div class="fest-flash"></div>
      <div class="fest-stage">
        <div class="fest-champ">${c.champIcon ? `<img src="${esc(c.champIcon)}" alt="">` : `<span>${esc((c.champ || '?').slice(0, 2).toUpperCase())}</span>`}
          <svg class="ring r1" viewBox="0 0 100 100"><circle cx="50" cy="50" r="46"/></svg><svg class="ring r2" viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg></div>
        <div class="fest-title" data-text="${esc(c.title)}">${esc(c.title)}</div>
        <div class="fest-kills">${Array.from({ length: n }, (_, i) => `<i style="--d:${1.05 + i * 0.22}s"></i>`).join('')}</div>
        <div class="fest-champname">${esc(c.champ || '')}</div>
        <div class="fest-msg"></div>
        <div class="fest-btns">${c.clip ? '<button class="btn fest-play">▶ Ver la jugada</button>' : ''}<button class="btn fest-ok">Seguir</button></div>
      </div>`;
    document.body.appendChild(root);
    const fx = makeFx(root.querySelector('.fest-fx'), n);
    let raf = 0, alive = true;
    const timers = [];
    const later = (ms, fn) => timers.push(setTimeout(fn, ms));
    const loop = () => { if (!alive) return; fx.frame(); raf = requestAnimationFrame(loop); };
    loop();
    const onResize = () => fx.size();
    window.addEventListener('resize', onResize);
    sound(n);
    // impacto
    later(350, () => {
      root.classList.add('hit');
      fx.impact();
      document.body.classList.add('fest-shake');
      later(600, () => document.body.classList.remove('fest-shake'));
    });
    later(600, () => fx.confetti(n >= 5 ? 220 : 140));
    // un rayo por cada kill, sincronizado con los íconos
    for (let i = 0; i < n; i++) later(1050 + i * 220, () => { fx.bolt(); fx.bolt(); });
    // frase tipeada
    const msgEl = root.querySelector('.fest-msg');
    const msg = String(c.msg || '');
    later(1100 + n * 220, () => {
      let k = 0;
      const t = setInterval(() => { k++; msgEl.textContent = msg.slice(0, k); if (k >= msg.length) clearInterval(t); }, 28);
      timers.push(t);
    });
    // fuegos artificiales sin parar
    const fw = setInterval(() => { fx.firework(); if (n >= 5) fx.firework(); }, n >= 5 ? 420 : 650);
    const cf = setInterval(() => fx.confetti(n >= 4 ? 40 : 25), 1800);
    timers.push(fw, cf);
    function close(now) {
      if (!alive) return;
      alive = false;
      timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
      window.removeEventListener('resize', onResize);
      const done = () => { cancelAnimationFrame(raf); root.remove(); if (running && running.root === root) running = null; };
      if (now) done(); else { root.classList.add('out'); setTimeout(done, 450); }
    }
    root.querySelector('.fest-ok').onclick = () => close();
    const play = root.querySelector('.fest-play');
    if (play) play.onclick = () => { close(); if (window.openClip) window.openClip(c.clip, `${c.title} · ${c.champ || ''}`, '', c.msg); };
    later(14000, () => close());
    running = { root, close, fx };
    return running;
  }

  window.celebrate = celebrate;
}());
