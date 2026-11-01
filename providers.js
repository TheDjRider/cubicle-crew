// Други агенти освен Claude Code: Codex (OpenAI), OpenCode, Gemini CLI и Antigravity. Само четем техните локални
// записи, нищо не пишем и не пипаме настройки. Събитията са същите като от Claude Code (+ незадължително поле `provider`).
//
// Codex:       ~/.codex/sessions/YYYY/MM/DD/rollout-<време>-<uuid>.jsonl ($CODEX_HOME), ред по ред като транскриптите
//              на Claude – server.js го следи със същия механизъм и вика codexLine() за всеки нов ред.
// OpenCode:    SQLite база ($XDG_DATA_HOME|~/.local/share)/opencode/opencode.db ($OPENCODE_DB); таблиците session,
//              message, part (JSON в `data`). Четем само новите/променените части веднъж в секунда (read-only).
// Gemini CLI:  ~/.gemini/tmp/<проект>/chats/session-*.jsonl ($GEMINI_DIR).
// Antigravity: ~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/transcript.jsonl (и ~/.gemini/antigravity/brain).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// ---------------------------------------------------------------- общи
const clip = (s, n = 60) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

/** Командата без обвивката bash -lc "…" / powershell -Command "…" и без водещо cd <път> &&. */
export function unwrapShell(cmd) {
  let c = String(cmd || '').trim();
  const m = c.match(/^(?:\S*[\\/])?(?:bash|sh|zsh|pwsh|powershell(?:\.exe)?|cmd(?:\.exe)?)\s+(?:-\w+\s+)*(?:\/c\s+)?["']?([\s\S]*?)["']?$/i);
  if (m && m[1]) c = m[1].trim();
  const cd = c.match(/^(?:cd|pushd|set-location|sl)\s+(?:\/d\s+)?(?:"[^"]+"|'[^']+'|\S+)\s*(?:&&|;)\s*([\s\S]+)$/i);
  return cd && cd[1] ? cd[1].trim() : c;
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

// ================================================================ Antigravity CLI (agy)
// ~/.gemini/antigravity-cli/brain/<convId>/.system_generated/logs/transcript.jsonl ($ANTIGRAVITY_DIR = папката brain).
// Редове: { step_index, source: 'USER_EXPLICIT'|'MODEL'|'SYSTEM', type: 'USER_INPUT'|'PLANNER_RESPONSE'|'GENERIC',
//           created_at, content?, thinking?, tool_calls?: [{name, args}], input_tokens?, cache_read_tokens?, output_tokens? }.
// Проектът идва от ../history.jsonl ({display, timestamp, workspace} на всеки промпт – по времето на първия промпт).
// (~/.gemini/antigravity/brain на IDE-то има само .md планове, без транскрипти – не го следим.)
export const AGY_ROOTS = [process.env.ANTIGRAVITY_DIR ? path.resolve(process.env.ANTIGRAVITY_DIR) : path.join(GEMINI_HOME, 'antigravity-cli', 'brain')];
export const AGY_ON = process.env.ANTIGRAVITY !== '0' && (!process.env.CLAUDE_PROJECTS_DIR || !!process.env.ANTIGRAVITY_DIR);
export const isAgyFile = (file) =>
  path.basename(file) === 'transcript.jsonl' &&
  file.includes(`${path.sep}.system_generated${path.sep}logs${path.sep}`) &&
  AGY_ROOTS.some((r) => file.startsWith(r + path.sep));

const AGY_LIVE_MS = 45 * 60e3;
const AGY_BUSY_CAP_MS = 3 * 60e3;
const AGY_PROCS_MS = 15000;
const AGY_SUB_MS = 15000;        // под-агент без точна връзка: нов разговор до толкова след invoke_subagent
// Колко пуснати agy има (процеси от най-горно ниво); 'pending' до първото преброяване, null = не знаем (тестове,
// грешка) -> без таван. Транскриптът няма флаг „затворен“, а presence/*.lock остават и след изход – без това всяка
// сесия, пипната в последните 45 мин, седеше в офиса и без пуснат CLI.
let agyProcs = null;

/** Брои agy.exe от най-горно ниво – без езиковия сървър (дете на agy) и `agy agentapi`. cb(брой | null). */
export function countAgyProcs(cb) {
  const parse = (rows) => {
    const isAgy = (exe) => /^agy(\.exe)?$/i.test(exe || '');
    const byPid = new Map(rows.map((r) => [r.pid, r]));
    let n = 0;
    for (const r of rows) {
      if (!isAgy(r.exe) || /\sagentapi(\s|$)/i.test(r.cmd)) continue;
      if (isAgy(byPid.get(r.ppid)?.exe)) continue;
      n++;
    }
    return n;
  };
  if (process.platform === 'win32') {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      "Get-CimInstance Win32_Process -Filter \"Name='agy.exe'\" | ForEach-Object { \"$($_.ProcessId)`t$($_.ParentProcessId)`t$($_.Name)`t$($_.CommandLine)\" }"],
    { timeout: 8000, windowsHide: true }, (err, out) => {
      if (err) return cb(null);
      cb(parse(String(out || '').split(/\r?\n/).filter(Boolean).map((l) => {
        const [pid, ppid, exe, ...cmd] = l.split('\t');
        return { pid: +pid, ppid: +ppid, exe, cmd: cmd.join('\t') };
      })));
    });
  } else {
    execFile('ps', ['-eo', 'pid=,ppid=,args='], { timeout: 5000 }, (err, out) => {
      if (err) return cb(null);
      cb(parse(String(out || '').split(/\r?\n/).map((l) => l.trim().match(/^(\d+)\s+(\d+)\s+(\S+)(.*)$/)).filter(Boolean)
        .map((m) => ({ pid: +m[1], ppid: +m[2], exe: m[3].split('/').pop(), cmd: m[4] }))));
    });
  }
}

/** Брои на всеки 15 s (само докато има кандидат-сесии). Вика се от startServer, ако AGY_ON. */
export function watchAgyProcs() {
  agyProcs = 'pending';
  let busy = false;
  const tick = () => {
    const now = Date.now();
    if (busy || ![...agyState.values()].some((g) => now - g.lastAt < AGY_LIVE_MS)) return;
    busy = true;
    countAgyProcs((n) => { agyProcs = n; busy = false; });
  };
  tick();
  setInterval(tick, AGY_PROCS_MS).unref?.();
}

const agyState = new Map();      // файл -> { id, convId, label, labelSrc, promptAt, first, model, parent, …, open: [], step, ask, lastAt }
const agyChildOf = new Map();    // convId на под-агент -> { parent, toolUseId, desc }
const agyTasks = [];             // { parent, toolUseId, desc, ts } – евристика за под-агент преди да се върне UUID-то му
const agyProjCache = new Map();  // папка -> име на проекта
const agyHist = new Map();       // history.jsonl -> { mtime, size, rows: [{t, ws}] }

/** Работната папка на промпта от history.jsonl до транскрипта (по времето ±5 s); null ако я няма (още). */
function agyWorkspace(file, at) {
  if (!at) return null;
  const root = AGY_ROOTS.find((r) => file.startsWith(r + path.sep));
  if (!root) return null;
  const hf = path.join(path.dirname(root), 'history.jsonl');
  let h = agyHist.get(hf);
  try {
    const st = fs.statSync(hf);
    if (!h || h.mtime !== st.mtimeMs || h.size !== st.size) {
      // само последните ~256 KB – стари промптове не ни трябват
      const len = Math.min(st.size, 262144), buf = Buffer.alloc(len), fd = fs.openSync(hf, 'r');
      try { fs.readSync(fd, buf, 0, len, st.size - len); } finally { fs.closeSync(fd); }
      const rows = [];
      for (const ln of buf.toString('utf8').split('\n')) {
        try { const o = JSON.parse(ln); if (o && typeof o.workspace === 'string' && o.timestamp) rows.push({ t: +o.timestamp, ws: o.workspace }); } catch { /* отрязан ред */ }
      }
      h = { mtime: st.mtimeMs, size: st.size, rows };
      agyHist.set(hf, h);
    }
  } catch { return null; }
  let best = null;
  for (const r of h.rows) if (Math.abs(r.t - at) < 5000 && (!best || Math.abs(r.t - at) < Math.abs(best.t - at))) best = r;
  return best ? best.ws : null;
}

const AGY_TOOLS = {
  read_file: 'Read', view_file: 'Read', view_file_outline: 'Read', view_code_item: 'Read', read_many_files: 'Read',
  write_file: 'Write', write_to_file: 'Write', create_file: 'Write',
  edit_file: 'Edit', replace_file_content: 'Edit', multi_replace_file_content: 'MultiEdit',
  grep_search: 'Grep', search_file_content: 'Grep',
  find_by_name: 'Glob', list_dir: 'Glob', list_directory: 'Glob',
  search_web: 'WebSearch', google_web_search: 'WebSearch',
  read_url_content: 'WebFetch', web_fetch: 'WebFetch', browser_subagent: 'WebFetch',
  invoke_subagent: 'Agent', define_subagent: 'Agent', manage_subagents: 'Agent', send_message: 'Write',
  ask_question: 'AskUserQuestion', notify_user: 'AskUserQuestion',
  manage_task: 'Bash', command_status: 'Bash', send_command_input: 'Bash', schedule: 'Bash',
};

/** В transcript.jsonl стойностите в args са сериализирани като JSON низове (напр. "\"C:\\\\...\""). */
function agyUnquote(v) {
  if (typeof v !== 'string') return v;
  const s = v.trim();
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('[') && s.endsWith(']')) || (s.startsWith('{') && s.endsWith('}'))) {
    try { return JSON.parse(s); } catch { /* суров низ */ }
  }
  return v;
}

function agyArgs(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(raw)) out[k] = agyUnquote(v);
  return out;
}

/** Намира името на проекта по път до файл в работната папка (прескача ~/.gemini и системните папки). */
function agyProjectOf(p) {
  if (typeof p !== 'string' || !p) return null;
  const clean = agyUnquote(p);
  if (typeof clean !== 'string' || clean.length < 3) return null;
  const norm = path.normalize(clean.replace(/^["']|["']$/g, ''));
  if (norm.includes(`${path.sep}.gemini${path.sep}`) || norm.includes(`${path.sep}AppData${path.sep}`) || norm.startsWith('/tmp/')) return null;
  const dir = path.extname(norm) ? path.dirname(norm) : norm;
  if (agyProjCache.has(dir)) return agyProjCache.get(dir);
  let cur = dir;
  for (let i = 0; i < 6; i++) {
    try {
      if (fs.existsSync(path.join(cur, '.git')) || fs.existsSync(path.join(cur, 'package.json'))) {
        const name = path.basename(cur);
        if (agyProjCache.size > 500) agyProjCache.clear();
        agyProjCache.set(dir, name);
        return name;
      }
    } catch { /* */ }
    const up = path.dirname(cur);
    if (!up || up === cur) break;
    cur = up;
  }
  const fb = path.basename(dir);
  return fb && fb.length > 1 && !/^[a-z]:\\?$/i.test(fb) ? fb : null;
}

function agyTool(name, rawArgs) {
  const a = agyArgs(rawArgs);
  if (name === 'run_command' || name === 'run_shell_command') {
    const cmd = String(a.CommandLine || a.command || a.cmd || '');
    return [cmd ? shellTool(cmd) : 'Bash', clip(cmd ? unwrapShell(cmd) : a.toolSummary || ''), false, false];
  }
  if (name === 'ask_question' || name === 'notify_user') {
    const q = Array.isArray(a.questions) && a.questions[0]?.question ? a.questions[0].question : a.question || a.Message || '';
    return ['AskUserQuestion', clip(q), name === 'ask_question', false];
  }
  if (name === 'invoke_subagent') {
    return ['Agent', clip(a.Role || a.Prompt || a.TypeName || ''), false, true];
  }
  const tool = AGY_TOOLS[name] || (/subagent|agent/i.test(name) ? 'Agent' : name ? name[0].toUpperCase() + name.slice(1) : 'Tool');
  const det = a.Path || a.AbsolutePath || a.TargetFile || a.DirectoryPath || a.File || a.Query || a.Pattern || a.query || a.Url || a.Prompt || a.Action || '';
  return [tool, clip(det), false, false];
}

/** Обновява метаданните (модел, проект, контекст, стъпка) от един ред на transcript.jsonl. */
function agyApplyMeta(g, o, setCtx) {
  if (!o || typeof o !== 'object') return;
  if (g.first === null) {
    g.first = String(o.source || '');
    const m = o.type === 'SYSTEM_MESSAGE' && typeof o.content === 'string' && o.content.match(/\bsender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (m) g.sender = m[1].toLowerCase();
  }
  if (o.type === 'USER_INPUT' && typeof o.content === 'string') {
    // „…changed setting `Model Selection` from X to Gemini 3.8 Flash (Medium). No need…“ – точката в 3.8 не е край
    const m = o.content.match(/`Model Selection` from .*? to (.+?)\.(?:\s|$)/);
    if (m && m[1]) g.model = m[1].trim().slice(0, 60);
    if (o.source === 'USER_EXPLICIT' && !g.promptAt) g.promptAt = Date.parse(o.created_at) || 0;
  } else if (o.type === 'PLANNER_RESPONSE') {
    if (o.input_tokens || o.cache_read_tokens) {
      g.ctx = (o.input_tokens || 0) + (o.cache_read_tokens || 0);
      setCtx?.(g.id, g.ctx, 1000000);
    }
    if (Array.isArray(o.tool_calls)) {
      for (const c of o.tool_calls) {
        const a = agyArgs(c?.args);
        const p = a.Path || a.AbsolutePath || a.TargetFile || a.DirectoryPath || a.File;
        const proj = !g.labelSrc && p && agyProjectOf(p);
        if (proj) { g.label = proj; g.labelSrc = 'path'; }
      }
    }
  }
}

/** Етикетът се избира веднъж: папката от history.jsonl, иначе (само докато там я няма) първият пипнат проект. */
function agyLabel(g, file) {
  if (g.labelSrc === 'history' || !g.promptAt) return;
  const ws = agyWorkspace(file, g.promptAt);
  const name = ws && path.basename(ws.replace(/[\\/]+$/, ''));
  if (name) { g.label = name; g.labelSrc = 'history'; }
}

/** Стъпката и „чака ли те“ по последния ред (при заварване на вече започната сесия). */
function agyStepFrom(g, o) {
  if (o.type === 'USER_INPUT' || o.type === 'GENERIC' || o.type === 'SYSTEM_MESSAGE') { g.step = 'THINKING'; g.ask = false; }
  else if (o.type === 'PLANNER_RESPONSE') {
    const calls = Array.isArray(o.tool_calls) ? o.tool_calls : [];
    g.step = calls.length ? 'TOOLS' : 'DONE';
    g.ask = calls.some((c) => c?.name === 'ask_question');
  }
}

function agyOf(file, setCtx = null) {
  let g = agyState.get(file);
  if (g) return g;
  const convId = path.basename(path.dirname(path.dirname(path.dirname(file)))) || path.basename(file, '.jsonl');
  g = {
    id: 'agy:' + convId, convId, label: 'antigravity', labelSrc: null, promptAt: 0, first: null, model: null, ctx: 0,
    parent: null, parentToolUseId: null, desc: null,
    open: [], subs: new Map(), sender: null, step: 'DONE', ask: false, lastAt: 0,
  };
  // При заварване на вече започната сесия четем началото и края на файла (без да излъчваме старата история),
  // за да знаем веднага проекта, модела, контекста и дали сесията в момента мисли или почива.
  try {
    const stat = fs.statSync(file);
    g.lastAt = stat.mtimeMs;
    const fd = fs.openSync(file, 'r');
    try {
      const headLen = Math.min(stat.size, 65536);
      const head = Buffer.alloc(headLen);
      fs.readSync(fd, head, 0, headLen, 0);
      for (const ln of head.toString('utf8').split('\n')) {
        if (!ln.trim()) continue;
        try { agyApplyMeta(g, JSON.parse(ln), setCtx); } catch { /* отрязан ред */ }
      }
      if (stat.size > headLen) {
        const tailLen = Math.min(stat.size - headLen, 131072);
        const tail = Buffer.alloc(tailLen);
        fs.readSync(fd, tail, 0, tailLen, stat.size - tailLen);
        const lines = tail.toString('utf8').split('\n');
        lines.shift(); // първият ред в опашката може да е отрязан
        for (const ln of lines) {
          if (!ln.trim()) continue;
          try { const o = JSON.parse(ln); agyApplyMeta(g, o, setCtx); agyStepFrom(g, o); } catch { /* */ }
        }
      } else {
        // малък файл – последната стъпка вече е в head
        const lines = head.toString('utf8').split('\n').filter((s) => s.trim());
        try { if (lines.length) agyStepFrom(g, JSON.parse(lines[lines.length - 1])); } catch { /* отрязан ред */ }
      }
    } finally { fs.closeSync(fd); }
  } catch { /* */ }
  agyLabel(g, file);
  agyLink(g, Date.now());
  if (agyState.size >= 300) { // първо заспалите, после най-отдавна пипнатите – живите остават
    const now = Date.now();
    for (const [k, v] of [...agyState].sort((x, y) => x[1].lastAt - y[1].lastAt)) {
      if (agyState.size < 200) break;
      if (now - v.lastAt > AGY_LIVE_MS || agyState.size >= 300) agyState.delete(k);
    }
  }
  agyState.set(file, g);
  return g;
}

/** Вика се от consider() в server.js при откриване/събуждане на transcript.jsonl – регистрира живата сесия веднага. */
export function agyTouch(file, mtimeMs, setCtx) {
  const g = agyOf(file, setCtx);
  if (mtimeMs > g.lastAt) g.lastAt = mtimeMs;
}

/** Живите сесии на Antigravity (за scanSessions() в server.js – като ocLive). procs: брой пуснати agy | 'pending' | null. */
export function agyLiveList(now = Date.now(), procs = agyProcs) {
  agySweepSubs(now);
  if (procs === 'pending' || procs === 0) return []; // не е пуснат (или още не знаем – никой не влиза, за да не излезе веднага)
  const cands = [];
  for (const g of agyState.values()) {
    const idle = now - g.lastAt;
    if (idle > AGY_LIVE_MS) continue;
    const status = g.ask ? 'waiting'
      : g.subs.size > 0 || ((g.step !== 'DONE' || g.open.length > 0) && idle < AGY_BUSY_CAP_MS) ? 'busy'
      : 'idle';
    // под-агентите не са в списъка на живите сесии (както при Claude Code) – идват и си тръгват по събитията си.
    // Иначе клиентът ги създаваше като главни сесии, а щом изпаднат от списъка след „busy“ – „прекъснати“ (посивели 15 мин).
    if (g.parent || g.sender) continue;
    cands.push({ g, status });
  }
  // таван: най-много толкова сесии, колкото пуснати agy (заетите първо, после най-скоро пипнатите)
  const keep = typeof procs === 'number'
    ? cands.sort((a, b) => (a.status === 'idle') - (b.status === 'idle') || b.g.lastAt - a.g.lastAt).slice(0, procs)
    : cands;
  return keep.map(({ g, status }) => {
    const e = { agent: g.id, label: g.label, status, provider: 'antigravity' };
    if (g.model) e.model = g.model;
    if (status === 'waiting') e.waitingFor = 'question';
    return e;
  });
}

let agyEmit = null; // последният emit от server.js – за затварянето на invoke_subagent от под-агента / по време
const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const agyById = (id) => { for (const g of agyState.values()) if (g.id === id) return g; return null; };

function agyBase(g, now) {
  const b = { agent: g.id, label: g.label, subagent: !!g.parent, provider: 'antigravity', ts: now };
  if (g.model) b.model = g.model;
  if (g.parent) b.parent = g.parent;
  if (g.parentToolUseId) b.parent_tool_use_id = g.parentToolUseId;
  if (g.desc) b.desc = g.desc;
  return b;
}

/** Под-агентът свърши -> invoke_subagent на родителя приключва (родителят спира да „делегира“, под-агентът си тръгва). */
function agySubDone(parentId, convId, now) {
  const p = parentId && agyById(parentId);
  const it = p?.subs.get(convId);
  if (!it) return;
  p.subs.delete(convId);
  agyEmit?.({ ...agyBase(p, now), type: 'tool_end', tool_use_id: it.id });
}

/** invoke_subagent, чийто под-агент заглъхна (3 мин без ред) или така и не се появи (1 мин) – затваряме. */
function agySweepSubs(now) {
  for (const p of agyState.values()) {
    for (const [cid, it] of p.subs) {
      const c = agyById('agy:' + cid);
      if (c ? now - c.lastAt > AGY_BUSY_CAP_MS : now - it.at > 4 * AGY_SUB_MS) agySubDone(p.id, cid, now);
    }
  }
}

/** Свързва под-агента с родителя: по резултата на invoke_subagent (conversationId), по sender= в първия му ред или
 *  (последно) по време – само за разговор, който не е започнат от човек (първият ред не е USER_EXPLICIT): иначе втори
 *  прозорец на agy, отворен до 15 s след invoke_subagent, ставаше „под-агент“. */
function agyLink(g, now) {
  let link = agyChildOf.get(g.convId);
  if (!link && g.sender && g.sender !== g.convId) {
    const p = agyById('agy:' + g.sender);
    const it = p?.open.find((x) => x.isSub && !x.child); // резултатът на invoke_subagent още не е записан
    if (it) it.child = g.convId;
    link = { parent: 'agy:' + g.sender, toolUseId: it?.id || null, desc: it?.desc || null, model: it?.model || null };
  }
  if (!link && agyTasks.length && g.first !== null && g.first !== 'USER_EXPLICIT') {
    const t = agyTasks.findLast((x) => !x.claimed && x.parent !== g.id && now - x.ts < AGY_SUB_MS);
    if (t) { t.claimed = true; link = { parent: t.parent, toolUseId: t.toolUseId, desc: t.desc, model: t.model }; }
  }
  if (!link) return;
  g.parent = link.parent; g.parentToolUseId = link.toolUseId; g.desc = link.desc;
  const p = agyById(link.parent);
  if (p && g.labelSrc !== 'history') { g.label = p.label; g.labelSrc = 'parent'; } // под-агентът работи по проекта на родителя
  if (!g.model) g.model = link.model || p?.model || null;
}

/** Един ред от transcript.jsonl на Antigravity -> събития към офиса. */
export function agyLine(file, line, emit, usage, setCtx = () => {}) {
  let o;
  try { o = JSON.parse(line); } catch { return; }
  agyEmit = emit;
  const g = agyOf(file, setCtx);
  const now = Date.now();
  g.lastAt = now;
  agyApplyMeta(g, o, setCtx);
  agyLabel(g, file);
  if (!g.parent) agyLink(g, now);
  const base = () => agyBase(g, now);
  if (o.type === 'USER_INPUT') {
    for (const it of g.open.splice(0)) emit({ ...base(), type: 'tool_end', tool_use_id: it.id });
    g.step = 'THINKING'; g.ask = false;
    emit({ ...base(), type: 'user_prompt' });
  } else if (o.type === 'SYSTEM_MESSAGE') {
    // съобщение от под-агент / задача от родителя / таймер – агентът ще отговори (мисли)
    g.step = 'THINKING'; g.ask = false;
  } else if (o.type === 'PLANNER_RESPONSE') {
    for (const it of g.open.splice(0)) emit({ ...base(), type: 'tool_end', tool_use_id: it.id });
    g.ask = false;
    if (o.input_tokens || o.output_tokens || o.cache_read_tokens) {
      const inp = o.input_tokens || 0, cr = o.cache_read_tokens || 0, out = o.output_tokens || 0;
      usage(g.id, g.label, !!g.parent, {
        id: `agy:${g.convId}:${o.step_index ?? now}`,
        model: g.model || undefined,
        usage: { input_tokens: inp, output_tokens: out, cache_read_input_tokens: cr, cache_creation_input_tokens: 0 },
      });
    }
    const calls = Array.isArray(o.tool_calls) ? o.tool_calls : [];
    if (calls.length) {
      g.step = 'TOOLS';
      calls.forEach((c, i) => {
        if (!c?.name) return;
        const [tool, detail, isAsk, isSub] = agyTool(c.name, c.args);
        const id = c.id || `${g.convId}:${o.step_index ?? 0}:${i}`;
        const model = isSub ? (agyArgs(c.args).Model || null) : null;
        if (isAsk) g.ask = true;
        if (isSub) {
          agyTasks.push({ parent: g.id, toolUseId: id, desc: detail || null, model, ts: now, claimed: false });
          while (agyTasks.length > 50) agyTasks.shift();
        }
        g.open.push({ id, isSub, desc: detail || null, model });
        emit({ ...base(), type: 'tool_start', id, tool, detail });
      });
    } else {
      g.step = 'DONE';
      emit({ ...base(), type: 'say' });
      if (g.parent) agySubDone(g.parent, g.convId, now); // под-агентът отговори без инструменти = свърши
    }
  } else if (o.type === 'GENERIC') {
    g.ask = false;
    const done = g.open.shift();
    if (done) {
      // „Created the following subagent: { "conversationId": "…" }“ – invoke_subagent се връща веднага, а под-агентът
      // работи на заден план: инструментът остава отворен (родителят „делегира“), докато под-агентът не свърши
      let cid = null;
      if (done.isSub && typeof o.content === 'string') {
        cid = (o.content.match(/"conversationId"\s*:\s*"([0-9a-f-]{36})"/i) || [])[1] || done.child || (o.content.match(UUID_RE) || [])[0] || null;
        if (cid) cid = cid.toLowerCase();
      }
      if (cid && cid !== g.convId) {
        agyChildOf.set(cid, { parent: g.id, toolUseId: done.id, desc: done.desc, model: done.model });
        while (agyChildOf.size > 200) agyChildOf.delete(agyChildOf.keys().next().value);
        done.at = now;
        g.subs.set(cid, done);
      } else emit({ ...base(), type: 'tool_end', tool_use_id: done.id });
    }
    if (!g.open.length) g.step = 'THINKING';
  }
}

/** Освобождава кешираните данни за заспал/изтрит файл (вика се от server.js). */
export function pruneProviders(file) {
  codexMeta.delete(file);
  geminiState.delete(file);
  agyState.delete(file);
}
