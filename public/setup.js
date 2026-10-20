// Начална настройка (първо пускане, save.setup === null): „Офис“ или „Фокус“, с какъв любимец започва офисът
// и как се казва, после градът – за часовника и времето навън. DOM над сцената (остър текст, кирилица).
// Записва се през портфейла (POST /api/setup или демо портфейла) и времето (POST /api/weather).
// ?setup я показва отново (за тестове; на истинския сървър вече минала настройка не се променя).
import { T, LANG, PARAMS, petName } from './config.js';
import { ITEM, SLOTS, PET_NAME_MAX } from './catalog.js';
import { cityDate } from './weather.js';
import { petThumb } from './shop.js';
import { prefs } from './prefs.js';
import { makeCanvas } from './util.js';

const el = (tag, cls, parent, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; };
const place = (c) => [c.name, c.admin1 && c.admin1 !== c.name ? c.admin1 : '', c.country].filter(Boolean).join(', ');
const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
// безплатният любимец от всеки вид (сива котка / бигъл)
const FIRST = { cat: ITEM[SLOTS.cat.def], dog: ITEM[ITEM[SLOTS.dog.need].gives] };

export class Setup {
  constructor(tokens) {
    this.tokens = tokens;
    this.root = null;
    this.forced = PARAMS.setup; // ?setup: веднъж на зареждане
    this.pet = 'cat'; this.name = ''; this.city = null; this.query = ''; this.mode = prefs.focus ? 'focus' : 'office';
  }

  /** Трябва ли да се покаже (истинският портфейл казва setup: null; стар сървър -> undefined -> не). */
  need() { return !PARAMS.lan && (this.forced || this.tokens.save.setup === null); } // телефонът само гледа
  get open() { return !!this.root; }

  maybeOpen() { if (!this.open && this.tokens.tokens != null && this.need()) this.show(); }

  show() {
    this.forced = false;
    this.root = el('div', null, document.body);
    this.root.id = 'setup';
    this.panel = el('div', 'setup-panel', this.root);
    this.panel.setAttribute('role', 'dialog');
    document.body.classList.add('setting-up');
    window.pixelOffice?.shop?.(true); // Electron: като за магазина (фокус, без click-through)
    // приложението: колко място да заема – на малък единствен екран лентата е избрана предварително
    window.pixelOffice?.getDesktop?.().then((d) => {
      this.desk = d; this.size = d.strip || d.screen?.small ? 'strip' : 'office'; this.autoHide = !!d.autoHide;
      if (this.at === -1 && this.root) this.step(-1);
    }).catch(() => {});
    this.step(-1);
  }

  close() {
    if (!this.root) return;
    this.tokens.setPreview(null);
    this.root.remove(); this.root = null;
    document.body.classList.remove('setting-up');
    window.pixelOffice?.shop?.(false);
    this.onClose?.();
  }

  /** Избраният любимец се вижда веднага в офиса отзад. */
  preview() {
    const eq = this.tokens.save.equipped || {};
    this.tokens.setPreview(this.pet === 'dog' ? { ...eq, cat: null, dog: FIRST.dog.id } : null);
  }

  step(i) {
    this.at = i;
    const S = T.setup, p = this.panel;
    p.innerHTML = '';
    if (i === -1) {
      // „Офис“ (цялата игра) или „Фокус“ (тихо табло) – сменя се после от „?“
      el('h2', null, p, S.hello);
      el('p', 'dim', p, S.intro);
      el('h3', null, p, S.modeQ);
      const row = el('div', 'modes', p);
      for (const m of ['office', 'focus']) {
        const b = el('button', m === this.mode ? 'on' : '', row);
        b.type = 'button';
        el('b', null, b, T.help[m]);
        el('span', null, b, T.help[m + 'Hint']);
        b.onclick = () => { this.mode = m; prefs.set('focus', m === 'focus'); this.step(-1); };
      }
      el('p', 'hint', p, S.modeHint);
      const D = this.desk;
      if (D) {
        el('h3', null, p, S.sizeQ);
        const sz = el('div', 'modes', p);
        for (const [m, title, hint] of [['office', S.sizeOffice, S.sizeOfficeHint(D.screen?.office ?? 20)], ['strip', S.sizeStrip, S.sizeStripHint(D.screen?.strip ?? 2)]]) {
          const b = el('button', m === this.size ? 'on' : '', sz);
          b.type = 'button';
          el('b', null, b, title);
          el('span', null, b, hint);
          b.onclick = () => { this.size = m; this.step(-1); };
        }
        const lab = el('label', 'check', p);
        const cb = el('input', null, lab); cb.type = 'checkbox'; cb.checked = this.autoHide; cb.onchange = () => { this.autoHide = cb.checked; };
        const tx = el('span', null, lab); el('b', null, tx, S.autoHide); el('small', null, tx, S.autoHideHint);
        if (D.screen?.small) el('p', 'hint', p, S.small);
      }
      this.nav(S.skip, () => this.finish(true), S.next, () => this.step(0));
    } else if (i === 0) {
      el('h3', null, p, S.petQ);
      const row = el('div', 'pick', p);
      for (const kind of ['cat', 'dog']) {
        const b = el('button', kind === this.pet ? 'on' : '', row);
        b.type = 'button';
        const src = petThumb(FIRST[kind]);
        const k = Math.max(2, Math.floor(72 / src.height));
        const c = makeCanvas(src.width, src.height); c.getContext('2d').drawImage(src, 0, 0);
        c.style.width = `${src.width * k}px`; c.style.height = `${src.height * k}px`;
        b.appendChild(c);
        el('span', null, b, S[kind]);
        b.onclick = () => { this.pet = kind; this.step(0); };
      }
      const lab = el('label', 'nm', p);
      el('span', null, lab, S.nameQ);
      const inp = el('input', null, lab);
      inp.maxLength = PET_NAME_MAX; inp.placeholder = petName(this.pet, null, this.pet === 'dog' ? ITEM['dog.extra'].gives : null); inp.value = this.name;
      inp.oninput = () => { this.name = inp.value; };
      inp.onkeydown = (e) => { if (e.key === 'Enter') this.step(1); };
      el('p', 'hint', p, S.petHint);
      this.nav(S.back, () => this.step(-1), S.next, () => this.step(1));
      this.preview();
    } else {
      el('h3', null, p, S.cityQ);
      el('p', 'hint', p, S.cityHint);
      if (PARAMS.demo) el('p', 'hint', p, T.weather.demo);
      else {
        const form = el('form', 'find', p);
        const inp = el('input', null, form); inp.placeholder = T.weather.placeholder; inp.maxLength = 60; inp.value = this.query;
        el('button', null, form, T.weather.search).type = 'submit';
        const list = el('div', 'list', p);
        const chosen = el('p', 'chosen', p);
        const showChosen = () => {
          chosen.textContent = '';
          if (!this.city) return;
          el('span', 'dim', chosen, S.chosen + ' ');
          el('b', null, chosen, place(this.city));
          chosen.appendChild(document.createTextNode(` · ${hhmm(cityDate(new Date(), this.city.tz))}`));
        };
        showChosen();
        form.onsubmit = async (e) => {
          e.preventDefault();
          const q = inp.value.trim(); this.query = q;
          if (q.length < 2) return;
          list.textContent = T.weather.searching;
          let r = null;
          try { r = await (await fetch(`api/weather/search?q=${encodeURIComponent(q)}&lang=${LANG}`)).json(); } catch { /* */ }
          list.textContent = '';
          if (!r || !r.ok) { list.textContent = T.weather.offline; return; }
          if (!r.list.length) { list.textContent = T.weather.nothing; return; }
          for (const c of r.list) {
            const b = el('button', null, list, place(c)); // текстът от интернет – само textContent
            b.type = 'button';
            b.onclick = () => { this.city = c; for (const x of list.children) x.classList.toggle('on', x === b); showChosen(); };
          }
        };
        setTimeout(() => inp.focus(), 0);
      }
      el('p', 'hint', p, S.later);
      this.nav(S.back, () => this.step(0), S.done, () => this.finish(false));
    }
  }

  nav(leftText, left, rightText, right) {
    const n = el('div', 'nav', this.panel);
    const a = el('button', null, n, leftText); a.type = 'button'; a.onclick = left;
    el('span', 'dim', n, `${this.at + 2} / 3`);
    const b = el('button', 'go', n, rightText); b.type = 'button'; b.onclick = right;
    this.err = el('p', 'err', this.panel);
  }

  /** Записва избора (skip = с котка, без град) и затваря. */
  async finish(skip) {
    for (const b of this.panel.querySelectorAll('button')) b.disabled = true;
    const be = this.tokens.backend;
    const r = be.setup ? await be.setup(skip ? {} : { pet: this.pet, name: this.name }) : { ok: true };
    if (r && !r.ok) {
      this.err.textContent = T.shop.errors[r.error] || r.error;
      for (const b of this.panel.querySelectorAll('button')) b.disabled = false;
      return;
    }
    // сървърът отговаря след първото време от интернета (до 10 s) – не чакаме, новото време идва и по WS
    if (!skip && this.city && !PARAMS.demo) {
      fetch('api/weather', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ city: this.city }) })
        .then((res) => res.json()).then((j) => { if (j.ok) this.onWeather?.(j); })
        .catch(() => { /* градът може да се избере и после от магазина */ });
    }
    this.close();
    // приложението: размерът (лентата презарежда страницата – затова последна)
    const bridge = window.pixelOffice;
    if (this.desk && bridge?.setDesktop) {
      if (this.autoHide !== !!this.desk.autoHide) bridge.setDesktop('autoHide', this.autoHide);
      if ((this.size === 'strip') !== !!this.desk.strip) bridge.setDesktop('strip', this.size === 'strip');
    }
  }
}
