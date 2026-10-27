// Cubicle Crew (бивш Pixel Office) като desktop приложение: малък прозорец без рамка, винаги отгоре, над трея.
// Сървърът (server.js) върви в същия процес – не е нужен отделен `npm start`, нито браузър.
import { app, BrowserWindow, Tray, Menu, nativeImage, screen, ipcMain, Notification, shell, globalShortcut, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { drawIcon16 } from './icon-art.js';
import { canSelfUpdate, download as downloadUpdate, runInstaller } from './updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MARGIN = 8;                  // разстояние от ръба на работния плот (над лентата със задачи)
const MAC = process.platform === 'darwin'; // macOS: горе вдясно под менюто, без икона в Dock, без стартиране при вход по подразбиране
const TARGET = { w: 712, h: 364 }; // физически пиксели – стаята (356×182) в мащаб 2
const CLEAR_H = 332;                // прозрачен фон: стаята е 356×166 (по-ниска стена, застъпени редове)
const target = () => (settings.clear ? { w: TARGET.w, h: CLEAR_H } : TARGET);
const OLD_TARGETS = [{ w: 790, h: 470 }, { w: 712, h: 416 }]; // до 2.7 и до 2.18 – прозорците в стария размер по подразбиране се смаляват веднъж
const HIDE_AFTER_MS = 8000;           // „само когато трябва“: скрива се толкова след последното „трябваш“
const SHORTCUT = 'CommandOrControl+Alt+P';
const COMPACT = { w: 300, h: 170 }; // сутрешното прозорче (DIP), докато няма сесия
const STRIP_W = 330;                // тънката лента (DIP): широчина; височината я казва страницата
// цветовете на състоянията (както STATES в public/config.js) – за точките в иконата в трея
const STATE_RGB = { idle: [107, 107, 128], thinking: [224, 194, 74], typing: [74, 194, 107], reading: [74, 143, 224], running: [224, 122, 74], delegating: [176, 74, 224], waiting: [224, 74, 107] };

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

let win = null, tray = null, port = 4317, stats = { agents: 0, subs: 0, tools: 0, waiting: [], sound: true, focus: false, private: false, leads: [], waitingIds: [] };
let quitting = false;
let waiting = false; // сутрешен екран: малко прозорче до първата сесия

// ---------------------------------------------------------------- настройки
const settingsFile = () => path.join(app.getPath('userData'), 'settings.json');
let settings = { bounds: null, onTop: true, through: false, demo: false, notify: true, lang: null, waitWindow: true, loginInit: false, strip: false, autoHide: false, taskbar: false, opacity: 1, clear: false };
let programmatic = 0; // setBounds от нас – да не се брои като ръчно преоразмеряване
function loadSettings() {
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) }; } catch { /* първо пускане */ }
  // от по-стара версия: запазеният размер става базов
  if (!settings.baseSize && settings.bounds) settings.baseSize = { w: settings.bounds.width, h: settings.bounds.height };
}
// 2.8 и 2.19: стаята е по-малка. Ако прозорецът е още в стар размер по подразбиране (не е местен ръчно), смаляваме го
// веднъж, закотвен в долния десен ъгъл. Ръчно избран размер не се пипа.
function migrateSize() {
  if (settings.size219) return;
  settings.size28 = settings.size219 = true;
  const b = settings.bounds, base = settings.baseSize;
  if (!b || !base) return;
  const k = screen.getDisplayMatching(b).scaleFactor || 1;
  const near = (v, t) => Math.abs(v - Math.ceil(t / k)) <= 4;
  const old = OLD_TARGETS.find((t) => near(base.w, t.w) && near(base.h, t.h));
  if (!old) return;
  const T = target(), w = Math.ceil(T.w / k), h = Math.ceil(T.h / k);
  settings.baseSize = { w, h };
  if (near(b.width, old.w) && near(b.height, old.h)) settings.bounds = { x: b.x + b.width - w, y: b.y + b.height - h, width: w, height: h };
  log('size migrated', JSON.stringify(settings.bounds));
}

/** Един екран и офисът би заел над 12% от него (лаптоп, 1366×768, 1080p при 125–150%) -> по подразбиране лента. */
function screenShares() {
  const d = screen.getPrimaryDisplay(), wa = d.workArea, k = d.scaleFactor || 1;
  const area = wa.width * wa.height;
  const office = Math.min(1, ((TARGET.w / k) * (TARGET.h / k)) / area), strip = Math.min(1, (STRIP_W * 64) / area);
  return { office: Math.round(office * 100), strip: Math.max(1, Math.round(strip * 100)), small: screen.getAllDisplays().length === 1 && office > 0.12 };
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
  const T = target(), w = Math.min(Math.ceil(T.w / k), wa.width - 2 * MARGIN), h = Math.min(Math.ceil(T.h / k), wa.height - 2 * MARGIN);
  // Windows: долу вдясно = точно над часовника/трея; macOS: горе вдясно = под иконата в лентата с менюто
  return { x: wa.x + wa.width - w - MARGIN, y: MAC ? wa.y + MARGIN : wa.y + wa.height - h - MARGIN, width: w, height: h };
}
function visible(b) {
  return b && screen.getAllDisplays().some(({ workArea: a }) => b.x < a.x + a.width - 40 && b.x + b.width > a.x + 40 && b.y >= a.y - 10 && b.y < a.y + a.height - 40);
}

// ---------------------------------------------------------------- прозорец
// език: изричен избор от менюто, иначе езикът на Windows (български -> bg, всичко друго -> en)
const lang = () => settings.lang || (/^bg/i.test(app.getLocale() || '') ? 'bg' : 'en');
const L = {
  bg: { hide: 'Скрий', show: 'Покажи', shop: 'Магазин', stats: 'Статистика', weather: 'Времето навън…', onTop: 'Винаги отгоре', through: 'Кликовете минават през прозореца', notify: 'Известие, когато агент чака',
    help: 'Настройки и помощ…', sound: 'Звук, когато агент чака или приключи', focus: 'Режим „Фокус“ (без игра и анимации)', private: 'Скривай команди и пътища', strip: 'Тънка лента вместо офиса',
    demo: 'Демо режим', login: 'Стартирай с Windows', waitWindow: 'Малко прозорче до първата сесия', autoHide: 'Показвай се само когато трябва', lang: 'Език / Language', resetSize: 'Нулирай размера',
    resetPlace: 'Върни на мястото над трея', browser: 'Отвори в браузъра', quit: 'Изход', update: (v) => `Нова версия ${v} – изтегли…`, install: (v) => `Нова версия ${v} – изтегли и инсталирай`, installing: (p) => `Изтегля новата версия… ${p}%`,
    tip: (a, s, w) => `агенти ${a} · под-агенти ${s}${w ? ` · чакат те ${w}` : ''}`, one: (n) => `${n} чака теб`, many: (k) => `${k} агента чакат теб` },
  en: { hide: 'Hide', show: 'Show', shop: 'Shop', stats: 'Stats', weather: 'Weather outside…', onTop: 'Always on top', through: 'Click-through', notify: 'Notify when an agent is waiting',
    help: 'Settings and help…', sound: 'Sound when an agent waits or finishes', focus: 'Focus mode (no game, no animations)', private: 'Hide commands and paths', strip: 'Thin strip instead of the office',
    demo: 'Demo mode', login: 'Start with Windows', waitWindow: 'Small window until the first session', autoHide: 'Show only when needed', lang: 'Language / Език', resetSize: 'Reset size',
    resetPlace: 'Move back above the tray', browser: 'Open in browser', quit: 'Quit', update: (v) => `New version ${v} – download…`, install: (v) => `New version ${v} – download and install`, installing: (p) => `Downloading the new version… ${p}%`,
    tip: (a, s, w) => `agents ${a} · sub-agents ${s}${w ? ` · waiting for you ${w}` : ''}`, one: (n) => `${n} is waiting for you`, many: (k) => `${k} agents are waiting for you` },
};
// macOS: „при вход“, не „с Windows“
if (MAC) { L.bg.login = 'Стартирай при вход'; L.en.login = 'Start at login'; }
const tr = () => L[lang()];
function setLang(l) { settings.lang = l; saveSettings(); win?.loadURL(pageUrl()); refreshTray(); }
function pageUrl() { return `http://localhost:${port}/?desktop${settings.demo ? '&demo' : ''}${settings.clear ? '&clear' : ''}${waiting ? '&wait' : ''}${settings.strip ? '&strip' : ''}&lang=${lang()}`; }
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

// тънка лента вместо офиса: малък прозорец в същия долен десен ъгъл, височината я казва страницата (strip-size)
function stripBounds(n, h = 60) {
  const wa = screen.getDisplayMatching(n).workArea;
  const w = Math.min(STRIP_W, wa.width - 2 * MARGIN), hh = Math.min(Math.max(30, h), wa.height - 2 * MARGIN);
  return { x: n.x + n.width - w, y: n.y + n.height - hh, width: w, height: hh };
}
function setStrip(on, then) {
  if (!win || settings.strip === on) { then?.(); return; }
  if (on) { if (!waiting) settings.bounds = win.getBounds(); }
  settings.strip = on; saveSettings();
  if (on) wake();
  programmatic = Date.now();
  if (on) { win.setMinimumSize(200, 30); win.setResizable(false); win.setBounds(stripBounds(win.getBounds())); }
  else {
    const c = win.getBounds(), n = visible(settings.bounds) ? settings.bounds : defaultBounds();
    win.setMinimumSize(320, 190); win.setResizable(true);
    win.setBounds({ x: c.x + c.width - n.width, y: c.y + c.height - n.height, width: n.width, height: n.height });
  }
  if (then) win.webContents.once('did-finish-load', then);
  reloadPage();
  refreshTray();
}
// раздел от менюто (магазин, статистика, време): в лентата няма място – първо обратно към офиса
function openTab(send) { wake(); setStrip(false, () => { toggleWindow(true); win.focus(); send(); }); }

// никой не работи (страницата брои минута): обратно към малкото прозорче в същия долен десен ъгъл
function sleep() {
  if (waiting || !win || !settings.waitWindow || shopOpen || !win.isVisible() || settings.strip) return;
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
  const b = waiting ? compactBounds(n) : settings.strip ? stripBounds(n) : n;
  win = new BrowserWindow({
    ...b,
    minWidth: waiting || settings.strip ? 200 : 320, minHeight: waiting ? 120 : settings.strip ? 30 : 190,
    // maximizable: false – двоен клик върху лентата за местене иначе разпъва прозореца на цял екран
    frame: false, resizable: !waiting && !settings.strip, maximizable: false, fullscreenable: false, skipTaskbar: !settings.taskbar, show: false,
    alwaysOnTop: settings.onTop, title: 'Cubicle Crew',
    // прозрачен фон: transparent се задава само при създаване – превключването прави прозореца наново (rebuildWindow)
    ...(settings.clear ? { transparent: true, backgroundColor: '#00000000' } : { backgroundColor: '#0e0c14' }),
    // autoplayPolicy: звукът "чака те" трябва да свири и преди първия клик в прозореца
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' },
  });
  applyOnTop();
  applyThrough();
  win.setOpacity(settings.opacity);
  if (MAC) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true }); // следва те по всички работни плотове (Spaces)
  win.loadURL(pageUrl());
  win.once('ready-to-show', () => { win.showInactive(); peek(6000); }); // „само когато трябва“: виждаш, че е тръгнало, после се скрива
  // временният размер на магазина не се помни
  const remember = () => { if (!win.isMinimized() && !waiting && !settings.strip) { settings.bounds = win.getBounds(); saveSettings(); } };
  win.on('moved', remember);
  // ръчно преоразмеряване = нов базов размер (автоматичното само го увеличава временно)
  win.on('resized', () => { if (Date.now() - programmatic > 600 && !waiting && !settings.strip) { const nb = win.getBounds(); settings.baseSize = { w: nb.width, h: nb.height }; } remember(); });
  win.on('close', (e) => { if (!quitting) { e.preventDefault(); win.hide(); refreshTray(); } });
  win.webContents.on('did-finish-load', sendState);
  // скрит/минимизиран прозорец -> страницата спира да рисува (backgroundThrottling е изключен)
  const sendVisible = () => win.webContents.send('visible', win.isVisible() && !win.isMinimized());
  for (const ev of ['show', 'hide', 'minimize', 'restore']) win.on(ev, sendVisible);
  win.webContents.on('did-finish-load', sendVisible);
  // връзки от страницата се отварят в браузъра, не в приложението
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
}

// прозорецът наново на същото място (смяна на прозрачния фон)
function rebuildWindow() {
  const old = win;
  if (!waiting && !settings.strip) {
    // прозрачният фон е по-нисък: височината следва стаята, долният десен ъгъл остава на място
    const b = old.getBounds(), h = Math.round(b.width * (settings.clear ? CLEAR_H : TARGET.h) / TARGET.w);
    settings.bounds = { ...b, y: b.y + b.height - h, height: h };
    settings.baseSize = { w: b.width, h };
  }
  shopOpen = false; clearSolid = null; // новата страница е без отворен панел (иначе остава „отворен“ завинаги)
  createWindow();
  old.destroy();
}

function applyOnTop() { win.setAlwaysOnTop(settings.onTop, 'floating'); sendState(); }
function applyThrough() { clearSolid = null; win.setIgnoreMouseEvents(settings.through, { forward: true }); sendState(); }
function sendState() { win?.webContents.send('state', { onTop: settings.onTop, through: settings.through }); }

// ---------------------------------------------------------------- настройки на приложението: едни и същи от трея и от панела „?“
const CAN_LOGIN = process.platform !== 'linux'; // Electron не поддържа стартиране при вход в Linux
function desktopSettings() {
  return { onTop: settings.onTop, through: settings.through, notify: settings.notify, strip: settings.strip, waitWindow: settings.waitWindow,
    demo: settings.demo, login: CAN_LOGIN ? loginItem().get() : false, canLogin: CAN_LOGIN, platform: process.platform,
    autoHide: settings.autoHide, taskbar: settings.taskbar, screen: screenShares(), selfUpdate: SELF_UPDATE, upd,
    opacity: settings.opacity, clear: settings.clear, canClear: process.platform !== 'linux' };
}

// ---------------------------------------------------------------- „Изтегли и инсталирай“ (updater.js): само инсталираното приложение в Windows
const SELF_UPDATE = canSelfUpdate(app);
let upd = { state: 'idle' }; // idle | download (pct) | install | error (err)
function setUpd(u) { upd = u; refreshTray(); win?.webContents.send('desktop-settings', desktopSettings()); }
async function installUpdate() {
  const v = stats.update?.version;
  if (!SELF_UPDATE || !v || upd.state === 'download' || upd.state === 'install') return;
  log(`update: изтегляне ${v}`);
  setUpd({ state: 'download', pct: 0, version: v });
  try {
    let last = 0;
    const file = await downloadUpdate(v, path.join(app.getPath('temp'), 'cubicle-crew-update'), (k) => {
      const pct = Math.floor(k * 100);
      if (pct >= last + 5) { last = pct; setUpd({ state: 'download', pct, version: v }); }
    });
    log(`update: инсталиране ${file}`);
    setUpd({ state: 'install', version: v });
    runInstaller(file);
    setTimeout(() => { quitting = true; app.quit(); }, 500); // инсталаторът чака приложението да излезе и после пуска новото
  } catch (e) {
    log(`update: ${e.message}`);
    setUpd({ state: 'error', err: String(e.message).slice(0, 80), version: v });
  }
}
function applyDesktop(key, v) {
  if (key === 'onTop') { settings.onTop = v; applyOnTop(); }
  else if (key === 'through') { settings.through = v; applyThrough(); }
  else if (key === 'notify') settings.notify = v;
  else if (key === 'opacity') { settings.opacity = Math.min(1, Math.max(0.25, Number(v) || 1)); win.setOpacity(settings.opacity); saveSettings(); return; }
  else if (key === 'clear') { settings.clear = v; saveSettings(); rebuildWindow(); return; }
  else if (key === 'taskbar') { settings.taskbar = v; win.setSkipTaskbar(!v); }
  else if (key === 'strip') { setStrip(v); return; }
  else if (key === 'login') { if (CAN_LOGIN) loginItem().set(v); }
  else if (key === 'waitWindow') { settings.waitWindow = v; if (!v) wake(); }
  else if (key === 'autoHide') { settings.autoHide = v; if (v) peek(HIDE_AFTER_MS); else toggleWindow(true); }
  else if (key === 'demo') { settings.demo = v; saveSettings(); win.loadURL(pageUrl()); }
  else return;
  saveSettings();
  refreshTray();
  win?.webContents.send('desktop-settings', desktopSettings());
}

function toggleWindow(force) {
  const show = force ?? !win.isVisible();
  if (show) { win.showInactive(); win.moveTop(); peek(15000); } else { win.hide(); peekUntil = 0; }
  refreshTray();
}

// „Само когато трябва“: прозорецът е скрит (иконата в трея остава) и излиза, без да взима фокуса, когато агент
// те чака или чака разрешение, когато оркестратор приключи (peek от страницата) или когато го отвориш сам.
// Скрива се HIDE_AFTER_MS след последното от тези, ако мишката не е над него и няма отворен магазин/панел.
let peekUntil = 0, needAt = 0;
function peek(ms) { peekUntil = Math.max(peekUntil, Date.now() + ms); }
function autoHideTick() {
  if (!win || !settings.autoHide || quitting) return;
  const now = Date.now();
  const asks = stats.waiting.length > 0 || !!stats.prompt;
  if (asks || stats.hold || shopOpen) needAt = now;
  if ((asks || now < peekUntil) && !win.isVisible()) { win.showInactive(); win.moveTop(); refreshTray(); }
  else if (win.isVisible() && now >= peekUntil && now - needAt > HIDE_AFTER_MS) { win.hide(); refreshTray(); }
}

// ---------------------------------------------------------------- икона в трея: рисунката 16x16 от icon-art.js (x2 за остър HiDPI)
function trayIcon(alert, leads = []) {
  const S = 32, buf = Buffer.alloc(S * S * 4);
  const px = (x, y, [r, g, b, a = 255]) => { if (x < 0 || y < 0 || x >= S || y >= S) return; const i = (y * S + x) * 4; buf[i] = b; buf[i + 1] = g; buf[i + 2] = r; buf[i + 3] = a; };
  const rect = (x, y, w, h, c) => { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(x + i, y + j, c); };
  drawIcon16((x, y, w, h, c) => rect(x * 2, y * 2, w * 2, h * 2, c));
  // по една точка на сесия (до 4) в цвета на състоянието ѝ – долу, върху рисунката
  leads.slice(0, 4).forEach((st, i) => { const x = 1 + i * 8; rect(x, 25, 7, 7, [20, 14, 28]); rect(x + 1, 26, 5, 5, STATE_RGB[st] || STATE_RGB.idle); });
  if (alert) { rect(20, 0, 12, 12, [42, 10, 20]); rect(21, 1, 10, 10, [224, 74, 107]); rect(25, 3, 2, 4, [255, 255, 255]); rect(25, 8, 2, 2, [255, 255, 255]); }
  return nativeImage.createFromBitmap(buf, { width: S, height: S, scaleFactor: 2 });
}

// След преименуването exe-то е на нов път; записът в Run (същото име = AUMID) още сочи стария "Pixel Office.exe" -> пренасочваме го.
function migrateLoginItem() {
  if (!app.isPackaged || MAC) return;
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
  if (!app.isPackaged || settings.loginInit || process.platform !== 'win32') return; // macOS/Linux – само ако потребителят го включи
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
  const T = target(), w = Math.min(Math.ceil(T.w / k), wa.width - 2 * MARGIN), h = Math.min(Math.ceil(T.h / k), wa.height - 2 * MARGIN);
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
  const t = tr();
  // кратко меню: всички настройки са в прозореца („Настройки и помощ…“); тук – отварянето и „кликовете минават през“,
  // защото докато е включено, прозорецът не приема кликове и само оттук може да се изключи
  return [
    ...(stats.update ? [upd.state === 'download' ? { label: t.installing(upd.pct || 0), enabled: false }
      : SELF_UPDATE ? { label: t.install(stats.update.version), click: () => installUpdate() }
      : { label: t.update(stats.update.version), click: () => shell.openExternal(stats.update.url) }, { type: 'separator' }] : []),
    { label: t.help, click: () => openTab(() => win.webContents.send('open-help')) },
    { type: 'separator' },
    { label: win?.isVisible() ? t.hide : t.show, accelerator: SHORTCUT, click: () => toggleWindow() },
    { label: t.shop, click: () => openTab(() => win.webContents.send('open-shop')) },
    { label: t.stats, click: () => openTab(() => win.webContents.send('open-tab', 'stats')) },
    { label: t.weather, click: () => openTab(() => win.webContents.send('open-weather')) },
    { type: 'separator' },
    { label: t.strip, type: 'checkbox', checked: settings.strip, click: (m) => setStrip(m.checked) },
    { label: t.through, type: 'checkbox', checked: settings.through, click: (m) => applyDesktop('through', m.checked) },
    { type: 'separator' },
    { label: t.quit, click: () => { quitting = true; app.quit(); } },
  ];
}

function refreshTray() {
  if (!tray) return;
  const w = stats.waiting.length;
  tray.setImage(trayIcon(w > 0, stats.leads));
  tray.setToolTip(`Cubicle Crew — ${tr().tip(stats.agents, stats.subs, w)}`);
  tray.setContextMenu(Menu.buildFromTemplate(menuTemplate()));
}

// ---------------------------------------------------------------- връзка със страницата
ipcMain.on('action', (_e, act) => {
  if (act === 'hide') toggleWindow(false);
  else if (act === 'quit') { quitting = true; app.quit(); }
  else if (act === 'lang:en' || act === 'lang:bg') setLang(act.slice(5));
  else if (act === 'pin') { settings.onTop = !settings.onTop; applyOnTop(); saveSettings(); refreshTray(); }
  else if (act === 'clear') { if (process.platform !== 'linux') applyDesktop('clear', !settings.clear); }
  else if (act === 'through') { settings.through = true; applyThrough(); saveSettings(); refreshTray(); }
  else if (act === 'settings') win.webContents.send('open-help'); // ⚙ в лентата: настройките в прозореца
  else if (act === 'reset-size') resetSize();
  else if (act === 'reset-place') resetPlace();
  else if (act === 'browser') shell.openExternal(`http://localhost:${port}/?lang=${lang()}`);
  else if (act === 'wake') wake();
  else if (act === 'sleep') sleep();
  else if (act === 'strip:off') setStrip(false);
  else if (act === 'strip:on') setStrip(true);
  else if (act === 'peek') peek(HIDE_AFTER_MS);
  else if (act === 'update-install') installUpdate();
});

// страницата казва какъв размер дава мащаб 2. Ръчно избраният размер е минимумът:
// прозорецът расте наляво/нагоре от долния десен ъгъл, когато трябва, и се връща към твоя размер след това.
// магазинът / настройките / началната настройка са отворени: прозорецът НЕ расте (молба от потребители) – страницата
// ги побира в него (по-плътно и със скрол, index.html); тук само го събуждаме, даваме фокус и спираме click-through
let shopOpen = false;
ipcMain.on('shop', (_e, open) => {
  if (!win) return;
  if (open) wake();
  if (open && !shopOpen) {
    shopOpen = true;
    if (settings.through) win.setIgnoreMouseEvents(false); // иначе в магазина не може да се кликне
    win.focus();
  } else if (!open && shopOpen) {
    shopOpen = false;
    applyThrough();
  }
});

// панелът „?“ чете и сменя същите настройки като менюто в трея
ipcMain.handle('settings:get', () => desktopSettings());
ipcMain.on('settings:set', (_e, key, v) => applyDesktop(String(key), typeof v === 'number' ? v : !!v));
// прозрачен фон: над празно място кликовете минават към това отдолу (forward – страницата пак получава движението на мишката)
// прозрачен фон: 20 пъти в секунда питаме страницата какво има под курсора и според отговора кликовете минават или не.
// Не разчитаме на препратените от Windows движения на мишката: над лентата горе (drag) ги няма,
// а при мащаб на екрана ≠ 100% се разминават – прозорецът оставаше „прозрачен за кликове“ навсякъде.
let clearSolid = null;
function clearTick() {
  if (!win || !settings.clear || waiting || settings.strip || settings.through || shopOpen || !win.isVisible()) return;
  const p = screen.getCursorScreenPoint(), b = win.getBounds();
  if (p.x < b.x || p.y < b.y || p.x >= b.x + b.width || p.y >= b.y + b.height) return;
  win.webContents.send('clear-probe', p.x - b.x, p.y - b.y);
}
ipcMain.on('clear-hit', (_e, solid) => {
  if (!win || !settings.clear || settings.through || shopOpen || solid === clearSolid) return;
  clearSolid = solid;
  win.setIgnoreMouseEvents(!solid, { forward: true });
});
// „Избери…“ до допълнителните папки (Docker, VM…): системният диалог; пътят отива към сървъра през страницата
ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0] || null;
});

ipcMain.on('strip-size', (_e, h) => {
  if (!win || !settings.strip) return;
  const b = win.getBounds(), n = stripBounds(b, Number(h) | 0);
  if (Math.abs(n.height - b.height) < 2) return;
  programmatic = Date.now();
  win.setBounds({ ...n, x: b.x + b.width - n.width, y: b.y + b.height - n.height });
});

ipcMain.on('prefer-size', (_e, sz) => {
  if (!win || shopOpen || waiting || settings.strip) return;
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
  stats = { agents: s.agents | 0, subs: s.subs | 0, tools: s.tools | 0, waiting: Array.isArray(s.waiting) ? s.waiting.map(String).slice(0, 20) : [], sound: s.sound !== false, focus: !!s.focus, private: !!s.private,
    leads: Array.isArray(s.leads) ? s.leads.filter((x) => STATE_RGB[x]).slice(0, 4) : [],
    waitingIds: Array.isArray(s.waitingIds) ? s.waitingIds.map(String).slice(0, 20) : [], prompt: typeof s.prompt === 'string' ? s.prompt.slice(0, 40) : null, hold: !!s.hold,
    // линкът се отваря навън – само към нашите рилийзи
    update: typeof s.update?.url === 'string' && s.update.url.startsWith('https://github.com/rezored/cubicle-crew/releases') ? { version: String(s.update.version).slice(0, 20), url: s.update.url } : null };
  permKeys(stats.prompt);
  const fresh = stats.waiting.filter((n) => !before.has(n));
  if (fresh.length && settings.notify && Notification.isSupported() && !win.isFocused()) {
    // страницата свири свой звук -> известието е без системния (иначе звъни два пъти)
    const n = new Notification({ title: 'Cubicle Crew', body: fresh.length === 1 ? tr().one(fresh[0]) : tr().many(fresh.length), silent: stats.sound });
    // клик -> терминалът на чакащата сесия (ако го намерим), иначе прозорецът с офиса
    const target = stats.waitingIds[stats.waiting.indexOf(fresh[0])] || stats.waitingIds[0];
    n.on('click', async () => {
      let ok = false;
      if (target) try { ok = (await (await fetch(`http://127.0.0.1:${port}/api/focus`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: target }) })).json()).ok; } catch { /* */ }
      if (!ok) { toggleWindow(true); win.focus(); }
    });
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

// Разреши / Откажи отвсякъде: Ctrl+Alt+Y / N (Cmd+Alt на Mac) – само докато има чакаща молба,
// за да не държим клавишите заети за другите програми
const PERM_KEYS = { allow: 'CommandOrControl+Alt+Y', deny: 'CommandOrControl+Alt+N' };
let permOn = false;
function permKeys(id) {
  if (!!id === permOn) return;
  permOn = !!id;
  for (const [decision, acc] of Object.entries(PERM_KEYS)) {
    if (!permOn) { globalShortcut.unregister(acc); continue; }
    globalShortcut.register(acc, async () => {
      const pid = stats.prompt;
      if (!pid) return;
      try { await fetch(`http://127.0.0.1:${port}/api/permission`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: pid, decision }) }); } catch { /* */ }
      log(`permission ${decision} via hotkey`);
    });
  }
}

app.whenReady().then(async () => {
  if (MAC) app.dock?.hide(); // уиджет: живее в лентата с менюто, не в Dock
  loadSettings();
  migrateSize();
  initLoginItem();
  migrateLoginItem();
  // при всяко пускане (от Windows, от инсталатора, ръчно): малко прозорче със сутрешна сцена, докато не се появи сесия.
  // Ако вече има сесия, страницата го събужда веднага.
  waiting = settings.waitWindow !== false && !settings.strip; // лентата и без това е малка
  const server = await import('../server.js');
  const { startServer } = server;
  flushWallet = server.flushWallet; // токените се записват преди изход  // собствен сървър (ако 4317 е зает, напр. от `npm start` – друг свободен порт), за да не зависи от друг процес
  ({ port } = await startServer(Number(process.env.PORT) || 4317, { reuse: false }));
  log('server port', port);
  createWindow();
  createTray();
  log('window', JSON.stringify(win.getBounds()));
  globalShortcut.register(SHORTCUT, () => toggleWindow());
  setInterval(autoHideTick, 1000);
  setInterval(clearTick, 50);
  screen.on('display-metrics-changed', () => { if (!visible(win.getBounds())) win.setBounds(defaultBounds()); });
});
