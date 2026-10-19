// Изглед за телефон в локалната мрежа: по желание (изключен по подразбиране), само за гледане, с PIN.
// Отделен HTTP сървър на 0.0.0.0:<LAN_PORT> (4327) – основният остава само на 127.0.0.1 и с всичките си проверки.
// Телефонът получава страницата (кодът, без данни) свободно; данните (WS и /api/save) – само с бисквитка, която
// се дава срещу верен PIN. Сървърът реже всичко, което разкрива работата: команди, пътища, описания на задачи,
// въпросите за разрешение. Нищо не може да се купи, смени или отговори оттук.
// Записва ~/.pixel-office/lan.json { enabled, pin, port, tokens }.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';

const DEF_PORT = Number(process.env.LAN_PORT) || 4327;
const MAX_TRIES = 5;               // грешни PIN-а от един адрес -> заключване
const LOCK_MS = 60e3;
const COOKIE = 'cc_lan';
const MAX_TOKENS = 10;             // запомнени телефони (най-старият отпада)

const newPin = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');
const cookieOf = (req) => (req.headers.cookie || '').split(';').map((s) => s.trim().split('=')).find(([k]) => k === COOKIE)?.[1] || '';
// само IPv4 адресите в частните мрежи (192.168.x, 10.x, 172.16–31.x) – тях телефонът в същата Wi-Fi вижда
// виртуалните адаптери (WSL, Hyper-V, Docker, VirtualBox, VMware) не се виждат от телефона – без тях; 192.168.x първо
const VIRTUAL = /vethernet|wsl|hyper-v|docker|virtualbox|vmware|vbox|utun|bridge|br-|veth/i;
function lanAddresses() {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL.test(name)) continue;
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) out.push(a.address);
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2);
  return out.sort((a, b) => rank(a) - rank(b));
}

export class Lan {
  /** home = ~/.pixel-office; publicDir/mime – за статичните файлове; snapshot() -> съобщенията за нов клиент;
   *  save() -> wallet.publicSave(). */
  constructor({ home, publicDir, mime, snapshot, save, log = () => {} }) {
    this.file = path.join(home, 'lan.json');
    this.publicDir = publicDir; this.mime = mime; this.snapshot = snapshot; this.saveOf = save; this.log = log;
    this.state = { enabled: false, pin: newPin(), port: DEF_PORT, tokens: [] };
    try { Object.assign(this.state, JSON.parse(fs.readFileSync(this.file, 'utf8'))); } catch { /* няма файл */ }
    if (!/^\d{6}$/.test(String(this.state.pin))) this.state.pin = newPin();
    this.tries = new Map();        // адрес -> { n, until }
    this.server = null; this.wss = null; this.error = null;
  }

  persist() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (e) { this.log(`lan: ${e.message}`); }
  }

  /** За панела с настройките (само от основния, локален сървър). */
  info() {
    const port = this.server ? this.port : this.state.port;
    return { ok: true, enabled: !!this.state.enabled, running: !!this.server, pin: this.state.pin, port,
      urls: this.server ? lanAddresses().map((ip) => `http://${ip}:${port}/`) : [], error: this.error, phones: this.state.tokens.length };
  }

  /** { enabled } включва/изключва; { newPin: true } – нов PIN (и изхвърля запомнените телефони). */
  async set(data = {}) {
    if (data.newPin) { this.state.pin = newPin(); this.state.tokens = []; this.closeClients(); }
    if (typeof data.enabled === 'boolean') this.state.enabled = data.enabled;
    this.persist();
    if (this.state.enabled && !this.server) await this.start();
    else if (!this.state.enabled && this.server) this.stop();
    return this.info();
  }

  async start() {
    if (!this.state.enabled || this.server) return;
    this.error = null;
    const server = http.createServer((req, res) => this.handle(req, res));
    const wss = new WebSocketServer({ server, verifyClient: ({ req }) => this.authed(req) && this.sameOrigin(req) });
    wss.on('error', () => {});
    wss.on('connection', (ws) => { for (const m of this.snapshot()) { const x = this.filter(m); if (x) ws.send(JSON.stringify(x)); } });
    // зает порт (друго приложение или втори Cubicle Crew) -> следващите три, накрая случаен;
    // бисквитката е за адреса, не за порта, така че телефонът остава влязъл
    const listen = (p) => new Promise((res) => {
      const fail = (e) => { server.off('listening', okk); res(e.code === 'EADDRINUSE' || e.code === 'EACCES' ? 'busy' : e.code || 'error'); };
      const okk = () => { server.off('error', fail); res(null); };
      server.once('error', fail); server.once('listening', okk);
      server.listen(p, '0.0.0.0');
    });
    const base = this.state.port;
    let err = 'busy';
    for (const p of [base, base + 1, base + 2, base + 3, 0]) { err = await listen(p); if (err !== 'busy') break; }
    if (err) { this.error = err; try { server.close(); } catch { /* */ } this.log(`lan: cannot listen (${err})`); return; }
    this.server = server; this.wss = wss; this.port = server.address().port;
    if (this.port !== base) this.log(`Phone view: port ${base} is taken – using ${this.port} instead.`);
    this.log(`Phone view: ${lanAddresses().map((ip) => `http://${ip}:${this.port}/`).join('  ') || `port ${this.port}`}`);
  }

  stop() {
    this.closeClients();
    try { this.wss?.close(); this.server?.close(); this.server?.closeAllConnections?.(); } catch { /* */ }
    this.server = null; this.wss = null;
  }
  closeClients() { for (const c of this.wss?.clients || []) c.terminate(); }

  /** Само „безобидното“: състоянията, имената на проектите, монетите и обзавеждането. */
  filter(m) {
    if (!m || typeof m !== 'object') return null;
    if (m.type === 'wallet' || m.type === 'weather') return m;
    if (m.type === 'sessions') return { type: 'sessions', list: (m.list || []).map(({ agent, label, status, provider }) => ({ agent, label, status, ...(provider ? { provider } : {}) })) };
    if (!m.agent) return null; // permission, update, agents… – не
    const { detail, desc, ...rest } = m;
    return rest;
  }

  /** Всяко съобщение на основния сървър минава оттук. */
  send(m) {
    if (!this.wss || !this.wss.clients.size) return;
    const x = this.filter(m);
    if (!x) return;
    const s = JSON.stringify(x);
    for (const c of this.wss.clients) if (c.readyState === 1) c.send(s);
  }

  authed(req) { const t = cookieOf(req); return !!t && this.state.tokens.includes(t); }
  // заявки с Origin (WS, POST) трябва да са от самата страница – не от друг сайт, насочен към този адрес
  sameOrigin(req) { const o = req.headers.origin; return !o || o === `http://${req.headers.host}`; }

  handle(req, res) {
    let urlPath;
    try { urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
    const json = (code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': this.mime['.json'], 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(body)); };
    if (urlPath === '/lan/me') { json(200, { ok: this.authed(req) }); return; }
    if (urlPath === '/lan/login') {
      if (req.method !== 'POST' || !this.sameOrigin(req) || !/^application\/json/.test(req.headers['content-type'] || '')) { res.writeHead(403).end(); return; }
      const ip = req.socket.remoteAddress || '?', now = Date.now(), t = this.tries.get(ip) || { n: 0, until: 0 };
      if (t.until > now) { json(429, { ok: false, error: 'locked', wait: Math.ceil((t.until - now) / 1000) }); return; }
      let body = '';
      req.on('data', (d) => { body += d; if (body.length > 256) req.destroy(); });
      req.on('end', () => {
        let pin = '';
        try { pin = String(JSON.parse(body || '{}').pin || ''); } catch { /* */ }
        const good = pin.length === 6 && crypto.timingSafeEqual(Buffer.from(pin.padEnd(6)), Buffer.from(String(this.state.pin)));
        if (!good) {
          t.n += 1; if (t.n >= MAX_TRIES) { t.n = 0; t.until = now + LOCK_MS; }
          this.tries.set(ip, t);
          json(401, { ok: false, error: t.until > now ? 'locked' : 'pin' });
          return;
        }
        this.tries.delete(ip);
        const token = crypto.randomBytes(24).toString('hex');
        this.state.tokens = [...this.state.tokens, token].slice(-MAX_TOKENS);
        this.persist();
        json(200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${30 * 86400}` });
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
    if (urlPath === '/api/sprites') { json(200, []); return; } // без собствени спрайтове – по-малко за пазене
    if (urlPath === '/api/save') { if (!this.authed(req)) { res.writeHead(401).end(); return; } json(200, this.saveOf()); return; }
    if (urlPath.startsWith('/api/')) { res.writeHead(404).end(); return; }
    // кодът на страницата – без данни, свободно (иначе формата за PIN няма откъде да дойде)
    const file = path.normalize(path.join(this.publicDir, urlPath === '/' ? 'index.html' : urlPath));
    if (file !== this.publicDir && !file.startsWith(this.publicDir + path.sep)) { res.writeHead(403).end(); return; }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404).end(); return; }
      res.writeHead(200, { 'Content-Type': this.mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
}
