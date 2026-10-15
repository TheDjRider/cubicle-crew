// Лични настройки на страницата (localStorage, всеки прозорец/браузър си ги пази):
//  focus   – режим „Фокус“: без монети, магазин, любимци, частици и забавления; остават състоянията и „чака те“
//  private – без команди, пътища и описания на задачите в балончетата и подсказките (споделен екран, стрийм)
//  names   – собствени имена на сесиите { id на сесията: име }
// ?overlay включва private по подразбиране (стрийм); Electron сменя focus/private от менюто в трея (IPC 'pref').
import { PARAMS } from './config.js';

const KEY = 'po.prefs';
const DEF = { focus: false, private: !!PARAMS.overlay, names: {} };
let state = { ...DEF };
try { state = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* без storage – по подразбиране */ }
if (PARAMS.focus) state.focus = true;
const listeners = [];

export const prefs = {
  get focus() { return !!state.focus; },
  get private() { return !!state.private; },
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
