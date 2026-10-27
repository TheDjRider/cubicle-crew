// Други агенти освен Claude Code: Codex (OpenAI) и OpenCode. Само четем техните локални записи, нищо не
// пишем и не пипаме настройки. Събитията са същите като от Claude Code (+ незадължително поле `provider`).
//
// Codex:    ~/.codex/sessions/YYYY/MM/DD/rollout-<време>-<uuid>.jsonl ($CODEX_HOME), ред по ред като транскриптите
//           на Claude – server.js го следи със същия механизъм и вика codexLine() за всеки нов ред.
// OpenCode: SQLite база ($XDG_DATA_HOME|~/.local/share)/opencode/opencode.db ($OPENCODE_DB); таблиците session,
//           message, part (JSON в `data`). Четем само новите/променените части веднъж в секунда (read-only).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// ---------------------------------------------------------------- общи
const clip = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Командата без обвивката bash -lc "…" / powershell -Command "…". */
export function unwrapShell(cmd) {
  const c = String(cmd || '').trim();
  const m = c.match(/^(?:\S*[\\/])?(?:bash|sh|zsh|pwsh|powershell(?:\.exe)?|cmd(?:\.exe)?)\s+(?:-\w+\s+)*(?:\/c\s+)?["']?([\s\S]*?)["']?$/i);
  return m && m[1] ? m[1] : c;
}

/** Командата от шел -> кой инструмент би бил при Claude (чете ли, търси ли или пуска нещо). */
export function shellTool(cmd) {
  const c = unwrapShell(cmd);
  const w = (c.split(/\s+/)[0] || '').replace(/^.*[\\/]/, '').toLowerCase();
  if (['rg', 'grep', 'egrep', 'findstr', 'select-string', 'ag', 'ack'].includes(w)) return 'Grep';
  if (['cat', 'type', 'get-content', 'gc', 'head', 'tail', 'less', 'more', 'nl', 'ls', 'dir', 'get-childitem', 'gci', 'tree', 'wc', 'find', 'fd', 'stat'].includes(w)) return 'Read';
  if (w === 'sed' && /\s-n\s/.test(c + ' ')) return 'Read';
  return 'Bash';
}

// ================================================================ Codex
export const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
export const CODEX_ROOT = path.join(CODEX_HOME, 'sessions');
/** Следим ли Codex: да, освен в тестове с CLAUDE_PROJECTS_DIR без изрично CODEX_HOME (и CODEX=0). */
export const CODEX_ON = process.env.CODEX !== '0' && (!process.env.CLAUDE_PROJECTS_DIR || !!process.env.CODEX_HOME);
export const isCodexFile = (file) => file.startsWith(CODEX_ROOT + path.sep);

const codexMeta = new Map();   // файл -> { id, label, parent }

/** session_meta (първият ред на файла): cwd, id и дали е под-агент. Чете се веднъж за файл. */
function metaOf(file) {
  let m = codexMeta.get(file);
  if (m) return m;
  const uuid = (path.basename(file, '.jsonl').match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) || [])[0];
  m = { id: 'codex:' + (uuid || path.basename(file, '.jsonl')), label: 'codex', parent: null };
  try {
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    const first = buf.subarray(0, n).toString('utf8').split('\n')[0];
    applyMeta(m, JSON.parse(first));
  } catch { /* непълен първи ред – ще дойде с handleLine */ }
  codexMeta.set(file, m);
  return m;
}
function applyMeta(m, obj) {
  if (obj?.type !== 'session_meta') return;
  const p = obj.payload || {};
  if (p.cwd) m.label = path.basename(String(p.cwd).replace(/[\\/]+$/, '')) || m.label;
  // под-агент (spawn_agent): в meta има родителската нишка
  const par = p.parent_thread_id || p.source?.subagent?.parent_thread_id || p.source?.subagent?.thread_spawn?.parent_thread_id || p.forked_from_id;
  if (par && typeof par === 'string') m.parent = 'codex:' + par;
}

/** Име + детайл за извикване на инструмент в Codex. */
function codexTool(name, args) {
  let a = args;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { /* custom tool: суров текст */ } }
  const cmdOf = (x) => (Array.isArray(x) ? x.join(' ') : x);
  switch (name) {
    case 'shell': case 'container.exec': case 'local_shell': case 'exec_command': case 'shell_command': {
      const cmd = cmdOf(a?.command ?? a?.cmd ?? a);
      return [shellTool(cmd), clip(unwrapShell(cmd))];
    }
    case 'apply_patch': {
      const t = typeof a === 'string' ? a : a?.input || a?.patch || '';
      const f = String(t).match(/\*\*\* (?:Update|Add|Delete) File: (.+)/);
      return [/\*\*\* Add File/.test(t) ? 'Write' : 'Edit', clip(f ? f[1] : '')];
    }
    case 'update_plan': return ['TodoWrite', ''];
    case 'view_image': return ['Read', clip(a?.path)];
    case 'web_search': case 'web_search_call': return ['WebSearch', clip(a?.query || a?.action?.query)];
    case 'spawn_agent': case 'create_agent': return ['Agent', clip(a?.message || a?.prompt || a?.task)];
    case 'wait': case 'write_stdin': return ['Bash', 'wait'];
    case 'exec': {
      // „code mode“: JS, който вика tools.exec_command({cmd: …}) – взимаме командата, ако я има
      const s = typeof a === 'string' ? a : a?.code || '';
      const c = String(s).match(/exec_command\(\{\s*cmd:\s*["'`]([^"'`]+)/);
      return c ? [shellTool(c[1]), clip(c[1])] : ['Bash', 'js'];
    }
    default: return [name, clip(a?.path || a?.file_path || a?.query || a?.command)];
  }
}

/**
 * Един ред от rollout файл на Codex -> събития във формата на Claude Code (без base полетата).
 * emit(evt) получава { agent, label, subagent, parent?, provider, type, … }; usage(agent, label, sub, msg) – токени.
 */
export function codexLine(file, line, emit, usage, setCtx = () => {}) {
  let obj;
  try { obj = JSON.parse(line); } catch { return; }
  const m = metaOf(file);
  if (obj.type === 'session_meta') { applyMeta(m, obj); return; }
  const base = { agent: m.id, label: m.label, subagent: !!m.parent, provider: 'codex', ts: Date.now() };
  if (m.parent) base.parent = m.parent;
  const out = (e) => emit({ ...base, ...e });
  const p = obj.payload || {};
  if (obj.type === 'response_item') {
    if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      const name = p.namespace && !['functions', 'exec'].includes(p.namespace) ? `${p.namespace.startsWith('mcp__') ? p.namespace : 'mcp__' + p.namespace}__${p.name}` : p.name || p.type;
      const [tool, detail] = name.startsWith('mcp__') ? [name, ''] : codexTool(p.type === 'local_shell_call' ? 'local_shell' : name, p.type === 'local_shell_call' ? p.action : p.arguments ?? p.input);
      out({ type: 'tool_start', id: p.call_id || p.id, tool, detail });
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output' || p.type === 'local_shell_call_output') {
      out({ type: 'tool_end', tool_use_id: p.call_id });
    } else if (p.type === 'web_search_call') {
      const id = p.id || p.call_id || `ws${Date.now()}`;
      out({ type: 'tool_start', id, tool: 'WebSearch', detail: clip(p.action?.query) });
      out({ type: 'tool_end', tool_use_id: id });
    } else if (p.type === 'message' && p.role === 'assistant') out({ type: 'say' });
    else if (p.type === 'reasoning') out({ type: 'say' });
  } else if (obj.type === 'event_msg') {
    if (p.type === 'user_message') out({ type: 'user_prompt' });
    else if (p.type === 'item_completed' && p.item?.type === 'UserMessage') out({ type: 'user_prompt' });
    else if (p.type === 'token_count' && p.info?.last_token_usage) {
      const u = p.info.last_token_usage, cached = u.cached_input_tokens || 0;
      if (p.info.model) base.model = p.info.model; // не е проверено в реален payload – няма ли го, няма ред „Модел“
      setCtx(base.agent, u.input_tokens || 0, p.info.model_context_window || 0); // input_tokens включва кешираните = целият контекст
      usage(base.agent, base.label, base.subagent, {
        id: `${base.agent}@${obj.timestamp || ''}`,
        usage: { input_tokens: Math.max(0, (u.input_tokens || 0) - cached), output_tokens: u.output_tokens || 0, cache_read_input_tokens: cached, cache_creation_input_tokens: u.cache_write_input_tokens || 0 },
      });
    }
  }
}

// ================================================================ OpenCode
function opencodeDb() {
  if (process.env.OPENCODE_DB) return path.resolve(process.env.OPENCODE_DB); // работи и с относителен път
  if (process.env.CLAUDE_PROJECTS_DIR) return null; // тестове: само изрично зададена база
  const homes = [process.env.XDG_DATA_HOME, path.join(os.homedir(), '.local', 'share'), process.env.LOCALAPPDATA, process.env.APPDATA].filter(Boolean);
  for (const h of homes) {
    const f = path.join(h, 'opencode', 'opencode.db');
    if (fs.existsSync(f)) return f;
  }
  return null;
}

const OC_TOOLS = {
  bash: 'Bash', read: 'Read', edit: 'Edit', multiedit: 'MultiEdit', write: 'Write', patch: 'Edit', apply_patch: 'Edit',
  glob: 'Glob', grep: 'Grep', list: 'Glob', ls: 'Glob', webfetch: 'WebFetch', websearch: 'WebSearch', codesearch: 'Grep',
  shell: 'Bash', execute: 'Bash', subagent: 'Task', task: 'Task', todowrite: 'TodoWrite', todoread: 'TodoRead', question: 'AskUserQuestion', plan_exit: 'ExitPlanMode',
};
const OC_BUSY_MS = 45e3;          // колко след последното събитие сесията брои още за „заета“
const OC_LIVE_MS = 45 * 60e3;     // колко след последното събитие изобщо се брои за жива (базата няма „затворено“)
const OC_MODES = { general: true, explore: true }; // режимите на под-агент

/** Колко OpenCode терминала/процеса (без `serve`/`web` – фоновият сървър) са отворени сега; null = не се знае. */
export function countOpencodeProcs(cb) {
  const parse = (out) => {
    let n = 0;
    for (const line of String(out || '').split(/\r?\n/)) {
      const cmd = line.trim();
      if (!cmd) continue;
      const exe = (cmd.startsWith('"') ? cmd.slice(1, cmd.indexOf('"', 1)) : cmd.split(/\s+/)[0]).split(/[\\/]/).pop().toLowerCase();
      if (exe !== 'opencode' && exe !== 'opencode.exe') continue;
      if (/\s(serve|web|acp|mcp)(\s|$)/.test(cmd.slice(cmd.toLowerCase().indexOf('opencode') + 8))) continue;
      n++;
    }
    return n;
  };
  const done = (err, out) => cb(err ? null : parse(out));
  if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='opencode.exe'\" | ForEach-Object { $_.CommandLine }"],
    { timeout: 8000, windowsHide: true }, done);
  } else execFile('ps', ['-eo', 'args'], { timeout: 5000 }, done);
}

/** Следи базата на OpenCode. live (ако е подаден) се пълни със { list: [...] } – статус на живите сесии. */
export async function watchOpencode(emit, usage, log = () => {}, setCtx = () => {}, live = null) {
  if (process.env.OPENCODE === '0') return null;
  let file = opencodeDb(), DatabaseSync, db = null, timer = null, procTimer = null;
  try {
    // node:sqlite още е „експериментален“ – без предупреждение в конзолата
    const warn = process.emitWarning;
    process.emitWarning = (w, ...r) => (String(w?.message || w).includes('SQLite') ? undefined : warn.call(process, w, ...r));
    try { ({ DatabaseSync } = await import('node:sqlite')); } finally { process.emitWarning = warn; }
  } catch {
    // без вграден node:sqlite (< Node 22.5) – подскажи какво липсва, ако базата съществува
    if (file && fs.existsSync(file)) log('OpenCode: базата е открита, но за четене трябва Node >= 22.5 (вграден node:sqlite) — обнови Node или задай OPENCODE_DB');
    return null;
  }
  let since = 0;                   // time_updated на последната прочетена част
  let legacy = true, since2 = 0, has2 = false;    // OpenCode v2: session_message / session_v2 (старите part/session вече не се пишат)
  const parts = new Map();         // id на част -> последният статус ('start' | 'end' | 'say')
  const sessions = new Map();      // session id -> { agent, label, parent, model, sub }
  const tasks = new Map();         // родителска сесия -> [callID на task, които още нямат дете]
  const childOf = new Map();       // дете -> callID на task-а на родителя
  const lastSay = new Map();       // агент -> кога беше последното „say“ (текстът се обновява на всеки няколко токена)
  const liveSeen = new Map();      // session id -> { at: time_updated ms, run: Set(callID), ask: въпрос чака отговор }
  const modelId = (j) => { try { return JSON.parse(j)?.id || null; } catch { return null; } };

  const session = (sid) => {
    let s = sessions.get(sid);
    if (s) return s;
    const row = (has2 && pick('session_v2', sid)) || pick('session', sid);
    const mode = typeof row?.agent === 'string' ? row.agent : null;
    s = { agent: 'oc:' + sid, label: row?.directory ? path.basename(String(row.directory).replace(/[\\/]+$/, '')) : 'opencode', parent: row?.parent_id ? 'oc:' + row.parent_id : null, model: row?.model ? modelId(row.model) : null, sub: !!row?.parent_id || OC_MODES[mode] || false, desc: row?.title ? clip(row.title, 80) : null };
    if (row?.parent_id) { const q = tasks.get(row.parent_id); if (q?.length) childOf.set(sid, q.shift()); }
    sessions.set(sid, s);
    return s;
  };

  // само колоните, които ги има (по-старите v1 бази нямат agent/model) – иначе SELECT гърми и спира сървъра
  const colsOf = new Map();
  const pick = (table, sid) => {
    try {
      if (!colsOf.has(table)) {
        const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
        colsOf.set(table, have.has('id') ? ['parent_id', 'directory', 'title', 'agent', 'model'].filter((c) => have.has(c)) : null);
      }
      const cols = colsOf.get(table);
      return cols?.length ? db.prepare(`SELECT ${cols.join(', ')} FROM ${table} WHERE id = ?`).get(sid) : null;
    } catch { return null; }
  };

  let procs = null;                // брой отворени OpenCode процеси (без фоновия сървър); null = не се знае → без ограничение
  // процесите се броят само докато има живи OpenCode сесии (иначе PowerShell на всеки 15 с за нищо)
  const pollProcs = () => { if (db && liveSeen.size) countOpencodeProcs((n) => { procs = n; }); };

  const liveOf = (sid) => {
    let lv = liveSeen.get(sid);
    if (!lv) { lv = { at: 0, run: new Set(), ask: false, idle: 0 }; liveSeen.set(sid, lv); }
    return lv;
  };

  const open = () => {
    file ||= opencodeDb();
    if (!file || !fs.existsSync(file)) return false;
    try {
      db = new DatabaseSync(file, { readOnly: true });
      // историята не се пуска отново: започваме от най-новата част в момента
      try { since = db.prepare('SELECT max(time_updated) AS t FROM part').get()?.t || 0; } catch { legacy = false; } // само v2 – без part
      has2 = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'session_message'").get();
      if (has2) since2 = db.prepare('SELECT max(time_updated) AS t FROM session_message').get()?.t || 0;
      if (has2 && since < since2) legacy = false; // старите таблици са спрели да се пишат (OpenCode v2) – не ги сканираме всяка секунда
      // живите сесии от последните OC_LIVE_MS: статусът влиза веднага, без да чака първото ново събитие
      if (legacy) for (const r of db.prepare('SELECT id, time_updated AS t FROM session WHERE time_updated > ?').all(Date.now() - OC_LIVE_MS)) {
        session(r.id);
        liveOf(r.id).at = r.t;
      }
      if (has2) for (const r of db.prepare('SELECT id, time_updated AS t, time_idle AS i FROM session_v2 WHERE time_updated > ?').all(Date.now() - OC_LIVE_MS)) {
        session(r.id);
        const lv = liveOf(r.id);
        lv.at = Math.max(lv.at, r.t); lv.idle = r.i || 0;
      }
      log(`OpenCode: следя ${file}`);
      return true;
    } catch (e) { db = null; log(`OpenCode: ${e.message}`); return false; }
  };

  const pushLive = () => {
    if (!live) return;
    const now = Date.now(), list = [], idles = [];
    for (const [sid, lv] of liveSeen) {
      const idle = now - lv.at;
      if (idle > OC_LIVE_MS) { liveSeen.delete(sid); continue; }
      const s = sessions.get(sid);
      if (!s) continue;
      const status = lv.ask ? 'waiting' : (lv.run.size || (idle < OC_BUSY_MS && lv.at > lv.idle) ? 'busy' : 'idle'); // v2: „idle“ съобщението приключва хода
      if (s.sub && status === 'idle') continue; // под-агентите се показват само докато работят
      const e = { agent: s.agent, label: s.label, status, provider: 'opencode' };
      if (s.model) e.model = s.model;
      if (status === 'waiting') e.waitingFor = 'question';
      if (status === 'idle') idles.push({ e, at: lv.at }); else list.push(e);
    }
    // базата няма „затворена“ сесия: незаетите се ограничават до броя на отворените OpenCode терминали (най-новите първи)
    idles.sort((a, b) => b.at - a.at);
    const room = procs == null ? idles.length : Math.max(0, procs - list.filter((e) => !sessions.get(e.agent.slice(3))?.sub).length);
    for (const { e } of idles.slice(0, room)) list.push(e);
    live.list = list;
  };

  // OpenCode v2: съобщенията са в session_message (type user|assistant|compaction|idle…), едно съобщение се
  // пренаписва, докато расте – `content[]` държи reasoning/text/tool части, tool: { id, name, state: { status, input } }
  const tickV2 = () => {
    let rows;
    try { rows = db.prepare('SELECT id, session_id AS sid, type, time_updated AS t, data FROM session_message WHERE time_updated > ? ORDER BY time_updated LIMIT 300').all(since2); }
    catch (e) { log(`OpenCode v2: ${e.message}`); has2 = false; return; }
    for (const r of rows) {
      since2 = Math.max(since2, r.t);
      if (r.type !== 'user' && r.type !== 'assistant' && r.type !== 'compaction' && r.type !== 'idle') continue;
      let d;
      try { d = JSON.parse(r.data); } catch { continue; }
      const s = session(r.sid), lv = liveOf(r.sid);
      lv.at = Math.max(lv.at, r.t);
      const base = { agent: s.agent, label: s.label, subagent: !!s.parent, provider: 'opencode', ts: Date.now() };
      const model = (r.type === 'assistant' && d.model?.id) || s.model;
      if (model) base.model = model;
      if (s.parent) {
        base.parent = s.parent;
        const tu = childOf.get(r.sid);
        if (tu) base.parent_tool_use_id = tu;
        if (s.desc) base.desc = s.desc;
      }
      const first = !parts.has(r.id);
      if (r.type === 'user') {
        if (first) { emit({ ...base, type: 'user_prompt' }); parts.set(r.id, 'say'); }
      } else if (r.type === 'compaction') {
        if (first) { parts.set(r.id, 'end'); emit({ ...base, type: 'compact', ts: r.t }); }
      } else if (r.type === 'idle') {
        // ходът е свършил: висящите инструменти (прекъсване/грешка) се затварят, въпросът вече не чака
        if (first) {
          parts.set(r.id, 'end'); lv.idle = r.t; lv.ask = false;
          for (const id of lv.run) emit({ ...base, type: 'tool_end', tool_use_id: id });
          lv.run.clear();
        }
      } else {
        if (first) { emit({ ...base, type: 'say' }); parts.set(r.id, 'say'); lastSay.set(s.agent, Date.now()); }
        for (const c of d.content || []) {
          if (c.type === 'tool') {
            const key = r.id + ':' + c.id, st = c.state?.status, id = c.id;
            const tool = OC_TOOLS[c.name] || (c.name ? c.name[0].toUpperCase() + c.name.slice(1) : 'Bash');
            const inp = c.state?.input || {};
            const done = st === 'completed' || st === 'error';
            if (done) lv.run.delete(id); else lv.run.add(id);
            if (c.name === 'question') lv.ask = !done;
            if (!parts.has(key)) {
              emit({ ...base, type: 'tool_start', id, tool, detail: clip(inp.filePath || inp.path || inp.command || inp.pattern || inp.description || inp.url || inp.query || '') });
              if (tool === 'Task') {
                const q = tasks.get(r.sid) || [];
                q.push(id);
                tasks.set(r.sid, q);
                for (const [cid, cs] of sessions) if (cs.parent === base.agent && !childOf.has(cid) && q.length) childOf.set(cid, q.shift());
              }
              parts.set(key, 'start');
            }
            if (done && parts.get(key) !== 'end') {
              emit({ ...base, type: 'tool_end', tool_use_id: id }); parts.set(key, 'end');
              const kid = c.state?.metadata?.sessionId || c.state?.metadata?.sessionID; // точна връзка с под-агента
              if (tool === 'Task' && kid) childOf.set(kid, id);
            }
          } else if ((c.type === 'text' || c.type === 'reasoning') && Date.now() - (lastSay.get(s.agent) || 0) > 2000) {
            emit({ ...base, type: 'say' }); lastSay.set(s.agent, Date.now()); // пише още – „мисли“
          }
        }
        if (d.time?.completed && d.tokens && parts.get(r.id + ':usage') !== 'end') {
          parts.set(r.id + ':usage', 'end');
          const t = d.tokens;
          setCtx(base.agent, (t.input || 0) + (t.cache?.read || 0) + (t.cache?.write || 0), 0);
          usage(base.agent, base.label, base.subagent, { id: 'oc:' + r.id, model: d.model?.id, usage: { input_tokens: t.input || 0, output_tokens: (t.output || 0) + (t.reasoning || 0), cache_read_input_tokens: t.cache?.read || 0, cache_creation_input_tokens: t.cache?.write || 0 } });
        }
      }
    }
  };

  const tick = () => {
    if (!db && !open()) { pushLive(); return; }
    let rows = [];
    if (legacy) try {
      rows = db.prepare(`SELECT p.id, p.session_id AS sid, p.time_updated AS t, p.data, json_extract(m.data, '$.role') AS role, json_extract(m.data, '$.model.modelID') AS model
        FROM part p JOIN message m ON m.id = p.message_id WHERE p.time_updated > ? ORDER BY p.time_updated LIMIT 500`).all(since);
    } catch (e) {
      if (has2) legacy = false; // v2 вече не пише в part/message
      else { log(`OpenCode: ${e.message}`); try { db.close(); } catch { /* */ } db = null; return; }
    }
    for (const r of rows) {
      since = Math.max(since, r.t);
      let d;
      try { d = JSON.parse(r.data); } catch { continue; }
      const s = session(r.sid);
      liveOf(r.sid).at = Math.max(liveOf(r.sid).at, r.t);
      const base = { agent: s.agent, label: s.label, subagent: !!s.parent, provider: 'opencode', ts: Date.now() };
      if (r.model || s.model) base.model = r.model || s.model;
      if (s.parent) {
        base.parent = s.parent;
        const tu = childOf.get(r.sid);
        if (tu) base.parent_tool_use_id = tu;
        if (s.desc) base.desc = s.desc;
      }
      const was = parts.get(r.id);
      if (d.type === 'tool') {
        const st = d.state?.status, id = d.callID || r.id;
        const tool = OC_TOOLS[d.tool] || (d.tool ? d.tool[0].toUpperCase() + d.tool.slice(1) : 'Bash');
        const inp = d.state?.input || {};
        const detail = clip(inp.filePath || inp.path || inp.command || inp.pattern || inp.description || inp.url || inp.query || '');
        const lv = liveOf(r.sid);
        if (st === 'running') lv.run.add(id); else lv.run.delete(id);
        if (d.tool === 'question') lv.ask = st !== 'completed' && st !== 'error'; // чака отговор от теб
        if (!was) {
          emit({ ...base, type: 'tool_start', id, tool, detail });
          if (tool === 'Task') {
            const q = tasks.get(r.sid) || [];
            q.push(id);
            tasks.set(r.sid, q);
            // вече има деца без връзка (напр. заредени при отварянето на базата)
            for (const [cid, cs] of sessions) if (cs.parent === base.agent && !childOf.has(cid) && q.length) childOf.set(cid, q.shift());
          }
          parts.set(r.id, 'start');
        }
        if ((st === 'completed' || st === 'error') && parts.get(r.id) !== 'end') { emit({ ...base, type: 'tool_end', tool_use_id: id }); parts.set(r.id, 'end'); }
      } else if (d.type === 'text' || d.type === 'reasoning') {
        if (!was) { emit({ ...base, type: r.role === 'user' ? 'user_prompt' : 'say' }); parts.set(r.id, 'say'); }
        else if (Date.now() - (lastSay.get(s.agent) || 0) > 2000) emit({ ...base, type: 'say' }); // пише още – „мисли“
        lastSay.set(s.agent, Date.now());
      } else if (d.type === 'compaction' && !was) {
        parts.set(r.id, 'end');
        emit({ ...base, type: 'compact', ts: r.t }); // разговорът е сбит – листовете отиват в мелачката
      } else if (d.type === 'step-finish' && d.tokens && !was) {
        parts.set(r.id, 'end');
        const t = d.tokens, model = r.model || s.model || undefined;
        setCtx(base.agent, (t.input || 0) + (t.cache?.read || 0) + (t.cache?.write || 0), 0);
        usage(base.agent, base.label, base.subagent, { id: 'oc:' + r.id, model, usage: { input_tokens: t.input || 0, output_tokens: (t.output || 0) + (t.reasoning || 0), cache_read_input_tokens: t.cache?.read || 0, cache_creation_input_tokens: t.cache?.write || 0 } });
      }
    }
    if (has2) tickV2();
    if (parts.size > 20000) for (const k of [...parts.keys()].slice(0, 10000)) parts.delete(k);
    pushLive();
  };
  // грешка в базата (непозната схема) не бива да спре целия сървър
  const safeTick = () => { try { tick(); } catch (e) { log(`OpenCode: ${e.message}`); } };
  timer = setInterval(safeTick, 1000);
  if (live) { pollProcs(); procTimer = setInterval(pollProcs, 15000); procTimer.unref?.(); }
  safeTick();
  return { stop() { clearInterval(timer); clearInterval(procTimer); try { db?.close(); } catch { /* */ } } };
}

// ================================================================ Gemini CLI
// ~/.gemini/tmp/<проект>/chats/session-<време>-<id>.jsonl ($GEMINI_DIR или $GEMINI_CLI_HOME/.gemini); под-агентите –
// chats/<id на родителя>/<id>.jsonl. Редове: метаданни { sessionId, kind, directories }, съобщения
// { id, type: 'user'|'gemini', toolCalls: [{ id, name, args, status }], thoughts, tokens }, $patch, $set.
// Едно съобщение се записва наново (същото id) всеки път, когато инструментите му се променят.
const GEMINI_HOME = process.env.GEMINI_DIR || path.join(process.env.GEMINI_CLI_HOME || os.homedir(), '.gemini');
export const GEMINI_ROOT = path.join(GEMINI_HOME, 'tmp');
export const GEMINI_ON = process.env.GEMINI !== '0' && (!process.env.CLAUDE_PROJECTS_DIR || !!process.env.GEMINI_DIR);
export const isGeminiFile = (file) => file.startsWith(GEMINI_ROOT + path.sep) && file.includes(`${path.sep}chats${path.sep}`);

const geminiState = new Map();   // файл -> { id, label, parent, calls: Map(id -> 'start'|'end'), msgs: Set }
const GEM_TOOLS = {
  read_file: 'Read', read_many_files: 'Read', list_directory: 'Glob', glob: 'Glob', search_file_content: 'Grep', grep: 'Grep',
  write_file: 'Write', replace: 'Edit', edit: 'Edit', google_web_search: 'WebSearch', web_fetch: 'WebFetch',
  save_memory: 'Write', write_todos: 'TodoWrite', ask_user: 'AskUserQuestion',
};

function geminiOf(file) {
  let g = geminiState.get(file);
  if (g) return g;
  // папката на проекта: ~/.gemini/tmp/<име или хеш>; родител – ако файлът е в chats/<id на родителя>/
  const rel = path.relative(GEMINI_ROOT, file).split(path.sep);
  const chatsAt = rel.indexOf('chats');
  g = { id: 'gemini:' + path.basename(file, '.jsonl'), label: rel[0] && !/^[0-9a-f]{32,}$/i.test(rel[0]) ? rel[0] : 'gemini', parent: null, calls: new Map() };
  if (rel.length - chatsAt > 2) g.parent = 'gemini:' + rel[chatsAt + 1];
  try {
    const fd = fs.openSync(file, 'r'), buf = Buffer.alloc(65536);
    const n = fs.readSync(fd, buf, 0, buf.length, 0); fs.closeSync(fd);
    geminiMeta(g, JSON.parse(buf.subarray(0, n).toString('utf8').split('\n')[0]));
  } catch { /* */ }
  geminiState.set(file, g);
  return g;
}
function geminiMeta(g, o) {
  if (!o || typeof o.sessionId !== 'string' || o.type) return false;
  g.id = 'gemini:' + o.sessionId;
  if (Array.isArray(o.directories) && o.directories[0]) g.label = path.basename(String(o.directories[0]).replace(/[\/]+$/, '')) || g.label;
  return true;
}

function geminiTool(name, args = {}) {
  if (name === 'run_shell_command') return [shellTool(args.command), clip(unwrapShell(args.command))];
  const tool = GEM_TOOLS[name] || (/agent|investigator|delegate/i.test(name) ? 'Agent' : name);
  return [tool, clip(args.file_path || args.absolute_path || args.path || args.pattern || args.query || args.url || args.description || (Array.isArray(args.paths) ? args.paths[0] : ''))];
}

/** Един ред от Gemini CLI сесия -> събития (като codexLine). */
export function geminiLine(file, line, emit, usage, setCtx = () => {}) {
  let o;
  try { o = JSON.parse(line); } catch { return; }
  const g = geminiOf(file);
  if (geminiMeta(g, o)) return;
  const base = { agent: g.id, label: g.label, subagent: !!g.parent, provider: 'gemini', ts: Date.now() };
  if (g.parent) base.parent = g.parent;
  const out = (e) => emit({ ...base, ...e });
  const calls = o.type === 'gemini' ? o.toolCalls || [] : o.$patch ? [...(o.$patch.toolCalls || []), ...(o.$patch.updates || []).flatMap((u) => u.toolCalls || [])] : [];
  for (const c of calls) {
    if (!c?.id) continue;
    const was = g.calls.get(c.id);
    const done = ['success', 'error', 'cancelled'].includes(c.status) || (o.$patch && c.result != null);
    if (!was && c.name) { const [tool, detail] = geminiTool(c.name, c.args); out({ type: 'tool_start', id: c.id, tool, detail }); g.calls.set(c.id, 'start'); }
    if (done && g.calls.get(c.id) === 'start') { out({ type: 'tool_end', tool_use_id: c.id }); g.calls.set(c.id, 'end'); }
  }
  if (o.type === 'user') out({ type: 'user_prompt' });
  else if (o.type === 'gemini') {
    if (!calls.length || o.thoughts?.length) out({ type: 'say' });
    const t = o.tokens;
    if (t && o.id) {
      const cached = t.cached || 0;
      setCtx(base.agent, t.input || 0, 1000000); // promptTokenCount = целият контекст (с кешираното)
      usage(base.agent, base.label, base.subagent, { id: 'gem:' + o.id, usage: { input_tokens: Math.max(0, (t.input || 0) - cached), output_tokens: (t.output || 0) + (t.thoughts || 0), cache_read_input_tokens: cached, cache_creation_input_tokens: 0 } });
    }
  }
  if (g.calls.size > 5000) for (const k of [...g.calls.keys()].slice(0, 2500)) g.calls.delete(k);
}
