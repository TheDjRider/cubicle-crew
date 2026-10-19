// Настройки и помощ – панел в прозореца (менюто в трея остава кратко): колона с разделите вляво, съдържанието вдясно.
// Разделите са по смисъл: как изглежда, кога те вика, какво вижда/праща, прозорецът, споделяне, помощ.
// Всеки раздел има цвят от езика на състоянията и пикселна иконка 9x9 (рисува се тук, без файлове).
// Отметките носят същите data-* като досега – ui.onHelpChange() ги прилага.
import { T, LANG, STATES, STATE_ORDER } from './config.js';
import { prefs } from './prefs.js';
import { soundOn } from './sound.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// иконки 9x9: a = цветът на раздела, b = тъмен контур, c = светло
const ICONS = {
  look: ['.........', '.bbbbbbb.', '.baaaaab.', '.bacccab.', '.bacccab.', '.baaaaab.', '.bbbbbbb.', '...bbb...', '.bbbbbbb.'],     // монитор
  alerts: ['....b....', '...bab...', '..baaab..', '..baaab..', '..baaab..', '.baaaaab.', 'bbbbbbbbb', '...bcb...', '....b....'],  // звънец
  privacy: ['..bbbbb..', '.bb...bb.', '.b.....b.', 'bbbbbbbbb', 'baaaaaaab', 'baaacaaab', 'baaacaaab', 'baaaaaaab', 'bbbbbbbbb'], // катинар
  window: ['bbbbbbbbb', 'bacaccacb', 'bbbbbbbbb', 'b.......b', 'b.aaaaa.b', 'b.aaaaa.b', 'b.......b', 'b.......b', 'bbbbbbbbb'],  // прозорец
  share: ['......bb.', '.....baab', '..bb.baab', '.baab.bb.', '.baaaab..', '.baab.bb.', '..bb.baab', '.....baab', '......bb.'],  // споделяне
  help: ['..bbbbb..', '.baaaaab.', 'baab.baab', '....baab.', '...baab..', '...bab...', '...bbb...', '...bab...', '...bbb...'],     // въпрос
};
const SECTIONS = { look: '#4a8fe0', alerts: '#e04a6b', privacy: '#b04ae0', window: '#e07a4a', share: '#4ac26b', help: '#e0c24a' };
const urls = {};
function iconUrl(key) {
  if (urls[key]) return urls[key];
  const c = document.createElement('canvas'), g = c.getContext('2d'), col = { a: SECTIONS[key], b: '#0e0c14', c: '#f6f3ea' };
  c.width = 9; c.height = 9;
  ICONS[key].forEach((row, j) => { for (let i = 0; i < 9; i++) if (col[row[i]]) { g.fillStyle = col[row[i]]; g.fillRect(i, j, 1, 1); } });
  return (urls[key] = c.toDataURL());
}
const icon = (key) => `<i class="ico" style="background-image:url(${iconUrl(key)})"></i>`;

// превключвател (пикселен) с заглавие и едно изречение обяснение
const sw = (attrs, on, title, hint) => `<label class="opt"><span><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" class="sw" ${attrs}${on ? ' checked' : ''}></label>`;
const card = (name, value, on, title, hint) => `<label class="card"><input type="radio" name="${name}" value="${value}" id="${name}-${value}"${on ? ' checked' : ''}><b>${title}</b>${hint ? `<small>${hint}</small>` : ''}</label>`;
const btn = (attrs, text) => `<button type="button" ${attrs}>${text}</button>`;

/** Съдържанието на всеки раздел ('' = разделът не се показва тук). ui – за състоянието (легенда, hook, обновления…). */
function sections(ui) {
  const H = T.help, D = ui.desk, demo = ui.conn === 'demo', U = ui.update;
  const out = {};
  // как изглежда
  out.look = `<div class="cards">${card('mode', 'office', !prefs.focus, H.office, H.officeHint)}${card('mode', 'focus', prefs.focus, H.focus, H.focusHint)}</div>` +
    (D ? sw('id="desk-strip" data-desk="strip"', D.strip, H.strip, H.stripHint) : '') +
    sw('id="opt-legend" data-legend', !ui.legend.hidden, H.legend, H.legendHint) +
    sw('id="pref-lights" data-pref="lights"', prefs.lights, H.lights, H.lightsHint) +
    `<div class="row"><b>${H.lang}</b><div class="seg">${card('lang', 'bg', LANG === 'bg', 'Български')}${card('lang', 'en', LANG === 'en', 'English')}</div></div>`;
  // кога те вика
  out.alerts = (!demo ? sw('id="opt-sound" data-sound', soundOn(), H.sound, H.soundHint) : '') +
    (D ? sw('id="desk-notify" data-desk="notify"', D.notify, H.notify, H.notifyHint) + sw('id="desk-autohide" data-desk="autoHide"', D.autoHide, H.autoHide, H.autoHideHint) : '') +
    (!demo ? sw('id="opt-perm" data-hook', !!ui.hook?.installed, H.perm, H.permHint) + (ui.hookErr ? `<p class="err">${ui.hookErr}</p>` : '') : '');
  // какво вижда и какво излиза от компютъра
  out.privacy = sw('id="pref-private" data-pref="private"', prefs.private, H.private, H.privateHint) +
    (U && !demo ? sw('id="opt-update" data-upd', U.enabled, H.update, H.updateHint) +
      `<p class="dim ver">${esc(H.version(U.current))}${U.newer ? ` · <a href="${esc(U.latest.url)}" target="_blank" rel="noopener">${esc(H.newer(U.latest.version))}</a>` : U.latest ? ` · ${H.latest}` : ''}</p>` : '') +
    `<h4>${H.data}</h4><p class="dim">${H.dataHint}</p><div class="btns">` +
    (!demo ? btn('data-go="stats"', H.openStats) : '') + btn('data-go="weather"', H.openWeather) +
    `<a href="https://github.com/rezored/cubicle-crew/blob/main/docs/security.md" target="_blank" rel="noopener">${H.security}</a></div>`;
  // прозорецът (само в приложението)
  out.window = D ? sw('id="desk-ontop" data-desk="onTop"', D.onTop, H.onTop, H.onTopHint) +
    sw('id="desk-through" data-desk="through"', D.through, H.through, H.throughHint) +
    sw('id="desk-wait" data-desk="waitWindow"', D.waitWindow, H.wait, H.waitHint) +
    (D.canLogin ? sw('id="desk-login" data-desk="login"', D.login, D.platform === 'darwin' ? H.loginMac : H.login, H.loginHint) : '') +
    sw('id="desk-demo" data-desk="demo"', D.demo, H.demo, H.demoHint) +
    `<h4>${H.place}</h4><div class="btns">${btn('data-act="reset-size"', H.resetSize)}${btn('data-act="reset-place"', H.resetPlace)}${btn('data-act="browser"', H.browser)}</div>` : '';
  // сподели
  out.share = `<div class="btns big">${btn('data-snap', H.snapshot)}${btn('data-clip', H.clip)}</div><p class="dim">${H.shareHint}</p>`;
  // помощ: цветовете, клавишите, обратна връзка
  out.help = `<h4>${H.colours}</h4><ul class="states">` + STATE_ORDER.map((st) => `<li data-state="${st}"><i style="background:${STATES[st].color}"></i><span><b>${T.states[st]}</b> – ${esc(H.states[st].replace(/^[^–]*–\s*/, ''))}</span></li>`).join('') + '</ul>' +
    `<p class="dim">${H.shapes}</p><p class="dim"><span class="danger">⚠</span> ${H.danger}</p>` +
    `<h4>${H.keysTitle}</h4><table class="keys">${H.keys.filter(([k]) => D || !k.includes('Ctrl+Alt')).map(([k, v]) => `<tr><th><kbd>${k}</kbd></th><td>${v}</td></tr>`).join('')}</table>` +
    `<h4>${H.agentsTitle}</h4><p class="dim">${H.agentsHint}</p><div class="btns"><a href="https://github.com/rezored/cubicle-crew/blob/main/docs/api.md" target="_blank" rel="noopener">${H.agentsLink}</a></div>` +
    `<h4>${H.feedback}</h4><p class="dim">${H.feedbackHint}</p><div class="btns">` +
    `<a href="https://github.com/rezored/cubicle-crew/discussions" target="_blank" rel="noopener">${H.discuss}</a>` +
    `<a href="https://github.com/rezored/cubicle-crew/issues/new" target="_blank" rel="noopener">${H.issue}</a>` +
    `<a href="https://buymeacoffee.com/rezored" target="_blank" rel="noopener">${H.coffee}</a></div>`;
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

/** Целият панел за раздела tab (ако го няма – първият). Връща { html, tab }. */
export function settingsHtml(ui, tab) {
  const H = T.help, all = sections(ui), keys = Object.keys(all);
  if (!all[tab]) tab = keys[0];
  const nav = keys.map((k) => `<button type="button" data-tab="${k}" class="${k === tab ? 'on' : ''}" style="--acc:${SECTIONS[k]}">${icon(k)}<span>${H.sections[k]}</span></button>`).join('');
  const ver = ui.update?.current ? `<small class="v">Cubicle Crew ${esc(ui.update.current)}</small>` : '';
  const html = `<div class="set-panel" style="--acc:${SECTIONS[tab]}">` +
    `<aside><div class="brand"><b>${H.title}</b></div><nav>${nav}</nav>${ver}</aside>` +
    `<section><header><h2>${icon(tab)}${H.sections[tab]}</h2><button type="button" class="x" data-close title="${H.close} (Esc)">✕</button></header>` +
    `<div class="body">${all[tab]}</div></section></div>`;
  return { html, tab };
}
