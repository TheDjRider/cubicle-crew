// Лични настройки на страницата (localStorage, всеки прозорец/браузър си ги пази):
//  focus   – режим „Фокус“: без монети, магазин, любимци, частици и забавления; остават състоянията и „чака те“
//  private – без команди, пътища и описания на задачите в балончетата и подсказките (споделен екран, стрийм)
//  names   – собствени имена на сесиите { id на сесията: име }
//  board   – коя страница е на дъската: 0 живата, 1 днес, 2 – 7 дни, 3 – 30 дни (прожекционният екран, board.js)
//  lights  – лампите на тавана нощем (ключът до вратата); изключени = старата тъмна „пещера“
//  lamp    – лампата и неонът в зоната за почивка (вторият ключ, под първия)
//  saver   – пестене на батерията: най-много 15 кадъра/s, без частици (искри, пара, прашинки)
//  perf    – малък брояч долу вляво: кадри/s, мс на кадър и ~% от едно ядро (за доверие: колко струва)
// ?overlay включва private по подразбиране (стрийм); Electron сменя focus/private от менюто в трея (IPC 'pref').
import { PARAMS } from './config.js';

const KEY = 'po.prefs';
const DEF = { focus: false, private: !!PARAMS.overlay, lights: true, lamp: true, names: {} };
let state = { ...DEF };
try { state = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* без storage – по подразбиране */ }
if (PARAMS.focus) state.focus = true;
const listeners = [];

export const prefs = {
  get focus() { return !!state.focus; },
  get private() { return !!state.private || PARAMS.lan; }, // телефонът: винаги (сървърът и без това не праща командите)
  get lights() { return state.lights !== false; },
  get lamp() { return state.lamp !== false; },
  get saver() { return !!state.saver; },
  get perf() { return !!state.perf || PARAMS.debug; },
  get board() { const b = state.board | 0; return b >= 0 && b < 4 ? b : 0; },
  /** Собственото име на сесия (или null). */
  name(id) { return state.names?.[id] || null; },
  set(key, value) {
    if (state[key] === value) return;
    state = { ...state, [key]: value };
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* */ }
    for (const fn of listeners) fn(key, value);
  },
  setName(id, name) {
    const n = String(name || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, 32);
    const names = { ...(state.names || {}) };
    if (n) names[id] = n; else delete names[id];
    this.set('names', names);
  },
  onChange(fn) { listeners.push(fn); },
};
window.pixelOffice?.onPref?.((key, value) => { if (key === 'focus' || key === 'private') prefs.set(key, !!value); });
