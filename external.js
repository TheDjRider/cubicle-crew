// Отворен вход: всеки инструмент може да влезе в офиса през POST /api/event (само локално).
// Два формата:
//  1. собствен (за скриптове и curl): { agent, label?, provider?, type, tool?, detail?, id?, reason? }
//     type: start | prompt | thinking | tool_start | tool_end | activity | waiting | idle | end
//  2. payload на hook (Copilot CLI, Cursor, Claude Code и съвместимите): разпознава се по hook_event_name /
//     sessionId и се превежда (?from=copilot|cursor|… казва кой е агентът – етикет „· Copilot“).
// Работата отива като обикновени събития (emit -> балончета, монети, статистика), а състоянието (работи / чака
// те / почива) – в списъка с живи сесии (list()), така клиентът вади „чака те“, известията и излизането наготово.

const IDLE_AFTER_MS = 10 * 60e3;  // „работи“ без нищо ново толкова -> почива
const DROP_AFTER_MS = 60 * 60e3;  // без нищо ново толкова -> излиза от офиса
const MAX = 40;                   // външни агенти наведнъж

const str = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const idOf = (v) => str(String(v ?? ''), 80).replace(/[^\w.:@-]/g, '').slice(0, 64);
const nameOf = (v) => str(v, 20).toLowerCase().replace(/[^a-z0-9-]/g, '');

// имената на инструментите от други агенти -> нашите (за цвета на състоянието: пише / чете / изпълнява…)
const TOOLS = {
  bash: 'Bash', shell: 'Bash', powershell: 'Bash', terminal: 'Bash', run_terminal_cmd: 'Bash', run_shell_command: 'Bash', exec: 'Bash', command: 'Bash',
  read: 'Read', view: 'Read', read_file: 'Read', cat: 'Read', open: 'Read',
  edit: 'Edit', str_replace: 'Edit', str_replace_editor: 'Edit', apply_patch: 'Edit', edit_file: 'Edit', multiedit: 'Edit', replace: 'Edit',
  write: 'Write', create: 'Write', write_file: 'Write', create_file: 'Write',
  grep: 'Grep', search: 'Grep', glob: 'Glob', find: 'Glob', list: 'Glob', ls: 'Glob', codebase_search: 'Grep', file_search: 'Glob',
  web_fetch: 'WebFetch', fetch: 'WebFetch', web_search: 'WebSearch',
  task: 'Task', agent: 'Agent', subagent: 'Task',
};
const toolName = (t) => { const s = str(t, 40); return TOOLS[s.toLowerCase()] || s || 'Tool'; };

/** Краткият детайл (както brief() в server.js): пътят, командата или търсеното. */
function briefOf(input) {
  let o = input;
  if (typeof o === 'string') { try { o = JSON.parse(o); } catch { return str(o, 60); } }
  if (!o || typeof o !== 'object') return '';
  return str(String(o.file_path || o.path || o.filePath || o.command || o.cmd || o.pattern || o.query || o.url || o.description || ''), 60);
}

export class External {
  /** emit(evt) – като emitEvt в server.js; changed() – списъкът (състоянията) се смени. */
  constructor({ emit, changed }) {
    this.emit = emit; this.changed = changed;
    this.agents = new Map(); // id -> { agent, label, provider, status, waitingFor, last, open: [], act, n }
    this.timer = setInterval(() => this.expire(), 30e3); this.timer.unref?.();
  }

  /** За списъка с живи сесии (WS {type:'sessions'}). */
  list() {
    return [...this.agents.values()].map((x) => {
      const it = { agent: x.agent, label: x.label, status: x.status };
      if (x.provider !== 'ext' && x.provider !== 'hook') it.provider = x.provider; // етикетът „· Copilot“ и за страница, отворена по-късно
      if (x.status === 'waiting') it.waitingFor = x.waitingFor;
      return it;
    });
  }

  expire(now = Date.now()) {
    let ch = false;
    for (const [id, x] of this.agents) {
      if (now - x.last > DROP_AFTER_MS) { this.close(x); this.agents.delete(id); ch = true; }
      else if (x.status !== 'idle' && now - x.last > IDLE_AFTER_MS) { this.close(x); x.status = 'idle'; ch = true; }
    }
    if (ch) this.changed();
  }

  /** Тялото на POST /api/event (вече JSON). from – ?from=… Връща { ok, hook, error? }. */
  ingest(body, from = '', event = '') {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'json' };
    // camelCase payload-ите на Copilot CLI нямат името на събитието – тогава то идва от адреса (?event=preToolUse)
    if (event && !body.hook_event_name && !body.type) body = { ...body, hook_event_name: str(event, 40) };
    const hook = !!(body.hook_event_name || body.sessionId || body.conversation_id || body.session_id);
    const e = hook ? this.fromHook(body, nameOf(from) || 'hook') : this.fromNative(body, nameOf(from));
    if (!e) return { ok: !hook ? false : true, hook, error: hook ? undefined : 'type' };
    if (!e.agent) return { ok: false, hook, error: 'agent' };
    this.apply(e);
    return { ok: true, hook };
  }

  fromNative(b, from) {
    const type = str(b.type, 20).toLowerCase();
    if (!['start', 'prompt', 'thinking', 'tool_start', 'tool_end', 'activity', 'waiting', 'idle', 'end'].includes(type)) return null;
    const raw = idOf(b.agent || b.session);
    const provider = nameOf(b.provider) || from || 'ext';
    return { agent: raw && `${provider}:${raw}`, label: str(b.label, 60), provider, type, tool: b.tool != null ? toolName(b.tool) : '', detail: str(b.detail, 60), id: idOf(b.id), reason: str(b.reason, 20) };
  }

  /** Payload на hook: Copilot CLI (camelCase и съвместимия с VS Code), Cursor, Claude Code. */
  fromHook(b, provider) {
    const ev = String(b.hook_event_name || b.hookEventName || b.event || '').toLowerCase().replace(/[^a-z]/g, '');
    const raw = idOf(b.sessionId || b.session_id || b.conversation_id);
    const cwd = typeof b.cwd === 'string' ? b.cwd : Array.isArray(b.workspace_roots) && typeof b.workspace_roots[0] === 'string' ? b.workspace_roots[0] : '';
    const base = { agent: raw && `${provider}:${raw}`, label: str(cwd.split(/[\\/]+/).filter(Boolean).pop() || '', 60), provider }; // и C:\… на Linux, и /home/… на Windows
    const tool = b.tool_name ?? b.toolName, input = b.tool_input ?? b.toolArgs;
    const id = idOf(b.tool_use_id || b.toolUseId);
    switch (ev) {
      case 'sessionstart': return { ...base, type: 'start' };
      case 'userpromptsubmitted': case 'userpromptsubmit': case 'beforesubmitprompt': return { ...base, type: 'prompt' };
      case 'pretooluse': return { ...base, type: 'tool_start', tool: toolName(tool), detail: briefOf(input), id };
      case 'posttooluse': case 'posttoolusefailure': return { ...base, type: 'tool_end', tool: toolName(tool), detail: briefOf(input), id, after: true };
      // Cursor: само събития „след“ – показваме ги като текущото действие до следващото
      case 'aftershellexecution': return { ...base, type: 'activity', tool: 'Bash', detail: str(b.command, 60) };
      case 'afterfileedit': return { ...base, type: 'activity', tool: 'Edit', detail: str(b.file_path, 60) };
      case 'beforereadfile': return { ...base, type: 'activity', tool: 'Read', detail: str(b.file_path, 60) };
      case 'aftermcpexecution': return { ...base, type: 'activity', tool: toolName(tool || 'mcp'), detail: '' };
      case 'afteragentthought': case 'afteragentresponse': return { ...base, type: 'thinking' };
      case 'permissionrequest': return { ...base, type: 'waiting', reason: 'permission' };
      case 'notification': return { ...base, type: 'waiting', reason: /permission/i.test(String(b.notification_type || b.message || '')) ? 'permission' : 'input' };
      case 'stop': case 'agentstop': case 'erroroccurred': return { ...base, type: 'idle' };
      case 'sessionend': return { ...base, type: 'end' };
      default: return null; // непознато събитие – тихо (hook-ът не бива да се чупи)
    }
  }

  /** Събитие към офиса (както редовете от транскриптите). */
  out(x, type, extra = {}) {
    const provider = x.provider === 'ext' || x.provider === 'hook' ? undefined : x.provider; // без име – без етикет „· …“
    this.emit({ agent: x.agent, label: x.label, subagent: false, provider, ts: Date.now(), type, ...extra });
  }

  /** Затваря висящите инструменти (и „текущото действие“). */
  close(x) {
    for (const id of x.open) this.out(x, 'tool_end', { tool_use_id: id });
    x.open = [];
  }

  apply(e) {
    let x = this.agents.get(e.agent);
    const before = x ? `${x.status}|${x.waitingFor}|${x.label}` : '';
    if (!x) {
      if (e.type === 'end') return;
      if (this.agents.size >= MAX) { const old = [...this.agents.values()].sort((a, b) => a.last - b.last)[0]; this.close(old); this.agents.delete(old.agent); }
      x = { agent: e.agent, label: e.label || e.agent.split(':').pop().slice(0, 8), provider: e.provider, status: 'busy', waitingFor: '', last: 0, open: [], n: 0 };
      this.agents.set(e.agent, x);
    }
    if (e.label) x.label = e.label;
    x.last = Date.now();
    if (e.type !== 'waiting' && e.type !== 'idle' && e.type !== 'end') x.status = 'busy';
    switch (e.type) {
      case 'start': break;
      case 'prompt': this.close(x); this.out(x, 'user_prompt'); break;
      case 'thinking': this.out(x, 'say'); break;
      case 'tool_start': {
        const id = e.id || `${x.agent}#${++x.n}`;
        x.open.push(id);
        this.out(x, 'tool_start', { id, tool: e.tool || 'Tool', detail: e.detail, tool_use_id: id });
        break;
      }
      case 'tool_end': {
        // без „преди“ (само postToolUse) – показваме го като действие, иначе затваряме точния (или последния)
        const i = e.id ? x.open.indexOf(e.id) : x.open.length - 1;
        if (i >= 0) { const [id] = x.open.splice(i, 1); this.out(x, 'tool_end', { tool_use_id: id }); }
        else if (e.after) this.activity(x, e);
        break;
      }
      case 'activity': this.activity(x, e); break;
      case 'waiting': x.status = 'waiting'; x.waitingFor = e.reason === 'permission' ? 'permission prompt' : 'input'; break;
      case 'idle': this.close(x); x.status = 'idle'; x.waitingFor = ''; break;
      case 'end': this.close(x); this.agents.delete(x.agent); this.changed(); return;
      default: break;
    }
    if (`${x.status}|${x.waitingFor}|${x.label}` !== before) this.changed();
  }

  /** „Текущото действие“: предишното свършва, новото започва (за агенти, които казват само какво са направили). */
  activity(x, e) {
    this.close(x);
    const id = `${x.agent}#${++x.n}`;
    x.open.push(id);
    this.out(x, 'tool_start', { id, tool: e.tool || 'Tool', detail: e.detail, tool_use_id: id });
  }
}
