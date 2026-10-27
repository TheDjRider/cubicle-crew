// Два прозорчета около версиите (данните идват от WS {type:'update'}: current, newer, latest):
// „Какво ново“ – веднъж след обновяване (T.whatsNew.items[версия]), и „Има нова версия“ – веднъж на версия,
// с бутон за изтегляне (в инсталираното приложение за Windows – направо „Изтегли и инсталирай“).
import { T, PARAMS } from './config.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* няма достъп */ } };
// стар потребител (преди 2.18 нямаше po.ver): има поне една от тези настройки
const OLD_KEYS = ['po.prefs', 'po.news', 'po.helpTab', 'po.legend', 'po.sound'];
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); return 0; };

export class WhatsNew {
  constructor(ui) {
    this.ui = ui;
    this.root = null;
    this.queue = [];
    // демо, лента, телефон, OBS, сутрешният екран – там не се показват
    this.off = !!(PARAMS.demo || PARAMS.web || PARAMS.strip || PARAMS.lan || PARAMS.overlay || PARAMS.wait);
    this.blocked = () => document.body.classList.contains('setting-up'); // докато е отворена началната настройка
  }

  /** WS {type:'update'}. */
  onUpdate(e) {
    if (this.off || !e?.current) return;
    if (this.ui.bridge?.getDesktop && !this.ui.desk) this.ui.bridge.getDesktop().then((d) => { this.ui.desk ||= d; }).catch(() => {}); // selfUpdate
    if (!this.checked) {
      this.checked = true;
      const prev = get('po.ver');
      set('po.ver', e.current);
      const was = prev || (OLD_KEYS.some((k) => get(k) != null) ? '0.0.0' : null);
      if (was && cmp(e.current, was) > 0) {
        const items = Object.entries(T.whatsNew.items).filter(([v]) => cmp(v, was) > 0 && cmp(v, e.current) <= 0).sort((a, b) => cmp(b[0], a[0]));
        if (items.length) this.push({ kind: 'news', version: e.current, items: items[0][1] });
      }
    }
    const v = e.newer && e.latest?.version;
    if (v && get('po.updSeen') !== v && !this.queue.some((q) => q.kind === 'update') && this.root?.dataset.kind !== 'update') {
      this.push({ kind: 'update', version: v, url: e.latest.url, current: e.current });
    }
  }

  push(item) { this.queue.push(item); this.next(); }

  next() {
    if (this.root || !this.queue.length) return;
    if (this.blocked()) { setTimeout(() => this.next(), 2000); return; }
    // приложението: дали може „Изтегли и инсталирай“ се знае след getDesktop() – чакаме го малко
    if (this.queue[0].kind === 'update' && this.ui.bridge?.getDesktop && !this.ui.desk && !this.waited) { this.waited = true; setTimeout(() => this.next(), 800); return; }
    const it = this.queue.shift(), W = T.whatsNew;
    const root = this.root = document.createElement('div');
    root.id = 'news'; root.dataset.kind = it.kind;
    root.setAttribute('role', 'dialog');
    let body;
    if (it.kind === 'news') {
      body = `<h2>${esc(W.title(it.version))}</h2><ul>${it.items.map(([b, s]) => `<li><b>${esc(b)}</b><span>${esc(s)}</span></li>`).join('')}</ul>` +
        `<div class="btns"><button type="button" class="go" data-ok>${esc(W.ok)}</button></div>`;
    } else {
      const self = !!this.ui.desk?.selfUpdate;
      body = `<h2>${esc(W.updTitle(it.version))}</h2><p>${esc(W.updText(it.current))}</p>` +
        `<p class="dim">${esc(self ? W.updSelf : W.updManual)}</p>` +
        `<div class="btns">${self ? `<button type="button" class="go" data-install>${esc(W.install)}</button>`
          : `<a class="go" href="${esc(it.url)}" target="_blank" rel="noopener" data-dl>${esc(W.download)}</a>`}` +
        `<a href="https://github.com/rezored/cubicle-crew/releases/tag/v${esc(it.version)}" target="_blank" rel="noopener" data-notes>${esc(W.notes)}</a>` +
        `<button type="button" data-ok>${esc(W.later)}</button></div>`;
    }
    root.innerHTML = `<div class="news-panel"><small>${esc(it.kind === 'news' ? W.label : W.updLabel)}</small>${body}</div>`;
    root.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest('[data-install]')) { this.ui.bridge?.action?.('update-install'); this.close(it); this.ui.helpTab = 'privacy'; this.ui.toggleHelp(true); }
      else if (t.closest('[data-dl]')) this.close(it);
      else if (t.closest('[data-ok]') || t === root) this.close(it);
    });
    document.body.appendChild(root);
    this.ui.bridge?.shop?.(true); // приложението: фокус и без click-through, докато е отворено
  }

  close(it) {
    if (it.kind === 'update') set('po.updSeen', it.version);
    this.root?.remove(); this.root = null;
    this.ui.bridge?.shop?.(false);
    setTimeout(() => this.next(), 400);
  }

  get open() { return !!this.root; }
}
