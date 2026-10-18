// „Разреши / Откажи“ от офиса: Claude Code hook PermissionRequest (type http) -> POST /api/hook/permission.
// Сървърът държи заявката отворена, показва я на страницата и връща решението ти като `decision` на hook-а.
// Ако никой не отговори тук (няма отворена страница, отговорено е в терминала, 45 с) – празен отговор = без
// решение, и Claude Code показва обичайния въпрос в терминала. Hook-ът се слага/маха само по твое желание
// (панелът „?“): резервно копие на settings.json, само нашият запис се пипа.
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

const HOLD_MS = 45000;           // колко чакаме отговор от офиса (hook-ът има timeout 60 с)
const HOOK_PATH = '/api/hook/permission';
const OURS = (h) => h && h.type === 'http' && typeof h.url === 'string' && /^http:\/\/127\.0\.0\.1:\d+\/api\/hook\/permission$/.test(h.url);

export class Permissions {
  /** opts: { broadcast, settingsFile, clients(): number, statusOf(session): 'waiting'|'busy'|…|null, brief(input), log } */
  constructor(opts) {
    this.o = opts;
    this.pending = new Map();    // id -> { id, session, tool, detail, at, res, timer, sawWaiting, leftAt }
    this.seq = 0;
    setInterval(() => this.watch(), 500).unref?.();
  }

  /** POST от Claude Code. Тялото: { session_id, tool_name, tool_input, hook_event_name, … }. */
  handleHook(req, res) {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 256 * 1024) req.destroy(); });
    req.on('end', () => {
      let h = {};
      try { h = JSON.parse(body || '{}'); } catch { /* */ }
      if (h.hook_event_name && h.hook_event_name !== 'PermissionRequest') { res.writeHead(200).end(); return; }
      if (!this.o.clients()) { res.writeHead(200).end(); return; } // никой не гледа офиса – веднага в терминала
      const id = `p${Date.now().toString(36)}${(++this.seq).toString(36)}`;
      const p = { id, session: String(h.session_id || ''), tool: String(h.tool_name || '').slice(0, 60), detail: this.o.brief(h.tool_input || {}), at: Date.now(), res, sawWaiting: false, leftAt: 0 };
      p.timer = setTimeout(() => this.finish(id, null), HOLD_MS);
      this.pending.set(id, p);
      // Claude Code се е отказал (timeout, отговорено в терминала, сесията е затворена)
      res.on('close', () => { if (this.pending.has(id)) this.finish(id, null, true); });
      this.o.broadcast(this.msg(p));
      this.o.log?.(`разрешение: ${p.tool} ${p.detail} (${p.session.slice(0, 8)})`);
    });
  }

  msg(p) { return { type: 'permission', id: p.id, session: p.session, tool: p.tool, detail: p.detail, at: p.at }; }
  /** Чакащите – за нов клиент. */
  list() { return [...this.pending.values()].map((p) => this.msg(p)); }

  /** Решение от страницата: 'allow' | 'deny'. */
  decide(id, decision) {
    if (!this.pending.has(id) || !['allow', 'deny'].includes(decision)) return false;
    this.finish(id, decision);
    return true;
  }

  finish(id, decision, gone = false) {
    const p = this.pending.get(id);
    if (!p) return;
    this.pending.delete(id);
    clearTimeout(p.timer);
    if (!gone) {
      const out = decision === 'allow' ? { behavior: 'allow' } : decision === 'deny' ? { behavior: 'deny', message: 'Denied from Cubicle Crew.' } : null;
      try {
        if (out) { p.res.writeHead(200, { 'Content-Type': 'application/json' }); p.res.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: out } })); }
        else p.res.writeHead(200).end(); // без решение -> обичайният въпрос в терминала
      } catch { /* връзката вече е затворена */ }
    }
    this.o.broadcast({ type: 'permission', id, done: true, decision: decision || null });
  }

  /** Отговорено в терминала: сесията е била „waiting“ и вече не е (след 1 с). */
  watch() {
    for (const p of this.pending.values()) {
      const st = this.o.statusOf(p.session);
      if (st === 'waiting') { p.sawWaiting = true; p.leftAt = 0; continue; }
      if (!p.sawWaiting) continue;
      p.leftAt ||= Date.now();
      if (Date.now() - p.leftAt > 1000) this.finish(p.id, null);
    }
  }

  // ---------------------------------------------------------------- hook-ът в settings.json
  read() {
    const f = this.o.settingsFile;
    let txt = null;
    try { txt = fs.readFileSync(f, 'utf8'); } catch { return { obj: {}, txt: null }; }
    try { return { obj: txt.trim() ? JSON.parse(txt) : {}, txt }; } catch { return { error: 'parse' }; }
  }

  /** { installed, port, file } */
  status() {
    const r = this.read();
    if (r.error) return { installed: false, error: r.error, file: this.o.settingsFile };
    const h = (r.obj.hooks?.PermissionRequest || []).flatMap((g) => g?.hooks || []).find(OURS);
    return { installed: !!h, port: h ? Number(h.url.match(/:(\d+)\//)[1]) : null, file: this.o.settingsFile };
  }

  /** Слага (on) или маха нашия hook. Резервно копие преди всяка промяна; останалото в файла не се пипа. */
  install(on, port) {
    const r = this.read();
    if (r.error) return { ok: false, error: r.error };
    const obj = r.obj && typeof r.obj === 'object' && !Array.isArray(r.obj) ? r.obj : {};
    const groups = Array.isArray(obj.hooks?.PermissionRequest) ? obj.hooks.PermissionRequest : [];
    const kept = groups.map((g) => (g && Array.isArray(g.hooks) ? { ...g, hooks: g.hooks.filter((h) => !OURS(h)) } : g)).filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length);
    if (on) kept.push({ hooks: [{ type: 'http', url: `http://127.0.0.1:${port}${HOOK_PATH}`, timeout: 60 }] });
    if (kept.length) { obj.hooks = { ...(obj.hooks || {}), PermissionRequest: kept }; }
    else if (obj.hooks) { delete obj.hooks.PermissionRequest; if (!Object.keys(obj.hooks).length) delete obj.hooks; }
    const f = this.o.settingsFile;
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      if (r.txt != null) fs.writeFileSync(f.replace(/\.json$/, '') + '.cubicle-crew-backup.json', r.txt);
      fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 2) + '\n');
      fs.renameSync(f + '.tmp', f);
    } catch (e) { return { ok: false, error: 'write', message: e.message }; }
    this.o.log?.(on ? `hook за разрешения: добавен в ${f}` : `hook за разрешения: махнат от ${f}`);
    return { ok: true, ...this.status() };
  }

  /** При старт: ако hook-ът сочи порт, на който никой не слуша, го насочваме към нашия. */
  syncPort(port) {
    const s = this.status();
    if (!s.installed || s.port === port) return;
    const sock = net.connect({ host: '127.0.0.1', port: s.port });
    sock.setTimeout(800);
    const free = () => { sock.destroy(); this.install(true, port); };
    sock.once('connect', () => sock.destroy()); // там работи друг Cubicle Crew – оставяме го
    sock.once('error', free); sock.once('timeout', free);
  }
}
