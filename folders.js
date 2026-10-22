// Още папки с транскрипти освен ~/.claude/projects:
//  - добавени от потребителя (панелът → Поверителност): напр. ~/.claude на агент в Docker/VM, монтиран на хоста.
//    Пазят се в ~/.pixel-office/folders.json { folders: [път, …] }.
//  - Cowork задачите на Claude Desktop: всяка е обикновена Claude Code сесия със своя папка
//    local-agent-mode-sessions/<акаунт>/<орг>/local_<id>/.claude (projects/ + sessions/) – намираме ги сами.
// Всяка папка става корен { projects, sessions, kind, label?, provider? }; server.js ги чете като ~/.claude.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MAX = 12;                         // папки от потребителя
const COWORK_RECENT_MS = 24 * 3600e3;   // Cowork задачи с активност в последното денонощие
const COWORK_MS = 10000;                // колко често търсим нови Cowork задачи

/** Папката, която потребителят посочи -> projects/ + sessions/ до нея (приема и самата projects). */
export function rootOf(dir) {
  const projects = path.basename(dir).toLowerCase() === 'projects' ? dir : path.join(dir, 'projects');
  return { projects, sessions: path.join(path.dirname(projects), 'sessions') };
}

/** Къде Claude Desktop държи Cowork задачите (Windows: и MSIX пакетът, и обикновената инсталация). */
function coworkBases() {
  if (process.env.CLAUDE_COWORK_DIR) return [process.env.CLAUDE_COWORK_DIR];
  const h = os.homedir(), out = [];
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || path.join(h, 'AppData', 'Local');
    const roaming = process.env.APPDATA || path.join(h, 'AppData', 'Roaming');
    out.push(path.join(roaming, 'Claude', 'local-agent-mode-sessions'));
    for (const base of [path.join(local, 'Claude-Data'), path.join(local, 'Packages')]) {
      let names = [];
      try { names = fs.readdirSync(base); } catch { /* няма */ }
      for (const n of names) {
        if (!/^claude_/i.test(n)) continue;
        out.push(path.join(base, n, 'local-agent-mode-sessions'));
        out.push(path.join(base, n, 'LocalCache', 'Roaming', 'Claude', 'local-agent-mode-sessions'));
      }
    }
  } else if (process.platform === 'darwin') out.push(path.join(h, 'Library', 'Application Support', 'Claude', 'local-agent-mode-sessions'));
  else out.push(path.join(process.env.XDG_CONFIG_HOME || path.join(h, '.config'), 'Claude', 'local-agent-mode-sessions'));
  return out;
}

const dirs = (p) => { try { return fs.readdirSync(p, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name); } catch { return []; } };

/** Cowork задачите с активност наскоро -> корени. Етикетът = името на избраната папка (само пътят, не задачата). */
function findCowork(now = Date.now()) {
  const out = [];
  for (const base of coworkBases()) {
    for (const acc of dirs(base)) for (const org of dirs(path.join(base, acc))) {
      const dir = path.join(base, acc, org);
      for (const n of dirs(dir)) {
        if (!n.startsWith('local_')) continue;
        const meta = path.join(dir, n + '.json');
        let st;
        try { st = fs.statSync(meta); } catch { continue; }
        if (now - st.mtimeMs > COWORK_RECENT_MS) continue;
        let label = 'Claude'; // без избрана папка: „★ Claude · Cowork“
        try {
          const j = JSON.parse(fs.readFileSync(meta, 'utf8'));
          const f = Array.isArray(j.userSelectedFolders) ? j.userSelectedFolders.find((x) => typeof x === 'string') : null;
          if (f) label = path.basename(f.replace(/[\\/]+$/, '')) || label;
        } catch { /* */ }
        const cfg = path.join(dir, n, '.claude');
        out.push({ projects: path.join(cfg, 'projects'), sessions: path.join(cfg, 'sessions'), kind: 'cowork', label: label.slice(0, 40), provider: 'cowork' });
      }
    }
  }
  return out;
}

export class Folders {
  /** home = ~/.pixel-office; onChange() – корените са се сменили. */
  constructor({ home, extra = [], cowork = true, onChange = () => {}, log = () => {} }) {
    this.file = path.join(home, 'folders.json');
    this.env = extra;            // CLAUDE_PROJECTS_EXTRA – не се показват за махане в панела
    this.onChange = onChange; this.log = log;
    this.user = this.load();
    this.coworkOn = cowork;
    this.cowork = [];
    this.key = '';
  }

  load() {
    try {
      const j = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return Array.isArray(j.folders) ? j.folders.filter((x) => typeof x === 'string' && path.isAbsolute(x)).slice(0, MAX) : [];
    } catch { return []; }
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify({ folders: this.user }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { this.log(`folders: ${e.message}`); }
  }

  start() {
    if (!this.coworkOn) return;
    const tick = () => {
      const found = findCowork();
      const key = found.map((r) => r.projects).join('|');
      if (key === this.key) return;
      const had = new Set(this.cowork.map((r) => r.projects));
      for (const r of found) if (!had.has(r.projects)) this.log(`Cowork: следя ${r.projects}`);
      this.key = key; this.cowork = found; this.onChange();
    };
    tick();
    setInterval(tick, COWORK_MS).unref?.();
  }

  /** Всички допълнителни корени. */
  roots() {
    return [...this.env.map((p) => ({ ...rootOf(p), kind: 'env' })), ...this.user.map((p) => ({ ...rootOf(p), kind: 'user' })), ...this.cowork];
  }

  /** За панела: папките от потребителя (с това дали в тях вече има транскрипти), от env и колко Cowork задачи следим. */
  info() {
    const row = (p) => { const r = rootOf(p); let found = false; try { found = fs.statSync(r.projects).isDirectory(); } catch { /* */ } return { path: p, found }; };
    return { ok: true, folders: this.user.map(row), env: this.env.map(row), cowork: this.coworkOn ? this.cowork.length : null };
  }

  /** POST /api/folders { add } | { remove } */
  set(data = {}) {
    if (typeof data.add === 'string') {
      const p = path.resolve(data.add.trim().replace(/^"(.*)"$/, '$1'));
      if (!data.add.trim() || !path.isAbsolute(data.add.trim().replace(/^"(.*)"$/, '$1'))) return { ...this.info(), ok: false, error: 'path' };
      let st = null;
      try { st = fs.statSync(p); } catch { /* */ }
      if (!st?.isDirectory()) return { ...this.info(), ok: false, error: 'missing' };
      if (this.user.length >= MAX) return { ...this.info(), ok: false, error: 'full' };
      if (!this.user.some((x) => path.resolve(x) === p)) { this.user.push(p); this.save(); this.onChange(); }
    } else if (typeof data.remove === 'string') {
      const n = this.user.length;
      this.user = this.user.filter((x) => x !== data.remove);
      if (this.user.length !== n) { this.save(); this.onChange(); }
    }
    return this.info();
  }
}
