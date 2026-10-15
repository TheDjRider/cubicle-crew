// Лична статистика по дни: време по състояния, колко е чакал теб, извиквания на инструменти и токени (от
// message.usage в транскриптите). Само локално, в ~/.pixel-office/stats.json; пише само процесът, който държи
// save.lock (wallet.owner) – иначе два сървъра биха броили двойно. Пази последните KEEP_DAYS дни.
//
// stats.json: { version: 1, days: { 'YYYY-MM-DD': { [sessionId]: {
//   project, sub, ms: { thinking, typing, reading, running, delegating, waiting }, tools, tok: { in, out, cw, cr } } } } }
import fs from 'node:fs';
import path from 'node:path';
import { dayKey } from './public/rules.js';

const KEEP_DAYS = 60;
const SAVE_MS = 30000;
const ACTIVE = ['thinking', 'typing', 'reading', 'running', 'delegating'];

function readJson(f) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } }
const num = (v) => (Number.isFinite(v) && v > 0 ? v : 0);

export class Stats {
  constructor(dir) {
    this.file = path.join(dir, 'stats.json');
    this.data = readJson(this.file) || { version: 1, days: {} };
    this.data.days ||= {};
    this.seen = new Set();   // message.id, вече броени (един отговор се пише на няколко реда със същото usage)
    this.seenQ = [];
    this.dirty = false; this.lastWrite = 0; this.lastStep = 0;
  }

  /** Записът за сесията днес (създава го). */
  rec(agent, project, sub) {
    const day = (this.data.days[dayKey()] ||= {});
    let r = day[agent];
    if (!r) r = day[agent] = { project: String(project || '').slice(0, 80), sub: !!sub, ms: {}, tools: 0, tok: { in: 0, out: 0, cw: 0, cr: 0 } };
    if (project && !r.project) r.project = String(project).slice(0, 80);
    return r;
  }

  /** Събитие от транскрипта (вече разчетено от server.js). */
  event(evt) {
    if (evt.type !== 'tool_start') return;
    this.rec(evt.agent, evt.label, evt.subagent).tools++;
    this.dirty = true;
  }

  /** Ред от транскрипта на асистента: message.usage (броим всяко message.id веднъж). */
  usage(agent, project, sub, msg) {
    const u = msg?.usage;
    if (!u) return;
    const id = msg.id;
    if (id) {
      if (this.seen.has(id)) return;
      this.seen.add(id); this.seenQ.push(id);
      if (this.seenQ.length > 20000) this.seen.delete(this.seenQ.shift());
    }
    const t = this.rec(agent, project, sub).tok;
    t.in += num(u.input_tokens); t.out += num(u.output_tokens);
    t.cw += num(u.cache_creation_input_tokens); t.cr += num(u.cache_read_input_tokens);
    this.dirty = true;
  }

  /** Всеки няколко секунди: колко време е прекарал всеки агент в кое състояние. states: [[id, state, project, sub]]. */
  step(states, now = Date.now()) {
    const dt = this.lastStep ? Math.min(60000, Math.max(0, now - this.lastStep)) : 0;
    this.lastStep = now;
    if (!dt) return;
    for (const [id, st, project, sub] of states) {
      if (st === 'idle' || !st) continue;
      const r = this.rec(id, project, sub);
      r.ms[st] = (r.ms[st] || 0) + dt;
      this.dirty = true;
    }
  }

  flush(force = false) {
    if (!this.dirty || (!force && Date.now() - this.lastWrite < SAVE_MS)) return;
    const keys = Object.keys(this.data.days).sort();
    while (keys.length > KEEP_DAYS) delete this.data.days[keys.shift()];
    try {
      fs.writeFileSync(this.file + '.tmp', JSON.stringify(this.data));
      fs.renameSync(this.file + '.tmp', this.file);
      this.dirty = false; this.lastWrite = Date.now();
    } catch { /* следващия път */ }
  }

  /** Друг процес брои – четем неговия файл. */
  reload() { const d = readJson(this.file); if (d?.days) this.data = d; }

  /** За GET /api/stats: последните n дни, по проекти и общо. */
  summary(days = 7) {
    const out = [];
    const d = new Date();
    for (let i = 0; i < days; i++) {
      const key = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i));
      const day = this.data.days[key] || {};
      const projects = {};
      const total = blank();
      for (const [sid, r] of Object.entries(day)) {
        const p = (projects[r.project || '?'] ||= { ...blank(), project: r.project || '?' });
        for (const t of [p, total]) add(t, r, sid);
      }
      out.push({ day: key, total: fin(total), projects: Object.values(projects).map(fin).sort((a, b) => b.activeMs - a.activeMs) });
    }
    return out;
  }

  /** CSV: един ред на сесия на ден. */
  csv(days = 30) {
    const rows = [['day', 'project', 'session', 'subagent', 'active_min', 'waiting_for_you_min', ...ACTIVE.map((s) => `${s}_min`), 'tool_calls', 'input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens']];
    const keys = Object.keys(this.data.days).sort().slice(-days);
    const min = (ms) => (ms / 60000).toFixed(1);
    for (const k of keys) {
      for (const [sid, r] of Object.entries(this.data.days[k])) {
        const active = ACTIVE.reduce((s, x) => s + (r.ms[x] || 0), 0);
        rows.push([k, r.project, sid, r.sub ? 1 : 0, min(active), min(r.ms.waiting || 0), ...ACTIVE.map((x) => min(r.ms[x] || 0)), r.tools, r.tok.in, r.tok.out, r.tok.cw, r.tok.cr]);
      }
    }
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
  }
}

const blank = () => ({ sessions: 0, subagents: 0, activeMs: 0, leadActiveMs: 0, waitingMs: 0, ms: {}, tools: 0, tokIn: 0, tokOut: 0, tokCache: 0, ids: new Set() });
function add(t, r, sid) {
  if (!t.ids.has(sid)) { t.ids.add(sid); if (r.sub) t.subagents++; else t.sessions++; }
  const active = ACTIVE.reduce((s, x) => s + (r.ms[x] || 0), 0);
  t.activeMs += active; if (!r.sub) t.leadActiveMs += active;
  t.waitingMs += r.ms.waiting || 0;
  for (const [k, v] of Object.entries(r.ms)) t.ms[k] = (t.ms[k] || 0) + v;
  t.tools += r.tools;
  t.tokIn += r.tok.in; t.tokOut += r.tok.out; t.tokCache += r.tok.cw + r.tok.cr;
}
function fin(t) { const { ids, ...rest } = t; void ids; return rest; }
