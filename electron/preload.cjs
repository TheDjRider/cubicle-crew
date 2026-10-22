// Минимален мост страница <-> Electron. Страницата работи и без него (в браузъра).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pixelOffice', {
  action: (act) => ipcRenderer.send('action', String(act)),
  stats: (s) => ipcRenderer.send('stats', s),
  preferSize: (sz) => ipcRenderer.send('prefer-size', sz),
  stripSize: (h) => ipcRenderer.send('strip-size', h),        // тънката лента: колко висока е
  onState: (fn) => ipcRenderer.on('state', (_e, st) => fn(st)),
  shop: (open) => ipcRenderer.send('shop', !!open),             // магазинът/настройките са отворени (фокус, без click-through)
  onOpenShop: (fn) => ipcRenderer.on('open-shop', () => fn()),  // "Магазин" от менюто в трея / ⚙
  onOpenWeather: (fn) => ipcRenderer.on('open-weather', () => fn()), // "Времето навън" от менюто
  onOpenTab: (fn) => ipcRenderer.on('open-tab', (_e, tab) => fn(String(tab))), // друг раздел на чекмеджето ("Статистика")
  onWake: (fn) => ipcRenderer.on('wake', () => fn()),            // сутрешният екран да се махне (меню/втори старт)
  onVisible: (fn) => ipcRenderer.on('visible', (_e, v) => fn(!!v)), // скрит прозорец -> страницата не рисува
  onSound: (fn) => ipcRenderer.on('sound', (_e, on) => fn(!!on)),     // "Звуци" от менюто в трея
  getDesktop: () => ipcRenderer.invoke('settings:get'),             // настройките на приложението (за панела „?“)
  setDesktop: (key, v) => ipcRenderer.send('settings:set', key, !!v),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),             // допълнителна папка с транскрипти (Docker, VM…)
  onDesktop: (fn) => ipcRenderer.on('desktop-settings', (_e, s) => fn(s)),
  onOpenHelp: (fn) => ipcRenderer.on('open-help', () => fn()),        // „Настройки и помощ…“ от менюто в трея
  onPref: (fn) => ipcRenderer.on('pref', (_e, key, value) => fn(String(key), !!value)), // „Фокус“ / „Скривай команди“ от трея
});
