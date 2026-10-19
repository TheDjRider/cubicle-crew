// Проверка за нова версия (по желание, изключена по подразбиране): веднъж на ден питаме GitHub за номера на
// последния рилийз. Не се праща нищо за потребителя – само GET без параметри (без бисквитки, без id).
// Пази се в ~/.pixel-office/update.json: { enabled, latest:{version, url}|null, checkedAt, savedAt }.
// WS съобщение: {type:'update', enabled, current, latest:{version, url}|null, newer} – без поле `agent`.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DIR = process.env.PIXEL_OFFICE_HOME || path.join(os.homedir(), '.pixel-office');
const FILE = path.join(DIR, 'update.json');
const EVERY_MS = 24 * 60 * 60 * 1000; // веднъж на ден
const RETRY_MS = 60 * 60 * 1000;      // без интернет – пак след час
const API = process.env.UPDATE_API || 'https://api.github.com/repos/rezored/cubicle-crew/releases/latest';
const RELEASES = 'https://github.com/rezored/cubicle-crew/releases';

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
const CURRENT = readJson(new URL('./package.json', import.meta.url))?.version || '0.0.0';
/** '2.10.0' > '2.9.1'; 'v' отпред и суфикси (-beta) се пропускат. */
const parts = (v) => String(v || '').replace(/^v/i, '').split(/[.-]/).slice(0, 3).map((x) => parseInt(x, 10) || 0);
export function isNewer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

export class Updates {
  constructor(broadcast, log = () => {}) {
    this.broadcast = broadcast; this.log = log;
    this.s = { enabled: false, latest: null, checkedAt: 0, savedAt: 0, ...(readJson(FILE) || {}) };
    this.next = 0; this.busy = false;
  }

  start() { this.timer = setInterval(() => this.tick(), 10 * 60 * 1000); this.timer.unref?.(); this.tick(); }

  msg() {
    const l = this.s.enabled ? this.s.latest : null;
    return { type: 'update', enabled: !!this.s.enabled, current: CURRENT, latest: l, newer: !!l && isNewer(l.version, CURRENT) };
  }

  write() {
    this.s.savedAt = Date.now();
    try {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(FILE + '.tmp', JSON.stringify(this.s, null, 1));
      fs.renameSync(FILE + '.tmp', FILE);
    } catch (e) { this.log(`update: запис – ${e.message}`); }
  }

  /** Друг Cubicle Crew (браузър + приложение) може да е проверил или сменил настройката – взимаме по-новия файл. */
  reload() {
    const f = readJson(FILE);
    if (f && (f.savedAt || 0) > (this.s.savedAt || 0)) { this.s = { ...this.s, ...f }; this.broadcast(this.msg()); }
  }

  async tick(force = false) {
    if (!force) this.reload();
    if (!this.s.enabled || this.busy) return;
    const now = Date.now();
    if (!force && (now < this.next || now - (this.s.checkedAt || 0) < EVERY_MS)) return;
    this.busy = true;
    try {
      const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cubicle-crew' }, signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const version = String(j.tag_name || '').replace(/^v/i, '').slice(0, 20);
      if (!/^\d+\.\d+(\.\d+)?/.test(version)) throw new Error('tag ' + j.tag_name);
      // линкът е само към нашите рилийзи – страницата го показва, приложението го отваря
      const url = typeof j.html_url === 'string' && j.html_url.startsWith(RELEASES + '/') ? j.html_url.slice(0, 200) : RELEASES;
      if (!this.s.enabled) return; // изключено междувременно
      this.s.latest = { version, url };
      this.s.checkedAt = Date.now();
      this.next = this.s.checkedAt + EVERY_MS;
      this.write();
      this.broadcast(this.msg());
    } catch (e) {
      this.next = Date.now() + RETRY_MS;
      this.log(`update: ${e.message}`);
    } finally { this.busy = false; }
  }

  /** POST /api/update {enabled}. Включване = проверка веднага. */
  async set(data) {
    if (data && 'enabled' in data) {
      this.s.enabled = !!data.enabled;
      if (!this.s.enabled) { this.s.latest = null; this.s.checkedAt = 0; }
    }
    this.next = 0;
    this.write();
    this.broadcast(this.msg());
    await this.tick(true);
    return { ok: true, ...this.msg() };
  }
}
