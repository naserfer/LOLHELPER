'use strict';
// Avisa cuando se aprieta o se suelta una tecla, SIN quedarse con ella (Tab sigue abriendo el marcador).
// No es un atajo global de Electron (esos consumen la tecla): un PowerShell consulta GetAsyncKeyState
// cada 40 ms e imprime "1"/"0" cuando cambia. No lee nada del juego ni manda teclas.
const { spawn } = require('child_process');

const VK = { tab: 0x09 };

function script(vk) {
  return [
    "Add-Type -Name K -Namespace PH -MemberDefinition '[DllImport(\"user32.dll\")] public static extern short GetAsyncKeyState(int k);'",
    '$p = $false',
    'while ($true) {',
    `  $d = ([PH.K]::GetAsyncKeyState(${vk}) -band 0x8000) -ne 0`,
    "  if ($d -ne $p) { if ($d) { [Console]::Out.WriteLine('1') } else { [Console]::Out.WriteLine('0') }; [Console]::Out.Flush(); $p = $d }",
    '  Start-Sleep -Milliseconds 40',
    '}',
  ].join('\n');
}

// onChange(true|false). Devuelve una función para parar. Solo en Windows.
function watchKey(key, onChange, opts) {
  opts = opts || {};
  if ((opts.platform || process.platform) !== 'win32') return () => {};
  const vk = VK[key] || key;
  let child = null, stopped = false, restarts = 0, down = false;
  const start = () => {
    if (stopped) return;
    child = (opts.spawn || spawn)('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script(vk)],
      { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    let buf = '';
    child.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line === '1' || line === '0') { down = line === '1'; onChange(down); }
      }
    });
    child.on('exit', () => {
      child = null;
      if (down) { down = false; onChange(false); }
      if (!stopped && restarts++ < 5) setTimeout(start, 3000);
    });
    child.on('error', () => { /* sin PowerShell: no hay arrastre con Tab, queda Alt+Shift+E */ });
  };
  start();
  return () => { stopped = true; if (child) child.kill(); };
}

module.exports = { watchKey, script };
