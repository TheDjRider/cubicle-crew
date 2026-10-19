// Тънка лента (?strip, Electron: „Тънка лента вместо офиса“): вместо офиса – по един ред на сесия:
// форма/цвят на състоянието, име, какво прави, от колко време, колко под-агента. Червено = чака теб.
// Сцената не се рисува (по-малко процесор); моделът и офисът продължават да вървят отзад.
import { STATES, T, PROVIDERS } from './config.js';
import { shortDetail, fmtDuration, danger } from './util.js';
import { prefs } from './prefs.js';

const el = (tag, cls, parent) => { const e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e; };

export class Strip {
  /** list = само списък под офиса (изгледът за телефон в изправено положение) – офисът си остава. */
  constructor(model, ui, { list = false } = {}) {
    this.model = model; this.ui = ui; this.list = list;
    this.root = el('div', list ? 'list' : null, document.body);
    this.root.id = 'strip';
    if (!list) document.body.classList.add('strip');
    this.last = 0; this.key = ''; this.h = 0;
    // клик върху ред -> терминалът на тази сесия
    if (!list) this.root.addEventListener('click', (e) => { const id = e.target.closest('.row')?.dataset.id; if (id) this.ui.goTerminal(id); });
  }

  render(now) {
    if (now - this.last < 250) return;
    this.last = now;
    const leads = [...this.model.agents.values()].filter((a) => !a.subagent).sort((a, b) => a.firstSeen - b.firstSeen);
    const rows = leads.map((ag) => {
      const st = ag.state, tool = this.model.currentTool(ag);
      const what = tool ? `${tool.tool}${prefs.private ? '' : ' ' + shortDetail(tool.detail, 30)}` : T.states[st];
      const subs = this.model.liveChildren(ag);
      return { id: ag.id, st, risky: !!tool && danger(tool.tool, tool.detail), name: this.ui.displayName(ag) + (ag.provider ? ` · ${PROVIDERS[ag.provider] || ag.provider}` : ''), what, time: fmtDuration(now - ag.stateSince, T), subs };
    });
    const key = JSON.stringify(rows);
    if (key === this.key) return;
    this.key = key;
    this.root.textContent = '';
    if (!rows.length) el('div', 'none', this.root).textContent = T.waitingActivity;
    for (const r of rows) {
      const row = el('div', `row${r.st === 'waiting' ? ' wait' : ''}`, this.root);
      row.dataset.state = r.st; row.dataset.id = r.id; if (!this.list) row.title = T.terminalHint;
      const dot = el('i', null, row); dot.style.background = STATES[r.st].color;
      el('b', null, row).textContent = r.name;
      el('span', r.risky ? 'what danger' : 'what', row).textContent = (r.risky ? '⚠ ' : '') + r.what;
      el('span', 'time', row).textContent = r.time + (r.subs ? ` · ↳${r.subs}` : '');
    }
    // височината на лентата -> Electron нагласява прозореца
    const h = Math.ceil(this.root.getBoundingClientRect().height);
    if (h !== this.h && !this.list) { this.h = h; window.pixelOffice?.stripSize?.(h); }
  }
}
