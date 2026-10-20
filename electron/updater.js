// „Изтегли и инсталирай“ (само инсталираното приложение в Windows): сваля инсталатора на новата версия от нашия
// рилийз в GitHub, проверява SHA-256 спрямо `digest` от API-то и го пуска тихо (/S) върху текущата инсталация –
// монетите, настройките и стартът с Windows остават; --force-run пуска новата версия след инсталирането.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';

const API = 'https://api.github.com/repos/rezored/cubicle-crew/releases/tags/v';
const DL = 'https://github.com/rezored/cubicle-crew/releases/download/';
const UA = { 'User-Agent': 'cubicle-crew', Accept: 'application/vnd.github+json' };

/** Може ли това копие да се обнови само (пакетирано, Windows, NSIS инсталация). */
export function canSelfUpdate(app) {
  return app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_DIR;
}

/** Сваля и проверява инсталатора на version. progress(0..1). Връща пътя до .exe. */
export async function download(version, dir, progress = () => {}) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('version');
  const r = await fetch(API + version, { headers: UA, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('GitHub HTTP ' + r.status);
  const rel = await r.json();
  const name = `CubicleCrew-Setup-${version}.exe`;
  const a = (rel.assets || []).find((x) => x.name === name);
  if (!a) throw new Error('no installer in the release');
  const url = String(a.browser_download_url || '');
  if (!url.startsWith(DL)) throw new Error('unexpected URL');
  const sha = /^sha256:([0-9a-f]{64})$/.exec(a.digest || '')?.[1];
  if (!sha) throw new Error('no checksum');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name), part = file + '.part';
  const res = await fetch(url, { headers: { 'User-Agent': 'cubicle-crew' }, signal: AbortSignal.timeout(15 * 60e3) });
  if (!res.ok || !res.body) throw new Error('download HTTP ' + res.status);
  const total = a.size || +res.headers.get('content-length') || 0;
  const hash = crypto.createHash('sha256'), out = fs.createWriteStream(part);
  let got = 0;
  try {
    for await (const chunk of res.body) {
      hash.update(chunk); got += chunk.length;
      if (!out.write(chunk)) await new Promise((ok) => out.once('drain', ok));
      if (total) progress(Math.min(1, got / total));
    }
    await new Promise((ok, bad) => out.end((e) => (e ? bad(e) : ok())));
  } catch (e) { out.destroy(); fs.rmSync(part, { force: true }); throw e; }
  if ((a.size && got !== a.size) || hash.digest('hex') !== sha) { fs.rmSync(part, { force: true }); throw new Error('checksum mismatch'); }
  fs.renameSync(part, file);
  return file;
}

/** Пуска инсталатора тихо, отделно от нас – после приложението трябва да излезе. */
export function runInstaller(file) {
  spawn(file, ['/S', '--updated', '--force-run'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}
