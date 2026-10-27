// Магазин: DOM панел (острия текст, кирилица) с раздели; посочен предмет се вижда веднага в офиса (преглед),
// покупките минават през сървъра (или демо портфейла) – правилата са в catalog.js.
import { T, itemName, LANG, PARAMS, petName, petTitle } from './config.js';
import { prefs } from './prefs.js';
import { wxFrom } from './weather.js';
import { ITEMS, ITEM, TABS, SLOTS, GROUP_SLOTS, ACHIEVEMENTS, owns, avatarOf, unlocked, resolveDecor, PET_SLOTS, petCount, MAX_PETS, PET_NAME_MAX, inSeason } from './catalog.js';
import { CharacterSprites, avatarLook, AVATAR_TOPS, AVATAR_BOTTOMS, DRESS_TOPS } from './sprites.js';
import { SKINS, HAIRS } from './palette.js';
import { thumb } from './environment.js';
import { Cat, Dog } from './characters.js';
import { coinUrl } from './tokens.js';
import { makeCanvas, fmtUsd } from './util.js';

// малък прозорец (същото като в index.html): по-дребни миниатюри, за да се побират повече
const SMALL = matchMedia('(max-width: 899px), (max-height: 539px)');

const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; if (parent) parent.appendChild(e); return e; };
const fmt = (n) => Number(n).toLocaleString(LANG === 'bg' ? 'bg-BG' : 'en-US');
// 1 ч 05 мин / 42 мин – за статистиката
const fmtDurationShort = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} ${T.min}` : `${Math.floor(m / 60)} ${T.hour} ${String(m % 60).padStart(2, '0')} ${T.min}`; };

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
/** Неотключено в албума: предмет с прозрачен фон -> тъмен силует; цяла картинка (стена, под, любимец на пода) -> сиво и тъмно. */
function silhouette(c) {
  const g = c.getContext('2d'), d = g.getImageData(0, 0, c.width, c.height).data;
  let cut = false;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 200) { cut = true; break; }
  if (cut) { g.globalCompositeOperation = 'source-in'; g.fillStyle = '#4a4266'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'source-over'; return; }
  const tmp = makeCanvas(c.width, c.height); tmp.getContext('2d').drawImage(c, 0, 0);
  g.clearRect(0, 0, c.width, c.height); g.filter = 'grayscale(1) brightness(0.45)'; g.drawImage(tmp, 0, 0); g.filter = 'none';
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
    SMALL.addEventListener?.('change', () => { this.key = ''; if (!this.root.hidden) this.render(); });
    tokens.onChange(() => { if (!this.root.hidden) this.render(); });
    addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const typing = e.target?.closest?.('input, textarea'); // името на любимеца / търсенето на град
      if (!typing && 'bBбБ'.includes(e.key) && this.tokens.tokens != null && !prefs.focus) { this.toggle(); e.preventDefault(); }
      else if (e.key === 'Escape' && !this.root.hidden) this.close();
    });
    window.pixelOffice?.onOpenShop?.(() => this.open());
    window.pixelOffice?.onOpenWeather?.(() => this.open('weather'));
    window.pixelOffice?.onOpenTab?.((tab) => this.open(tab)); // „Статистика“ от менюто в трея
    // статистиката се опреснява, докато разделът е отворен
    setInterval(() => { if (!this.root.hidden && this.tab === 'stats') this.renderStats(true); }, 15000);
    this.weather = null; // последното {type:'weather'} от сървъра
  }

  /** Ново време от сървъра (WS или след POST). */
  setWeather(m) { this.weather = m; if (!this.root.hidden && this.tab === 'weather') { this.key = ''; this.render(); } }

  build() {
    const r = this.root;
    r.innerHTML = '';
    const panel = el('div', 'shop-panel', r);
    const head = el('header', null, panel);
    this.ttl = el('b', 'ttl', head, T.shop.title);
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
    this.body.addEventListener('mouseover', (e) => this.hover(e.target.closest('.card, .tile[data-id]')));
    this.body.addEventListener('mouseleave', () => this.hover(null));
    this.body.addEventListener('click', (e) => this.click(e.target.closest('button')));
  }

  open(tab) {
    if (PARAMS.lan) return; // телефонът само гледа
    if (document.body.classList.contains('setting-up')) return; // първо началната настройка
    if (prefs.focus && tab !== 'weather' && tab !== 'stats') return; // „Фокус“: без магазин (времето и статистиката остават)
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
    // статистиката и времето не са „магазин“; във „Фокус“ няма и монети
    const info = this.tab === 'stats' || this.tab === 'weather';
    this.ttl.textContent = info ? T.shop.tabs[this.tab] : T.shop.title;
    this.bal.hidden = prefs.focus;
    for (const b of this.nav.children) { b.classList.toggle('on', b.dataset.tab === this.tab); b.hidden = prefs.focus && b.dataset.tab !== 'weather' && b.dataset.tab !== 'stats'; }
    const tab = TABS.find((x) => x.id === this.tab);
    // пълно прерисуване само ако нещо видимо се е променило (иначе посочването "мига")
    const afford = ITEMS.filter((it) => tab.groups.includes(it.group) && !owns(s, it.id) && it.price <= t.tokens).map((it) => it.id).join();
    const key = [this.tab, JSON.stringify(s.owned), JSON.stringify(s.equipped), JSON.stringify(s.achievements), afford,
      tab.id === 'trophies' ? JSON.stringify(s.stats) + s.lifetime : '', tab.id === 'stats' ? 'stats' : '', JSON.stringify(s.avatar), tab.id === 'weather' ? JSON.stringify(this.weather) : '', JSON.stringify(s.petNames)].join('|');
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
    else if (tab.id === 'stats') this.renderStats();
    else if (tab.id === 'pets') this.renderPets();
    else if (tab.id === 'album') this.renderAlbum();
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
      if (it.by) el('div', 'by', card).textContent = T.shop.by(it.by);
      const price = it.price === 0 ? T.shop.free : have ? T.shop.owned : `<i style="background-image:url(${this.coin})"></i>${fmt(it.price)}`;
      el('div', 'pr', card, price);
      const act = el('div', 'act', card);
      if (!have) {
        const short = it.price - (this.tokens.tokens ?? 0), off = !inSeason(it);
        // сезонен извън сезона: „от 01.12“
        const b = el('button', 'buy', act, off ? T.shop.seasonFrom(it.from.split('-').reverse().join('.')) : short > 0 ? T.shop.need(fmt(short)) : T.shop.buy);
        b.dataset.buy = it.id; b.disabled = short > 0 || off;
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

  /** Албум: цялата колекция – купеното в цвят, останалото като силует с цената (и сезона). Само фиксирани цени –
   *  нищо случайно, всичко се купува направо. Клик по силует -> разделът му в магазина; посочване -> преглед в офиса. */
  renderAlbum() {
    const s = this.tokens.save, A = T.shop.album, now = new Date();
    const cats = TABS.filter((t) => t.groups.length).map((t) => ({ t, items: ITEMS.filter((it) => t.groups.includes(it.group) && it.group !== 'catslot') }));
    const all = cats.flatMap((c) => c.items), got = all.filter((it) => owns(s, it.id)).length;
    const tro = ACHIEVEMENTS.filter((a) => s.achievements?.[a.id]).length;
    const bar = (n, m) => `<span class="bar"><i style="width:${Math.round((n / Math.max(1, m)) * 100)}%"></i></span>`;
    const top = el('section', 'album-top', this.body);
    el('div', 'big', top, `<b>${A.total(got, all.length)}</b>${bar(got, all.length)}<span class="dim">${A.trophies(tro, ACHIEVEMENTS.length)}</span>`);
    el('p', 'hint', top, A.fair);
    const dm = (md) => md.split('-').reverse().join('.');
    for (const { t, items } of cats) {
      const n = items.filter((it) => owns(s, it.id)).length;
      const sec = el('section', 'album', this.body);
      el('h3', null, sec, `${T.shop.tabs[t.id]} <span class="cnt">${n} / ${items.length}</span>${bar(n, items.length)}`);
      const grid = el('div', 'tiles', sec);
      for (const it of items) {
        const have = owns(s, it.id), b = el('button', `tile${have ? ' got' : ''}${it.from ? ' season' : ''}`, grid);
        b.type = 'button'; b.dataset.id = it.id; b.dataset.go = t.id;
        const c = this.thumb(it), k = SMALL.matches ? 1 : Math.max(1, Math.round(parseFloat(c.style.width) / c.width / 2)); // половината от магазина
        c.style.width = `${c.width * k}px`; c.style.height = `${c.height * k}px`;
        if (!have) silhouette(c);
        b.appendChild(c);
        const cap = it.from ? `${dm(it.from)}–${dm(it.to)}${inSeason(it, now) ? ' ●' : ''}` : have ? '' : it.price ? `<i style="background-image:url(${this.coin})"></i>${fmt(it.price)}` : T.shop.free;
        if (cap) el('span', 'cap', b, cap);
        b.title = `${itemName(it)}${have ? ` · ${T.shop.owned}` : ''}${it.from ? ` · ${A.season(dm(it.from), dm(it.to))}` : ''}`;
      }
    }
    // постиженията: златни купички или сиви силуети
    const sec = el('section', 'album', this.body);
    el('h3', null, sec, `${T.shop.tabs.trophies} <span class="cnt">${tro} / ${ACHIEVEMENTS.length}</span>${bar(tro, ACHIEVEMENTS.length)}`);
    const grid = el('div', 'tiles', sec);
    for (const a of ACHIEVEMENTS) {
      const on = !!s.achievements?.[a.id], b = el('button', `tile cup${on ? ' got' : ''}`, grid);
      b.type = 'button'; b.dataset.go = 'trophies';
      const ic = trophy(on); ic.className = 'th'; ic.style.width = ic.style.height = '27px'; b.appendChild(ic);
      b.title = (T.achievements[a.id] || [a.id])[0];
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
      if (it.by) el('div', 'by', c).textContent = T.shop.by(it.by);
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
      h.textContent = `${title} · ${petTitle(slot, s.petNames, cur)}${cur ? '' : ` (${P.home})`}`;
      // име
      const form = el('form', 'pname', sec);
      const inp = el('input', null, form);
      inp.name = `pet-${slot}`; inp.maxLength = PET_NAME_MAX; inp.placeholder = petName(slot, null, cur); inp.value = s.petNames?.[slot] || '';
      inp.setAttribute('aria-label', P.name);
      el('button', null, form, P.rename).type = 'submit';
      form.onsubmit = async (e) => {
        e.preventDefault();
        if (!this.tokens.backend.pet) return;
        const r = await this.tokens.backend.pet(slot, inp.value);
        if (r && !r.ok) this.flash(T.shop.errors[r.error] || r.error);
      };
      const all = ITEMS.filter((x) => x.group === S.group), crew = all.filter((x) => x.by);
      const grid = el('div', 'grid', sec);
      let crewGrid = null;
      if (crew.length) { el('h4', null, sec, P.crew); crewGrid = el('div', 'grid', sec); }
      for (const it of [...all.filter((x) => !x.by), ...crew]) {
        const c = card(it.by ? crewGrid : grid, it, slot, cur === it.id);
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

  /** Лична статистика: днес + 7 дни + по проекти; експорт CSV/JSON. Данните са от сървъра (stats.js). */
  async renderStats(refresh = false) {
    const S = T.stats;
    let sec = this.body.querySelector('section.stats');
    if (!sec) { sec = el('section', 'stats', this.body); el('p', 'dim', sec).textContent = S.loading; }
    if (PARAMS.demo) { sec.innerHTML = ''; el('p', 'hint', sec).textContent = S.demo; return; }
    let r = null;
    try { r = await (await fetch('api/stats?days=7')).json(); } catch { /* */ }
    if (this.tab !== 'stats' || !sec.isConnected) return;
    if (!r?.ok) { if (!refresh) { sec.innerHTML = ''; el('p', 'hint', sec).textContent = S.offline; } return; }
    const dur = (ms) => (ms < 60000 ? (ms > 0 ? '<1 ' + T.min : '–') : fmtDurationShort(ms));
    const tok = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n));
    const today = r.days[0], t = today.total;
    sec.innerHTML = '';
    el('h3', null, sec, S.today);
    const cards = el('div', 'cards', sec);
    const card = (k, v, sub) => { const c = el('div', 'stat', cards); el('b', null, c).textContent = v; el('span', null, c).textContent = k; if (sub) el('small', null, c).textContent = sub; };
    card(S.work, dur(t.activeMs), `${S.leads}: ${dur(t.leadActiveMs)}`);
    card(S.waited, dur(t.waitingMs));
    card(S.tools, fmt(t.tools), S.sessions(t.sessions, t.subagents));
    card(S.tokens, `${tok(t.tokIn)} / ${tok(t.tokOut)}`, `${S.cache}: ${tok(t.tokCache)}`);
    card(S.cost, fmtUsd(t.usd), t.tokNoPrice ? S.noPrice(tok(t.tokNoPrice)) : S.costHint);
    if (!t.sessions && !t.subagents) el('p', 'hint', sec).textContent = S.empty;
    // 7 дни: работа (зелено) и чакане за теб (червено) – обща скала
    el('h3', null, sec, S.days);
    const max = Math.max(1, ...r.days.map((d) => d.total.activeMs + d.total.waitingMs));
    const bars = el('div', 'bars', sec);
    for (const d of [...r.days].reverse()) {
      const col = el('div', 'day', bars);
      const stack = el('div', 'stack', col);
      const a = el('i', 'w', stack); a.style.height = `${(d.total.activeMs / max) * 100}%`;
      const w = el('i', 'q', stack); w.style.height = `${(d.total.waitingMs / max) * 100}%`;
      col.title = `${d.day}: ${S.active} ${dur(d.total.activeMs)} · ${S.waiting} ${dur(d.total.waitingMs)}`;
      el('span', null, col).textContent = d.day.slice(8) + '.' + d.day.slice(5, 7);
    }
    if (today.projects.length) {
      const tb = el('table', 'proj', sec);
      tb.innerHTML = `<thead><tr><th>${S.project}</th><th>${S.active}</th><th>${S.waiting}</th><th>${S.calls}</th><th>${S.tok}</th><th>$</th></tr></thead>`;
      const body = el('tbody', null, tb);
      for (const p of today.projects) {
        const tr = el('tr', null, body);
        el('td', null, tr).textContent = p.project; // името на папката – само като текст
        for (const v of [dur(p.activeMs), dur(p.waitingMs), fmt(p.tools), `${tok(p.tokIn)} / ${tok(p.tokOut)}`, p.usd ? fmtUsd(p.usd) : '–']) el('td', 'n', tr, v);
      }
    }
    const act = el('div', 'sw', sec);
    const a1 = el('a', 'btn', act, S.csv); a1.href = 'api/stats.csv?days=30'; a1.download = 'cubicle-crew-stats-30d.csv';
    const a2 = el('a', 'btn', act, S.json); a2.href = 'api/stats?days=30'; a2.download = 'cubicle-crew-stats-30d.json';
    el('p', 'hint', sec).textContent = S.note;
  }

  /** Времето навън: избран град + търсене; текстът от интернет се слага само като textContent. */
  renderWeather() {
    const W = T.weather, m = this.weather;
    const sec = el('section', 'weather', this.body);
    if (PARAMS.demo) { // демото: без град, времето се избира с копче
      el('p', 'hint', sec).textContent = W.demo;
      const row = el('div', 'wxdemo', sec);
      for (const k of Object.keys(W.kinds)) {
        const b = el('button', null, row); b.type = 'button'; b.textContent = W.kinds[k];
        b.addEventListener('click', () => this.onFakeWeather?.(k));
      }
      return;
    }
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
    // цяло число пъти увеличение (пиксел арт), около 116x88 (в малък прозорец ~76x58)
    const [tw, th] = SMALL.matches ? [76, 58] : [116, 88];
    const k = Math.max(1, Math.min(6, Math.round(Math.min(tw / src.width, th / src.height))));
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
    if (b.dataset.go) { this.tab = b.dataset.go; this.key = ''; this.hoverId = null; this.tokens.setPreview(null); this.render(); this.body.scrollTop = 0; return; } // албумът -> разделът
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
