'use strict';
/* Interfaz de Pick Helper. Recibe la vista del motor y la dibuja. Solo se redibuja cuando cambia
   algo importante; el reloj, el oro y los timers se actualizan en el lugar (sin titilar). */
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const fmtT = (t) => (t <= 0 ? 'VIVO' : `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`);
const pct = (x) => `${Math.round(x)}%`;
const wrc = (wr) => (wr >= 51.5 ? 'good' : wr <= 48.5 ? 'bad' : 'neutral');
const DMG = { AD: 'var(--ad)', AP: 'var(--ap)', MIX: 'var(--mix)', '?': 'var(--muted)' };
const DIFF = { easy: ['FÁCIL', 'green'], skill: ['PAREJO', 'gold'], hard: ['DIFÍCIL', 'red'], xhard: ['MUY DIFÍCIL', 'red'] };
const BUILD_LABEL = { default: 'estándar', vs_ad: 'vs equipo AD', vs_ap: 'vs equipo AP', ad: 'camino AD', ap: 'camino AP' };
const ROLE_TXT = { support: 'support', utility: 'support', adc: 'ADC', bottom: 'ADC', top: 'top', mid: 'mid', middle: 'mid', jungle: 'jungla', todos: 'todos los roles' };
const ROLE_TAG = { top: 'TOP', jungle: 'JG', middle: 'MID', mid: 'MID' };

let ICONS = {};
let S = null;            // último estado completo
const LIVE = {};

/* ------------------------------------------------------------------ íconos */
function icon(kind, name, size, opts = {}) {
  if (!name) return '';
  const u = ICONS[`${kind}:${norm(name)}`];
  const px = Math.round(size * (window.UI_U || 1));
  const style = `width:${px}px;height:${px}px;${opts.border ? `border-color:${opts.border};` : ''}`;
  const tip = opts.tip ? ` data-tip="${esc(opts.tip)}"` : ` data-tip="${esc(name)}"`;
  const initials = esc(String(name).replace(/[^A-Za-z ]/g, '').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase());
  const cls = `ic${opts.round ? ' round' : ''}${opts.dead ? ' dead' : ''}`;
  if (!u) return `<span class="${cls}" style="${style}"${tip}><span class="fb">${initials}</span></span>`;
  // Las iniciales quedan debajo: si la imagen tarda o no carga, se ven igual.
  return `<span class="${cls}" style="${style}"${tip}><span class="fb under">${initials}</span><img src="${esc(u)}" alt="" data-fb="${initials}"></span>`;
}
const items = (names, size, arrows) => `<div class="icons">${(names || []).map((n, i) => (i && arrows ? '<span class="arrow">›</span>' : '') + icon('item', n, size)).join('')}</div>`;
const sec = (title, right) => `<div class="sec">${esc(title)}${right ? `<span class="r">${esc(right)}</span>` : ''}</div>`;
const pill = (txt, cls) => `<span class="pill ${cls}">${esc(txt)}</span>`;
function wrBar(wr, w = 180) {
  const pos = Math.max(0, Math.min(1, (wr - 40) / 20)) * 100;
  const a = Math.min(50, pos), b = Math.max(50, pos);
  return `<div class="wr sp4" style="width:${w}px"><i style="left:${a}%;width:${b - a}%;background:var(--${wrc(wr)})"></i></div>`;
}

/* ------------------------------------------------------------------ guía */
function guideCard(g, enemy, myLevel, role) {
  if (!g) return '';
  const L = g.labels || ['Nivel 1', 'Hasta el nivel 6', 'Desde el 6'];
  const title = role === 'jungle' ? `Cómo jugarle al jungla ${enemy}` : `Cómo jugar la línea vs ${enemy}`;
  const pro = g.src === 'pro';
  // Udyr (no6): no tiene definitiva, así que no hay "antes/después del 6": se muestran las dos partes siempre.
  const phase = myLevel === undefined || g.no6 ? null : myLevel < 6 ? 'pre' : 'post';
  let h = `<div class="card${pro ? ' hi' : ''}"><div class="row"><span class="k" style="color:var(--gold)">${esc(title)}</span><span class="right">${pill(pro ? 'PRO' : 'ANÁLISIS', pro ? 'gold' : 'dark')}</span></div>`;
  if (phase === null ? !(g.no6 && myLevel > 3) : myLevel <= 3) h += `<div class="g-h">${esc(L[0])}</div><div class="g-l">${esc(g.lv1)}</div>`;
  if (phase === null || phase === 'pre') h += `<div class="g-h">${esc(L[1])}</div><ul class="g">${(g.pre6 || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  if (phase === null || phase === 'post') h += `<div class="g-h">${phase === null ? esc(L[2]) : 'Ya sos nivel 6+'}</div><div class="g-l">${esc(g.post6)}</div>`;
  else h += `<div class="g-h off">Cuando llegues al 6</div><div class="g-l off">${esc(g.post6)}</div>`;
  if (g.evitar && g.evitar !== '—') h += `<div class="g-h red">No hagas esto</div><div class="g-l">${esc(g.evitar)}</div>`;
  return `${h}<div class="small muted sp8">Fuente: ${esc(g.por || '')}</div></div>`;
}

/* ------------------------------------------------------------------ plan de bot (support) */
const SRC_PILL = { DATOS: ['DATOS', 'gray'], 'ANÁLISIS': ['ANÁLISIS', 'dark'], HISTORIAL: ['TU HISTORIAL', 'gray'], PRO: ['PRO', 'gold'] };
const srcPill = (src) => pill(...(SRC_PILL[src] || [src, 'dark']));
// En partida (game = true) no hay números: ni winrates, ni sinergias, ni tu récord.
function botCard(bp, ally, game, level) {
  if (!bp) return '';
  const who = ally ? ` con ${esc(ally)}` : '';
  let h = `<div class="card hi bot"><div class="row wrap"><span class="k" style="color:var(--gold)">Plan de bot${who}</span><span class="right">${pill(bp.label, 'gold')}</span></div>`;
  h += `<div class="t sp4">${esc(bp.head)}</div>`;
  if (!game && bp.why && bp.why.length) {
    h += `<ul class="g bot-why">${bp.why.map((w) => `<li>${srcPill(w.src)} ${esc(w.txt)}</li>`).join('')}</ul>`;
  }
  if (bp.combo) h += `<div class="g-h">Combo con tu ADC ${srcPill(bp.combo.src)}</div><div class="g-l">${esc(bp.combo.txt)}</div>`;
  if (bp.threats && bp.threats.length) {
    h += `<div class="g-h red">Respetá ${srcPill('ANÁLISIS')}</div>${bp.threats.map((t) => `<div class="g-l"><b>${esc(t.who)}:</b> ${esc(t.txt)}</div>`).join('')}`;
  }
  if (bp.post6 && bp.post6.length) {
    const off = game && level !== undefined && level < 6;
    h += `<div class="g-h${off ? ' off' : ''}">${game && level >= 6 ? 'Ya sos 6' : 'Desde el 6'} ${srcPill('ANÁLISIS')}</div>${bp.post6.map((t) => `<div class="g-l${off ? ' off' : ''}"><b>${esc(t.who)}:</b> ${esc(t.txt)}</div>`).join('')}`;
  }
  if (!game && bp.missing && bp.missing.length) h += `<div class="small muted sp8">${esc(bp.missing.join(' · ').replace(/^./, (c) => c.toUpperCase()))}</div>`;
  if (!game) h += '<div class="small muted sp8">Fuentes: op.gg (vs support, sinergia) · Lolalytics (vs ADC) · Data Dragon · kits de la wiki (ANÁLISIS) · tu historial. No hay guías PRO de support.</div>';
  return `${h}</div>`;
}

// Plan de jungla / mid (Bitty). Mismo criterio: en partida, sin números.
function jgCard(jp, game, level) {
  if (!jp) return '';
  const title = jp.role === 'jungle' ? 'Plan de jungla' : 'Plan de mid';
  let h = `<div class="card hi bot"><div class="row wrap"><span class="k" style="color:var(--gold)">${title}</span><span class="right">${pill(jp.label, 'gold')}</span></div>`;
  h += `<div class="t sp4">${esc(jp.head)}</div>`;
  if (!game && jp.why && jp.why.length) h += `<ul class="g bot-why">${jp.why.map((w) => `<li>${srcPill(w.src)} ${esc(w.txt)}</li>`).join('')}</ul>`;
  if (jp.threats && jp.threats.length) h += `<div class="g-h red">Respetá</div>${jp.threats.map((t) => `<div class="g-l">${srcPill(t.src)} <b>${esc(t.who)}:</b> ${esc(t.txt)}</div>`).join('')}`;
  if (jp.post6 && jp.post6.length) {
    // Udyr no tiene definitiva: en vez de "Desde el 6" trae su propio título (post6_label) y no se apaga antes del 6.
    const off = !jp.post6_label && game && level !== undefined && level < 6;
    const ttl = jp.post6_label || (game && level >= 6 ? 'Ya sos 6' : 'Desde el 6');
    h += `<div class="g-h${off ? ' off' : ''}">${esc(ttl)} ${srcPill('ANÁLISIS')}</div>${jp.post6.map((t) => `<div class="g-l${off ? ' off' : ''}">${esc(t.txt)}</div>`).join('')}`;
  }
  if (!game && jp.missing && jp.missing.length) h += `<div class="small muted sp8">${esc(jp.missing.join(' · ').replace(/^./, (c) => c.toUpperCase()))}</div>`;
  if (!game) h += `<div class="small muted sp8">${esc(jp.fuente || 'Fuentes: op.gg Master+ y Lolalytics (Master+ y Emerald+, este último a mitad de peso) · kits (ANÁLISIS). No hay guías PRO para estos campeones.')}</div>`;
  return `${h}</div>`;
}

/* ------------------------------------------------------------------ Udyr: AD o AP */
// Lo que a Mauri más le cuesta. En champ select: la decisión, por qué, los dos caminos y el dato. En partida: sin números.
function udyrCard(u, game) {
  if (!u) return '';
  const other = u.path === 'AD' ? 'AP' : 'AD';
  let h = `<div class="card hi udyr"><div class="row wrap"><span class="k" style="color:var(--gold)">¿AD o AP?</span><span class="right">${pill(`ARMÁ ${u.path}`, u.path === 'AP' ? 'ap' : 'ad')}</span></div>`;
  h += `<div class="t sp4">${esc(u.head)}</div>`;
  const rs = (u.reasons || []).filter((r) => !game || r.side === u.path);
  if (rs.length) h += `<ul class="g bot-why">${rs.map((r) => `<li>${pill(r.side ? `→ ${r.side}` : '=', r.side === 'AP' ? 'ap' : r.side === 'AD' ? 'ad' : 'gray')} ${esc(r.txt)}</li>`).join('')}</ul>`;
  h += `<div class="row wrap sp8" style="gap:10px"><div><div class="k">Ítems ${esc(u.path)}</div><div class="sp4">${items(u.items, 30, true)}</div></div>
    <div><div class="k">Subí</div><div class="icons sp4">${u.skills.map((k, i) => `${i ? '<span class="arrow">›</span>' : ''}<span class="pill gray" style="font-size:.85em">${esc(k)}</span>`).join('')}</div></div></div>`;
  h += `<div class="g-h">Por qué ${esc(u.path)} ${srcPill('ANÁLISIS')}</div><div class="g-l">${esc(u.explain[u.path])}</div>`;
  if (!game) {
    h += `<div class="g-h off">Y ${esc(other)}, cuándo</div><div class="g-l off">${esc(u.explain[other])}</div>`;
    if (u.data) h += `<div class="small sp8">${srcPill('DATOS')} ${esc(u.data)}</div>`;
    h += '<div class="small muted sp8">Criterio: el daño de tu equipo pesa el doble que los rivales. Si ya empezaste un camino en partida, se sigue ese. Fuentes: kit de la wiki de LoL (ANÁLISIS) · op.gg Emerald+ (ítems de Udyr jungla, 16.22).</div>';
  }
  return `${h}</div>`;
}

/* ------------------------------------------------------------------ champ select */
function drawSelect(v) {
  const sup = v.mode === 'support';
  let A = '', B = '';
  A += sec('Equipo rival', v.enemies.length ? `AD ${v.ad} · AP ${v.ap}` : '');
  if (v.enemies.length) {
    A += `<div class="pad"><div class="icons">${v.enemies.map((e) => {
      const lane = v.lane_enemy && norm(e.name) === norm(v.lane_enemy);
      return `<div style="text-align:center">${icon('champion', e.name, lane ? 40 : 34, { border: lane ? 'var(--gold)' : DMG[e.dmg] })}<div class="k" style="color:${lane ? 'var(--gold)' : DMG[e.dmg]}">${lane ? (sup ? 'SUP' : ROLE_TAG[v.mode] || 'TOP') : e.dmg === '?' ? '' : e.dmg}</div></div>`;
    }).join('')}</div><div class="bar sp8"><i style="flex:${v.ad};background:var(--ad)"></i><i style="flex:${v.ap};background:var(--ap)"></i></div></div>`;
  } else A += '<div class="empty">Todavía nadie pickeó.</div>';

  if (sup) {
    const ah = v.adc_hist;
    A += `<div class="card"><div class="row"><div class="grow"><div class="k">Tu ADC${v.ally_adc && !v.ally_adc_locked ? ' (hover)' : ''}</div>`;
    A += v.ally_adc ? `<div class="row sp4">${icon('champion', v.ally_adc, 32, { border: 'var(--good)' })}<span class="t big">${esc(v.ally_adc)}</span></div>` : '<div class="dim sp4">Todavía no eligió</div>';
    if (ah && ah.g) A += `<div class="small sp4 ${ah.w * 2 > ah.g ? 'good' : ah.w * 2 < ah.g ? 'bad' : 'dim'}">Vos de support con ${esc(v.ally_adc)}: ${ah.w}-${ah.g - ah.w}</div>`;
    A += `</div><div class="right"><div class="k" style="color:var(--bad)">Línea rival</div><div class="icons sp4" style="justify-content:flex-end">`;
    for (const [n, lab] of [[v.enemy_adc, 'ADC'], [v.lane_enemy, 'SUP']]) A += `<div style="text-align:center">${n ? icon('champion', n, 32, { border: 'var(--bad)' }) : '<span class="ic" style="width:32px;height:32px">?</span>'}<div class="k">${lab}</div></div>`;
    A += '</div></div></div>';
    if (v.ban_sugg.length) A += `<div class="row sp8"><span class="k" style="color:var(--bad)">Baneá</span>${v.ban_sugg.map((n) => icon('champion', n, 24, { border: 'var(--bad)' })).join('')}</div>`;
    A += '</div>';
  } else {
    A += `<div class="card"><div class="row"><div class="grow"><div class="k">${v.mode === 'jungle' ? 'Jungla rival' : `Rival de ${esc(ROLE_TXT[v.mode] || 'top')}`}</div>${v.lane_enemy ? `<div class="row sp4">${icon('champion', v.lane_enemy, 30, { border: 'var(--gold)' })}<span class="t big">${esc(v.lane_enemy)}</span></div>` : '<div class="t big sp4">Pick a ciegas</div>'}</div>`;
    if (v.ban_sugg.length) A += `<div class="right"><div class="k" style="color:var(--bad)">Baneá</div><div class="icons sp4">${v.ban_sugg.map((n) => icon('champion', n, 28, { border: 'var(--bad)' })).join('')}</div></div>`;
    A += '</div></div>';
  }

  if (sup && v.focus && v.focus.bot) A += botCard(v.focus.bot, v.ally_adc, false);
  else if (v.focus && v.focus.jg) A += udyrCard(v.focus.udyr, false) + jgCard(v.focus.jg, false);
  else if (v.win_line) A += `<div class="card hi"><div class="t">${esc(v.win_line)}</div></div>`;
  if (v.scout) A += `<div class="card"><div class="small">${esc(v.scout)}</div></div>`;
  A += sec(sup ? 'Tu support' : 'Tu pick', sup ? 'mejores 5' : '');
  v.recs.forEach((r, i) => {
    const ok = r.status === 'ok', best = i === 0 && ok;
    const sc = r.score;
    let mid = `<div class="row"><span class="nm">${esc(r.name)}</span>${best ? pill('RECOMENDADO', 'gold') : ''}${!ok ? pill(r.status, r.status === 'BANEADO' ? 'red' : 'gray') : ''}</div>`;
    if (r.lane) {
      const m = r.lane[1];
      // Bitty: WR mezclado de op.gg y Lolalytics (partidas efectivas: Emerald+ cuenta a mitad de peso).
      const mwr = m.wr_mix != null ? m.wr_mix : m.wr;
      const mg = m.games_mix != null ? m.games_mix : m.games;
      mid += `<div class="row small"><b class="${wrc(mwr)}">${mwr.toFixed(1)}%</b><span class="dim">vs ${esc(r.lane[0])}${sup ? '' : ` · ${mg.toLocaleString('es')} partidas`}</span>${m.pro ? pill(DIFF[m.pro.diff][0], DIFF[m.pro.diff][1]) : ''}</div>${wrBar(mwr)}`;
      if (m.sources) mid += `<div class="small muted">${esc(m.sources.map((x) => `${x.name.replace('Lolalytics', 'Lola')} ${x.wr.toFixed(1)}%`).join(' · '))}</div>`;
    } else if (!sup) mid += `<div class="small dim">${(r.cfg.blind || 0) >= 1 ? 'Seguro a ciegas' : 'Mejor si ves al rival'}</div>`;
    if (sup) {
      const ch = [];
      if (r.arch) ch.push(pill(r.arch, 'gray'));
      if (r.syn) {
        const d = r.syn[1].delta, cls = d >= 0.5 ? 'good' : d <= -0.5 ? 'bad' : 'neutral';
        ch.push(r.syn[1].est ? `<span class="${Math.abs(d) >= 0.5 ? cls : 'dim'}">≈${d >= 0 ? '+' : ''}${d.toFixed(1)} con ${esc(r.syn[0])} <span class="muted">(estimado por tipo)</span></span>`
          : `<b class="${cls}">sinergia ${d >= 0 ? '+' : ''}${d.toFixed(1)} con ${esc(r.syn[0])}</b>`);
      } else if (v.ally_adc) ch.push(`<span class="muted">dúo casi no jugado con ${esc(v.ally_adc)}</span>`);
      if (r.mine) {
        const pr = r.mine.pair;
        ch.push(`<span style="color:var(--gold-l)">vos: ${pr ? `${pr.w}-${pr.g - pr.w} con ${esc(v.ally_adc)}` : `${r.mine.w}-${r.mine.g - r.mine.w}`}</span>`);
      }
      if (!r.lane) ch.push(`<span class="dim">WR general ${r.cfg.tier_wr.toFixed(1)}%</span>`);
      mid += `<div class="chips">${ch.join('')}</div>`;
    }
    A += `<div class="card${best ? ' hi' : ''}" style="margin-top:${i ? 4 : 0}px"><div class="rec${best ? ' top' : ''}${ok ? '' : ' off'}">${icon('champion', r.name, best ? 48 : 38, { border: best ? 'var(--gold)' : 'var(--gold-d)' })}<div class="grow">${mid}</div><span class="score ${sc > 0.5 ? 'good' : sc < -0.5 ? 'bad' : 'neutral'}">${sc > 0 ? '+' : ''}${sc.toFixed(1)}</span></div></div>`;
  });

  const f = v.focus;
  if (f) {
    const g = f.guide || (f.lane ? f.lane[1].guide : null);
    if (g) B += guideCard(g, f.lane ? f.lane[0] : v.lane_enemy || 'tu línea', undefined, v.mode);
    const p = v.plan;
    if (p) {
      B += sec(`Plan · ${f.name}`, BUILD_LABEL[v.build_key]);
      B += '<div class="pad"><div class="row wrap" style="align-items:flex-start;gap:16px">';
      for (const [title, names] of [['Inicio', p.start], ['Botas', [p.boots]], ['1° vs rival', p.first || []]]) {
        if (names && names.length) B += `<div><div class="k">${title}</div><div class="sp4">${items(names, 32)}</div></div>`;
      }
      B += '</div>';
      if (p.start_note) B += `<div class="small muted sp4">${esc(p.start_note)}</div>`;
      B += `<div class="k sp12">Build</div><div class="sp4">${items(p.build, 36, true)}</div>`;
      B += `<div class="row wrap sp12" style="align-items:flex-start;justify-content:space-between">
        <div><div class="k">Runas · ${esc(p.runes.keystone)}</div><div class="row sp4">${icon('rune', p.runes.keystone, 40, { round: true, border: 'transparent', tip: p.runes.keystone + (p.runes.alt ? `\n${p.runes.alt}` : '') })}<div class="icons">${p.runes.primary.concat(p.runes.secondary).map((n) => icon('rune', n, 22, { round: true, border: 'transparent' })).join('')}</div></div></div>
        <div style="text-align:right"><div class="k">Hechizos · skills</div><div class="icons sp4" style="justify-content:flex-end">${p.spells.map((n) => icon('spell', n, 26)).join('')}</div>
        <div class="icons sp4" style="justify-content:flex-end">${p.skills.map((k, i) => `${i ? '<span class="arrow">›</span>' : ''}<span class="pill gray" style="font-size:.85em">${esc(k)}</span>`).join('')}</div></div></div>`;
      if (p.pro) {
        const d = DIFF[p.pro.diff];
        B += `<div class="card" style="margin:10px 0 0;border-color:var(--gold-d)"><div class="row"><span class="k" style="color:var(--gold)">★ Challenger · Federals1</span><span class="right">${pill(d[0], d[1])}</span></div>
          <div class="row sp8">${icon('item', p.pro.start, 28)}<span class="arrow">›</span>${icon('rune', p.pro.keystone, 30, { round: true, border: 'transparent' })}${p.pro.rush ? `<span class="arrow">›</span>${icon('item', p.pro.rush, 28)}` : ''}${p.pro.spell ? `<span class="arrow">+</span>${icon('spell', p.pro.spell, 24)}` : ''}</div>
          <div class="small dim sp4">${esc([p.pro.start, p.pro.keystone, p.pro.rush && `rush ${p.pro.rush}`, p.pro.spell].filter(Boolean).join(' · '))}</div></div>`;
      }
      if (p.tip && !g) B += `<div class="sp8">En línea: ${esc(p.tip)}</div>`;
      B += `<div class="small dim sp8">${esc(p.general)}</div></div>`;
    }
  }
  return cols(A, B);
}

/* ------------------------------------------------------------------ partida */
function drawGame(v) {
  const me = v.me;
  let H = `<div class="gh">${icon('champion', me.champ, 38, { border: 'var(--gold)' })}<div class="grow"><div class="t big">${esc(me.champ)}</div><div class="small dim">Nivel ${me.level} · ${esc(me.kda)} · ${me.cs} CS</div></div>
    <div class="right"><div class="gold-big" data-live="gold">${v.gold}</div><div class="small muted" data-live="time">${fmtT(v.time)}</div></div></div>`;
  let A = '', B = '';
  if (v.death) A += `<div class="toast${v.death.verdict && v.death.verdict !== 'error' ? ' ok' : ''}"><div class="ttl">Moriste · ${esc(v.death.title)}</div><div class="sp4">${esc(v.death.text)}</div></div>`;
  const b = v.buy;
  if (!v.in_pool) A += `<div class="empty">${esc(me.champ)} no está en tu pool: no tengo build para recomendarte.</div>`;
  else if (b) {
    const ok = b.missing === 0;
    const buys = b.items.concat(b.extra ? [b.extra] : []);
    A += `<div class="card hi"${ok ? '' : ' style="border-color:var(--line)"'}><div class="row"><span class="k" style="color:${ok ? 'var(--gold)' : 'var(--dim)'}">${ok ? 'Comprá ahora' : 'Próxima compra'}</span>${ok ? `<span class="right">${pill(`${b.cost} de oro`, 'gold')}</span>` : ''}</div>
      <div class="icons sp8">${buys.map((n, i) => (i ? '<span class="arrow">+</span>' : '') + icon('item', n, i === 0 ? 46 : 38, { border: ok ? 'var(--gold)' : 'var(--gold-d)' })).join('')}</div>
      <div class="t sp8">${esc(buys.join(' + '))}</div>${ok ? '' : `<div class="bad small" data-live="missing" style="font-weight:700">Te faltan ${b.missing} de oro</div>`}
      <div class="row sp8">${icon('item', b.target, 24)}<div class="grow"><div style="font-weight:700">${b.start ? 'Inicio de partida' : `${b.complete ? 'Completa' : 'Hacia'} ${esc(b.target)}`}</div><div class="small dim">Por qué: ${esc((v.why || {})[b.target] || 'parte de la build')}</div>
      ${(b.also || []).map((nx) => `<div class="small dim">Con lo que sobra avanzás ${esc(nx)}: ${esc((v.why || {})[nx] || '')}</div>`).join('')}</div></div></div>`;
  } else A += '<div class="empty good">Build completa. Si sobra oro: Control Ward y elixires.</div>';
  const up = v.sup_upgrade;
  if (up) {
    A += `<div class="card hi"><div class="row"><span class="k" style="color:var(--gold)">${up.ready ? 'Evolucioná el ítem de support' : 'Evolución de support'}</span><span class="right">${pill(up.ready ? 'GRATIS' : 'ANÁLISIS', up.ready ? 'gold' : 'dark')}</span></div>
      <div class="row sp8">${icon('item', up.item, 46, { border: 'var(--gold)' })}<div class="grow"><div class="t">${esc(up.item)}</div>
      <div class="small dim">${up.ready ? 'Ya está lista: la elegís en el menú del ítem, sin gastar oro.' : 'Cuando pase a Bounty of Worlds, la elegís gratis en el menú del ítem.'}</div>
      <div class="small sp4">Por qué: ${esc(up.why)}</div></div></div></div>`;
  }
  if ((v.queue || []).length > 1) A += sec('Después') + `<div class="pad">${items(v.queue.slice(1), 32, true)}</div>`;

  const rl = v.rules_live || [];
  if (rl.length) {
    A += sec(v.rules_early ? 'Tu plan hasta el 14' : 'Tus reglas', v.rules_early ? 'de tus partidas' : 'menos confiables');
    A += `<div class="card" style="margin-top:0">${rl.map((r) => `<div class="rule"><span class="dot" style="background:var(--${r.ok ? 'good' : 'bad'})"></span><b>${esc(r.rule)}</b><span class="v ${r.ok ? 'good' : 'bad'}" data-live="rule:${r.key}">${esc(r.value)}</span></div>
      <div class="small dim">${esc(r.note)} · cumpliéndola ganás ${r.wr_ok}%, si no ${r.wr_no}%</div>`).join('')}</div>`;
  }

  const l = v.lane;
  if (v.bot_plan && v.time < 14 * 60) B += botCard(v.bot_plan, v.ally_adc, true, me.level);
  if (v.udyr && v.time < 20 * 60) B += udyrCard(v.udyr, true);
  if (v.jg_plan && v.time < 14 * 60) B += jgCard(v.jg_plan, true, me.level);
  if (l && v.guide && v.time < 16 * 60) B += guideCard(v.guide, l.champ, me.level, v.role);
  A += sec(v.support_mode ? 'Support rival' : v.role === 'jungle' ? 'Jungla rival' : 'Tu rival');
  if (l) {
    const dl = l.level - me.level;
    A += `<div class="card" style="margin-top:0"><div class="row">${icon('champion', l.champ, 40, { border: l.dead ? 'var(--muted)' : 'var(--bad)', dead: l.dead })}<div class="grow"><div class="t">${esc(l.champ)}${l.dead ? ' <span class="muted">(muerto)</span>' : ''}</div>
      <div class="small"><b class="${dl >= 1 ? 'bad' : dl <= -1 ? 'good' : 'dim'}">Nivel ${l.level}</b> <span class="dim">(${dl > 0 ? '+' : ''}${dl} vs vos) · ${esc(l.kda)} · ${l.cs} CS</span></div></div>
      <div class="icons">${l.spells.filter(Boolean).map((s) => icon('spell', s, 22, { tip: s.replace('Summoner', '') })).join('')}</div></div>
      ${l.items.length ? `<div class="sp8">${items(l.items, 28)}</div>` : ''}${l.ult ? `<div class="small sp8">${esc(l.ult)}</div>` : ''}</div>`;
  } else A += '<div class="empty">No pude detectar a tu rival de línea.</div>';
  const ea = v.enemy_adc;
  if (ea) A += `<div class="card" style="margin-top:4px"><div class="row">${icon('champion', ea.champ, 32, { border: 'var(--bad)' })}<div class="grow"><div class="t">ADC rival: ${esc(ea.champ)}</div><div class="small dim">Nivel ${ea.level} · ${esc(ea.kda)}</div></div></div>${ea.items.length ? `<div class="sp8">${items(ea.items, 24)}</div>` : ''}</div>`;
  if (v.ally_adc && v.support_mode) A += `<div class="small dim pad sp4">Tu ADC: ${esc(v.ally_adc)}</div>`;

  if (v.alerts.length) B += sec('Alertas') + v.alerts.map(([tone, t]) => `<div class="alert ${tone}">${esc(t)}</div>`).join('');
  B += sec('Equipo rival', `AP ${Math.round(v.ap_share * 100)}% · AD ${100 - Math.round(v.ap_share * 100)}%`);
  B += `<div class="pad"><div class="icons">${v.threats.map((t, i) => `<div style="text-align:center">${icon('champion', t.name, i ? 32 : 38, { border: DMG[t.dmg], dead: t.dead, tip: `${t.name} · nivel ${t.level} · ${t.kda}` })}<div class="small ${i ? 'dim' : 'bad'}">${esc(t.kda)}</div></div>`).join('')}</div>
    <div class="bar sp8"><i style="flex:${1 - v.ap_share};background:var(--ad)"></i><i style="flex:${v.ap_share};background:var(--ap)"></i></div><div class="small muted sp4">Ordenados por amenaza (oro en ítems + kills).</div></div>`;
  return H + cols(A, B);
}

/* ------------------------------------------------------------------ coach (fuera de partida) */
const verdictPill = (v) => (v === 'error' ? pill('EVITABLE', 'red') : v === 'cambio' ? pill('CAMBIO', 'green') : v === 'sacrificio' ? pill('OBJETIVO', 'green') : pill('—', 'dark'));
function drawCoach(status) {
  const c = S.coach || {};
  const h = S.history || {};
  let A = '', B = '';
  const kind = status[0];
  A += `<div class="hero"><span class="gem"></span><h1>${kind === 'off' ? 'Sin conexión' : 'Listo'}</h1><div class="dim small sp4">${kind === 'off' ? 'Abrí el cliente de League para conectar.' : 'Entrá a champ select y aparece la recomendación.'}</div></div>`;

  // Última partida: repaso + autopsia
  const last = c.last;
  if (last) {
    const res = last.win === true ? 'Victoria' : last.win === false ? 'Derrota' : 'Resultado pendiente';
    A += sec('Tu última partida', `${res} · ${last.champ}`);
    A += `<div class="card${last.win === false ? ' bad' : last.win ? ' good' : ''}" style="margin-top:0">`;
    const rv = last.review_early;
    if (rv) {
      A += `<div class="t">Cumpliste ${rv.met} de ${rv.total} de tu plan hasta el 14</div>${rv.items.map((it) => `<div class="line"><b class="${it.ok ? 'good' : 'bad'}">${it.ok ? '✓' : '✗'}</b><span class="grow">${esc(it.rule)}</span><span class="dim">hiciste ${esc(it.value)}</span></div>`).join('')}`;
      if (rv.key_miss) A += `<div class="neutral sp8" style="font-weight:700">Para la próxima: ${esc(rv.key_miss.rule)}. En las partidas posteriores dio ${pct(rv.key_miss.wr_ok)} cuando la cumpliste y ${pct(rv.key_miss.wr_no)} cuando no.</div>`;
    } else if (last.snap14) {
      const s = last.snap14;
      A += `<div class="k">Hasta el minuto 14</div><div class="row wrap sp4 small" style="gap:4px 14px"><span>Muertes <b>${s.d14}</b></span><span>Visión <b>${Math.round(s.vis14)}</b></span><span>Control Wards <b>${s.cw14}</b></span><span>Oro <b>${Math.round(s.gold14).toLocaleString('es')}</b></span><span>Participación <b>${pct(s.kp14)}</b></span>${last.item1 ? `<span>1er legendario <b>${Number(last.item1).toFixed(1)} min</b></span>` : ''}</div>`;
    } else A += '<div class="small dim">El overlay no estaba abierto al minuto 14 de esta partida.</div>';
    if (last.deaths.length) {
      const rv2 = last.review || {};
      const bits = [];
      if (rv2.errors != null) bits.push(`${rv2.errors} evitable${rv2.errors === 1 ? '' : 's'}`);
      if (rv2.cambios) bits.push(`${rv2.cambios} cambio${rv2.cambios > 1 ? 's' : ''}`);
      if (rv2.sacrificios) bits.push(`${rv2.sacrificios} por objetivo`);
      A += `<div class="k sp12">Autopsia: ${last.deaths.length} muerte${last.deaths.length > 1 ? 's' : ''}${bits.length ? ` · ${esc(bits.join(' · '))}` : ''}</div>`;
      if (rv2.costly) A += `<div class="small bad sp4" style="font-weight:700">La más cara: ${esc(rv2.costly.title)} al ${fmtT(rv2.costly.t)} (${esc(rv2.costly.cost_text)}).</div>`;
      A += `<div class="death">${last.deaths.map((d) => `<span class="tm">${fmtT(d.t)}</span><div><div class="row wrap" style="gap:6px">${verdictPill(d.verdict)}<b class="${d.verdict === 'error' ? 'bad' : d.verdict === 'neutral' ? 'dim' : d.primary === 'cambio' || d.primary === 'sacrificio' ? 'good' : 'neutral'}">${esc(d.title)}</b></div><div class="small dim">${d.facts ? `${esc(d.facts)}. ` : ''}${esc(d.text)}</div>${d.cost_text ? `<div class="small muted">Costo: ${esc(d.cost_text)}</div>` : ''}${d.clip ? `<button class="btn clipbtn sp4" data-clip="${esc(d.clip)}" data-title="${esc(`${fmtT(d.t)} · ${d.title}`)}" data-text="${esc(d.text)}">▶ Ver la muerte</button>` : ''}</div>`).join('')}</div>`;
      if (!last.deaths.some((d) => d.clip) && (S.clips || {}).state === 'sin-placa') A += '<div class="small muted sp8">Sin clips: tu placa de video no pudo codificar (se apagan para no bajarte FPS).</div>';
    } else A += '<div class="good small sp8">No moriste en toda la partida.</div>';
    A += '</div>';
  }

  // Tus jugadas: triples, cuádruples y pentas (se guardan, las muertes no)
  const plays = S.plays || [];
  if (plays.length) {
    A += sec('Tus jugadas', `${plays.length} guardada${plays.length > 1 ? 's' : ''}`);
    A += `<div class="pad">${plays.map((p) => `<div class="play"><div class="row wrap" style="gap:6px">${pill(p.title, 'gold')}<b>${esc(p.champ || '')}</b><span class="right small muted">${esc(new Date(p.date).toLocaleDateString('es'))}</span></div>
      <div class="sp4">${esc(p.msg)}</div><button class="btn clipbtn sp4" data-clip="jugadas/${esc(p.file)}" data-title="${esc(`${p.title} · ${p.champ || ''}`)}" data-congrats="${esc(p.msg)}">▶ Verla de nuevo</button></div>`).join('')}</div>`;
  }

  // Tu coach: un foco, tu progreso, qué te hace perder y lo que hiciste bien (todas las partidas grabadas)
  const au = c.autopsy;
  A += sec('Por qué morís', au && au.deaths ? `${au.deaths} muertes · ${au.games} partidas${au.early ? ` · ${au.early} antes del 14` : ''}` : '');
  if (au && au.deaths) {
    A += '<div class="pad">';
    if (au.focus) A += `<div class="card hi" style="margin-top:0"><div class="k" style="color:var(--gold)">Tu foco para la próxima</div><div class="t sp4">${esc(au.focus.title)}</div><div class="sp4">${esc(au.focus.tip)}</div><div class="small dim sp4">${esc(au.focus.text)}</div></div>`;
    else if (au.next) A += `<div class="card hi" style="margin-top:0"><div class="k">Para la próxima</div><div class="t sp4">${esc(au.next.text)}</div></div>`;
    if (au.progress) A += `<div class="small sp8 ${au.progress.better ? 'good' : au.progress.worse ? 'bad' : 'dim'}" style="font-weight:700">${esc(au.progress.text)}</div>`;
    if (au.hurts && au.hurts.length) A += `<div class="g-h red">Qué te hace perder</div>${au.hurts.map((x) => `<div class="g-l"><b>${esc(x.title)}:</b> ${esc(x.text)}</div>`).join('')}`;
    if (au.good && au.good.length) A += `<div class="g-h" style="color:var(--good)">Lo que hiciste bien</div>${au.good.map((x) => `<div class="g-l">${esc(x)}</div>`).join('')}`;
    if (au.patterns.length) A += '<div class="g-h">Todas las causas</div>';
    for (const p of au.patterns.slice(0, 5)) {
      const dec = (x) => x.toFixed(1).replace('.', ',');
      const cmp = p.in_wins !== null && p.in_losses !== null ? `<span class="muted"> · por partida: ${dec(p.in_losses)} en derrotas, ${dec(p.in_wins)} en victorias</span>` : '';
      A += `<div class="pat"><div class="row"><b>${esc(p.title)}</b><span class="right ${p.pct >= 30 ? 'bad' : 'neutral'}" style="font-weight:800">${Math.round(p.pct)}%</span></div><div class="bar"><i style="width:${p.pct}%;background:${p.pct >= 30 ? 'var(--bad)' : 'var(--gold)'}"></i></div><div class="small dim sp4">${esc(p.tip)}${cmp}</div></div>`;
    }
    if (au.games < 5) A += `<div class="small muted sp8">Con ${au.games} partida${au.games > 1 ? 's' : ''} grabada${au.games > 1 ? 's' : ''} es una primera mirada: se afina con cada partida.</div>`;
    A += '</div>';
  } else A += '<div class="empty">Se llena solo: jugá con el overlay abierto y cada muerte queda analizada.</div>';

  // Reglas tempranas: cada rol aprende por separado y solo activa reglas que se
  // sostienen en partidas posteriores a las usadas para entrenarlas.
  const earlyModels = Object.values(c.earlyByRole || {});
  B += sec('Tu plan hasta el minuto 14', 'aprendido y validado por rol');
  if (earlyModels.length) {
    for (const e of earlyModels) {
      const title = ROLE_TXT[e.role] || e.label || e.role;
      B += `<div class="card" style="margin-top:0"><div class="row"><b>${esc(title)}</b><span class="right dim">${e.have}/${e.need} partidas</span></div>`;
      const rules = (c.early_rules_text || {})[e.role] || [];
      if (rules.length) {
        B += rules.map((r) => `<div class="line sp8"><b class="grow">${esc(r.text)}</b>${pill('SE SOSTUVO', 'good')}</div><div class="small dim">En partidas posteriores: ${pct(r.wr_ok)} al cumplirla (${r.ok[1]}), ${pct(r.wr_no)} al no cumplirla (${r.no[1]}).</div>`).join('');
      } else if (e.have < 20) {
        const need = Math.max(0, 20 - e.have);
        B += `<div class="small dim sp8">Faltan ${need} partidas completas de ${esc(title)} para la muestra inicial. Después valido el patrón con partidas posteriores.</div>`;
      } else if (e.train_n < 20) {
        B += `<div class="small dim sp8">Estoy separando las partidas de ${esc(title)} para aprender con las anteriores y validar con las posteriores (${e.train_n}/20 de entrenamiento).</div>`;
      } else if (e.validation_wins < 5 || e.validation_losses < 5) {
        B += `<div class="small dim sp8">Validación posterior: ${e.validation_wins} victorias y ${e.validation_losses} derrotas; hacen falta 5 de cada para evaluar las reglas.</div>`;
      } else if (e.candidates && e.candidates.some((r) => r.validation.status === 'pendiente')) {
        B += '<div class="small dim sp8">Hay patrones en revisión; todavía faltan partidas posteriores en alguno de sus dos grupos para validarlos.</div>';
      } else if (e.candidates && e.candidates.length) {
        B += '<div class="small dim sp8">Los patrones iniciales no se sostuvieron en las partidas posteriores. Sigo midiendo.</div>';
      } else {
        B += '<div class="small dim sp8">Todavía no aparece un patrón claro en tus partidas de este rol.</div>';
      }
      B += '</div>';
    }
    B += '<div class="small muted sp8">Solo cuentan partidas completas con resultado y rol identificable. Las anteriores sin rol se recuperan si el campeón pertenece a un único pool.</div>';
  } else B += '<div class="empty">El coach necesita un perfil con roles configurados.</div>';

  // Reglas de partida completa, también separadas por rol y verificadas en partidas posteriores.
  const fullModels = Object.entries(h.rules_by_role || {});
  if (fullModels.length) {
    B += sec('Condiciones de partida completa', 'menos confiables · validadas por rol');
    for (const [role, model] of fullModels) {
      const title = ROLE_TXT[role] || role;
      B += `<div class="card" style="margin-top:0"><div class="row"><b>${esc(title)}</b><span class="right dim">${model.have} partidas</span></div>`;
      if (model.rules.length) {
        B += model.rules.map((r) => `<div class="line sp8"><span class="grow">${esc(r.text)}</span><b class="neutral">${pct(r.wr_ok)} vs ${pct(r.wr_no)}</b></div><div class="small dim">Partidas posteriores: ${r.ok[1]} cumpliéndola y ${r.no[1]} sin cumplirla.</div>`).join('');
      } else if (model.have < 20) {
        B += `<div class="small dim sp8">Faltan ${20 - model.have} partidas de ${esc(title)} para la muestra inicial; después valido con partidas posteriores.</div>`;
      } else if (model.train_n < 20) {
        B += `<div class="small dim sp8">Separando entrenamiento y validación de ${esc(title)} (${model.train_n}/20 de entrenamiento).</div>`;
      } else if (model.validation_wins < 5 || model.validation_losses < 5) {
        B += `<div class="small dim sp8">Validación posterior: ${model.validation_wins} victorias y ${model.validation_losses} derrotas; hacen falta 5 de cada.</div>`;
      } else if (model.candidates && model.candidates.some((r) => r.validation.status === 'pendiente')) {
        B += '<div class="small dim sp8">Hay condiciones en revisión; todavía faltan partidas posteriores en alguno de sus dos grupos.</div>';
      } else {
        B += '<div class="small dim sp8">Los patrones iniciales no se sostuvieron en partidas posteriores.</div>';
      }
      B += '</div>';
    }
    B += '<div class="small muted sp8">Los números de la partida completa pueden ser consecuencia de ir ganando, no la causa.</div>';
  }

  // Historial
  if (h.games) {
    B += sec(`Tus últimas ${h.games} partidas`, `${h.wins}-${h.games - h.wins} · ${pct(100 * h.wins / h.games)}`);
    const line = (name, g, w, kind, extra = '') => {
      const p = g ? 100 * w / g : 0;
      return `<div class="line">${kind ? icon(kind, name, 24) : ''}<span class="grow">${esc(name)}</span><b class="${p >= 55 ? 'good' : p <= 45 ? 'bad' : 'neutral'}">${w}-${g - w} ${pct(p)}</b>${extra ? `<span class="dim small">${extra}</span>` : ''}</div>`;
    };
    if (h.mates.length) B += sec('Con quién más jugaste', 'mismo equipo') + `<div class="pad">${h.mates.map((m) => line(m.name, m.g, m.w)).join('')}</div>`;
    if (h.champs.length) B += sec('Tus campeones') + `<div class="pad">${h.champs.slice(0, 6).map((x) => line(x.key, x.g, x.w, 'champion', `KDA ${((x.k + x.a) / Math.max(1, x.d)).toFixed(1)}`)).join('')}</div>`;
    if (h.with_adc.length) B += sec('De support, con cada ADC') + `<div class="pad">${h.with_adc.slice(0, 6).map((x) => line(x.key, x.g, x.w, 'champion')).join('')}</div>`;
  } else if (kind === 'off') B += '<div class="empty">Tu historial se carga cuando abras el cliente.</div>';
  else if (h.state === 'cargando' || h.state === 'pendiente') B += '<div class="empty">Cargando tu historial…</div>';

  const role = (S.settings || {}).rol_por_defecto;
  const roles = (S.profile || {}).roles || { utility: 'Support', top: 'Top' };
  B += `${sec('Ajustes')}<div class="pad row"><span class="small dim grow">Rol cuando no hay rol asignado (normales, blind)</span><span class="seg">${Object.entries(roles).map(([k, lab]) => `<button data-role="${k}" class="${role === k ? 'on' : ''}">${esc(lab)}</button>`).join('')}</span></div>`;
  const pid = (S.profile || {}).id;
  const NAMES = { naser: 'Naser', bitty: 'Bitty', mauri: 'Mauri' };
  const others = Object.keys(NAMES).filter((k) => k !== pid);
  if (pid) B += `<div class="pad row wrap sp8"><span class="small dim grow">Jugador: <b style="color:var(--gold-l)">${esc(NAMES[pid] || pid)}</b> (cada uno con sus datos)</span>${others.map((o) => `<button class="btn" data-switch="${o}">Cambiar a ${NAMES[o]}</button>`).join('')}</div>`;
  B += hudSettings();
  const cs = S.clips || {};
  const clipsOn = (S.settings || {}).clips_enabled !== false;
  const csTxt = !clipsOn ? 'Apagado.' : cs.state === 'grabando' ? `Grabando con ${cs.hw ? 'la placa de video' : 'el procesador'} (${cs.width}×${cs.height}).` : cs.state === 'sin-placa' ? 'Tu placa de video no pudo codificar: los clips quedan apagados para no bajarte FPS.' : 'Listo: arranca solo en la próxima partida.';
  B += `${sec('Clips')}<div class="card" style="margin-top:0"><div class="row"><span class="grow">Clip de cada muerte y de tus triples (o más)</span><span class="seg"><button data-clips="on" class="${clipsOn ? 'on' : ''}">Sí</button><button data-clips="off" class="${clipsOn ? '' : 'on'}">No</button></span></div>
    <div class="small dim sp8">${esc(csTxt)} Se graba en memoria: al disco solo van los clips. Los de muertes se borran solos al empezar la partida siguiente; las jugadas se guardan (las últimas 30).</div></div>`;
  // Windows: arranque oculto con el ícono en la bandeja (por defecto todo en Sí).
  const st = S.settings || {};
  const yes = (k) => st[k] !== false;
  const tog = (k, label) => `<div class="row sp4"><span class="grow small">${esc(label)}</span><span class="seg"><button data-tog="${k}" data-val="on" class="${yes(k) ? 'on' : ''}">Sí</button><button data-tog="${k}" data-val="off" class="${yes(k) ? '' : 'on'}">No</button></span></div>`;
  B += `${sec('Windows')}<div class="card" style="margin-top:0">${tog('arranque_windows', 'Iniciar con Windows (oculta, con el ícono abajo a la derecha)')}${tog('bandeja', 'La X la manda a la bandeja (el overlay sigue andando)')}${tog('mostrar_en_champ', 'Aparecer sola al empezar el champ select')}
    <div class="small dim sp8">Para cerrarla del todo: clic derecho en el ícono de la bandeja → Salir.</div></div>`;
  return cols(A, B);
}

function hudSettings() {
  const st = S.settings || {};
  const on = st.hud_enabled !== false;
  return `${sec('Overlay dentro del juego')}<div class="card" style="margin-top:0">
    <div class="row"><span class="grow">Mostrar qué comprar y los avisos sobre el juego</span><span class="seg"><button data-hud="on" class="${on ? 'on' : ''}">Sí</button><button data-hud="off" class="${on ? '' : 'on'}">No</button></span></div>
    <div class="row wrap sp8"><button class="btn" data-hudcmd="edit">${HUD_EDIT ? 'Terminar de acomodar' : 'Acomodar posiciones'}</button><button class="btn" data-hudcmd="reset">Posiciones de fábrica</button><button class="btn" data-hudcmd="monitor">Cambiar monitor (${(st.hud_display || 0) + 1})</button></div>
    <div class="small dim sp8">Atajos dentro del juego: <b>Alt+Shift+H</b> ocultar/mostrar · <b>Alt+Shift+E</b> acomodar · <b>Alt+Shift+R</b> posiciones de fábrica · mantené <b>Tab</b> y arrastrá un recuadro para moverlo.<br>Jugá en modo <b>Sin bordes</b>: en pantalla completa exclusiva Windows no deja dibujar encima.</div></div>`;
}
let HUD_EDIT = false;

function cols(A, B) { return `<div class="cols"><div class="col colA">${A}</div><div class="col colB">${B}</div></div>`; }

/* ------------------------------------------------------------------ render */
function setBrand() {
  const t = (S && S.profile && S.profile.title) || 'PICK HELPER';
  const el = document.querySelector('.brand .name');
  if (el.textContent !== t) el.textContent = t;
}
function setStatus(st) {
  const el = $('#status');
  el.className = `status ${st[0]}`;
  el.querySelector('span').textContent = st[1];
}
function render() {
  if (!S) return;
  setBrand();
  setStatus(S.status);
  const v = S.view;
  const scroll = $('#scroll');
  const keep = scroll.scrollTop;
  let html;
  if (!v) html = drawCoach(S.status);
  else if ('gold' in v) html = drawGame(v);
  else html = drawSelect(v);
  html += `<div class="foot"><span>${esc(v && 'gold' in v ? 'Datos en vivo del juego' : S.meta || '')}</span><span>Arrastrá la barra para mover · doble clic: pantalla completa</span></div>`;
  $('#app').innerHTML = html;
  scroll.scrollTop = keep;
  for (const b of document.querySelectorAll('[data-role]')) b.onclick = () => window.ph.settings({ rol_por_defecto: b.dataset.role });
  for (const b of document.querySelectorAll('[data-clips]')) b.onclick = () => window.ph.settings({ clips_enabled: b.dataset.clips === 'on' });
  for (const b of document.querySelectorAll('[data-tog]')) b.onclick = () => window.ph.settings({ [b.dataset.tog]: b.dataset.val === 'on' });
  for (const b of document.querySelectorAll('[data-switch]')) b.onclick = () => window.ph.switchPlayer(b.dataset.switch);
  for (const b of document.querySelectorAll('[data-hud]')) b.onclick = () => window.ph.settings({ hud_enabled: b.dataset.hud === 'on' });
  for (const b of document.querySelectorAll('[data-hudcmd]')) b.onclick = () => window.ph.hud(b.dataset.hudcmd);
  applyLive(S.live);
}
function applyLive(l) {
  if (!l) return;
  const set = (sel, txt) => { const e = document.querySelector(sel); if (e && e.textContent !== txt) e.textContent = txt; };
  set('[data-live="gold"]', String(l.gold));
  set('[data-live="time"]', fmtT(l.time));
  if (l.missing > 0) set('[data-live="missing"]', `Te faltan ${l.missing} de oro`);
  (l.objectives || []).forEach(([, t], i) => set(`[data-live="obj:${i}"]`, fmtT(t)));
  for (const [k, val] of l.rules || []) set(`[data-live="rule:${k}"]`, val);
}

/* escala con el ancho de la ventana */
function rescale() {
  const w = window.innerWidth;
  const colW = w >= 760 ? w / 2 : w;
  const u = Math.max(0.9, Math.min(1.45, colW / 430));
  window.UI_U = u;
  document.documentElement.style.setProperty('--u', u.toFixed(3));
}
let rt = null;
window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const old = window.UI_U; rescale(); if (Math.abs(old - window.UI_U) > 0.02) render(); }, 120); });

/* si un ícono no carga, se muestran las iniciales */
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName === 'IMG' && img.dataset.fb !== undefined) img.remove();
}, true);

/* tooltips */
const tip = $('#tip');
document.addEventListener('mouseover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) { tip.classList.remove('on'); return; }
  tip.textContent = t.dataset.tip;
  const r = t.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - 290, r.left)}px`;
  tip.style.top = `${r.bottom + 6}px`;
  tip.classList.add('on');
});

$('#b-min').onclick = () => window.ph.win('min');
$('#b-max').onclick = () => window.ph.win('max');
$('#b-close').onclick = () => window.ph.win('close');
$('#b-pin').onclick = () => window.ph.win('pin');
document.getElementById('bar').ondblclick = () => window.ph.win('max');

window.ph.on('icons', (m) => { ICONS = m; render(); });
window.ph.on('state', (s) => { S = s; render(); });
// Festejo de triple o más al terminar la partida (lo manda main.js una sola vez por partida).
window.ph.on('celebrate', (c) => { if (window.celebrate) window.celebrate(Object.assign({ champIcon: ICONS[`champion:${norm(c.champ)}`] || null }, c)); });
window.ph.on('tick', (s) => { if (S) { S.status = s.status; S.live = s.live; setStatus(s.status); applyLive(s.live); } });
window.ph.on('win', (w) => {
  if ('pinned' in w) $('#b-pin').classList.toggle('on', w.pinned);
  if ('hudEdit' in w && w.hudEdit !== HUD_EDIT) { HUD_EDIT = w.hudEdit; render(); }
});
rescale();
window.ph.ready();

/* ------------------------------------------------------------------ reproductor de clips */
function openClip(src, title, text, congrats) {
  closeClip();
  const m = document.createElement('div');
  m.id = 'clipmodal';
  m.innerHTML = `<div class="clipbox"><div class="row"><b class="grow">${esc(title)}</b><button class="btn" id="clipclose">Cerrar</button></div>
    <div class="clipvid">${congrats ? `<div class="congrats"><span>🎉</span> ${esc(congrats)}</div>` : ''}<video src="pickhelper://clip/${esc(src)}" controls autoplay playsinline></video></div>
    ${text ? `<div class="small dim sp8">${esc(text)}</div>` : ''}</div>`;
  document.body.appendChild(m);
  m.addEventListener('click', (e) => { if (e.target === m || e.target.id === 'clipclose') closeClip(); });
}
function closeClip() { const m = document.getElementById('clipmodal'); if (m) m.remove(); }
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-clip]');
  if (b) openClip(b.dataset.clip, b.dataset.title, b.dataset.text, b.dataset.congrats);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeClip(); });
