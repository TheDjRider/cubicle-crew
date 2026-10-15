// Cubicle Crew (бивш Pixel Office) като desktop приложение: малък прозорец без рамка, винаги отгоре, над трея.
// Сървърът (server.js) върви в същия процес – не е нужен отделен `npm start`, нито браузър.
import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, Notification, shell, globalShortcut } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawIcon16 } from './icon-art.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARGIN = 8;                  // разстояние от ръба на работния плот (над лентата със задачи)
const TARGET = { w: 790, h: 470 }; // физически пиксели – един екип в мащаб 2 (растe автоматично при втори)
const SHORTCUT = 'CommandOrControl+Alt+P';
const COMPACT = { w: 300, h: 170 }; // сутрешното прозорче (DIP), докато няма сесия

// дневник за проблеми при старт: %APPDATA%/pixel-office/desktop.log
let LOG = null;
const log = (...a) => {
  try { LOG ||= path.join(app.getPath('userData'), 'desktop.log'); fs.appendFileSync(LOG, `${new Date().toISOString()} ${a.join(' ')}\n`); } catch { /* */ }
};
process.on('uncaughtException', (e) => log('ERR', e.stack || e));
process.on('unhandledRejection', (e) => log('REJ', e?.stack || e));
// Папката с настройките остава старата (%APPDATA%/pixel-office) и след преименуването – иначе се губят размер, позиция, настройки.
// --user-data-dir (втори екземпляр за тестове) е с предимство. Първият log() е след това – иначе дневникът отива в %APPDATA%/cubicle-crew.
if (!app.commandLine.hasSwitch('user-data-dir')) app.setPath('userData', path.join(app.getPath('appData'), 'pixel-office'));
log('start', process.argv.join(' '));
if (!app.requestSingleInstanceLock()) { log('second instance – exit'); app.quit(); }
app.setAppUserModelId('com.pixeloffice.desktop');

let win = null, tray = null, port = 4317, stats = { agents: 0, subs: 0, tools: 0, waiting: [], sound: true, focus: false, private: false };
let quitting = false;
let waiting = false; // сутрешен екран: малко прозорче до първата сесия

// ---------------------------------------------------------------- настройки
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { bounds: null, onTop: true, through: false, demo: false, notify: true, lang: null, waitWindow: true, loginInit: false };
let programmatic = 0; // setBounds от нас – да не се брои като ръчно преоразмеряване
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* първо пускане */ }
  // от по-стара версия: запазеният размер става базов
  if (!settings.baseSize && settings.bounds) settings.baseSize = { w: settings.bounds.width, h: settings.bounds.height };
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2)); } catch { /* */ } }, 300);
}

// ---------------------------------------------------------------- позиция
function defaultBounds() {
  const d = screen.getPrimaryDisplay();
  const wa = d.workArea, k = d.scaleFactor || 1;
  const w = Math.min(Math.ceil(TARGET.w / k), wa.width - 2 * MARGIN), h = Math.min(Math.ceil(TARGET.h / k), wa.height - 2 * MARGIN);
  // долу вдясно = точно над часовника/трея
  return { x: wa.x + wa.width - w - MARGIN, y: wa.y + wa.height - h - MARGIN, width: w, height: h };
}
function visible(b) {
  return b && screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40);
}

// ---------------------------------------------------------------- прозорец
// език: изричен избор от менюто, иначе езикът на Windows (български -> bg, всичко друго -> en)
const lang = () => settings.lang || (/^bg/i.test(app.getLocale() || '') ? 'bg' : 'en');
const L = {
  bg: { hide: 'Скрий', show: 'Покажи', shop: 'Магазин', weather: 'Времето навън…', onTop: 'Винаги отгоре', through: 'Кликовете минават през прозореца', notify: 'Известие, когато агент чака',
    sound: 'Звук, когато агент чака или приключи', focus: 'Режим „Фокус“ (без игра и анимации)', private: 'Скривай команди и пътища',
    demo: 'Демо режим', login: 'Стартирай с Windows', waitWindow: 'Малко прозорче до първата сесия', lang: 'Език / Language', resetSize: 'Нулирай размера',
    resetPlace: 'Върни на мястото над трея', browser: 'Отвори в браузъра', quit: 'Изход',
    tip: (a, s, w) => `агенти ${a} · под-агенти ${s}${w ? ` · чакат те ${w}` : ''}`, one: (n) => `${n} чака теб`, many: (k) => `${k} агента чакат теб` },
  en: { hide: 'Hide', show: 'Show', shop: 'Shop', weather: 'Weather outside…', onTop: 'Always on top', through: 'Click-through', notify: 'Notify when an agent is waiting',
    sound: 'Sound when an agent waits or finishes', focus: 'Focus mode (no game, no animations)', private: 'Hide commands and paths',
    demo: 'Demo mode', login: 'Start with Windows', waitWindow: 'Small window until the first session', lang: 'Language / Език', resetSize: 'Reset size',
    resetPlace: 'Move back above the tray', browser: 'Open in browser', quit: 'Quit',
    tip: (a, s, w) => `agents ${a} · sub-agents ${s}${w ? ` · waiting for you ${w}` : ''}`, one: (n) => `${n} is waiting for you`, many: (k) => `${k} agents are waiting for you` },
};
const tr = () => L[lang()];
function setLang(l) { settings.lang = l; saveSettings(); win?.loadURL(pageUrl()); refreshTray(); }
function pageUrl() { return `http://localhost:${port}/?desktop${settings.demo ? '&demo' : ''}${waiting ? '&wait' : ''}&lang=${lang()}`; }
// презареждане винаги с актуалния адрес (reload() би запазил &wait и след събуждане)
const reloadPage = () => win?.loadURL(pageUrl());

// малкото прозорче: долният му десен ъгъл съвпада с този на нормалния прозорец
function compactBounds(n) {
  const wa = screen.getDisplayMatching(n).workArea;
  const w = Math.min(COMPACT.w, wa.width - 2 * MARGIN), h = Math.min(COMPACT.h, wa.height - 2 * MARGIN);
  return { x: n.x + n.width - w, y: n.y + n.height - h, width: w, height: h };
}

// първата сесия (или клик / меню): нормалният размер, закотвен в долния десен ъгъл на прозорчето (ако е местено – там)
function wake() {
  if (!waiting || !win) return;
  waiting = false;
  const c = win.getBounds(), wa = screen.getDisplayMatching(c).workArea;
  const n = visible(settings.bounds) ? settings.bounds : defaultBounds();
  const w = Math.min(n.width, wa.width - 2 * MARGIN), h = Math.min(n.height, wa.height - 2 * MARGIN);
  const x = Math.max(wa.x + MARGIN, Math.min(c.x + c.width, wa.x + wa.width - MARGIN) - w);
  const y = Math.max(wa.y + MARGIN, Math.min(c.y + c.height, wa.y + wa.height - MARGIN) - h);
  programmatic = Date.now();
  win.setMinimumSize(320, 190);
  win.setResizable(true);
  win.setBounds({ x, y, width: w, height: h });
  settings.bounds = win.getBounds(); saveSettings();
  win.webContents.send('wake');
  log('wake', JSON.stringify(settings.bounds));
  refreshTray();
}

// никой не работи (страницата брои минута): обратно към малкото прозорче в същия долен десен ъгъл
function sleep() {
  if (waiting || !win || !settings.waitWindow || shopRestore || !win.isVisible()) return;
  settings.bounds = win.getBounds(); saveSettings();
  waiting = true;
  programmatic = Date.now();
  win.setResizable(false);
  win.setMinimumSize(200, 120);
  win.setBounds(compactBounds(settings.bounds));
  reloadPage();
  log('sleep', JSON.stringify(settings.bounds));
  refreshTray();
}

function createWindow() {
  const n = visible(settings.bounds) ? settings.bounds : defaultBounds();
  const b = waiting ? compactBounds(n) : n;
  win = new BrowserWindow({
    ...b,
    minWidth: waiting ? 200 : 320, minHeight: waiting ? 120 : 190,
    // maximizable: false – двоен клик върху лентата за местене иначе разпъва прозореца на цял екран
    frame: false, resizable: !waiting, maximizable: false, fullscreenable: false, skipTaskbar: true, show: false,
    alwaysOnTop: settings.onTop, backgroundColor: '#0e0c14', title: 'Cubicle Crew',
    // autoplayPolicy: звукът "чака те" трябва да свири и преди първия клик в прозореца
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  applyOnTop();
  applyThrough();
  win.loadURL(pageUrl());
  win.once('ready-to-show', () => win.showInactive());
  // временният размер на магазина не се помни
  const remember = () => { if (!win.isMinimized() && !shopRestore && !waiting) { settings.bounds = win.getBounds(); saveSettings(); } };
  win.on('moved', remember);
  // ръчно преоразмеряване = нов базов размер (автоматичното само го увеличава временно)
  win.on('resized', () => { if (Date.now() - programmatic > 600 && !waiting) { const nb = win.getBounds(); settings.baseSize = { w: nb.width, h: nb.height }; } remember(); });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); refreshTray(); } });
  win.webContents.on('did-finish-load', sendState);
  // скрит/минимизиран прозорец -> страницата спира да рисува (backgroundThrottling е изключен)
  const sendVisible = () => win.webContents.send('visible', win.isVisible() && !win.isMinimized());
  for (const ev of ['show', 'hide', 'minimize', 'restore']) win.on(ev, sendVisible);
  win.webContents.on('did-finish-load', sendVisible);
  // връзки от страницата се отварят в браузъра, не в приложението
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

function applyOnTop() { win.setAlwaysOnTop(settings.onTop, 'floating'); sendState(); }
function applyThrough() { win.setIgnoreMouseEvents(settings.through, { forward: true }); sendState(); }
function sendState() { win?.webContents.send('state', { onTop: settings.onTop, through: settings.through }); }

function toggleWindow(force) {
  const show = force ?? !win.isVisible();
  if (show) { win.showInactive(); win.moveTop(); } else win.hide();
  refreshTray();
}

// ---------------------------------------------------------------- икона в трея: рисунката 16x16 от icon-art.js (x2 за остър HiDPI)
function trayIcon(alert) {
  const S = 32, buf = Buffer.alloc(S * S * 4);
  const px = (x, y, [r, g, b, a = 255]) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  drawIcon16((x, y, w, h, c) => rect(x * 2, y * 2, w * 2, h * 2, c));
  if (alert) { rect(20, 0, 12, 12, [42, 10, 20]); rect(21, 1, 10, 10, [224, 74, 107]); rect(25, 3, 2, 4, [255, 255, 255]); rect(25, 8, 2, 2, [255, 255, 255]); }
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
}

// След преименуването exe-то е на нов път; записът в Run (същото име = AUMID) още сочи стария "Pixel Office.exe" -> пренасочваме го.
function migrateLoginItem() {
  if (!app.isPackaged) return;
  try {
    const s = app.getLoginItemSettings();
    const old = (s.launchItems || []).some((i) => i.enabled && i.path && /pixel office/i.test(i.path) && path.resolve(i.path) !== path.resolve(process.execPath));
    if (!s.openAtLogin && old) { loginItem().set(true); log('login item -> ' + process.execPath); }
  } catch (e) { log('login item migrate', e?.message || e); }
}

function loginItem() {
  const opts = app.isPackaged ? { args: ['--autostart'] } : { path: process.execPath, args: [app.getAppPath(), '--autostart'] };
  return { get: () => app.getLoginItemSettings(opts).openAtLogin, set: (v) => app.setLoginItemSettings({ openAtLogin: v, ...opts }) };
}

// Стартирането с Windows е включено по подразбиране: веднъж, при първото пускане на тази версия.
// После решава само потребителят (отметката в менюто).
function initLoginItem() {
  if (!app.isPackaged || settings.loginInit) return;
  try { loginItem().set(true); settings.loginInit = true; saveSettings(); log('login item on by default'); } catch (e) { log('login item init', e?.message || e); }
}

function createTray() {
  tray = new Tray(trayIcon(false));
  tray.on('click', () => toggleWindow());
  refreshTray();
}

// размерът по подразбиране, без да мести прозореца: долният десен ъгъл остава на място
function resetSize() {
  wake();
  const b = win.getBounds();
  const d = screen.getDisplayMatching(b), wa = d.workArea, k = d.scaleFactor || 1;
  const w = Math.min(Math.ceil(TARGET.w / k), wa.width - 2 * MARGIN), h = Math.min(Math.ceil(TARGET.h / k), wa.height - 2 * MARGIN);
  const right = Math.min(b.x + b.width, wa.x + wa.width - MARGIN), bottom = Math.min(b.y + b.height, wa.y + wa.height - MARGIN);
  programmatic = Date.now();
  win.setBounds({ x: Math.max(wa.x + MARGIN, right - w), y: Math.max(wa.y + MARGIN, bottom - h), width: w, height: h });
  settings.bounds = win.getBounds(); settings.baseSize = { w, h }; saveSettings();
  toggleWindow(true);
  reloadPage(); // страницата отново казва колко място иска за мащаб 2
}
function resetPlace() {
  wake();
  programmatic = Date.now();
  win.setBounds(defaultBounds());
  settings.bounds = win.getBounds(); settings.baseSize = { w: settings.bounds.width, h: settings.bounds.height }; saveSettings();
  toggleWindow(true);
  reloadPage();
}

// едно и също меню: в трея и от бутона ⚙ в прозореца
function menuTemplate() {
  const li = loginItem(), t = tr();
  return [
    { label: win?.isVisible() ? t.hide : t.show, accelerator: SHORTCUT, click: () => toggleWindow() },
    { label: t.shop, click: () => { wake(); toggleWindow(true); win.focus(); win.webContents.send('open-shop'); } },
    { label: t.weather, click: () => { wake(); toggleWindow(true); win.focus(); win.webContents.send('open-weather'); } },
    { type: 'separator' },
    { label: t.onTop, type: 'checkbox', checked: settings.onTop, click: (m) => { settings.onTop = m.checked; applyOnTop(); saveSettings(); } },
    { label: t.through, type: 'checkbox', checked: settings.through, click: (m) => { settings.through = m.checked; applyThrough(); saveSettings(); } },
    { label: t.notify, type: 'checkbox', checked: settings.notify, click: (m) => { settings.notify = m.checked; saveSettings(); } },
    // звукът е настройка на страницата (localStorage) – менюто само я сменя там
    { label: t.sound, type: 'checkbox', checked: stats.sound, click: (m) => { stats.sound = m.checked; win?.webContents.send('sound', m.checked); } },
    // настройки на страницата (localStorage) – менюто само ги сменя там, страницата ги връща в stats
    { label: t.focus, type: 'checkbox', checked: stats.focus, click: (m) => { stats.focus = m.checked; win?.webContents.send('pref', 'focus', m.checked); } },
    { label: t.private, type: 'checkbox', checked: stats.private, click: (m) => { stats.private = m.checked; win?.webContents.send('pref', 'private', m.checked); } },
    { label: t.demo, type: 'checkbox', checked: settings.demo, click: (m) => { settings.demo = m.checked; saveSettings(); win.loadURL(pageUrl()); } },
    { label: t.login, type: 'checkbox', checked: li.get(), click: (m) => li.set(m.checked) },
    { label: t.waitWindow, type: 'checkbox', checked: settings.waitWindow, click: (m) => { settings.waitWindow = m.checked; saveSettings(); if (!m.checked) wake(); } },
    { label: t.lang, submenu: [
      { label: 'English', type: 'radio', checked: lang() === 'en', click: () => setLang('en') },
      { label: 'Български', type: 'radio', checked: lang() === 'bg', click: () => setLang('bg') },
    ] },
    { type: 'separator' },
    { label: t.resetSize, click: resetSize },
    { label: t.resetPlace, click: resetPlace },
    { label: t.browser, click: () => shell.openExternal(`http://localhost:${port}/?lang=${lang()}`) },
    { type: 'separator' },
    { label: t.quit, click: () => { quitting = true; app.quit(); } },
  ];
}

function refreshTray() {
  if (!tray) return;
  const w = stats.waiting.length;
  tray.setImage(trayIcon(w > 0));
  tray.setToolTip(`Cubicle Crew — ${tr().tip(stats.agents, stats.subs, w)}`);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

// ---------------------------------------------------------------- връзка със страницата
ipcMain.on('action', (_e, act) => {
  if (act === 'hide') toggleWindow(false);
  else if (act === 'quit') { quitting = true; app.quit(); }
  else if (act === 'lang:en' || act === 'lang:bg') setLang(act.slice(5));
  else if (act === 'pin') { settings.onTop = !settings.onTop; applyOnTop(); saveSettings(); refreshTray(); }
  else if (act === 'through') { settings.through = true; applyThrough(); saveSettings(); refreshTray(); }
  else if (act === 'settings') Menu.buildFromTemplate(menuTemplate()).popup({ window: win });
  else if (act === 'reset-size') resetSize();
  else if (act === 'wake') wake();
  else if (act === 'sleep') sleep();
});

// страницата казва какъв размер дава мащаб 2. Ръчно избраният размер е минимумът:
// прозорецът расте наляво/нагоре от долния десен ъгъл, когато трябва, и се връща към твоя размер след това.
// магазинът не се побира в малкия прозорец: докато е отворен, прозорецът расте (от долния десен ъгъл) и после се връща
const SHOP_SIZE = { w: 820, h: 700 }; // магазинът е лента отдолу – офисът над нея трябва да остане в мащаб ≥2
let shopRestore = null;
ipcMain.on('shop', (_e, open) => {
  if (!win) return;
  if (open) wake();
  if (open && !shopRestore) {
    const b = win.getBounds(), wa = screen.getDisplayMatching(b).workArea;
    shopRestore = b;
    const w = Math.min(Math.max(b.width, SHOP_SIZE.w), wa.width - 2 * MARGIN), h = Math.min(Math.max(b.height, SHOP_SIZE.h), wa.height - 2 * MARGIN);
    const x = Math.max(wa.x + MARGIN, Math.min(b.x + b.width, wa.x + wa.width - MARGIN) - w), y = Math.max(wa.y + MARGIN, Math.min(b.y + b.height, wa.y + wa.height - MARGIN) - h);
    programmatic = Date.now();
    if (w !== b.width || h !== b.height) win.setBounds({ x, y, width: w, height: h });
    if (settings.through) win.setIgnoreMouseEvents(false); // иначе в магазина не може да се кликне
    win.focus();
  } else if (!open && shopRestore) {
    programmatic = Date.now();
    win.setBounds(shopRestore);
    shopRestore = null;
    applyThrough();
  }
});

ipcMain.on('prefer-size', (_e, sz) => {
  if (!win || shopRestore || waiting) return;
  const b = win.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const base = settings.baseSize || { w: b.width, h: b.height };
  const w = Math.min(Math.max(320, base.w, sz.w | 0), wa.width - 2 * MARGIN), h = Math.min(Math.max(190, base.h, sz.h | 0), wa.height - 2 * MARGIN);
  if (Math.abs(w - b.width) < 4 && Math.abs(h - b.height) < 4) return;
  const right = b.x + b.width, bottom = b.y + b.height;
  const x = Math.max(wa.x + MARGIN, Math.min(right, wa.x + wa.width - MARGIN) - w);
  const y = Math.max(wa.y + MARGIN, Math.min(bottom, wa.y + wa.height - MARGIN) - h);
  programmatic = Date.now();
  win.setBounds({ x, y, width: w, height: h });
  settings.bounds = win.getBounds(); saveSettings();
});

ipcMain.on('stats', (_e, s) => {
  const before = new Set(stats.waiting);
  stats = { agents: s.agents | 0, subs: s.subs | 0, tools: s.tools | 0, waiting: Array.isArray(s.waiting) ? s.waiting.map(String).slice(0, 20) : [], sound: s.sound !== false, focus: !!s.focus, private: !!s.private };
  const fresh = stats.waiting.filter((n) => !before.has(n));
  if (fresh.length && settings.notify && Notification.isSupported() && !win.isFocused()) {
    // страницата свири свой звук -> известието е без системния (иначе звъни два пъти)
    const n = new Notification({ title: 'Cubicle Crew', body: fresh.length === 1 ? tr().one(fresh[0]) : tr().many(fresh.length), silent: stats.sound });
    n.on('click', () => { toggleWindow(true); win.focus(); });
    n.show();
  }
  refreshTray();
});

// ---------------------------------------------------------------- старт
app.on('second-instance', () => { wake(); toggleWindow(true); });
app.on('window-all-closed', () => { /* остава в трея */ });
let flushWallet = () => {};
app.on('before-quit', () => { quitting = true; flushWallet(); });
app.on('will-quit', () => globalShortcut.unregisterAll());

app.whenReady().then(async () => {
  loadSettings();
  initLoginItem();
  migrateLoginItem();
  // при всяко пускане (от Windows, от инсталатора, ръчно): малко прозорче със сутрешна сцена, докато не се появи сесия.
  // Ако вече има сесия, страницата го събужда веднага.
  waiting = settings.waitWindow !== false;
  const server = await import('../server.js');
  const { startServer } = server;
  flushWallet = server.flushWallet; // токените се записват преди изход  // собствен сървър (ако 4317 е зает, напр. от `npm start` – друг свободен порт), за да не зависи от друг процес
  ({ port } = await startServer(Number(process.env.PORT) || 4317, { reuse: false }));
  log('server port', port);
  createWindow();
  createTray();
  log('window', JSON.stringify(win.getBounds()));
  globalShortcut.register(SHORTCUT, () => toggleWindow());
  screen.on('display-metrics-changed', () => { if (!visible(win.getBounds())) win.setBounds(defaultBounds()); });
});
