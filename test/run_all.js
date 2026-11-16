// Corre todas las pruebas: equivalencia con la versión Python y pruebas de las funciones nuevas.
const { execFileSync } = require('child_process');
let bad = 0;
const files = ['test/golden/compare.js', 'test/new_features.js', 'test/support_upgrade.js', 'test/items_list.js', 'test/keywatch.js', 'test/botlane.js', 'test/player.js', 'test/bitty_plus.js', 'test/coach.js', 'test/start_items.js', 'test/mauri.js', 'test/clips.js', 'test/game_plan.js', 'test/live_orders.js', 'test/scout.js', 'test/postgame.js', 'test/e2e.js', 'test/bitty_test.js'];
if (process.env.DISPLAY) files.push('test/clips_e2e.js', 'test/ui.js', 'test/hud_test.js', 'test/upgrade_test.js', 'test/ui_bitty.js', 'test/ui_mauri.js');
for (const f of files) {
  try { process.stdout.write(execFileSync('node', [f], { encoding: 'utf8' })); } catch (e) { process.stdout.write(e.stdout || ''); bad++; }
}
process.exit(bad);
