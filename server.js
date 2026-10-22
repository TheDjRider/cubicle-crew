// Следи JSONL транскриптите на Claude Code и праща събития към браузъра.
// ВНИМАНИЕ: форматът на транскриптите не е официален API и може да се промени.
// Пусни с DEBUG=1 (или `npm run debug`), за да видиш какво се парсва.
import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Wallet } from './wallet.js';
import { Weather } from './weather.js';
import { Updates } from './update.js';
import { External } from './external.js';
import { focusPid } from './focus.js';
import { execFile } from 'node:child_process';
import { Permissions } from './permissions.js';
import { Lan } from './lan.js';
import { Folders } from './folders.js';
import { CODEX_ON, CODEX_ROOT, isCodexFile, codexLine, watchOpencode, GEMINI_ON, GEMINI_ROOT, isGeminiFile, geminiLine } from './providers.js';

const PORT = Number(process.env.PORT) || 4317;
const ROOT = process.env.CLAUDE_PROJECTS_DIR || path.join(os.homedir(), '.claude', 'projects');
const ACTIVE_WINDOW_MS = 60 * 60 * 1000; // следим файлове, пипани в последния час
const POLL_MS = 400;
const SCAN_MS = 2000;                    // пълно обхождане на папката (стари/възобновени файлове)
const SESSIONS = process.env.CLAUDE_SESSIONS_DIR || path.join(path.dirname(ROOT), 'sessions'); // <pid>.json на всяка жива сесия
const SESSIONS_MS = 1000;                // и молбите за разрешение идват оттук – да не закъсняват
const LINK_WINDOW_MS = 15000;            // евристика: под-агент, появил се до толкова след Task/Agent
const DEBUG = !!process.env.DEBUG || process.argv.includes('--debug');
// още папки с транскрипти: CLAUDE_PROJECTS_EXTRA (разделени с ;), папките от панела и Cowork задачите на Claude Desktop
// (folders.js) + на Windows сами – ~/.claude/projects във вече пуснатите WSL дистрибуции
// (\\wsl.localhost\<distro>\home\<user>\...). WSL не се пуска от нас; CLAUDE_WSL=0 го изключва.
const EXTRA = (process.env.CLAUDE_PROJECTS_EXTRA || '').split(';').map((s) => s.trim()).filter(Boolean);
const HOME = process.env.PIXEL_OFFICE_HOME || path.join(os.homedir(), '.pixel-office');
// Cowork: CLAUDE_COWORK=0 го изключва; с CLAUDE_PROJECTS_DIR (тестове) – само с изричен CLAUDE_COWORK_DIR
const COWORK_ON = process.env.CLAUDE_COWORK !== '0' && (!process.env.CLAUDE_PROJECTS_DIR || !!process.env.CLAUDE_COWORK_DIR);
const folders = new Folders({ home: HOME, extra: EXTRA, cowork: COWORK_ON, onChange: () => { lastFull = 0; }, log: (m) => console.log(m) });
const WSL_MS = 60000;
let wslRoots = [];
const roots = () => [ROOT, ...folders.roots().map((r) => r.projects), ...wslRoots, ...(CODEX_ON ? [CODEX_ROOT] : []), ...(GEMINI_ON ? [GEMINI_ROOT] : [])];
/** Допълнителният корен (Docker, Cowork…), в който е файлът – за етикета и доставчика. */
const rootOfFile = (file) => folders.roots().find((r) => file.startsWith(r.projects + path.sep));
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const SPRITES = path.join(PUBLIC, 'sprites');
const HOST = '127.0.0.1';                 // само локално – никой от мрежата (Wi-Fi в офиса/кафенето) не вижда сесиите
const STARTED = Date.now();
// DNS rebinding: заявка, чийто Host не е локален, идва от чужд домейн, насочен към 127.0.0.1
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
const localReq = (req) => LOCAL_HOST.test(req.headers.host || '') && (!req.headers.origin || LOCAL_ORIGIN.test(req.headers.origin));

// ---------- статичен сървър ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.png': 'image/png', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp',
};
const server = http.createServer((req, res) => {
  if (!localReq(req)) { res.writeHead(403).end(); return; }
  let urlPath;
  try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; } // лош %-код не срива сървъра
  // списък на override спрайтовете – клиентът не прави заявки към липсващи файлове
  if (urlPath === '/api/sprites') {
    let files = [];
    try { files = fs.readdirSync(SPRITES).filter((f) => /\.(png|json|webp)$/i.test(f)); } catch { /* няма папка */ }
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(files));
    return;
  }
  // портфейл с токени и магазин
  if (urlPath === '/api/save') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(wallet.publicSave()));
    return;
  }
  if (urlPath === '/api/buy' || urlPath === '/api/equip' || urlPath === '/api/avatar' || urlPath === '/api/setup' || urlPath === '/api/pet') {
    // само POST с JSON от localhost: чужда страница не може да харчи токените (JSON от друг произход изисква preflight, който не позволяваме)
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = await wallet.act(urlPath.slice(5), data);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  // „Разреши / Откажи“ от офиса: hook-ът на Claude Code (PermissionRequest, type http) – без Origin, JSON
  if (urlPath === '/api/hook/permission') {
    if (req.method !== 'POST' || req.headers.origin) { res.writeHead(403).end(); return; }
    perms.handleHook(req, res);
    return;
  }
  // решението от страницата, състоянието на hook-а и слагане/махане (POST JSON от localhost, както магазина)
  if (urlPath === '/api/permission' || urlPath === '/api/hook') {
    if (urlPath === '/api/hook' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ ok: true, ...perms.status() }));
      return;
    }
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = urlPath === '/api/permission' ? { ok: perms.decide(String(data.id || ''), String(data.decision || '')) } : perms.install(!!data.on, wallet.port);
      res.writeHead(r.ok || urlPath === '/api/permission' ? 200 : 400, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); // вече отговорена молба – не е грешка
      res.end(JSON.stringify(r));
    });
    return;
  }
  // „Към терминала“: изкарва отпред прозореца на сесията (POST JSON от localhost, както магазина)
  if (urlPath === '/api/focus') {
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const pid = pidOf.get(String(data.agent || ''));
      const app = pid ? await focusPid(pid) : null;
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(app ? { ok: true, app } : { ok: false, error: !pid ? 'nopid' : process.platform === 'linux' ? 'unsupported' : 'window' }));
    });
    return;
  }
  // лична статистика (само локално): обобщение по дни и CSV
  if (urlPath === '/api/stats') {
    const days = Math.max(1, Math.min(60, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 7));
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, days: wallet.statsView().summary(days) }));
    return;
  }
  if (urlPath === '/api/stats.csv') {
    const days = Math.max(1, Math.min(60, Number(new URL(req.url, 'http://x').searchParams.get('days')) || 30));
    res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="cubicle-crew-stats-${days}d.csv"`, 'Cache-Control': 'no-store' });
    res.end('\ufeff' + wallet.statsView().csv(days));
    return;
  }
  // времето навън: състояние, търсене на град, избор/изключване
  if (urlPath === '/api/weather' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(weather.msg()));
    return;
  }
  if (urlPath === '/api/weather/search') {
    const q = new URL(req.url, 'http://x').searchParams;
    weather.search(q.get('q'), q.get('lang')).then((list) => ({ ok: true, list }), () => ({ ok: false, error: 'offline', list: [] })).then((r) => {
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  if (urlPath === '/api/weather') {
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = await weather.set(data);
      res.writeHead(r.ok ? 200 : 400, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  // отворен вход: всеки инструмент (скрипт, curl, hook на Copilot CLI / Cursor…) може да влезе в офиса – вж. docs/api.md.
  // Само локално и без чужд Origin (като другите POST-ове); hook-овете получават празен {} – нищо не решаваме вместо тях.
  if (urlPath === '/api/event') {
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    const chunks = []; let size = 0, big = false;
    req.on('data', (d) => { size += d.length; if (size > 1 << 20) big = true; else chunks.push(d); }); // payload-ите на hook-ове може да носят цели файлове
    req.on('end', () => {
      let data = null;
      try { if (!big) data = JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'); } catch { /* лош JSON */ }
      const q = new URL(req.url, 'http://x').searchParams;
      const r = external.ingest(data, q.get('from') || '', q.get('event') || '');
      res.writeHead(r.hook || r.ok ? 200 : 400, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r.hook ? {} : r.ok ? { ok: true } : { ok: false, error: big ? 'size' : r.error }));
    });
    return;
  }
  // проверка за нова версия (по желание)
  if (urlPath === '/api/update' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(updates.msg()));
    return;
  }
  // изгледът за телефон (lan.js): състояние, вкл./изкл., нов PIN – само от тази машина, както магазина
  if (urlPath === '/api/lan') {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(lan.info())); return; }
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = await lan.set({ enabled: typeof data.enabled === 'boolean' ? data.enabled : undefined, newPin: data.newPin === true });
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  // допълнителни папки с транскрипти (Docker, VM…): списък, добавяне, махане – само от тази машина, както магазина
  if (urlPath === '/api/folders') {
    if (req.method === 'GET') { res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' }); res.end(JSON.stringify(folders.info())); return; }
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = folders.set(data);
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  if (urlPath === '/api/update') {
    const origin = req.headers.origin;
    if (req.method !== 'POST' || !/^application\/json/.test(req.headers['content-type'] || '') || (origin && !LOCAL_ORIGIN.test(origin))) { res.writeHead(403).end(); return; }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 1024) req.destroy(); });
    req.on('end', async () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch { /* празно */ }
      const r = await updates.set(data);
      res.writeHead(200, { 'Content-Type': MIME['.json'], 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(r));
    });
    return;
  }
  const file = path.normalize(path.join(PUBLIC, urlPath === '/' ? 'index.html' : urlPath));
  if (file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, verifyClient: ({ req }) => localReq(req) });
wss.on('error', () => { /* грешките при listen се обработват в startServer */ });
let lan = null; // lan.js – създава се по-долу (портфейлът може да прати нещо още при създаването си)
const broadcast = (evt) => {
  const msg = JSON.stringify(evt);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  lan?.send(evt); // телефонът в локалната мрежа (ако е включен) – без команди и пътища
};
const wallet = new Wallet(broadcast, (m) => console.log(m));
// молбите за разрешение (hook-ът е по желание – вж. permissions.js)
const perms = new Permissions({
  broadcast: (m) => broadcast(m),
  settingsFile: path.join(process.env.CLAUDE_CONFIG_DIR || path.dirname(ROOT), 'settings.json'),
  clients: () => wss.clients.size,
  statusOf: (session) => live.find((x) => x.agent === session)?.status || null,
  brief: (input) => brief(input),
  log: (m) => console.log(m),
});
const weather = new Weather(broadcast, (m) => { if (DEBUG) console.log(m); });
const updates = new Updates(broadcast, (m) => { if (DEBUG) console.log(m); });
// отвореният вход за други агенти (POST /api/event): събитията – като от транскриптите, състоянията – в живите сесии
const external = new External({ emit: (e) => emitEvt(e), changed: () => scanSessions() });
// изглед за телефон в локалната мрежа (по желание, с PIN, само за гледане)
lan = new Lan({
  home: process.env.PIXEL_OFFICE_HOME || path.join(os.homedir(), '.pixel-office'), publicDir: PUBLIC, mime: MIME,
  snapshot: () => [wallet.msg(0, 'sync', null, null, true), { type: 'sessions', list: live }, weather.msg()],
  save: () => wallet.publicSave(), log: (m) => console.log(m),
});
// нов клиент веднага вижда портфейла и живите сесии
wss.on('connection', (ws) => {
  ws.send(JSON.stringify(wallet.msg(0, 'sync', null, null, true)));
  ws.send(JSON.stringify({ type: 'sessions', list: live }));
  ws.send(JSON.stringify(weather.msg()));
  ws.send(JSON.stringify(updates.msg()));
  for (const p of perms.list()) ws.send(JSON.stringify(p));
});

// ---------- живи сесии ----------
// Claude Code пише ~/.claude/sessions/<pid>.json, докато сесията е отворена. Така почиващ оркестратор
// остава в офиса (на дивана), дори да няма нови редове в транскрипта или сървърът да е пуснат след него.
// Съобщението {type:'sessions', list:[{agent, label, status}]} няма поле `agent` – старите клиенти го пропускат.
let live = [], liveKey = '';
const pidOf = new Map(); // сесия -> pid (за „Към терминала“; не се праща към страницата)
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
// pidDomain (Claude Code ≥ 2.1.3xx): "win32:<машина>", "linux::pid:[…]" – pid от контейнер/VM не е наш процес
const ownDomains = new Set();
let nsPid = null;
try { nsPid = process.platform === 'linux' ? fs.readlinkSync('/proc/self/ns/pid') : null; } catch { /* */ }
const ownDomain = (d) => !d || ownDomains.has(d) || (process.platform === 'linux' ? !!nsPid && d.endsWith(nsPid) : d.startsWith(process.platform + ':'));
// сесия от чужд домейн: файлът ѝ няма heartbeat, а при docker kill остава – вярваме му, докато транскриптът е пресен
const FOREIGN_IDLE_MS = 30 * 60e3, FOREIGN_BUSY_MS = 3 * 3600e3;
function lastWrite(sid) {
  let t = 0;
  for (const [f, st] of tracked) if (st.mtime > t && path.basename(f, '.jsonl') === sid) t = st.mtime;
  return t;
}
function scanSessions() {
  const now = Date.now();
  const read = (dir) => { try { return fs.readdirSync(dir).filter((n) => n.endsWith('.json')).map((n) => path.join(dir, n)); } catch { return []; } };
  // основната папка + sessions/ до всеки допълнителен корен (WSL не – достъпът е бавен, а pid-овете са на Linux)
  const files = read(SESSIONS).map((f) => ({ f, r: null }));
  for (const r of folders.roots()) for (const f of read(r.sessions)) files.push({ f, r });
  const list = [];
  for (const { f, r } of files) {
    let s, mtime = 0;
    try { s = JSON.parse(fs.readFileSync(f, 'utf8')); mtime = fs.statSync(f).mtimeMs; } catch { continue; }
    if (!s || typeof s.sessionId !== 'string' || !Number.isInteger(s.pid)) continue;
    const dom = typeof s.pidDomain === 'string' ? s.pidDomain : '';
    if (!r || ownDomain(dom)) {
      if (!alive(s.pid)) continue;
      if (!r && dom) ownDomains.add(dom);
    } else {
      const fresh = Math.max(mtime, lastWrite(s.sessionId));
      if (now - fresh > (s.status === 'busy' ? FOREIGN_BUSY_MS : FOREIGN_IDLE_MS)) continue;
    }
    if (list.some((x) => x.agent === s.sessionId)) continue;
    if (!r || ownDomain(dom)) pidOf.set(s.sessionId, s.pid); // „Към терминала“ – само за наш процес
    const item = { agent: s.sessionId, label: r?.label || (s.cwd ? path.basename(s.cwd) : s.sessionId.slice(0, 8)), status: s.status || null };
    if (r?.provider) item.provider = r.provider;
    // status "waiting" + waitingFor ("permission prompt", …) – Claude Code чака теб (молба за разрешение и т.н.)
    if (typeof s.waitingFor === 'string' && s.waitingFor) item.waitingFor = s.waitingFor.slice(0, 40);
    // името, което Claude Code дава на сесията (напр. "pixel-office-24") – различава две сесии в един проект
    if (typeof s.name === 'string' && s.name) item.name = s.name.slice(0, 40);
    list.push(item);
  }
  for (const x of external.list()) if (!list.some((y) => y.agent === x.agent)) list.push(x);
  list.sort((x, y) => (x.agent < y.agent ? -1 : 1));
  const key = JSON.stringify(list);
  if (key === liveKey) return;
  liveKey = key; live = list;
  if (DEBUG) console.log('живи сесии:', list.map((x) => `${x.label}/${x.agent.slice(0, 8)} ${x.status}`).join(', ') || '—');
  wallet.setLive(list.map((x) => x.agent), list.filter((x) => x.status === 'busy').map((x) => x.agent),
    list.filter((x) => x.status === 'waiting').map((x) => x.agent), Object.fromEntries(list.map((x) => [x.agent, x.label])));
  broadcast({ type: 'sessions', list });
}

// ---------- следене на файлове ----------
const tracked = new Map(); // file -> { pos, rest: Buffer, mtime }
// стари/заспали файлове -> { mtime, size, st? }; проверяват се само при пълното обхождане,
// за да не викаме statSync за стотици стари транскрипти 2.5 пъти в секунда
const dormant = new Map();
let firstScan = true, lastFull = 0;

function listJsonl(dir, out = [], depth = 0) {
  if (depth > 5) return out;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listJsonl(p, out, depth + 1);
    else if (e.name.endsWith('.jsonl')) out.push(p);
  }
  return out;
}

const brief = (input = {}) =>
  String(input.file_path || input.command || input.pattern || input.description || input.url || input.query || '')
    .replace(/\s+/g, ' ').slice(0, 60);

// ---------- връзка под-агент -> родител ----------
// Ред на източниците (от най-сигурен към най-несигурен):
//  1. <agent>.meta.json до файла на под-агента: { toolUseId, requestShape, description } – точен tool_use id
//  2. sessionId в редовете на под-агента / името на папката <sessionId>/subagents/ – кой е родителят
//  3. евристика: последният Task/Agent tool_start в същия проект до LINK_WINDOW_MS преди появата
const links = new Map();        // file -> { parent, parent_tool_use_id, background, desc, source, metaTried }
const delegations = [];         // { parent, projectDir, tool_use_id, ts, claimed }
const DELEGATE = new Set(['Task', 'Agent']);

const isSubFile = (file) => file.includes(`${path.sep}subagents${path.sep}`);
// проектната папка (там, където са главните сесии)
function projectDirOf(file) {
  if (isSubFile(file)) return path.dirname(path.dirname(path.dirname(file)));
  return path.dirname(file);
}

function linkFor(file, obj, agent) {
  let L = links.get(file);
  if (!L) { L = { parent: null, parent_tool_use_id: null, background: false, desc: null, source: null, metaTried: 0 }; links.set(file, L); }
  const now = Date.now();
  // 1) meta.json (може да се появи малко след jsonl файла – пробваме пак до 1 път в секунда)
  if (!L.parent_tool_use_id && now - L.metaTried > 1000) {
    L.metaTried = now;
    try {
      const meta = JSON.parse(fs.readFileSync(file.replace(/\.jsonl$/, '.meta.json'), 'utf8'));
      if (meta.toolUseId) { L.parent_tool_use_id = meta.toolUseId; L.source = 'meta'; }
      if (meta.requestShape === 'background') L.background = true;
      if (meta.description) L.desc = String(meta.description).slice(0, 80);
    } catch { /* няма meta */ }
  }
  // 2) sessionId / папка
  if (!L.parent) {
    if (obj.isSidechain && obj.sessionId && obj.sessionId !== agent) { L.parent = obj.sessionId; L.source ||= 'session'; }
    else if (isSubFile(file)) { L.parent = path.basename(path.dirname(path.dirname(file))); L.source ||= 'path'; }
  }
  // 3) евристика – ако все още не знаем кой tool_use е създал този под-агент
  if (!L.parent_tool_use_id) {
    const pdir = projectDirOf(file);
    let best = null;
    for (let i = delegations.length - 1; i >= 0; i--) {
      const d = delegations[i];
      if (d.claimed || d.projectDir !== pdir || now - d.ts > LINK_WINDOW_MS) continue;
      if (L.parent && d.parent !== L.parent) continue;
      best = d; break;
    }
    if (best) {
      best.claimed = true;
      L.parent_tool_use_id = best.tool_use_id;
      if (!L.parent) { L.parent = best.parent; L.source = 'heuristic'; }
    }
  }
  // tool_use, който meta.json вече е посочил – да не го "вземе" друг под-агент
  if (L.parent_tool_use_id) for (const d of delegations) if (d.tool_use_id === L.parent_tool_use_id) d.claimed = true;
  return L;
}

/** Едно събитие към страницата и портфейла (от Claude Code, Codex или OpenCode). */
function emitEvt(evt) {
  const c = ctxNow.get(evt.agent);
  if (c && ctxSent.get(evt.agent) !== c) { evt.ctx = c[0]; evt.ctxMax = c[1]; ctxSent.set(evt.agent, c); }
  if (DEBUG) console.log(evt.agent.slice(0, 14).padEnd(14), evt.type.padEnd(11), evt.tool || '', evt.detail || '', evt.parent ? `↑${evt.parent.slice(0, 8)} (${evt.link || evt.provider || ''})` : '');
  broadcast(evt);
  wallet.ingest(evt);
}
const usageOf = (agent, label, sub, msg) => wallet.usage(agent, label, sub, msg);
// колко е пълен контекстът на всеки агент: праща се като незадължителни ctx/ctxMax със следващото му събитие
const ctxNow = new Map(), ctxSent = new Map();
function setCtx(agent, ctx, max) {
  if (!(ctx > 0)) return;
  // прозорецът, ако агентът не го казва: най-малкият от обичайните, в който контекстът се побира
  max = max > 0 ? max : [200000, 272000, 400000, 1000000, 2000000].find((m) => m >= ctx) || ctx;
  ctxNow.set(agent, [Math.round(ctx), Math.round(max)]);
}

function handleLine(file, line) {
  if (isCodexFile(file)) { codexLine(file, line, emitEvt, usageOf, setCtx); return; }
  if (isGeminiFile(file)) { geminiLine(file, line, emitEvt, usageOf, setCtx); return; }
  if (file.startsWith(GEMINI_ROOT + path.sep)) return; // други .jsonl в ~/.gemini/tmp (не са разговори)
  let obj;
  try { obj = JSON.parse(line); } catch { return; }
  // само разговорът: от Claude Code 2.1.3xx има и "api-request-blob" (копие на заявката към API-то със същите
  // tool_use/text блокове) – иначе всеки инструмент и отговор идват по два пъти, с етикет от името на папката
  if (obj.type !== 'user' && obj.type !== 'assistant') return;
  const agent = path.basename(file, '.jsonl');
  const subagent = isSubFile(file) || obj.isSidechain === true;
  const R = rootOfFile(file);
  const base = {
    agent,
    label: R?.label || (obj.cwd ? path.basename(obj.cwd) : path.basename(path.dirname(file))),
    subagent,
    ts: Date.now(),
  };
  if (R?.provider) base.provider = R.provider;
  if (subagent) {
    const L = linkFor(file, obj, agent);
    // допълнителни полета – само ако ги знаем (старите клиенти просто ги игнорират)
    if (L.parent) base.parent = L.parent;
    if (L.parent_tool_use_id) base.parent_tool_use_id = L.parent_tool_use_id;
    if (L.background) base.background = true;
    if (L.desc) base.desc = L.desc;
    if (DEBUG && L.source) base.link = L.source;
  }
  // истинските токени (за личната статистика) – само числата от usage, нищо от текста
  if (obj.type === 'assistant' && obj.message?.usage) {
    wallet.usage(agent, base.label, subagent, obj.message);
    const u = obj.message.usage;
    setCtx(agent, (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), /[1m]/i.test(obj.message.model || '') ? 1000000 : 0);
  }
  const content = obj.message?.content;
  const out = [];

  if (typeof content === 'string') {
    out.push({ type: obj.type === 'user' ? 'user_prompt' : 'say' });
  } else if (Array.isArray(content)) {
    for (const b of content) {
      if (b.type === 'tool_use') out.push({ type: 'tool_start', id: b.id, tool: b.name, detail: brief(b.input) });
      else if (b.type === 'tool_result') out.push({ type: 'tool_end', tool_use_id: b.tool_use_id });
      else if (b.type === 'text') out.push({ type: obj.type === 'user' ? 'user_prompt' : 'say' });
      else if (b.type === 'thinking') out.push({ type: 'say' });
    }
  }
  for (const e of out) {
    const evt = { ...base, ...e };
    if (e.type === 'tool_start' && DELEGATE.has(e.tool)) {
      delegations.push({ parent: agent, projectDir: projectDirOf(file), tool_use_id: e.id, ts: Date.now(), claimed: false });
      while (delegations.length > 200) delegations.shift();
    }
    emitEvt(evt);
  }
}

function readNew(file, st) {
  let size;
  try { const stat = fs.statSync(file); size = stat.size; st.mtime = stat.mtimeMs; } catch { tracked.delete(file); return; }
  if (size < st.pos) { st.pos = 0; st.rest = Buffer.alloc(0); } // файлът е пренаписан
  if (size === st.pos) return;
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(size - st.pos);
  fs.readSync(fd, buf, 0, buf.length, st.pos);
  fs.closeSync(fd);
  st.pos = size;
  const all = Buffer.concat([st.rest, buf]);
  const lastNl = all.lastIndexOf(0x0a);
  if (lastNl === -1) { st.rest = all; return; }
  st.rest = all.subarray(lastNl + 1);
  for (const line of all.subarray(0, lastNl).toString('utf8').split('\n')) {
    if (line.trim()) handleLine(file, line);
  }
}

function listDir(dir) {
  try { return fs.readdirSync(dir).filter((n) => n.endsWith('.jsonl')).map((n) => path.join(dir, n)); } catch { return []; }
}

// нов или събуден файл -> tracked; стар (непипан от час) -> dormant
function consider(file, now) {
  let stat;
  try { stat = fs.statSync(file); } catch { return; }
  const d = dormant.get(file);
  if (d && d.mtime === stat.mtimeMs) return;
  if (now - stat.mtimeMs > ACTIVE_WINDOW_MS) { dormant.set(file, { mtime: stat.mtimeMs, size: stat.size, st: d?.st }); return; }
  dormant.delete(file);
  let st = d?.st;
  if (!st) {
    // при старт не пускаме историята отново; възобновен стар файл – от размера, с който заспа
    // (нищо от новото не се губи); нови файлове четем от началото
    const old = firstScan || (stat.birthtimeMs || stat.ctimeMs) < STARTED - 5000;
    st = { pos: d ? d.size : old ? stat.size : 0, rest: Buffer.alloc(0) };
    if (DEBUG) console.log('следя', file);
  }
  tracked.set(file, st);
}

/** Пуснатите WSL дистрибуции с ~/.claude/projects (само Windows; без CLAUDE_PROJECTS_DIR и без CLAUDE_WSL=0). */
function detectWsl() {
  if (process.platform !== 'win32' || process.env.CLAUDE_PROJECTS_DIR || process.env.CLAUDE_WSL === '0') return;
  execFile('wsl.exe', ['-l', '--running', '-q'], { encoding: 'buffer', timeout: 5000, windowsHide: true }, (err, out) => {
    if (err || !out) return;
    const names = out.toString('utf16le').replace(/\uFEFF/g, '').split(/\r?\n/).map((s) => s.replace(/\0/g, '').trim()).filter(Boolean);
    const found = [];
    for (const n of names) {
      if (!/^[\w.-]+$/.test(n)) continue;
      const base = `\\\\wsl.localhost\\${n}`;
      const homes = [path.join(base, 'root')];
      try { for (const u of fs.readdirSync(path.join(base, 'home'))) homes.push(path.join(base, 'home', u)); } catch { /* няма /home */ }
      for (const h of homes) { const p = path.join(h, '.claude', 'projects'); try { if (fs.statSync(p).isDirectory()) found.push(p); } catch { /* */ } }
    }
    if (found.join('|') !== wslRoots.join('|')) { wslRoots = found; for (const p of found) console.log(`WSL: следя ${p}`); }
  });
}

function poll() {
  const now = Date.now();
  if (now - lastFull >= SCAN_MS) {
    lastFull = now;
    for (const root of roots()) for (const file of listJsonl(root)) if (!tracked.has(file)) consider(file, now);
    firstScan = false;
  } else {
    // между пълните обхождания – само папките на проектите (нова сесия) и на активните сесии (нов под-агент);
    // readdir без statSync на старите файлове
    const dirs = new Set();
    try { for (const e of fs.readdirSync(ROOT, { withFileTypes: true })) if (e.isDirectory()) dirs.add(path.join(ROOT, e.name)); } catch { /* няма папка */ }
    for (const f of tracked.keys()) {
      const dir = path.dirname(f);
      dirs.add(dir);
      if (path.basename(dir) !== 'subagents') dirs.add(path.join(dir, path.basename(f, '.jsonl'), 'subagents'));
    }
    for (const dir of dirs) for (const file of listDir(dir)) if (!tracked.has(file) && !dormant.has(file)) consider(file, now);
  }
  for (const [file, st] of tracked) {
    readNew(file, st);
    if (st.mtime && now - st.mtime > ACTIVE_WINDOW_MS) { tracked.delete(file); dormant.set(file, { mtime: st.mtime, size: st.pos, st }); }
  }
}

/** Пуска сървъра. Зает порт: с reuse – ползва вече работещия Cubicle Crew; иначе (и при чуждо приложение) – случаен свободен порт. */
export async function startServer(port = PORT, { reuse = true } = {}) {
  // свободен ли е портът? (проверка с отделен сокет – иначе ws хвърля грешката като необработена)
  const free = (p) => new Promise((res) => {
    const probe = net.createServer();
    probe.once('error', () => res(false));
    probe.once('listening', () => probe.close(() => res(true)));
    probe.listen(p, HOST);
  });
  const listen = (p) => new Promise((res, rej) => { server.once('error', rej); server.listen(p, HOST, () => res(server.address().port)); });
  // фиксиран резервен порт – случаен порт сменя origin-а и трие настройките в localStorage.
  // 4317/4318 са и портовете по подразбиране на OpenTelemetry Collector – често заети на машина за разработка.
  const fallback = async () => {
    for (const p of [port + 1, port + 2, port + 3]) if (await free(p)) return listen(p);
    return listen(0);
  };
  let actual;
  if (await free(port)) actual = await listen(port);
  else if (!reuse) actual = await fallback();
  else {
    try {
      // с таймаут – иначе чужд сървър на порта (напр. gRPC) може да увисне заявката
      const r = await fetch(`http://127.0.0.1:${port}/api/sprites`, { signal: AbortSignal.timeout(2000) });
      if (r.ok && Array.isArray(await r.json())) return { port, external: true }; // вече върви Cubicle Crew
    } catch { /* портът е зает от друго приложение */ }
    actual = await fallback();
  }
  if (actual !== port) console.log(`Port ${port} is taken by another app – using ${actual} instead.`);
  setInterval(poll, POLL_MS);
  poll();
  setInterval(scanSessions, SESSIONS_MS);
  if (CODEX_ON) console.log(`Codex: watching ${CODEX_ROOT}`);
  if (GEMINI_ON) console.log(`Gemini CLI: watching ${GEMINI_ROOT}`);
  watchOpencode(emitEvt, usageOf, (m) => console.log(m), setCtx).catch(() => {});
  lan.start().catch(() => {});
  scanSessions();
  wallet.port = actual;
  perms.syncPort(actual);
  wallet.start();
  weather.start();
  updates.start();
  process.once('exit', () => wallet.close());
  console.log(`Cubicle Crew: http://localhost:${actual}   (demo without Claude: /?demo   showcase: /?demo=showcase)`);
  folders.start();
  console.log(`Watching: ${[ROOT, ...folders.roots().filter((r) => r.kind !== 'cowork').map((r) => r.projects)].join(', ')}`);
  detectWsl(); setInterval(detectWsl, WSL_MS).unref?.();
  return { port: actual, external: false };
}

// `node server.js` – пуска се веднага; при import (от Electron) – само при извикване на startServer()
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  // Ctrl+C не вика 'exit' сам – така портфейлът се записва преди изход
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(sig, () => process.exit(0));
  startServer()
    .then(({ port, external }) => { if (external) console.log(`Cubicle Crew is already running: http://localhost:${port}`); })
    .catch((e) => { console.error(e.message); process.exit(1); });
}

/** За Electron: запис на портфейла преди изход. */
export function flushWallet() { wallet.close(); }
