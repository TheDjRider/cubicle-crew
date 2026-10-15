// „Към терминала“: изкарва отпред прозореца, в който работи дадена сесия на Claude Code.
// pid-ът е от ~/.claude/sessions/<pid>.json; качваме се по родителите до първия процес с прозорец
// (Windows Terminal, VS Code, Terminal.app, iTerm…). Само локално; нищо не се чете от прозорците.
import { execFile } from 'node:child_process';

// Windows: Get-CimInstance за родителите, SetForegroundWindow (+ Alt, за да ни го позволи Windows)
const PS = (pid) => `
$ErrorActionPreference = 'SilentlyContinue'
Add-Type @"
using System; using System.Runtime.InteropServices;
public class CcWin {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, UIntPtr e);
}
"@
$p = ${pid}
for ($i = 0; $i -lt 10 -and $p; $i++) {
  $proc = Get-Process -Id $p
  if ($proc -and $proc.MainWindowHandle -ne [IntPtr]::Zero) {
    $h = $proc.MainWindowHandle
    if ([CcWin]::IsIconic($h)) { [CcWin]::ShowWindow($h, 9) | Out-Null }
    [CcWin]::keybd_event(0x12, 0, 0, [UIntPtr]::Zero); [CcWin]::keybd_event(0x12, 0, 2, [UIntPtr]::Zero)
    [CcWin]::SetForegroundWindow($h) | Out-Null
    Write-Output $proc.ProcessName
    exit 0
  }
  $p = (Get-CimInstance Win32_Process -Filter "ProcessId=$p").ParentProcessId
}
exit 1
`;

const run = (cmd, args, timeout = 6000) => new Promise((resolve) => {
  execFile(cmd, args, { timeout, windowsHide: true }, (err, stdout) => resolve(err ? null : String(stdout || '').trim()));
});

/** macOS: качваме се по ppid до процес вътре в .app и активираме приложението. */
async function focusMac(pid) {
  let p = pid;
  for (let i = 0; i < 10 && p > 1; i++) {
    const comm = await run('ps', ['-o', 'comm=', '-p', String(p)]);
    const m = comm && comm.match(/^(.*?\.app)\/Contents\/MacOS\//);
    if (m) return (await run('open', ['-a', m[1]])) != null ? m[1].split('/').pop().replace(/\.app$/, '') : null;
    const pp = await run('ps', ['-o', 'ppid=', '-p', String(p)]);
    p = Number(pp);
    if (!Number.isInteger(p)) break;
  }
  return null;
}

/** Изкарва отпред прозореца на процеса (или негов родител). Връща името на приложението или null. */
export async function focusPid(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (process.platform === 'win32') return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PS(pid)]);
  if (process.platform === 'darwin') return focusMac(pid);
  return null; // Linux: прозоречните мениджъри са твърде различни – засега не
}
