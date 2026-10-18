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
export function codexLine(file, line, emit, usage) {
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
      usage(base.agent, base.label, base.subagent, {
        id: `${base.agent}@${obj.timestamp || ''}`,
        usage: { input_tokens: Math.max(0, (u.input_tokens || 0) - cached), output_tokens: u.output_tokens || 0, cache_read_input_tokens: cached, cache_creation_input_tokens: u.cache_write_input_tokens || 0 },
      });
    }
  }
}

// ================================================================ OpenCode
function opencodeDb() {
  if (process.env.OPENCODE_DB) return path.isAbsolute(process.env.OPENCODE_DB) ? process.env.OPENCODE_DB : null;
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
  task: 'Task', todowrite: 'TodoWrite', todoread: 'TodoRead', question: 'AskUserQuestion',
};

/** Следи базата на OpenCode. Връща { stop } или null, ако няма OpenCode / node:sqlite. */
export async function watchOpencode(emit, usage, log = () => {}) {
  if (process.env.OPENCODE === '0') return null;
  let file = opencodeDb(), DatabaseSync, db = null, timer = null;
  try {
    // node:sqlite още е „експериментален“ – без предупреждение в конзолата
    const warn = process.emitWarning;
    process.emitWarning = (w, ...r) => (String(w?.message || w).includes('SQLite') ? undefined : warn.call(process, w, ...r));
    try { ({ DatabaseSync } = await import('node:sqlite')); } finally { process.emitWarning = warn; }
  } catch { return null; }
  let since = 0;                   // time_updated на последната прочетена част
  const parts = new Map();         // id на част -> последният статус ('start' | 'end' | 'say')
  const sessions = new Map();      // session id -> { agent, label, parent }
  const tasks = new Map();         // родителска сесия -> [callID на task, които още нямат дете]
  const childOf = new Map();       // дете -> callID на task-а на родителя
  const lastSay = new Map();       // агент -> кога беше последното „say“ (текстът се обновява на всеки няколко токена)

  const session = (sid) => {
    let s = sessions.get(sid);
    if (s) return s;
    const row = db.prepare('SELECT id, parent_id, directory, title FROM session WHERE id = ?').get(sid);
    s = { agent: 'oc:' + sid, label: row?.directory ? path.basename(String(row.directory).replace(/[\\/]+$/, '')) : 'opencode', parent: row?.parent_id ? 'oc:' + row.parent_id : null, desc: row?.title ? clip(row.title, 80) : null };
    if (row?.parent_id) { const q = tasks.get(row.parent_id); if (q?.length) childOf.set(sid, q.shift()); }
    sessions.set(sid, s);
    return s;
  };

  const open = () => {
    file ||= opencodeDb();
    if (!file || !fs.existsSync(file)) return false;
    try {
      db = new DatabaseSync(file, { readOnly: true });
      // историята не се пуска отново: започваме от най-новата част в момента
      since = db.prepare('SELECT max(time_updated) AS t FROM part').get()?.t || 0;
      log(`OpenCode: следя ${file}`);
      return true;
    } catch (e) { db = null; log(`OpenCode: ${e.message}`); return false; }
  };

  const tick = () => {
    if (!db && !open()) return;
    let rows;
    try {
      rows = db.prepare(`SELECT p.id, p.session_id AS sid, p.time_updated AS t, p.data, json_extract(m.data, '$.role') AS role
        FROM part p JOIN message m ON m.id = p.message_id WHERE p.time_updated > ? ORDER BY p.time_updated LIMIT 500`).all(since);
    } catch (e) { log(`OpenCode: ${e.message}`); try { db.close(); } catch { /* */ } db = null; return; }
    for (const r of rows) {
      since = Math.max(since, r.t);
      let d;
      try { d = JSON.parse(r.data); } catch { continue; }
      const s = session(r.sid);
      const base = { agent: s.agent, label: s.label, subagent: !!s.parent, provider: 'opencode', ts: Date.now() };
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
        if (!was) {
          emit({ ...base, type: 'tool_start', id, tool, detail });
          if (tool === 'Task') { const q = tasks.get(r.sid) || []; q.push(id); tasks.set(r.sid, q); }
          parts.set(r.id, 'start');
        }
        if ((st === 'completed' || st === 'error') && parts.get(r.id) !== 'end') { emit({ ...base, type: 'tool_end', tool_use_id: id }); parts.set(r.id, 'end'); }
      } else if (d.type === 'text' || d.type === 'reasoning') {
        if (!was) { emit({ ...base, type: r.role === 'user' ? 'user_prompt' : 'say' }); parts.set(r.id, 'say'); }
        else if (Date.now() - (lastSay.get(s.agent) || 0) > 2000) emit({ ...base, type: 'say' }); // пише още – „мисли“
        lastSay.set(s.agent, Date.now());
      } else if (d.type === 'step-finish' && d.tokens && !was) {
        parts.set(r.id, 'end');
        const t = d.tokens;
        usage(base.agent, base.label, base.subagent, { id: 'oc:' + r.id, usage: { input_tokens: t.input || 0, output_tokens: (t.output || 0) + (t.reasoning || 0), cache_read_input_tokens: t.cache?.read || 0, cache_creation_input_tokens: t.cache?.write || 0 } });
      }
    }
    if (parts.size > 20000) for (const k of [...parts.keys()].slice(0, 10000)) parts.delete(k);
  };
  timer = setInterval(tick, 1000);
  tick();
  return { stop() { clearInterval(timer); try { db?.close(); } catch { /* */ } } };
}
