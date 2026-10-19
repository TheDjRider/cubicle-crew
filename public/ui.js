// Целият текст е DOM (остър при всякакъв мащаб и с кирилица): етикети, балончета,
// подсказки при посочване, HUD, легенда и ?debug панел.
import { CFG, STATES, STATE_ORDER, PROVIDERS, T, PARAMS, LANG, setLang, itemName, petTitle, waitingText } from './config.js';
import { shortDetail, fmtDuration, danger, fmtUsd } from './util.js';
import { coinUrl } from './tokens.js';
import { soundOn, setSound } from './sound.js';
import { prefs } from './prefs.js';
import { boardData, demoBoardData, PAGE_DAYS } from './board.js';
import { settingsHtml } from './settings.js';

// торбичка за пазаруване 9x9 (иконата на бутона за магазина) – рисува се тук, без външни файлове
const BAG = ['...aaa...', '..a...a..', '..a...a..', 'bbbbbbbbb', 'bcccccccb', 'bcccdcccb', 'bccdddccb', 'bcccdcccb', 'bbbbbbbbb'];
function bagUrl() {
  const c = document.createElement('canvas'), g = c.getContext('2d'), col = { a: '#e8d8a8', b: '#3a2050', c: '#b05ad8', d: '#ffe27a' };
  c.width = 9; c.height = 9;
  BAG.forEach((row, j) => { for (let i = 0; i < 9; i++) if (col[row[i]]) { g.fillStyle = col[row[i]]; g.fillRect(i, j, 1, 1); } });
  return c.toDataURL();
}

// стълбчета 9x9 (бутонът „Статистика“)
const BARS = ['.........', '......aa.', '......aa.', '...bb.aa.', '...bb.aa.', 'cc.bb.aa.', 'cc.bb.aa.', 'cc.bb.aa.', 'ddddddddd'];
function barsUrl() {
  const c = document.createElement('canvas'), g = c.getContext('2d'), col = { a: '#4ac26b', b: '#4a8fe0', c: '#e0c24a', d: '#8a8aa0' };
  c.width = 9; c.height = 9;
  BARS.forEach((row, j) => { for (let i = 0; i < 9; i++) if (col[row[i]]) { g.fillStyle = col[row[i]]; g.fillRect(i, j, 1, 1); } });
  return c.toDataURL();
}

// звънче 9x9 (известия/звук); изключено – сиво и зачеркнато
const BELL = ['....a....', '...aba...', '..abbba..', '..abbba..', '..abbba..', '.abbbbba.', 'aaaaaaaaa', '....c....', '.........'];
function bellUrl(on) {
  const c = document.createElement('canvas'), g = c.getContext('2d');
  const col = on ? { a: '#7a5410', b: '#ffe27a', c: '#ffe27a' } : { a: '#3a3a4a', b: '#8a8aa0', c: '#8a8aa0' };
  c.width = 9; c.height = 9;
  BELL.forEach((row, j) => { for (let i = 0; i < 9; i++) if (col[row[i]]) { g.fillStyle = col[row[i]]; g.fillRect(i, j, 1, 1); } });
  if (!on) { g.fillStyle = '#e04a6b'; for (let i = 0; i < 9; i++) g.fillRect(i, 8 - i, 1, 1); }
  return c.toDataURL();
}

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Кратко id без префикса на агента (codex:…, oc:…). */
const shortId = (id, n) => String(id).replace(/^(codex|oc|gemini):/, '').slice(0, n);

/** Детайлът на инструмента (вече escape-нат) – в червено с ⚠, ако командата е рискова; в private режим остава само ⚠. */
function dangerHtml(t, html) {
  return danger(t.tool, t.detail) ? `<span class="danger" title="${T.danger}">⚠ ${html}</span>` : html;
}

export class UI {
  constructor(office, model, canvas) {
    this.office = office; this.model = model; this.canvas = canvas;
    this.overlay = document.getElementById('overlay');
    this.hud = document.getElementById('hud');
    this.tip = document.getElementById('tooltip');
    this.card = document.getElementById('card');
    this.legend = document.getElementById('legend');
    this.empty = document.getElementById('empty');
    this.debugEl = document.getElementById('debug');
    this.items = new Map();        // id -> { label, bubble, cache }
    this.cssScale = 1; this.dpr = 1;
    this.conn = 'connecting';
    this.hover = null; this.mouse = null;
    this.fps = { frames: 0, last: performance.now(), value: 0 };
    this.lastHud = 0;
    this.buildLegend();
    this.bindMouse();
    // Разреши / Откажи (hook-ът на Claude Code – вж. permissions.js): лента долу в средата
    this.prompt = el('div', null, document.body);
    this.prompt.id = 'prompt'; this.prompt.hidden = true;
    this.prompt.addEventListener('click', (e) => { const b = e.target.closest('[data-perm]'); if (b) this.decide(b.dataset.id, b.dataset.perm); });
    // статистиката за прожекционния екран над дъската – веднага и после всяка минута
    this.loadBoardStats();
    setInterval(() => this.loadBoardStats(), 60000);
    // монетата в HUD отваря магазина (onShop се задава в main.js)
    this.hud.addEventListener('click', (e) => {
      if (e.target.closest('.tok, .shopbtn')) this.onShop?.();
      else if (e.target.closest('.help')) this.toggleHelp();
      else if (e.target.closest('.statsbtn')) this.onStats?.();
      else if (e.target.closest('.snd')) {
        setSound(!soundOn()); this.lastHud = 0; // Electron научава новия избор от stats (sound)
      }
      else if (e.target.closest('.lang')) {
        const l = LANG === 'bg' ? 'en' : 'bg';
        if (PARAMS.desktop && window.pixelOffice?.action) window.pixelOffice.action('lang:' + l); else setLang(l);
      }
    });
    document.documentElement.lang = LANG;
    if (PARAMS.overlay) document.body.classList.add('overlay');
    // фокус (клик върху агент): картата е интерактивна – бутон за ново име на сесията
    this.card.addEventListener('click', (e) => {
      if (e.target.closest('[data-ren]')) this.startRename();
      else if (e.target.closest('[data-term]')) this.goTerminal(this.office.focusId);
    });
    prefs.onChange(() => { this.lastHud = 0; this.card._html = ''; for (const it of this.items.values()) it.c = {}; if (this.help && !this.help.hidden) this.renderHelp(); });
    if (PARAMS.debug) this.debugEl.hidden = false;
    if (PARAMS.desktop) this.initDesktop();
  }

  // ------------------------------------------------------------------ Electron
  initDesktop() {
    document.body.classList.add('desktop');
    const bridge = window.pixelOffice;
    let stored = null;
    try { stored = localStorage.getItem('po.legend'); } catch { /* */ }
    if (stored == null) this.legend.hidden = true; // в малкия прозорец легендата е скрита по подразбиране (L я показва)
    const bar = document.getElementById('winbar');
    for (const b of bar.querySelectorAll('button[data-act]')) if (T.winbar[b.dataset.act]) b.title = T.winbar[b.dataset.act];
    bar.addEventListener('click', (e) => {
      const act = e.target.closest('button')?.dataset.act;
      if (act && bridge) bridge.action(act);
    });
    bridge?.onState?.((st) => { bar.querySelector('[data-act="pin"]').classList.toggle('on', !!st.onTop); });
    bridge?.onSound?.((on) => { setSound(on); this.lastHud = 0; }); // "Звук" от менюто в трея
    bridge?.onOpenHelp?.(() => this.toggleHelp(true));               // „Настройки и помощ…“ от трея
    this.bridge = bridge;
  }

  sendDesktopStats(s) {
    if (!this.bridge) return;
    const waiting = [...this.office.actors.values()].filter((a) => a.vstate === 'waiting').map((a) => (!prefs.private && a.agent.desc) || this.displayName(a.agent));
    const sound = soundOn();
    // състоянията на оркестраторите по ред на идване -> точките в иконата в трея
    const leads = [...this.office.actors.values()].filter((a) => !a.agent.subagent).sort((a, b) => a.joinSeq - b.joinSeq).map((a) => a.vstate);
    const prompt = this.model.prompts.keys().next().value || null; // най-старата молба за разрешение (глобалните Ctrl+Alt+Y / N)
    const update = this.update?.newer ? this.update.latest : null; // нова версия -> ред в менюто на трея
    // „само когато трябва“: докато мишката е над прозореца или е отворен панел/магазин/настройка, приложението не го скрива
    const hold = !!document.querySelector('body:hover') || (this.help && !this.help.hidden) || document.body.classList.contains('shopping') || document.body.classList.contains('setting-up') || !!this.office.focusId;
    const key = `${s.agents}|${s.subs}|${s.tools}|${waiting.join(',')}|${sound}|${prefs.focus}|${prefs.private}|${leads.join(',')}|${prompt}|${update?.version}|${hold}`;
    if (key === this._lastStats) return;
    this._lastStats = key;
    // sound: приложението пуска известието без системния звук, щом страницата свири своя
    const waitingIds = [...this.office.actors.values()].filter((a) => a.vstate === 'waiting').map((a) => this.office.leadOf(a)?.id || a.id);
    this.bridge.stats({ agents: s.agents - s.subs, subs: s.subs, tools: s.tools, waiting, sound, focus: prefs.focus, private: prefs.private, leads, waitingIds, prompt, update, hold });
  }

  setScale(scale, dpr, W, H) {
    this.cssScale = scale / dpr; this.dpr = dpr;
    this.overlay.style.width = `${(W * scale) / dpr}px`;
    this.overlay.style.height = `${(H * scale) / dpr}px`;
    const podCss = CFG.POD_W * this.cssScale;
    document.documentElement.style.setProperty('--pod', `${Math.round(podCss)}px`);
    document.documentElement.style.setProperty('--bubble-max', `${Math.round(Math.max(120, Math.min(280, podCss * 1.3)))}px`);
    document.documentElement.style.setProperty('--label-max', `${Math.round(Math.max(56, podCss - 6))}px`);
    // дребен мащаб: компактен текст, балончетата – само при "чака" или при посочване/фокус
    document.body.classList.toggle('tiny', this.cssScale < 1.5 || PARAMS.desktop);
  }

  setConnection(s) { this.conn = s; this.lastHud = 0; }

  /** Известие за постижение (по едно, на опашка) + конфети. */
  achievement(id, reward) {
    if (prefs.focus) return; // наградата пак е записана, само без известие
    (this.toasts ||= []).push([id, reward]);
    if (!this.toastBusy) this.nextToast();
  }
  /** Известие за новост (на същата опашка, без конфети). */
  notice(title, text) {
    (this.toasts ||= []).push(['notice', title, text]);
    if (!this.toastBusy) this.nextToast();
  }
  nextToast() {
    const next = this.toasts.shift();
    const box = document.getElementById('toast');
    if (!next) { this.toastBusy = false; box.hidden = true; return; }
    this.toastBusy = true;
    if (next[0] === 'notice') {
      box.innerHTML = `<small>🐾 ${T.news.label}</small><b>${esc(next[1])}</b><span>${esc(next[2])}</span>`;
      box.hidden = false;
      setTimeout(() => this.nextToast(), 8000);
      return;
    }
    const [id, reward] = next;
    const [name, desc] = T.achievements[id] || [id, ''];
    box.innerHTML = `<small>🏆 ${T.shop.achievement}</small><b>${esc(name)}</b><span>${esc(desc)} · ${T.shop.reward(reward)}</span>`;
    box.hidden = false;
    const L = this.office.L;
    this.office.fx.confetti(L.W / 2, CFG.WALL_H + 10, 60);
    setTimeout(() => this.nextToast(), 4200);
  }

  /** Брояч на токените; reason = бонус (за кратко подсветяване). */
  setTokens(n, reason, now) {
    this.tokens = n;
    if (reason) this.tokenFlash = now;
    this.lastHud = 0;
  }

  /** Логически -> CSS пиксели, закръглени до физически пиксел. */
  px(v) { return Math.round(v * this.cssScale * this.dpr) / this.dpr; }

  buildLegend() {
    this.legend.innerHTML = STATE_ORDER.map((s) => `<span data-state="${s}"><i style="background:${STATES[s].color}"></i>${T.states[s]}</span>`).join('') + `<em>${T.legendHint}</em>`;
    try { if (localStorage.getItem('po.legend') === '0') this.legend.hidden = true; } catch { /* няма storage */ }
    addEventListener('keydown', (e) => {
      if ('lLлЛ'.includes(e.key) && e.key.length === 1 && !e.target?.closest?.('input, textarea')) {
        this.legend.hidden = !this.legend.hidden;
        try { localStorage.setItem('po.legend', this.legend.hidden ? '0' : '1'); } catch { /* */ }
      }
      // Y / N (и на фонетичната кирилица: ъ / н) – отговор на най-старата молба за разрешение
      if (!this.prompt.hidden && e.key.length === 1 && !e.target?.closest?.('input, textarea')) {
        const k = e.key.toLowerCase(), id = this.prompt.dataset.id;
        if (k === 'y' || k === 'ъ') { this.decide(id, 'allow'); return; }
        if (k === 'n' || k === 'н') { this.decide(id, 'deny'); return; }
      }
      if (e.key === 'Escape') { this.focus(null); if (this.help && !this.help.hidden) this.toggleHelp(false); }
      if (e.key === '?' && !e.target?.closest?.('input, textarea')) this.toggleHelp();
    });
  }

  bindMouse() {
    const toLogical = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / this.cssScale, y: (e.clientY - r.top) / this.cssScale, cx: e.clientX, cy: e.clientY };
    };
    this.canvas.addEventListener('mousemove', (e) => { this.mouse = toLogical(e); });
    this.canvas.addEventListener('mouseleave', () => { this.mouse = null; });
    // двоен клик върху агент -> неговият терминал
    this.canvas.addEventListener('dblclick', (e) => {
      const m = toLogical(e), a = this.office.hitTest(m.x, m.y);
      if (a) { this.goTerminal(a.id); return; }
      const pet = this.office.petAt(m.x, m.y);
      if (pet) this.onPet?.(pet.slot);
    });
    this.canvas.addEventListener('click', (e) => {
      const m = toLogical(e);
      const a = this.office.hitTest(m.x, m.y);
      if (!a && this.onSwitch(m)) { this.office.toggleLights(); return; }
      if (!a && this.onBoard(m)) { this.office.boardClick(); this.loadBoardStats(); return; }
      if (!a && this.onPlaque(m)) { this.onWeather?.(); return; }
      const pet = !a && this.office.petAt(m.x, m.y);
      if (pet) { this.office.petPet(pet); return; } // клик = погали; двоен клик = име и външен вид
      this.focus(a && a.id !== this.office.focusId ? a.id : null);
    });
  }

  /** Мишката е върху дъската (или спуснатия екран пред нея). */
  onBoard(m) { const b = this.office.room?.board; return !!b && m.x >= b.x - 2 && m.x < b.x + b.w + 2 && m.y >= b.y - 4 && m.y < b.y + b.h + 3; }

  /** Статистиката за екрана: от сървъра (последните 30 дни), в ?demo – примерна. */
  async loadBoardStats() {
    if (PARAMS.demo) { this.office.boardStats ||= demoBoardData(); return; }
    try {
      const r = await (await fetch('api/stats?days=30')).json();
      if (r?.ok) this.office.boardStats = boardData(r.days);
    } catch { /* сървърът е стар или го няма – екранът показва „--“ */ }
  }

  /** Мишката е върху ключа за осветлението до вратата (с малко поле около него). */
  onSwitch(m) { const s = this.office.room?.lightSwitch; return !!s && m.x >= s.x - 2 && m.x < s.x + s.w + 2 && m.y >= s.y - 2 && m.y < s.y + s.h + 2; }

  /** Мишката е върху метеостанцията на стената. */
  onPlaque(m) { const p = this.office.room?.wxPlaque; return !!p && m.x >= p.x && m.x < p.x + p.w && m.y >= p.y && m.y < p.y + p.h; }

  focus(id) {
    if (id) this.model.seen(id); this.office.focusId = id; this.card.hidden = !id; }

  // ------------------------------------------------------------------ всеки кадър
  /** Решение от лентата (бутон или Y/N) -> сървъра, който го връща на Claude Code. */
  async decide(id, decision) {
    if (!id) return;
    this.model.permission({ id, done: true });
    try { await fetch('api/permission', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision }) }); } catch { /* */ }
  }

  /** Лентата с най-старата чакаща молба за разрешение. */
  renderPrompt() {
    const list = [...this.model.prompts.values()];
    const p = list[0];
    const key = p ? `${p.id}|${list.length}|${prefs.private}|${LANG}` : '';
    if (key === this.prompt._key) return;
    this.prompt._key = key;
    this.prompt.hidden = !p;
    if (!p) return;
    const ag = this.model.agents.get(p.session), P = T.perm;
    this.prompt.dataset.id = p.id;
    this.prompt.innerHTML = `<span class="q"><b>${esc(ag ? this.displayName(ag) : p.session.slice(0, 8))}</b> · ${esc(T.allow(p.tool))}</span>` +
      (p.detail && !prefs.private ? `<code${danger(p.tool, p.detail) ? ` class="danger" title="${T.danger}">⚠ ` : '>'}${esc(shortDetail(p.detail, 60))}</code>` : danger(p.tool, p.detail) ? `<code class="danger">⚠ ${T.danger}</code>` : '') +
      `<button type="button" class="ok" data-perm="allow" data-id="${esc(p.id)}">${P.allow} <kbd>Y</kbd></button>` +
      `<button type="button" data-perm="deny" data-id="${esc(p.id)}">${P.deny} <kbd>N</kbd></button>` +
      (list.length > 1 ? `<span class="more">${P.more(list.length - 1)}</span>` : '') +
      (this.bridge ? `<span class="more">${P.global}</span>` : '');
  }

  sync(now) {
    this.renderPrompt();
    const office = this.office;
    const seen = new Set();
    for (const a of office.actors.values()) {
      seen.add(a.id);
      let it = this.items.get(a.id);
      if (!it) {
        it = { label: el('div', 'tag', this.overlay), bubble: el('div', 'bubble', this.overlay), c: {} };
        it.label.innerHTML = '<i></i><span class="n"></span><span class="s"></span>';
        it.bubble.innerHTML = '<b></b><span></span>';
        this.items.set(a.id, it);
      }
      const ag = a.agent;
      const st = a.vstate;
      const anc = office.anchors(a);
      const hidden = a.alpha < 0.05;
      // етикет
      const name = (ag.subagent ? '↳ ' : '★ ') + ((!prefs.private && ag.desc) || this.displayName(ag)) + (ag.provider && !ag.subagent ? ` · ${PROVIDERS[ag.provider] || ag.provider}` : '');
      this.set(it, 'name', name, () => { it.label.children[1].textContent = name; it.lw = 0; });
      this.set(it, 'st', st, () => {
        it.label.children[0].style.background = STATES[st].color;
        it.label.children[2].textContent = T.states[st]; it.lw = 0;
        it.label.dataset.state = st;
        it.bubble.dataset.state = st;
      });
      const lx = this.clampX(anc.label.x, it, 'lw', it.label);
      // на дивана и при кафето/водата двама стоят близо – етикетът на втория е ред по-долу, за да не се застъпват
      const ly = this.px(anc.label.y) + (a.mode !== 'walk' && (a.loc.type === 'sofa' || a.loc.type === 'cooler') ? (a.loc.type === 'sofa' ? a.loc.i : 1) * (it.lh ||= (it.label.offsetHeight || 14) + 2) : 0);
      this.set(it, 'lpos', `${lx},${ly},${Math.round(a.alpha * 10)}`, () => {
        it.label.style.transform = `translate(${lx}px, ${ly}px) translateX(-50%)`;
        it.label.style.opacity = hidden ? 0 : Math.min(1, a.alpha * 1.2);
        it.bubble.style.visibility = hidden ? 'hidden' : '';
      });
      // балонче: инструмент + детайл (само за "работни" състояния)
      const tool = this.model.currentTool(ag);
      let btxt = null;
      if (tool && (st === 'typing' || st === 'reading' || st === 'running' || st === 'delegating')) btxt = [tool.tool, prefs.private ? '' : shortDetail(tool.detail, 38), danger(tool.tool, tool.detail)];
      if (ag.crashed && !ag.crashSeen) btxt = [T.crashed.title, T.crashed.hint];
      else if (st === 'waiting') btxt = [T.needsYou, ag.ask ? T.allow(ag.ask.kind === 'permission' && tool ? tool.tool : '') : tool ? tool.tool : ''];
      const bkey = btxt ? btxt.join('|') : '';
      this.set(it, 'btxt', bkey, () => {
        if (btxt) { it.bubble.children[0].textContent = btxt[0]; it.bubble.children[1].textContent = btxt[1]; it.bw = 0; }
        it.bubble.classList.toggle('show', !!btxt);
        it.bubble.classList.toggle('danger', !!btxt?.[2]);
      });
      const by = anc.bubble.y - (st === 'waiting' ? 18 : 0);
      const bx = this.clampX(anc.bubble.x, it, 'bw', it.bubble);
      this.set(it, 'bpos', `${bx},${this.px(by)}`, () => {
        it.bubble.style.transform = `translate(${bx}px, ${this.px(by)}px) translate(-50%, -100%)`;
      });
      it.label.classList.toggle('focus', office.focusId === a.id);
      it.bubble.classList.toggle('hl', office.focusId === a.id || this.hoverId === a.id);
    }
    for (const [id, it] of this.items) if (!seen.has(id)) { it.label.remove(); it.bubble.remove(); this.items.delete(id); }

    this.updateTooltip(now);
    if (office.focusId) this.updateCard(now);
    this.fps.frames++;
    if (now - this.lastHud > 250) { this.lastHud = now; this.updateHud(now); }
  }

  /** Центрирано по x, но без да излиза извън стаята. */
  clampX(x, it, key, elm) {
    if (!it[key]) it[key] = elm.offsetWidth || 0;
    const half = it[key] / 2 + 2, W = this.overlay.clientWidth;
    return Math.round(Math.max(half, Math.min(W - half, this.px(x))) * this.dpr) / this.dpr;
  }

  set(it, key, val, fn) { if (it.c[key] !== val) { it.c[key] = val; fn(); } }

  displayName(ag) {
    const own = prefs.name(ag.id);
    if (own) return own;
    // ако няколко сесии са в един проект – добавяме кратко id
    let dup = 0;
    for (const o of this.model.agents.values()) if (o.label === ag.label && !o.subagent) dup++;
    return dup > 1 && !ag.subagent ? ag.sessionName || `${ag.label} #${shortId(ag.id, 4)}` : ag.label;
  }

  describe(a, now, card = false) {
    const ag = a.agent, st = a.vstate, priv = prefs.private;
    const tool = this.model.currentTool(ag) || ag.lastTool;
    const own = prefs.name(ag.id);
    const rows = [
      [T.project, (own ? `<b>${esc(own)}</b> · ` : '') + esc(ag.label) + ` <span class="dim">#${esc(shortId(ag.id, 8))}</span>`],
      [T.state, `<i class="dot" data-state="${st}" style="background:${STATES[st].color}"></i>${T.states[st]}`],
    ];
    if (ag.provider) rows.push([T.agentKind, esc(PROVIDERS[ag.provider] || ag.provider)]);
    if (tool) rows.push([T.tool, `<b>${esc(tool.tool)}</b> ${dangerHtml(tool, priv ? '' : esc(shortDetail(tool.detail, 46)))}`]);
    rows.push([T.toolCalls, String(ag.toolCalls)]);
    if (ag.ctx > 0) { const k = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/.0$/, '') + 'M' : Math.round(n / 1000) + 'k'); rows.push([T.context, `${k(ag.ctx)} / ${k(ag.ctxMax)} <span class="dim">(${Math.round((100 * ag.ctx) / ag.ctxMax)}%)</span>`]); }
    rows.push([T.uptime, fmtDuration(now - ag.firstSeen, T)]);
    if (ag.parent) { const p = this.model.agents.get(ag.parent); rows.push([T.childOf, esc(p ? this.displayName(p) : ag.parent.slice(0, 8))]); }
    if (ag.children.size) rows.push([T.parentOf, String(this.model.liveChildren(ag)) + ' / ' + ag.children.size]);
    const title = ag.desc && !priv ? `<div class="title">${esc(ag.desc)}</div>` : '';
    // картата: последните действия на агента (най-новото горе) – часът, инструментът, колко продължи
    let hist = '';
    if (card && ag.history?.length) {
      const hm = (t) => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
      hist = `<div class="hist"><b>${T.history}</b>` + ag.history.slice(-10).reverse().map((h) =>
        `<div><span class="t">${hm(h.at)}</span><b>${esc(h.tool)}</b><span class="d">${dangerHtml(h, priv ? '' : esc(shortDetail(h.detail, 34)))}</span><span class="t">${h.ms == null ? T.running : fmtDuration(h.ms, T)}</span></div>`).join('') + '</div>';
    }
    const ren = card ? `<div class="ren"><button type="button" data-term title="${T.terminalHint}">↗ ${T.terminal}</button>${ag.subagent ? '' : ` <button type="button" data-ren>✎ ${T.rename}</button>`}</div>` : '';
    return title + '<table>' + rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('') + '</table>' + hist + ren;
  }

  updateTooltip(now) {
    const m = this.mouse;
    if (!m) { this.tip.hidden = true; this.canvas.style.cursor = ''; this.hoverId = null; return; }
    const a = this.office.hitTest(m.x, m.y);
    this.hoverId = a ? a.id : null;
    if (a) this.model.seen(a.id);
    let html = null;
    if (a) html = this.describe(a, now);
    else {
      const page = this.office.board.page, B = T.board;
      if (this.onBoard(m) && page > 0) {
        // прожекционният екран: числата от страницата с думи
        const d = this.office.boardStats?.[PAGE_DAYS[page]], tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
        html = `<div class="title">${B.pages[page]}</div>` + (d
          ? `<table><tr><th>${B.work}</th><td>${fmtDuration(d.activeMs, T)}</td></tr><tr><th>${B.waited}</th><td>${fmtDuration(d.waitingMs, T)}</td></tr><tr><th>${B.tools}</th><td>${d.tools}</td></tr><tr><th>${B.tokens}</th><td>${tok(d.tokIn)} / ${tok(d.tokOut)}</td></tr>${d.usd ? `<tr><th>${B.cost}</th><td>${fmtUsd(d.usd)}</td></tr>` : ''}</table>`
          : `<div>${B.none}</div>`) + `<div class="dim">${page === 3 ? B.back : B.next}</div>`;
      } else if (this.onBoard(m)) {
        const s = this.model.stats(), coins = this.tokens != null && !prefs.focus;
        html = `<table><tr><th>${B.agents}</th><td>${s.agents}</td></tr><tr><th>${B.tools}</th><td>${s.tools}</td></tr><tr><th>${B.subs}</th><td>${s.subs}</td></tr>` +
          (coins ? `<tr><th>${T.tokens}</th><td>${this.fmtTokens()}</td></tr>` : '') + '</table>' +
          (coins ? `<div class="dim">${T.tokensHint}</div>` : '') + `<div class="dim">${B.click}</div>`;
      }
    }
    if (!a && !html && this.onPlaque(m)) {
      const wm = this.office.weatherMsg, c = wm?.city;
      html = (c ? `<div class="title">${esc(c.name)}</div>` : '') + `<div class="dim">${T.weather.tip}</div>`;
    }
    if (!a && !html && this.onSwitch(m)) html = `<div class="title">${T.lights.title}</div><div class="dim">${this.office.lights.on ? T.lights.off : T.lights.on}</div>`;
    // любимец: името му (може да се смени – клик отваря „Любимци“)
    const pet = !a && !html && this.office.petAt(m.x, m.y);
    if (pet) html = `<div class="title">${esc(petTitle(pet.slot, this.office.petNames, pet.look?.id))}</div><div>${T.pets.kinds[pet.kind]} · ${esc(itemName(pet.look))}${pet.look?.by ? ` · ${esc(T.shop.by(pet.look.by))}` : ''}</div><div class="dim">${T.pets.tip}</div>`;
    this.canvas.style.cursor = a || pet || this.onPlaque(m) || this.onSwitch(m) || this.onBoard(m) ? 'pointer' : '';
    if (!html) { this.tip.hidden = true; return; }
    if (this.tip._html !== html) { this.tip.innerHTML = html; this.tip._html = html; }
    this.tip.hidden = false;
    const tw = this.tip.offsetWidth, th = this.tip.offsetHeight;
    let x = m.cx + 14, y = m.cy + 14;
    if (x + tw > innerWidth - 6) x = m.cx - tw - 10;
    if (y + th > innerHeight - 6) y = m.cy - th - 10;
    this.tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  updateCard(now) {
    const a = this.office.actors.get(this.office.focusId);
    if (!a) { this.focus(null); return; }
    if (this.renaming) return; // докато се пише новото име, картата не се прерисува
    const html = this.describe(a, now, true);
    if (this.card._html !== html) { this.card.innerHTML = html; this.card._html = html; }
  }

  updateHud(now) {
    const s = this.model.stats();
    const fpsDt = now - this.fps.last;
    if (fpsDt >= 1000) { this.fps.value = Math.round((this.fps.frames * 1000) / fpsDt); this.fps.frames = 0; this.fps.last = now; }
    const connTxt = { connecting: T.connecting, connected: T.connected, down: T.reconnecting, demo: T.demo }[this.conn];
    // токените са първи – в малкия прозорец остават сами в ъгъла, когато останалото се скрие
    const html =
      (this.tokens != null && !prefs.focus ? `<span class="tok${now - (this.tokenFlash ?? -1e9) < 1500 ? ' gain' : ''}" title="${T.shop.open}"><i style="background-image:url(${this.coin ||= coinUrl()})"></i><b>${this.fmtTokens()}</b></span>` +
        `<span class="shopbtn" title="${T.shop.open}"><i style="background-image:url(${this.bag ||= bagUrl()})"></i></span>` : '') +
      `<span class="conn ${this.conn}"><i></i>${connTxt}</span>` +
      `<span>${T.agents} <b>${s.agents - s.subs}</b></span>` +
      `<span>${T.subagents} <b>${s.subs}</b></span>` +
      `<span>${T.toolCalls} <b>${s.tools}</b></span>` +
      (s.waiting ? `<span class="alert">${T.waitingYou} <b>${s.waiting}</b></span>` : '') +
      (this.conn !== 'demo' ? `<span class="snd" title="${soundOn() ? T.sound.on : T.sound.off}"><i style="background-image:url(${(this.bells ||= [bellUrl(false), bellUrl(true)])[+soundOn()]})"></i></span>` : '') +
      (this.conn !== 'demo' ? `<span class="statsbtn" title="${T.stats.open}"><i style="background-image:url(${this.barsIcon ||= barsUrl()})"></i></span>` : '') +
      (this.update?.newer ? `<span class="help upd" title="${T.help.open} · ${esc(T.help.newer(this.update.latest.version))}">?</span>` : `<span class="help" title="${T.help.open}">?</span>`) +
      `<span class="lang" title="${T.lang}">${LANG === 'bg' ? 'БГ' : 'EN'}</span>`;
    if (this.hud._html !== html) { this.hud.innerHTML = html; this.hud._html = html; }
    const title = s.waiting ? `(${s.waiting}) ${T.needsYou} · ${T.title}` : T.title;
    if (document.title !== title) document.title = title;
    this.empty.hidden = !(s.agents === 0 && this.conn !== 'demo');
    const wt = waitingText(T.waitingActivity, this.office.agentsFound);
    if (this.empty.textContent !== wt) this.empty.textContent = wt;
    if (PARAMS.debug) this.updateDebug(now);
    this.sendDesktopStats(s);
  }

  fmtTokens() { return this.tokens.toLocaleString(LANG === 'bg' ? 'bg-BG' : 'en-US'); }

  // ------------------------------------------------------------------ към терминала (сървърът изкарва прозореца отпред)
  async goTerminal(id) {
    const a = this.office.actors.get(id);
    const lead = a ? this.office.leadOf(a) : null;
    const agent = lead ? lead.id : id;
    let r = null;
    try { r = await (await fetch('api/focus', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent }) })).json(); } catch { r = { ok: false, error: 'offline' }; }
    if (!r?.ok) this.note(T.terminalFail[r?.error] || T.terminalFail.window);
  }
  /** Кратко съобщение долу в средата. */
  note(text) {
    if (!this.noteEl) { this.noteEl = el('div', null, document.body); this.noteEl.id = 'note'; }
    this.noteEl.textContent = text; this.noteEl.hidden = false;
    clearTimeout(this.noteT); this.noteT = setTimeout(() => { this.noteEl.hidden = true; }, 3500);
  }

  // ------------------------------------------------------------------ ново име на сесия (от картата при фокус)
  startRename() {
    const a = this.office.actors.get(this.office.focusId);
    if (!a || a.agent.subagent) return;
    const box = this.card.querySelector('.ren');
    if (!box) return;
    this.renaming = true;
    box.innerHTML = '';
    const inp = el('input', null, box);
    inp.id = 'rename'; inp.maxLength = 32; inp.placeholder = a.agent.label; inp.title = T.renameHint;
    inp.value = prefs.name(a.id) || '';
    const done = (save) => {
      if (!this.renaming) return;
      this.renaming = false;
      if (save) prefs.setName(a.id, inp.value);
      this.card._html = '';
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(true); else if (e.key === 'Escape') { e.stopPropagation(); done(false); } });
    inp.addEventListener('blur', () => done(true));
    inp.focus();
  }

  // ------------------------------------------------------------------ помощ: цветовете + настройки
  toggleHelp(show) {
    if (!this.help) {
      this.help = el('div', null, document.body);
      this.help.id = 'help'; this.help.hidden = true;
      this.help.setAttribute('role', 'dialog');
      this.help.addEventListener('change', (e) => this.onHelpChange(e.target));
      this.help.addEventListener('click', (e) => {
        const t = e.target;
        if (t === this.help || t.closest('[data-close]')) this.toggleHelp(false); // клик извън панела или ✕
        else if (t.closest('[data-tab]')) { this.helpTab = t.closest('[data-tab]').dataset.tab; try { localStorage.setItem('po.helpTab', this.helpTab); } catch { /* */ } this.renderHelp(true); }
        else if (t.closest('[data-go]')) { this.toggleHelp(false); this.onTab?.(t.closest('[data-go]').dataset.go); }
        else if (t.closest('[data-act]')) this.bridge?.action?.(t.closest('[data-act]').dataset.act);
        else if (t.closest('[data-snap]')) this.onSnapshot?.();
        else if (t.closest('[data-clip]')) { this.toggleHelp(false); this.onClip?.(); }
      });
      if (!this.helpTab) { try { this.helpTab = localStorage.getItem('po.helpTab') || 'look'; } catch { this.helpTab = 'look'; } }
      // настройките на приложението се сменят и от трея – панелът ги показва актуални
      this.bridge?.onDesktop?.((d) => { this.desk = d; if (!this.help.hidden) this.renderHelp(); });
    }
    const open = show ?? this.help.hidden;
    if (open) {
      this.renderHelp();
      this.bridge?.getDesktop?.().then((d) => { this.desk = d; if (!this.help.hidden) this.renderHelp(); }).catch(() => {});
    }
    this.help.hidden = !open;
    // приложението: панелът иска място – прозорецът расте като за магазина и после се връща (ако магазинът не е отворен)
    if (open && !this.helpGrew && !document.body.classList.contains('shopping')) { this.helpGrew = true; this.bridge?.shop?.(true); }
    else if (!open && this.helpGrew) { this.helpGrew = false; this.bridge?.shop?.(false); }
  }

  /** Отметка/избор в панела -> съответната настройка (страницата, звукът, езикът или приложението). */
  onHelpChange(t) {
    const d = t.dataset || {};
    if (d.pref) prefs.set(d.pref, t.checked);
    else if (t.name === 'mode') prefs.set('focus', t.value === 'focus');
    else if (d.legend != null) { this.legend.hidden = !t.checked; try { localStorage.setItem('po.legend', t.checked ? '1' : '0'); } catch { /* */ } }
    else if (d.sound != null) { setSound(t.checked); this.lastHud = 0; }
    else if (t.name === 'lang') { if (PARAMS.desktop && this.bridge?.action) this.bridge.action('lang:' + t.value); else setLang(t.value); }
    else if (d.hook != null) this.setHook(t.checked);
    else if (d.upd != null) fetch('api/update', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: t.checked }) }).catch(() => {});
    else if (d.desk) { this.bridge?.setDesktop?.(d.desk, t.checked); if (d.desk === 'strip' && t.checked) this.toggleHelp(false); }
  }

  /** WS {type:'update'}: проверката за нова версия (точка на „?“, ред в панела, приложението – в трея). */
  setUpdate(e) {
    this.update = e; this.lastHud = 0; this._lastStats = '';
    if (this.help && !this.help.hidden) this.renderHelp(true);
  }

  /** Hook-ът за разрешения: сложен ли е (за отметката в панела). */
  async loadHook() {
    try { this.hook = await (await fetch('api/hook')).json(); } catch { this.hook = null; }
    if (this.help && !this.help.hidden) this.renderHelp(true);
  }
  async setHook(on) {
    let r = null;
    try { r = await (await fetch('api/hook', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ on }) })).json(); } catch { /* */ }
    this.hookErr = !r ? T.help.permErr.offline : r.ok ? '' : T.help.permErr[r.error] || r.error;
    if (r?.ok) this.hook = r;
    this.renderHelp(true);
  }

  /** Настройки и помощ: панел с раздели (settings.js), всяка опция с по едно изречение какво прави. */
  renderHelp(fresh = false) {
    if (!fresh && this.conn !== 'demo') this.loadHook();
    const scroll = this.help.querySelector('.body')?.scrollTop || 0;
    const { html, tab } = settingsHtml(this, this.helpTab);
    const same = tab === this.helpTab;
    this.helpTab = tab;
    this.help.innerHTML = html;
    if (same) { const b = this.help.querySelector('.body'); if (b) b.scrollTop = scroll; } // превключване на отметка – без скок нагоре
  }

  updateDebug(now) {
    const L = this.office.L;
    const lines = this.model.log.slice(-24).reverse().map(({ t, e }) => {
      const ago = ((now - t) / 1000).toFixed(1).padStart(5);
      return `${ago}s ${esc(e.agent.slice(0, 8))} ${esc(e.type)} ${esc(e.tool || '')} ${esc(shortDetail(e.detail || '', 28))}${e.parent ? ' ↑' + esc(e.parent.slice(0, 6)) : ''}`;
    });
    this.debugEl.innerHTML =
      `<b>FPS ${this.fps.value}</b> · scale ${L.scale} · ${L.W}×${L.H} · ${L.cols}×${L.rows} (cap ${L.cap}) · actors ${this.office.actors.size} · particles ${this.office.fx.list.length}` +
      `<pre>${lines.join('\n')}</pre>`;
  }
}
