'use strict';
// Scout del lobby: racha, one-trick y a quién jugarle. Solo lee el historial del cliente.
// Si un jugador no responde, se saltea. No bloquea el pick.

const ROLE = { top: 'top', jungle: 'jungla', middle: 'mid', bottom: 'adc', utility: 'support' };

function roleOf(pos) {
  return ROLE[String(pos || '').toLowerCase()] || '';
}

function fromHistoryGame(g, puuid, champName) {
  const ids = {};
  for (const pi of g.participantIdentities || []) ids[pi.participantId] = (pi.player || {});
  const meId = Object.keys(ids).find((i) => ids[i].puuid === puuid);
  if (meId === undefined) return null;
  const me = (g.participants || []).find((p) => String(p.participantId) === String(meId));
  if (!me) return null;
  return { win: !!(me.stats || {}).win, champ: champName(me.championId) };
}

// entries: [{ role, champ, games: [{win, champ}] }] con las partidas de la más nueva a la más vieja.
function report(entries) {
  const bits = [];
  let best = null;
  for (const e of entries || []) {
    const games = e.games || [];
    const n = games.length;
    if (!n || !e.champ || e.champ.startsWith('#')) continue;
    const wins = games.filter((g) => g.win).length;
    let streak = 0;
    for (const g of games) { if (!g.win) streak++; else break; }
    const counts = {};
    for (const g of games) counts[g.champ] = (counts[g.champ] || 0) + 1;
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (e.role === 'adc' && streak >= 3) bits.push(`Tu ADC, ${e.champ}, viene de ${streak} derrotas.`);
    if (top && top[1] > 12) bits.push(`${e.champ} es one-trick (${top[1]} de ${n}).`);
    if (e.role && e.role !== 'adc' && e.role !== 'support' && (!best || wins / n > best.wins / best.n)) best = { role: e.role, champ: e.champ, wins, n };
  }
  if (best && best.n >= 8 && best.wins / best.n >= 0.7) bits.push(`El ${best.role} lockeó ${best.champ} y ganó ${best.wins} de ${best.n}. Jugá para el ${best.role}.`);
  return bits.join(' ') || null;
}

module.exports = { roleOf, fromHistoryGame, report };
