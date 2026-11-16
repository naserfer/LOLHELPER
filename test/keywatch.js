// Tab se lee sin quedarse con la tecla: un PowerShell consulta su estado y avisa cuando cambia.
const { EventEmitter } = require('events');
const { watchKey, script } = require('../src/keywatch');

let failed = 0;
const ok = (c, msg) => { console.log(`${c ? 'OK  ' : 'FALLA'} ${msg}`); if (!c) failed++; };

const s = script(9);
ok(/GetAsyncKeyState\(9\)/.test(s), 'consulta el estado de Tab (código 9)');
ok(!/SendInput|keybd_event|mouse_event|ReadProcessMemory|OpenProcess/.test(s), 'no manda teclas ni lee memoria de otro proceso (reglas de Riot)');

let spawned = null;
const fake = () => {
  const c = new EventEmitter();
  c.stdout = new EventEmitter();
  c.kill = () => { c.killed = true; };
  spawned = c;
  return c;
};
const seen = [];
const stop = watchKey('tab', (d) => seen.push(d), { platform: 'win32', spawn: fake });
spawned.stdout.emit('data', Buffer.from('1\r\n'));
spawned.stdout.emit('data', Buffer.from('0'));
spawned.stdout.emit('data', Buffer.from('\r\n1\r\nbasura\r\n'));
ok(JSON.stringify(seen) === '[true,false,true]', `avisa al apretar y al soltar, aunque lleguen cortados (${JSON.stringify(seen)})`);
const c1 = spawned;
c1.emit('exit');
ok(seen[seen.length - 1] === false, 'si PowerShell se cierra con Tab apretado, se suelta el arrastre');
stop();
ok(watchKey('tab', () => {}, { platform: 'linux', spawn: () => { throw new Error('no'); } })() === undefined, 'fuera de Windows no hace nada');

if (failed) { console.log(`keywatch: ${failed} fallas`); process.exit(1); }
console.log('keywatch: todo OK');
