// Входна точка: връзка към сървъра (или демо), цикъл на рисуване, мащабиране.
import { PARAMS, T } from './config.js';
import { Model } from './model.js';
import { Particles } from './particles.js';
import { Office } from './office.js';
import { UI } from './ui.js';
import { timeOfDay, parseFakeTime, TILES } from './environment.js';
import { applyWeather, wxFrom, fakeNow, cityDate } from './weather.js';
import { setCharacterSheet, buildAtlas, lookFor } from './sprites.js';
import { startDemo } from './demo.js';
import { Tokens, demoWallet } from './tokens.js';
import { Shop } from './shop.js';
import { Morning } from './morning.js';
import { Setup } from './setup.js';
import { prefs } from './prefs.js';
import { play } from './sound.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d', { alpha: false });
const model = new Model();
const fx = new Particles();
const office = new Office(model, fx);
if (PARAMS.debug) { window.__office = office; window.__model = model; }
const ui = new UI(office, model, canvas);
if (PARAMS.seed != null) office.seed = PARAMS.seed;
const tokens = new Tokens(office, ui);
const shop = new Shop(tokens, ui);
ui.onShop = () => shop.open();
ui.onWeather = () => shop.open('weather');
ui.onPet = (slot) => shop.openPet(slot);
// докато магазинът (или началната настройка) е отворен, Electron пренебрегва prefer-size -> след затваряне
// искаме размера наново, иначе втори екип, дошъл междувременно, остава в малкия прозорец (мащаб 1)
shop.onToggle = () => { lastSpecKey = ''; resize(); };
// „Фокус“ / „Скривай команди“ (от ? панела или от трея): любимците, стената с монетите, магазинът
prefs.onChange((k) => {
  if (k !== 'focus') return;
  office.syncPets();
  if (prefs.focus) { shop.close(); fx.list.length = 0; for (const a of office.actors.values()) if (a.sofaAct === 'game' || a.sofaAct === 'doze') a.sofaAct = 'rest'; }
});
if (PARAMS.debug) window.__shop = shop;

model.on('join', (a) => office.join(a, performance.now()));
model.on('leave', (a) => office.leave(a));
model.on('link', (p, c) => office.link(p, c));
model.on('celebrate', (a) => office.celebrate(a));
// звуци (само с истински сесии – демото би звъняло постоянно)
if (!PARAMS.demo) {
  model.on('state', (a, old, s) => { if (s === 'waiting' && old !== 'waiting') play('ask', a.id); });
  model.on('celebrate', (a) => { if (!a.subagent) play('done', a.id); });
}

// ?wait: сутрешен екран, докато не се появи първият агент (или клик) – после Electron връща нормалния размер
const morning = PARAMS.wait ? new Morning(office, () => { lastSpecKey = ''; window.pixelOffice?.action('wake'); resize(); }) : null;
window.pixelOffice?.onWake?.(() => morning?.wake());

// начална настройка (първо пускане): любимец + град; сутрешният екран не чака – настройката е в истинския прозорец
const setup = new Setup(tokens);
setup.onWeather = (m) => { onWeather(m); shop.setWeather(m); };
setup.onClose = () => { lastSpecKey = ''; resize(); };
tokens.onChange(() => {
  if (morning?.active && setup.need()) morning.wake();
  setup.maybeOpen();
});
if (PARAMS.debug) window.__setup = setup;

// ---------------------------------------------------------------- мащаб
let appliedVersion = -1;
let lastSpecKey = '';
function applyCanvas() {
  const L = office.L, dpr = window.devicePixelRatio || 1;
  canvas.width = L.W; canvas.height = L.H;
  canvas.style.width = `${(L.W * L.scale) / dpr}px`;
  canvas.style.height = `${(L.H * L.scale) / dpr}px`;
  ui.setScale(L.scale, dpr, L.W, L.H);
  appliedVersion = office.layoutVersion;
  if (PARAMS.desktop && window.pixelOffice?.preferSize) {
    const key = `${L.need.w}x${L.need.h}`;
    if (key !== lastSpecKey) {
      lastSpecKey = key;
      window.pixelOffice.preferSize({ w: Math.ceil((L.need.w * 2) / dpr), h: Math.ceil((L.need.h * 2) / dpr) });
    }
  }
}
function resize() {
  const dpr = window.devicePixelRatio || 1;
  // отворен магазин = лента отдолу; офисът се побира над нея
  const shopH = shop.root.hidden ? 0 : shop.root.offsetHeight;
  office.resize(Math.round(innerWidth * dpr), Math.round(Math.max(120, innerHeight - shopH) * dpr));
  applyCanvas();
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- време (истинско или ?time=)
const fake = parseFakeTime(PARAMS.time);
const t0 = Date.now();
// ---------------------------------------------------------------- времето навън (сървър или ?weather=)
let weatherMsg = null;
const fakeWx = PARAMS.weather ? fakeNow(PARAMS.weather) : null;
const currentWx = () => wxFrom(fakeWx || weatherMsg?.now);
function onWeather(m) { weatherMsg = m; office.weatherMsg = m; }
shop.onWeather = onWeather;

// часът е на избрания град (началната настройка / магазин → „Времето“); ?time= е фалшив час и не се мести
function nowDate() {
  if (!fake) return cityDate(new Date(), weatherMsg?.city?.tz);
  const d = new Date();
  d.setHours(fake.h, fake.m, 0, 0);
  return new Date(d.getTime() + (Date.now() - t0));
}

// ---------------------------------------------------------------- обратно към малкия прозорец
// офисът е празен (няма нито една сесия, и почиващите се броят) минута, без мишка/магазин/настройка ->
// Electron връща сутрешното прозорче (само ако „Малко прозорче до първата сесия“ е включено – решава main.js там).
const SLEEP_AFTER_MS = 60000;
let quietSince = 0, slept = false;
function checkSleep(now) {
  if (!PARAMS.desktop || PARAMS.demo || morning?.active || slept || !window.pixelOffice?.action) return;
  if (model.agents.size || !shop.root.hidden || setup.open || ui.mouse) { quietSince = 0; return; }
  if (!quietSince) quietSince = now;
  else if (now - quietSince > SLEEP_AFTER_MS) { slept = true; window.pixelOffice.action('sleep'); }
}

// ---------------------------------------------------------------- цикъл
// Адаптивна честота (заради процесора): пълна, докато нещо се движи бързо (office.animating()),
// иначе 30 fps – картината е същата, просто не я рисуваме два пъти. Скрит прозорец в Electron
// (backgroundThrottling е изключен) -> само логиката, 4 пъти в секунда, без рисуване.
const CALM_MS = 1000 / 30 - 4;  // -4 мс толеранс за трептенето на vsync
const HIDDEN_MS = 250;
let last = performance.now();
let shown = true, raf = 0, timer = 0;
function schedule() {
  if (shown) raf = requestAnimationFrame(frame);
  else timer = setTimeout(() => frame(performance.now()), HIDDEN_MS);
}
function frame(now) {
  if (shown && now - last < CALM_MS && !office.animating()) { schedule(); return; }
  let dt = Math.min(shown ? 0.1 : HIDDEN_MS / 1000 * 2, (now - last) / 1000);
  last = now;
  model.tick(now);
  while (dt > 0) { const s = Math.min(0.1, dt); office.update(s, now); fx.update(s); dt -= s; } // стъпки ≤0.1 s и при скрит прозорец
  if (office.layoutVersion !== appliedVersion) applyCanvas();
  tokens.update(now);
  if (morning?.active && model.agents.size) morning.wake();
  checkSleep(now);
  if (shown) {
    const date = nowDate();
    if (morning?.active) morning.render(now, date, currentWx());
    else office.render(ctx, now, applyWeather(timeOfDay(date), currentWx()), date);
  }
  ui.sync(now);
  schedule();
}
schedule();
window.pixelOffice?.onVisible?.((v) => {
  if (v === shown) return;
  shown = v; cancelAnimationFrame(raf); clearTimeout(timer); schedule();
});

// ---------------------------------------------------------------- PNG override (по желание)
// Сървърът връща списък на файловете в public/sprites, за да не правим заявки към липсващи файлове.
fetch('api/sprites').then((r) => (r.ok ? r.json() : [])).then(async (files) => {
  const has = (f) => files.includes(f);
  const img = (f) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `sprites/${f}`; });
  const json = (f) => fetch(`sprites/${f}`).then((r) => r.json());
  if (has('characters.png')) {
    setCharacterSheet(await img('characters.png'), has('characters.json') ? await json('characters.json') : null);
    for (const a of office.actors.values()) a.sprites.cache.clear();
  }
  if (has('tiles.png') && has('tiles.json')) {
    TILES.img = await img('tiles.png'); TILES.map = await json('tiles.json');
    office.relayout();
  }
}).catch(() => { /* без override – всичко е процедурно */ });

// ---------------------------------------------------------------- ?atlas – преглед на генерираните спрайтове
if (new URLSearchParams(location.search).has('atlas')) {
  const wrap = document.createElement('div');
  wrap.id = 'atlas';
  const colors = ['#4ac26b', '#4a8fe0', '#e07a4a', '#b04ae0', '#e04a6b', '#e0c24a', '#6b6b80', '#4ac26b'];
  for (let i = 0; i < 8; i++) {
    const c = buildAtlas(lookFor('atlas-' + i, i === 7), colors[i]);
    c.style.width = `${c.width * (Number(new URLSearchParams(location.search).get('atlas')) || 3)}px`;
    wrap.appendChild(c);
  }
  document.body.appendChild(wrap);
}

// ---------------------------------------------------------------- връзка
const ingest = (e) => model.ingest(e);
if (PARAMS.demo) {
  ui.setConnection('demo');
  const earn = demoWallet(tokens);
  startDemo((e) => { ingest(e); earn(e); }, model);
} else {
  let retry = 1000;
  const connect = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);
    ws.onopen = () => { ui.setConnection('connected'); retry = 1000; };
    ws.onmessage = (m) => {
      let e;
      try { e = JSON.parse(m.data); } catch { return; /* лош ред */ }
      if (e.type === 'wallet') tokens.onWallet(e);
      else if (e.type === 'sessions') model.sessions(e.list);
      else if (e.type === 'weather') { onWeather(e); shop.setWeather(e); }      else ingest(e);
    };
    ws.onclose = () => { ui.setConnection('down'); setTimeout(connect, retry); retry = Math.min(8000, retry * 1.5); };
    ws.onerror = () => { /* onclose ще се погрижи */ };
  };
  connect();
}
void T;
