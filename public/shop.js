// Магазин: DOM панел (острия текст, кирилица) с раздели; посочен предмет се вижда веднага в офиса (преглед),
// покупките минават през сървъра (или демо портфейла) – правилата са в catalog.js.
import { T, itemName, LANG, PARAMS, petName } from './config.js';
import { prefs } from './prefs.js';
import { wxFrom } from './weather.js';
import { ITEMS, ITEM, TABS, SLOTS, GROUP_SLOTS, ACHIEVEMENTS, owns, avatarOf, unlocked, resolveDecor, PET_SLOTS, petCount, MAX_PETS, PET_NAME_MAX } from './catalog.js';
import { CharacterSprites, avatarLook, AVATAR_TOPS, AVATAR_BOTTOMS, DRESS_TOPS } from './sprites.js';
import { SKINS, HAIRS } from './palette.js';
import { thumb } from './environment.js';
import { Cat, Dog } from './characters.js';
import { coinUrl } from './tokens.js';
import { makeCanvas } from './util.js';

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const fmt = (n) => Number(n).toLocaleString(LANG === 'bg' ? 'bg-BG' : 'en-US');

/** Любимец на парче под (иначе тъмните котки/кучета не се виждат на тъмната карта); кучето седи, за да личи породата. */
export function petThumb(it, mode = 'sit') {
  const dog = it.group === 'dog', w = dog ? 22 : 18, h = dog ? 18 : 14;
  const c = makeCanvas(w, h), g = c.getContext('2d');
  g.fillStyle = '#7e5538'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#6f4a30'; for (let y = 6; y < h; y += 6) g.fillRect(0, y, w, 1);
  const p = dog ? new Dog(it) : new Cat(it);
  p.x = dog ? 10 : 9; p.y = h - 1; p.mode = mode;
  p.draw(g, 0);
  return c;
}
/** Купичка 9x9 – златна, ако е отключено. */
function trophy(on) {
  const c = makeCanvas(9, 9), g = c.getContext('2d');
  const [a, b, d] = on ? ['#f0c840', '#fff4b0', '#a87a1a'] : ['#6b6b80', '#8a8aa0', '#4a4a5a'];
  const px = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
  px(1, 0, 7, 1, d); px(1, 1, 7, 3, a); px(2, 1, 2, 2, b); px(0, 1, 1, 2, d); px(8, 1, 1, 2, d);
  px(2, 4, 5, 1, a); px(3, 5, 3, 1, d); px(4, 5, 1, 2, a); px(2, 7, 5, 2, d); px(3, 7, 3, 1, a);
  return c;
}

export class Shop {
  constructor(tokens, ui) {
    this.tokens = tokens; this.ui = ui;
    this.root = document.getElementById('shop');
    this.tab = 'walls';
    try { this.tab = localStorage.getItem('po.shopTab') || 'walls'; } catch { /* */ }
    if (!TABS.some((t) => t.id === this.tab)) this.tab = 'walls';
    this.thumbs = new Map();
    this.key = '';
    this.build();
    tokens.onChange(() => { if (!this.root.hidden) this.render(); });
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const typing = e.target?.closest?.('input, textarea'); // името на любимеца / търсенето на град
      if (!typing && 'bBбБ'.includes(e.key) && this.tokens.tokens != null && !prefs.focus) { this.toggle(); e.preventDefault(); }
      else if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
    window.pixelOffice?.onOpenShop?.(() => this.open());
    window.pixelOffice?.onOpenWeather?.(() => this.open('weather'));
    this.weather = null; // последното {type:'weather'} от сървъра
  }

  /** Ново време от сървъра (WS или след POST). */
  setWeather(m) { this.weather = m; if (!this.root.hidden && this.tab === 'weather') { this.key = ''; this.render(); } }

  build() {
    const r = this.root;
    r.innerHTML = '';
    const panel = el('div', 'shop-panel', r);
    const head = el('header', null, panel);
    el('b', 'ttl', head, T.shop.title);
    this.bal = el('span', 'bal', head);
    const x = el('button', 'x', head, '✕'); x.title = 'Esc';
    x.onclick = () => this.close();
    this.nav = el('nav', null, panel);
    for (const t of TABS) {
      const b = el('button', null, this.nav, T.shop.tabs[t.id]);
      b.dataset.tab = t.id;
      b.onclick = () => { this.tab = t.id; try { localStorage.setItem('po.shopTab', t.id); } catch { /* */ } this.key = ''; this.render(); this.body.scrollTop = 0; };
    }
    this.body = el('div', 'body', panel);
    this.foot = el('footer', null, panel, T.shop.hint);
    this.body.addEventListener('mouseover', (e) => this.hover(e.target.closest('.card')));
    this.body.addEventListener('mouseleave', () => this.hover(null));
    this.body.addEventListener('click', (e) => this.click(e.target.closest('button')));
  }

  open(tab) {
    if (document.body.classList.contains('setting-up')) return; // първо началната настройка
    if (prefs.focus && tab !== 'weather') return; // „Фокус“: без магазин (времето остава)
    if (tab) this.tab = tab;
    if (this.tokens.tokens == null) return;
    const was = this.root.hidden;
    this.root.hidden = false; this.key = ''; this.render();
    document.body.classList.add('shopping');
    window.pixelOffice?.shop?.(true);
    if (was) this.onToggle?.();
  }
  close() {
    if (this.root.hidden) return;
    this.root.hidden = true;
    this.tokens.setPreview(null);
    document.body.classList.remove('shopping');
    window.pixelOffice?.shop?.(false);
    this.onToggle?.();
  }
  toggle() { if (this.root.hidden) this.open(); else this.close(); }

  // ------------------------------------------------------------------ рисуване
  render() {
    const t = this.tokens, s = t.save;
    this.bal.innerHTML = `<i style="background-image:url(${this.coin ||= coinUrl()})"></i>${fmt(t.tokens ?? 0)}`;
    for (const b of this.nav.children) { b.classList.toggle('on', b.dataset.tab === this.tab); b.hidden = prefs.focus && b.dataset.tab !== 'weather'; }
    const tab = TABS.find((x) => x.id === this.tab);
    // пълно прерисуване само ако нещо видимо се е променило (иначе посочването "мига")
    const afford = ITEMS.filter((it) => tab.groups.includes(it.group) && !owns(s, it.id) && it.price <= t.tokens).map((it) => it.id).join();
    const key = [this.tab, JSON.stringify(s.owned), JSON.stringify(s.equipped), JSON.stringify(s.achievements), afford,
      tab.id === 'trophies' ? JSON.stringify(s.stats) + s.lifetime : '', JSON.stringify(s.avatar), tab.id === 'weather' ? JSON.stringify(this.weather) : '', JSON.stringify(s.petNames)].join('|');
    if (key === this.key) return;
    this.key = key;
    const scroll = this.body.scrollTop;
    // полето, в което се пише в момента (име на любимец), оцелява при прерисуване
    const typing = this.body.contains(document.activeElement) && document.activeElement.tagName === 'INPUT' && document.activeElement.name
      ? { name: document.activeElement.name, value: document.activeElement.value, at: document.activeElement.selectionStart } : null;
    this.body.innerHTML = '';
    if (tab.id === 'trophies') this.renderTrophies();
    else if (tab.id === 'avatar') this.renderAvatar();
    else if (tab.id === 'weather') this.renderWeather();
    else if (tab.id === 'pets') this.renderPets();
    else if (tab.merge) this.renderGroup(tab.groups, T.shop.tabs[tab.id]); // по един предмет на група – обща решетка
    else for (const g of tab.groups) this.renderGroup([g], T.shop.groups[g]);
    this.body.scrollTop = scroll;
    if (typing) {
      const inp = this.body.querySelector(`input[name="${typing.name}"]`);
      if (inp) { inp.value = typing.value; inp.focus(); try { inp.setSelectionRange(typing.at, typing.at); } catch { /* */ } }
    }
    // клик върху любимец в офиса -> неговият ред
    if (this.focusPet && tab.id === 'pets') { this.body.querySelector(`section[data-pet="${this.focusPet}"]`)?.scrollIntoView({ block: 'start' }); this.focusPet = null; }
  }

  /** Отваря „Любимци“ на реда на дадения любимец (клик върху него в офиса). */
  openPet(slot) { this.focusPet = slot; this.open('pets'); }

  renderGroup(groups, title) {
    const s = this.tokens.save, eq = s.equipped || {};
    const sec = el('section', null, this.body);
    el('h3', null, sec, title);
    const grid = el('div', 'grid', sec);
    for (const it of ITEMS.filter((x) => groups.includes(x.group))) {
      const slots = GROUP_SLOTS[it.group];
      const have = owns(s, it.id);
      const where = slots.filter((sl) => (eq[sl] || SLOTS[sl].def) === it.id);
      const card = el('div', `card${have ? ' owned' : ''}${where.length ? ' on' : ''}`, grid);
      card.dataset.id = it.id;
      card.appendChild(this.thumb(it));
      el('div', 'nm', card, itemName(it));
      const price = it.price === 0 ? T.shop.free : have ? T.shop.owned : `<i style="background-image:url(${this.coin})"></i>${fmt(it.price)}`;
      el('div', 'pr', card, price);
      const act = el('div', 'act', card);
      if (!have) {
        const short = it.price - (this.tokens.tokens ?? 0);
        const b = el('button', 'buy', act, short > 0 ? T.shop.need(fmt(short)) : T.shop.buy);
        b.dataset.buy = it.id; b.disabled = short > 0;
      } else if (slots.length > 1) {
        for (const sl of slots) {
          const b = el('button', where.includes(sl) ? 'on' : '', act, T.shop.slots[sl]);
          b.dataset.equip = it.id; b.dataset.slot = sl;
        }
      } else if (SLOTS[slots[0]].def == null) {
        const b = el('button', where.length ? 'on' : '', act, where.length ? T.shop.remove : T.shop.equip);
        b.dataset.slot = slots[0];
        if (where.length) b.dataset.remove = '1'; else b.dataset.equip = it.id;
      } else {
        const b = el('button', where.length ? 'on' : '', act, where.length ? T.shop.equipped : T.shop.equip);
        b.dataset.equip = it.id; b.dataset.slot = slots[0]; b.disabled = !!where.length;
      }
    }
  }

  renderTrophies() {
    const s = this.tokens.save, st = s.stats || {};
    const view = { lifetimeTokens: s.lifetime || 0, tasksDone: st.tasksDone || 0, lifetimeActiveSec: st.lifetimeActiveSec || 0, daysActive: st.daysActive || 0, owned: s.owned || [] };
    const sec = el('section', 'trophies', this.body);
    for (const a of ACHIEVEMENTS) {
      const got = s.achievements?.[a.id];
      const v = a.value(view);
      const row = el('div', `trophy${got ? ' got' : ''}`, sec);
      const ic = trophy(!!got); ic.className = 'ic'; row.appendChild(ic);
      const [name, desc] = T.achievements[a.id] || [a.id, ''];
      el('div', 'tx', row, `<b>${name}</b><span>${desc}</span>`);
      el('div', 'pg', row, got ? `${T.shop.unlocked}<em>${T.shop.reward(a.reward)}</em>` :
        `<span class="bar"><i style="width:${Math.round((v / a.goal) * 100)}%"></i></span>${T.shop.progress(fmt(v), fmt(a.goal))}<em>${T.shop.reward(a.reward)}</em>`);
    }
  }

  /** Аватарът: голям преглед + тяло, прическа, кожа, коса, очила. Всеки избор се записва веднага (безплатно). */
  renderAvatar() {
    const av = { body: 0, style: 0, top: 0, bottom: 0, ...avatarOf(this.tokens.save) }, A = T.shop.avatar;
    const gk = av.body === 1 ? 'f' : 'm', dress = AVATAR_BOTTOMS[gk][av.bottom] === 'dress';
    const sec = el('section', 'avatar', this.body);
    const pv = el('div', 'pv', sec);
    for (const pose of ['stand', 'couchSit']) {
      const f = new CharacterSprites(avatarLook(av, 'avatar')).frame(pose, null, '#4ac26b');
      const c = makeCanvas(24, 34), g = c.getContext('2d');
      g.fillStyle = '#7e5538'; g.fillRect(0, 0, 24, 34);
      g.fillStyle = '#6f4a30'; for (const y of [10, 21, 32]) g.fillRect(0, y, 24, 1);
      g.drawImage(f.body, 0, 1); g.drawImage(f.front, 0, 1);
      c.className = 'th'; c.style.width = '96px'; c.style.height = '136px';
      pv.appendChild(c);
    }
    const opts = el('div', 'opts', sec);
    const row = (title, items) => {
      el('h3', null, opts, title);
      const r = el('div', 'sw', opts);
      for (const [label, patch, color, on] of items) {
        const b = el('button', on ? 'on' : '', r, color ? '' : label);
        b.title = label; b.dataset.av = JSON.stringify({ ...av, ...patch });
        if (color) { b.classList.add('dot'); b.style.background = color; }
      }
    };
    row(A.body, [[A.male, { body: 0 }, null, av.body !== 1], [A.female, { body: 1 }, null, av.body === 1]]);
    row(A.style, A.styles[gk].map((s, i) => [s, { style: i }, null, av.style === i]));
    // горнище; с рокля се показват само съвместимите (avatarLook пак пази)
    const tops = A.tops[gk].map((s, i) => [s, { top: i }, null, av.top === i]).filter((_, i) => !dress || DRESS_TOPS.has(AVATAR_TOPS[gk][i]));
    row(A.top, tops);
    if (gk === 'f') row(A.bottom, A.bottoms.map((s, i) => {
      // към рокля с несъвместимо горнище -> блуза
      const patch = AVATAR_BOTTOMS.f[i] === 'dress' && !DRESS_TOPS.has(AVATAR_TOPS.f[av.top] || 'blouse') ? { bottom: i, top: 0 } : { bottom: i };
      return [s, patch, null, av.bottom === i];
    }));
    row(A.skin, SKINS.map((s, i) => [A.skins[i] || '', { skin: i }, s[1], av.skin === i]));
    row(A.hair, HAIRS.map((h, i) => [A.hairs[i] || '', { hair: i }, h[1], av.hair === i]));
    row(A.glasses, [[A.without, { glasses: false }, null, !av.glasses], [A.with, { glasses: true }, null, !!av.glasses]]);
    el('p', 'hint', opts, A.hint);
  }

  /** Любимци: по един ред за всеки (3 котки + куче) – име, шарка/порода, прибиране у дома. Следващата котка се
   *  показва, щом предишната е отключена; кучето – винаги. В офиса са най-много MAX_PETS. */
  renderPets() {
    const s = this.tokens.save, eq = s.equipped || {}, P = T.shop.pets, decor = resolveDecor(eq);
    const full = petCount(s) >= MAX_PETS;
    const card = (grid, it, slot, on) => {
      const c = el('div', `card${owns(s, it.id) ? ' owned' : ''}${on ? ' on' : ''}`, grid);
      c.dataset.id = it.id; c.dataset.slot = slot;
      c.appendChild(this.thumb(it));
      el('div', 'nm', c, itemName(it));
      return c;
    };
    const catSlots = PET_SLOTS.filter((sl) => SLOTS[sl].pet === 'cat');
    // първо безплатният вид (започналите с куче виждат кучето най-горе)
    const order = (s.starter === 'dog') ? [...PET_SLOTS].sort((a, b) => (SLOTS[b].pet === 'dog') - (SLOTS[a].pet === 'dog')) : PET_SLOTS;
    for (const slot of order) {
      const S = SLOTS[slot];
      if (!unlocked(s, slot) && S.after && !unlocked(s, S.after)) continue;
      const sec = el('section', 'pet', this.body);
      sec.dataset.pet = slot;
      const title = S.pet === 'dog' ? P.dog : P.cats[catSlots.indexOf(slot)];
      const h = el('h3', null, sec);
      if (!unlocked(s, slot)) {
        h.textContent = title;
        const grid = el('div', 'grid', sec);
        const it = ITEM[S.need];
        const c = card(grid, it, slot, false);
        el('div', 'pr', c, `<i style="background-image:url(${this.coin})"></i>${fmt(it.price)}`);
        const short = it.price - (this.tokens.tokens ?? 0);
        const b = el('button', 'buy', el('div', 'act', c), full ? P.full : short > 0 ? T.shop.need(fmt(short)) : T.shop.buy);
        b.dataset.buy = it.id; b.disabled = short > 0 || full;
        el('p', 'hint', sec, (S.pet === 'dog' ? P.unlockDog : P.unlock)(itemName(ITEM[it.gives])));
        continue;
      }
      const cur = decor[slot]?.id || null;
      h.textContent = `${title} · ${petName(slot, s.petNames)}${cur ? '' : ` (${P.home})`}`;
      // име
      const form = el('form', 'pname', sec);
      const inp = el('input', null, form);
      inp.name = `pet-${slot}`; inp.maxLength = PET_NAME_MAX; inp.placeholder = petName(slot, null); inp.value = s.petNames?.[slot] || '';
      inp.setAttribute('aria-label', P.name);
      el('button', null, form, P.rename).type = 'submit';
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!this.tokens.backend.pet) return;
        const r = await this.tokens.backend.pet(slot, inp.value);
        if (r && !r.ok) this.flash(T.shop.errors[r.error] || r.error);
      };
      const grid = el('div', 'grid', sec);
      for (const it of ITEMS.filter((x) => x.group === S.group)) {
        const c = card(grid, it, slot, cur === it.id);
        const have = owns(s, it.id);
        el('div', 'pr', c, it.price === 0 ? T.shop.free : have ? T.shop.owned : `<i style="background-image:url(${this.coin})"></i>${fmt(it.price)}`);
        const act = el('div', 'act', c);
        if (!have) {
          const short = it.price - (this.tokens.tokens ?? 0);
          const b = el('button', 'buy', act, short > 0 ? T.shop.need(fmt(short)) : T.shop.buy);
          b.dataset.buy = it.id; b.dataset.slot = slot; b.disabled = short > 0;
        } else {
          const b = el('button', cur === it.id ? 'on' : '', act, cur === it.id ? T.shop.equipped : T.shop.equip);
          b.dataset.equip = it.id; b.dataset.slot = slot; b.disabled = cur === it.id || (!cur && full);
        }
      }
      // у дома / обратно в офиса (връща се с безплатната шарка/порода)
      const b = el('button', null, el('div', 'act', sec), cur ? P.away : P.back);
      b.dataset.slot = slot;
      if (cur) b.dataset.remove = '1';
      else { b.dataset.equip = S.def || ITEM[S.need].gives; b.disabled = full; }
    }
    el('p', 'hint', el('section', null, this.body), P.limit);
  }

  /** Времето навън: избран град + търсене; текстът от интернет се слага само като textContent. */
  renderWeather() {
    const W = T.weather, m = this.weather;
    const sec = el('section', 'weather', this.body);
    if (PARAMS.demo) { el('p', 'hint', sec).textContent = W.demo; return; }
    el('h3', null, sec, W.city);
    const cur = el('p', 'cur', sec);
    if (m?.city) {
      const c = m.city, wx = wxFrom(m.now);
      el('b', null, cur).textContent = [c.name, c.admin1 && c.admin1 !== c.name ? c.admin1 : '', c.country].filter(Boolean).join(', ');
      const st = !m.enabled ? W.off : wx ? [W.kinds[wx.kind], wx.temp != null ? `${Math.round(wx.temp)}°` : '', wx.pop != null ? W.pop(Math.round(wx.pop)) : ''].filter(Boolean).join(' · ') : W.loading;
      cur.appendChild(document.createTextNode(' · ' + st));
    } else cur.textContent = W.none;
    const form = el('form', 'find', sec);
    const inp = el('input', null, form); inp.placeholder = W.placeholder; inp.maxLength = 60; inp.value = this.wxQuery || '';
    el('button', null, form, W.search).type = 'submit';
    const list = el('div', 'sw', sec);
    form.onsubmit = async (e) => {
      e.preventDefault();
      const q = inp.value.trim(); this.wxQuery = q;
      if (q.length < 2) return;
      list.textContent = W.searching;
      let r = null;
      try { r = await (await fetch(`api/weather/search?q=${encodeURIComponent(q)}&lang=${LANG}`)).json(); } catch { /* */ }
      list.textContent = '';
      if (!r || !r.ok) { list.textContent = W.offline; return; }
      if (!r.list.length) { list.textContent = W.nothing; return; }
      for (const c of r.list) {
        const b = el('button', null, list);
        b.textContent = [c.name, c.admin1 && c.admin1 !== c.name ? c.admin1 : '', c.country].filter(Boolean).join(', ');
        b.dataset.wx = JSON.stringify({ city: c });
      }
    };
    if (m?.city) {
      const act = el('div', 'sw', sec);
      el('button', null, act, m.enabled ? W.disable : W.enable).dataset.wx = JSON.stringify({ enabled: !m.enabled });
      el('button', null, act, W.remove).dataset.wx = JSON.stringify({ city: null });
    }
    el('p', 'hint', sec).textContent = W.hint;
  }

  thumb(it) {
    let src = this.thumbs.get(it.id);
    if (!src) { src = it.group === 'cat' || it.group === 'dog' ? petThumb(it) : it.group === 'catslot' ? petThumb(ITEM[it.gives]) : thumb(it); this.thumbs.set(it.id, src); }
    // цяло число пъти увеличение (пиксел арт), около 84x66
    const k = Math.max(1, Math.min(4, Math.round(Math.min(84 / src.width, 66 / src.height))));
    const c = makeCanvas(src.width, src.height);
    c.getContext('2d').drawImage(src, 0, 0);
    c.className = 'th';
    c.style.width = `${src.width * k}px`; c.style.height = `${src.height * k}px`;
    return c;
  }

  // ------------------------------------------------------------------ действия
  hover(card) {
    const id = card?.dataset.id;
    if (id === this.hoverId) return;
    this.hoverId = id;
    if (!id) { this.tokens.setPreview(null); return; }
    const it = ITEMS.find((x) => x.id === id), eq = this.tokens.save.equipped || {};
    if (it.slot) { this.tokens.setPreview({ ...eq, [it.slot]: it.gives }); return; } // отключване на котка
    const slot = card.dataset.slot; // котка 1/2/3
    if (slot) { this.tokens.setPreview(eq[slot] === id || (!eq[slot] && SLOTS[slot].def === id) ? null : { ...eq, [slot]: id }); return; }
    const slots = GROUP_SLOTS[it.group];
    if (slots.some((sl) => (eq[sl] || SLOTS[sl].def) === id)) { this.tokens.setPreview(null); return; } // вече е сложено
    this.tokens.setPreview({ ...eq, [slots[0]]: id });
  }

  async click(b) {
    if (!b || b.disabled) return;
    const be = this.tokens.backend;
    let r = null;
    if (b.dataset.wx) {
      b.disabled = true;
      try {
        const res = await fetch('api/weather', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b.dataset.wx });
        const j = await res.json();
        if (j.ok) { this.wxQuery = ''; this.setWeather(j); this.onWeather?.(j); } else this.flash(T.weather.nothing);
      } catch { this.flash(T.shop.errors.offline); }
      b.disabled = false;
      return;
    }
    if (b.dataset.av) { if (!b.classList.contains('on') && be.avatar) r = await be.avatar(JSON.parse(b.dataset.av)); }
    else if (b.dataset.buy) r = await be.buy(b.dataset.buy, b.dataset.slot || null);
    else if (b.dataset.remove) r = await be.equip(b.dataset.slot, null);
    else if (b.dataset.equip && !b.classList.contains('on')) r = await be.equip(b.dataset.slot, b.dataset.equip);
    if (!r) return;
    if (!r.ok) this.flash(T.shop.errors[r.error] || r.error);
    else { this.hoverId = null; this.tokens.setPreview(null); }
  }

  flash(msg) {
    this.foot.textContent = msg; this.foot.classList.add('err');
    clearTimeout(this.ft);
    this.ft = setTimeout(() => { this.foot.textContent = T.shop.hint; this.foot.classList.remove('err'); }, 3500);
  }
}
