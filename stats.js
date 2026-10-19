// Лична статистика по дни: време по състояния, колко е чакал теб, извиквания на инструменти и токени (от
// message.usage в транскриптите). Само локално, в ~/.pixel-office/stats.json; пише само процесът, който държи
// save.lock (wallet.owner) – иначе два сървъра биха броили двойно. Пази последните KEEP_DAYS дни.
//
// stats.json: { version: 1, days: { 'YYYY-MM-DD': { [sessionId]: {
//   project, sub, ms: { thinking, typing, reading, running, delegating, waiting }, tools, tok: { in, out, cw, cr }, usd?, np? } } } }
// usd = приблизителната цена по цените на API (само Claude модели; записите отпреди 2.7.0 нямат),
// np = токени от модели без цена в таблицата (Codex, Gemini, OpenCode, непознат модел).
import fs from 'node:fs';
import path from 'node:path';
import { dayKey } from './public/rules.js';

const KEEP_DAYS = 60;
const SAVE_MS = 30000;
const ACTIVE = ['thinking', 'typing', 'reading', 'running', 'delegating'];

// Цени на Claude API в $ за 1M токена: [вход, изход, четене от кеша] (platform.claude.com/docs/en/about-claude/pricing,
// 2026-10-19). Запис в кеша: 1.25× входа за 5 мин, 2× за 1 ч. Ключ: семейство + версия от message.model.
const PRICES = {
  'fable 5.1': [10, 50, 0.25], 'mythos 5.1': [10, 50, 0.25], 'fable 5': [10, 50, 1], 'mythos 5': [10, 50, 1],
  'opus 5.5': [4, 20, 0.2], 'opus 5': [5, 25, 0.5], 'opus 4.8': [5, 25, 0.5], 'opus 4.7': [5, 25, 0.5], 'opus 4.6': [5, 25, 0.5], 'opus 4.5': [5, 25, 0.5],
  'opus 4.1': [15, 75, 1.5], 'opus 4': [15, 75, 1.5],
  'sonnet 5.5': [2, 10, 0.1], 'sonnet 5': [2, 10, 0.2], 'sonnet 4.6': [3, 15, 0.3], 'sonnet 4.5': [3, 15, 0.3], 'sonnet 4': [3, 15, 0.3],
  'haiku 5.5': [0.1, 0.5, 0.01], 'haiku 4.5': [1, 5, 0.1], 'haiku 3.5': [0.8, 4, 0.08],
};
const HAIKU55_LONG = [0.5, 2.5, 0.05]; // Haiku 5.5 при заявка над 100k входни токена (с кеша)
const FAST = new Set(['opus 5.5', 'opus 5', 'opus 4.8']); // usage.speed === 'fast' -> 2×
/** 'claude-opus-4-5-20251101', 'us.anthropic.claude-sonnet-4-5-v1:0', 'claude-opus-4-5@…', 'claude-3-5-haiku-…' -> 'opus 4.5' */
export function modelKey(model) {
  const m = String(model || '').toLowerCase();
  let r = m.match(/claude-(fable|mythos|opus|sonnet|haiku)-(\d+)(?:-(\d)(?!\d))?/);
  if (r) return `${r[1]} ${r[2]}${r[3] ? '.' + r[3] : ''}`;
  r = m.match(/claude-(\d)-(\d)-(opus|sonnet|haiku)/);
  return r ? `${r[3]} ${r[1]}.${r[2]}` : '';
}
/** Цена на един отговор в $ или null, ако моделът няма цена. */
export function costOf(model, u) {
  const key = modelKey(model);
  let p = PRICES[key];
  if (!p || !u) return null;
  const cw = num(u.cache_creation_input_tokens), cw1h = Math.min(cw, num(u.cache_creation?.ephemeral_1h_input_tokens));
  const inp = num(u.input_tokens), cr = num(u.cache_read_input_tokens);
  if (key === 'haiku 5.5' && inp + cw + cr > 100000) p = HAIKU55_LONG;
  const [i, o, r] = p;
  let usd = (inp * i + num(u.output_tokens) * o + cr * r + (cw - cw1h) * i * 1.25 + cw1h * i * 2) / 1e6;
  if (u.speed === 'fast' && FAST.has(key)) usd *= 2;
  if (u.inference_geo === 'us') usd *= 1.1;
  return usd;
}

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
    const r = this.rec(agent, project, sub), t = r.tok;
    t.in += num(u.input_tokens); t.out += num(u.output_tokens);
    t.cw += num(u.cache_creation_input_tokens); t.cr += num(u.cache_read_input_tokens);
    const usd = costOf(msg.model, u);
    if (usd != null) r.usd = (r.usd || 0) + usd;
    else r.np = (r.np || 0) + num(u.input_tokens) + num(u.output_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens);
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
    const rows = [['day', 'project', 'session', 'subagent', 'active_min', 'waiting_for_you_min', ...ACTIVE.map((s) => `${s}_min`), 'tool_calls', 'input_tokens', 'output_tokens', 'cache_write_tokens', 'cache_read_tokens', 'usd_api_estimate']];
    const keys = Object.keys(this.data.days).sort().slice(-days);
    const min = (ms) => (ms / 60000).toFixed(1);
    for (const k of keys) {
      for (const [sid, r] of Object.entries(this.data.days[k])) {
        const active = ACTIVE.reduce((s, x) => s + (r.ms[x] || 0), 0);
        rows.push([k, r.project, sid, r.sub ? 1 : 0, min(active), min(r.ms.waiting || 0), ...ACTIVE.map((x) => min(r.ms[x] || 0)), r.tools, r.tok.in, r.tok.out, r.tok.cw, r.tok.cr, (r.usd || 0).toFixed(4)]);
      }
    }
    const q = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return rows.map((r) => r.map(q).join(',')).join('\n') + '\n';
  }
}

const blank = () => ({ sessions: 0, subagents: 0, activeMs: 0, leadActiveMs: 0, waitingMs: 0, ms: {}, tools: 0, tokIn: 0, tokOut: 0, tokCache: 0, usd: 0, tokNoPrice: 0, ids: new Set() });
function add(t, r, sid) {
  if (!t.ids.has(sid)) { t.ids.add(sid); if (r.sub) t.subagents++; else t.sessions++; }
  const active = ACTIVE.reduce((s, x) => s + (r.ms[x] || 0), 0);
  t.activeMs += active; if (!r.sub) t.leadActiveMs += active;
  t.waitingMs += r.ms.waiting || 0;
  for (const [k, v] of Object.entries(r.ms)) t.ms[k] = (t.ms[k] || 0) + v;
  t.tools += r.tools;
  t.tokIn += r.tok.in; t.tokOut += r.tok.out; t.tokCache += r.tok.cw + r.tok.cr;
  t.usd += r.usd || 0; t.tokNoPrice += r.np || 0;
}
function fin(t) { const { ids, ...rest } = t; void ids; rest.usd = Math.round(rest.usd * 10000) / 10000; return rest; }
