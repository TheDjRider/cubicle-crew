#!/usr/bin/env node
// npx cubicle-crew – пуска локалния сървър и отваря офиса в браузъра.
// Ако Cubicle Crew вече върви на порта (напр. приложението), само отваря браузъра към него.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { startServer } from '../server.js';

const args = process.argv.slice(2);
const has = (...f) => f.some((x) => args.includes(x));
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };

if (has('-h', '--help')) {
  console.log(`Cubicle Crew – your Claude Code agents in a tiny pixel-art office

Usage: npx cubicle-crew [options]

  --port <n>   port for the local server (default 4317, or $PORT)
  --demo       open the demo with made-up agents
  --no-open    don't open the browser
  -v, --version
  -h, --help

Everything stays on this computer: the server listens on 127.0.0.1 only.
The desktop app (tray widget): https://github.com/rezored/cubicle-crew/releases`);
  process.exit(0);
}
if (has('-v', '--version')) {
  console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  process.exit(0);
}

/** Браузърът по подразбиране (без зависимости). */
function openUrl(url) {
  const [cmd, a] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { spawn(cmd, a, { stdio: 'ignore', detached: true, windowsHide: true }).on('error', () => {}).unref(); } catch { /* отвори го на ръка */ }
}

// Ctrl+C не вика 'exit' сам – така портфейлът се записва преди изход
for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => process.exit(0));

const port = Number(val('--port')) || Number(process.env.PORT) || 4317;
try {
  const { port: actual, external } = await startServer(port);
  const url = `http://localhost:${actual}/${has('--demo') ? '?demo' : ''}`;
  if (!has('--no-open')) openUrl(url);
  if (external) {
    console.log(`Cubicle Crew is already running here: ${url}`);
    process.exit(0);
  }
  console.log(`\nOpen ${url} – press Ctrl+C to stop.`);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
