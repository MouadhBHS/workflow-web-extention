import {
  CATEGORIES, KEYS, between, summarize, dailySeries, percentage, duration, dayStart,
  dayEnd, shiftDays, dateKey, parseDateKey, formatTime, formatDate,
  localInput, fromLocalInput, htmlEscape, pad
} from './lib.js';
import { invoke, listen } from './bridge.js';

import { bounds, selectionForInterval, selectionFromEntry, adjustSelection, STEP, timeOnDay, clamp } from './timeline-editor.js';
import { editorMarkup } from './timeline-view.js';
import { DEFAULT_PREFERENCES, normalizePreferences, opacityFraction, reminderFrequencyLabel } from './preferences.js';
import { DEFAULT_CATEGORY_STYLES, applyCategoryStyles } from './category-appearance.js';
import { categoryAppearanceSettings } from './category-editor-ui.js';

const native = invoke;
const isTray = new URLSearchParams(location.search).get('view') === 'tray';
document.documentElement.classList.toggle('main-window', !isTray);
document.documentElement.classList.toggle('popup-window', isTray);
const state = {
  page: 'dashboard', entries: [], active: null, day: dayStart(Date.now()),
  days: 7, now: Date.now(), loading: true, error: '', toast: '', modal: null,
  startup: false, request: 0, busy: false, selection: null, drag: null,
  preferences: { ...DEFAULT_PREFERENCES }, savingPreferences: false, savingCategory: null,
  companion: {paired:false,online:false}
};
const app = document.querySelector('#app');
function applyAppearance() {
  document.documentElement.dataset.theme = state.preferences.theme;
  if (!isTray) document.documentElement.style.setProperty('--surface-opacity', String(opacityFraction(state.preferences.opacity)));
}
applyAppearance();
const icons = {
  timer: '<circle cx="12" cy="13" r="9"/><path d="M12 8v5l3 2M9 2h6"/>',
  chart: '<rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6M17 2v6M3 10h18"/>',
  insights: '<path d="M3 17l6-6 4 3 8-9"/><path d="M16 5h5v5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="3"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  trash: '<path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>',
  briefcase: '<rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  coffee: '<path d="M4 8h13v7a6 6 0 0 1-6 6h-1a6 6 0 0 1-6-6V8Zm13 1h2a3 3 0 0 1 0 6h-2M7 3v2m5-2v2"/>',
  sparkles: '<path d="m12 3 1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Zm7 14 .6 1.4L21 19l-1.4.6L19 21l-.6-1.4L17 19l1.4-.6L19 17Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  monitor: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 22h8m-4-4v4"/>',
  bolt: '<path d="M13 2 5 13h6l-1 9 9-12h-6l1-8Z"/>',
  warning: '<path d="m12 3 10 18H2L12 3Zm0 6v5m0 4h.01"/>',
  layers: '<path d="m12 2 9 5-9 5-9-5 9-5Zm-9 10 9 5 9-5M3 17l9 5 9-5"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  pin: '<path d="m14 3 7 7-3 1-4 4-1 5-9-9 5-1 4-4 1-3Z"/>',
  circle: '<circle cx="12" cy="12" r="9"/>'
};
function icon(name, size = 19) { return `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[name] || icons.circle}</svg>`; }
const esc = htmlEscape;
function catDot(key, label = true) { const cat = CATEGORIES[key]; return `<span class="category-name"><span class="dot" style="background:${cat.color}"></span>${label ? esc(cat.label) : ''}</span>`; }
const currentDuration = () => state.active ? Math.max(0, state.now - state.active.start_ms) : 0;
function timerText(ms) { const seconds = Math.max(0, Math.floor(ms / 1000)); return `${pad(Math.floor(seconds / 3600))}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}`; }
function dateLabel(ms) { return dateKey(ms) === dateKey(state.now) ? 'Today' : formatDate(ms); }
function niceError(error) { return typeof error === 'string' ? error : error?.message || 'Something went wrong. Please try again.'; }
function notify(message, error = false) {
  if (isTray) {
    // Quiet quick-stamping: successful actions only update the timer and category.
    // Keep failures visible inline rather than covering controls with a toast.
    state.toast = error ? { message, error: true } : '';
    render();
    return;
  }
  state.toast = { message, error };
  render();
  setTimeout(() => { if (state.toast?.message === message) { state.toast = ''; document.getElementById('toast')?.remove(); } }, 4400);
}
async function call(command, args = {}) {
  if (!native) throw new Error('Open this page from the installed extension.');
  return native(command, args);
}
async function refresh() {
  if (!native) { state.loading = false; state.error = 'The extension must be installed to save entries.'; render(); return; }
  const request = ++state.request;
  const start = Math.min(shiftDays(state.now, -31), dayStart(state.day));
  const end = Math.max(dayEnd(state.now), dayEnd(state.day));
  try {
    const data = await call('snapshot', { fromMs: start, toMs: end });
    if (request !== state.request) return;
    state.entries = data.entries;
    state.active = data.active;
    state.error = '';
  } catch (err) { state.error = niceError(err); }
  state.loading = false;
  render();
}
async function mutate(command, args = {}, success = '') {
  if (state.busy) return false;
  state.busy = true;
  try {
    await call(command, args);
    state.modal = null;
    state.toast = !isTray && success ? { message: success, error: false } : '';
    await refresh();
    return true;
  } catch (err) { notify(niceError(err), true); return false; }
  finally { state.busy = false; }
}
function logo() { return `<span class="brand-mark" role="img" aria-label="Orange ring logo"></span>`; }
function brandName() { return `<span class="brand-name" aria-label="Workflow">Workflow</span>`; }
function sidebar() {
  const routes = [ ['dashboard', 'chart', 'Overview'], ['timeline', 'calendar', 'Timeline'], ['insights', 'insights', 'Insights'] ];
  return `<aside class="sidebar">
    <div class="brand">${logo()}${brandName()}</div>
    <div class="sidebar-label">WORKSPACE</div>
    <nav class="sidebar-nav">${routes.map(([page, glyph, name]) => `<button class="nav-link ${page === state.page ? 'active' : ''}" data-action="nav" data-page="${page}" aria-label="${name}">${icon(glyph, 19)}<span>${name}</span>${page === state.page ? '<span class="nav-active-bar"></span>' : ''}</button>`).join('')}</nav>
    <div class="sidebar-spacer"></div>
    <div class="sidebar-bottom"><button class="nav-link ${state.page === 'settings' ? 'active' : ''}" data-action="nav" data-page="settings" aria-label="Settings">${icon('settings')}<span>Settings</span></button>
    <div class="sidebar-foot">LOCAL FIRST <span class="footer-status"></span> PRIVATE BY DESIGN</div></div>
  </aside>`;
}
function statusPill() {
  if (state.active) return `<div class="running-pill"><span class="live-pulse"></span>${esc(CATEGORIES[state.active.category].label)}<strong data-live-timer>${timerText(currentDuration())}</strong></div>`;
  return `<div class="idle-pill"><span class="idle-circle"></span> Not tracking</div>`;
}
function topbar() {
  return `<header class="topbar"><div class="breadcrumbs">Workspace <span>/</span> <strong>${state.page === 'dashboard' ? 'Overview' : state.page[0].toUpperCase() + state.page.slice(1)}</strong></div><div class="topbar-right">${statusPill()}</div></header>`;
}
function headline(title, description, actions = '') {
  return `<div class="page-heading"><div><div class="eyebrow">${formatDate(state.now, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div><h1>${title}</h1><p>${description}</p></div>${actions}</div>`;
}
function button(label, action, cls = 'btn-primary', extra = '') { return `<button type="button" class="${cls}" data-action="${action}" ${extra}>${label}</button>`; }
function summaryTiles(start, end) {
  const totals = summarize(state.entries, start, end, state.now);
  return `<div class="stat-grid"><div class="stat-card primary-stat"><div class="stat-icon">${icon('clock', 21)}</div><div class="stat-label">TOTAL TIME TRACKED</div><div class="stat-value">${duration(totals.total, true)}</div><div class="stat-hint">A little progress adds up.</div></div>
  ${KEYS.map(k => `<div class="stat-card"><div class="stat-icon small-${k}" style="color:${CATEGORIES[k].color};background:${CATEGORIES[k].color}1C">${icon(CATEGORIES[k].icon)}</div><div class="stat-label">${esc(CATEGORIES[k].label.toUpperCase())}</div><div class="stat-value">${duration(totals[k], true)}</div><div class="stat-hint">${percentage(totals[k], totals.total).toFixed(0)}% of tracked time</div></div>`).join('')}</div>`;
}
function ringChart(summary) {
  let at = 0;
  const stops = KEYS.map(k => {
    const next = at + percentage(summary[k], summary.total);
    const segment = `${CATEGORIES[k].color} ${at}% ${next}%`;
    at = next;
    return segment;
  }).join(', ');
  const paint = summary.total ? `conic-gradient(${stops})` : 'conic-gradient(#2b343e 0% 100%)';
  return `<div class="ring" style="background:${paint}"><div class="ring-inner"><span>TRACKED</span><strong>${duration(summary.total, true)}</strong><small>total time</small></div></div>`;
}
function distribution(summary) {
  return `<div class="distribution-content">${ringChart(summary)}<div class="legend">${KEYS.map(k => `<div class="legend-row"><div>${catDot(k)}</div><div class="legend-values"><strong>${duration(summary[k], true)}</strong><span>${percentage(summary[k], summary.total).toFixed(0)}%</span></div></div>`).join('')}</div></div>`;
}
function smallDayChart(days = 7) {
  const series = dailySeries(state.entries, days, state.now);
  const max = Math.max(...series.map(v => v.total), 60 * 60_000);
  return `<div class="day-chart ${days === 30 ? 'month-bars' : ''}">${series.map(row => `<div class="day-column" title="${esc(formatDate(row.start))}: ${duration(row.total)}"><div class="bar-lane"><div class="bar-stack" style="height:${Math.max(row.total ? 4 : 0, percentage(row.total, max))}%">${KEYS.map(k => `<div class="bar-part" style="height:${percentage(row[k], row.total)}%;background:${CATEGORIES[k].color}"></div>`).join('')}</div></div><span class="bar-day ${dateKey(row.start) === dateKey(state.now) ? 'bar-day-today' : ''}">${days === 30 ? new Date(row.start).getDate() : new Date(row.start).toLocaleDateString([], { weekday:'short' })}</span></div>`).join('')}</div>`;
}
function dashboard() {
  const start = dayStart(state.now), totals = summarize(state.entries, start, dayEnd(start), state.now);
  const name = new Date(state.now).getHours() < 12 ? 'Good morning' : new Date(state.now).getHours() < 17 ? 'Good afternoon' : 'Good evening';
  return `${headline(`${name}<span class="heading-dot">.</span>`, 'Your time, clearly accounted for.', button(`${icon('plus', 17)} Add entry`, 'add', 'btn-secondary'))}
    ${summaryTiles(start, dayEnd(start))}
    ${stampPanel()}
    <div class="dashboard-columns"><section class="panel distribution-panel"><div class="panel-heading"><div><h2>Where your time went</h2><p>Today’s breakdown</p></div><span class="tag-muted">TODAY</span></div>${distribution(totals)}</section>
    <section class="panel rhythm-panel"><div class="panel-heading"><div><h2>Your weekly rhythm</h2><p>Time tracked across the last 7 days</p></div><button class="text-link" data-action="nav" data-page="insights">More insights ${icon('arrow', 15)}</button></div>${smallDayChart(7)}<div class="chart-foot"><span>${catDot('professional')}</span><span>${catDot('personal')}</span><span>${catDot('adhd')}</span></div></section></div>
    <section class="panel today-panel"><div class="panel-heading"><div><h2>Today’s activity</h2><p>One step at a time</p></div><button class="text-link" data-action="nav" data-page="timeline">View timeline ${icon('arrow', 15)}</button></div>${activityList(start, 4)}</section>
  `;
}
function activityList(date, count = Infinity) {
  const rows = between(state.entries, dayStart(date), dayEnd(date), state.now).sort((a,b) => b.start_ms - a.start_ms).slice(0, count);
  if (!rows.length) return `<div class="empty-state"><div class="empty-glyph">${icon('clock', 24)}</div><strong>No entries yet</strong><p>Your activity will show up here after your first stamp.</p>${button(`${icon('play', 15)} Start tracking`, 'scroll-stamp', 'btn-outline')}</div>`;
  return `<div class="activity-list">${rows.map(e => `<div class="activity-row"><div class="activity-icon" style="color:${CATEGORIES[e.category].color};background:${CATEGORIES[e.category].color}15">${icon(CATEGORIES[e.category].icon, 18)}</div><div class="activity-info"><strong>${esc(CATEGORIES[e.category].label)}${e.is_live ? '<span class="tiny-live">LIVE</span>' : ''}</strong><span>${esc(e.note || 'No description')}</span></div><span class="activity-when">${formatTime(e.start_ms)} — ${e.is_live ? 'Now' : formatTime(e.end_ms)}</span><strong class="activity-duration">${duration(e.duration_ms, true)}</strong></div>`).join('')}</div>`;
}
function stampPanel() {
  return `<section class="stamp-panel" id="stamp-panel"><div class="stamp-title"><div class="stamp-icon">${icon('timer', 20)}</div><div><h2>Quick stamp</h2><p>${state.active ? 'Currently tracking' : 'What are you doing right now?'}</p></div></div>
  <div class="stamp-categories">${KEYS.map(k => `<button data-action="stamp" data-category="${k}" class="stamp-option ${state.active?.category === k ? 'selected' : ''}" style="--category-accent:${CATEGORIES[k].color}"><span class="stamp-option-icon" style="color:${CATEGORIES[k].color};background:${CATEGORIES[k].color}14">${icon(CATEGORIES[k].icon, 21)}</span><span>${esc(CATEGORIES[k].label)}</span>${state.active?.category === k ? icon('check', 18) : icon('plus', 17)}</button>`).join('')}</div>
  ${state.active ? button(`${icon('stop', 17)} Stamp out`, 'stop', 'btn-stop wide') : '<div class="stamp-help">Select a category to start tracking.</div>'}</section>`;
}
function timeRibbon(date, rows) {
  return editorMarkup(state, rows, icon);
}
function timeline() {
  const start = dayStart(state.day), end = dayEnd(state.day);
  const rows = between(state.entries, start, end, state.now).sort((a,b) => a.start_ms-b.start_ms);
  const totals = summarize(state.entries, start, end, state.now);
  return `${headline('Your timeline<span class="heading-dot">.</span>', 'Slide, resize and recolor any part of your day.', `<div class="heading-buttons">${button(`${icon('plus', 17)} Add entry`, 'add')}</div>`)}
  <section class="panel timeline-panel"><div class="timeline-toolbar"><div class="day-navigator"><button aria-label="Previous day" data-action="previous-day" class="icon-button">${icon('left')}</button><div class="navigator-date"><strong>${dateLabel(state.day)}</strong><span>${formatDate(start, { weekday:'long', month:'long', day:'numeric', year:'numeric' })}</span></div><button aria-label="Next day" data-action="next-day" class="icon-button" ${dateKey(state.day) === dateKey(state.now) ? 'disabled' : ''}>${icon('right')}</button></div><div class="day-toolbar"><input aria-label="Choose date" type="date" max="${dateKey(state.now)}" value="${dateKey(state.day)}" data-field="day" class="date-input"/><button data-action="today" class="btn-outline small">Today</button></div></div>
  <div class="timeline-summary"><div><span>TIME RECORDED</span><strong>${duration(totals.total, true)}</strong></div>${KEYS.map(k => `<div><span>${catDot(k)}</span><strong>${duration(totals[k], true)}</strong></div>`).join('')}</div>
  ${timeRibbon(state.day, rows)}<div class="entry-head"><h2>Time entries <span>${rows.length}</span></h2><span>Click an entry to edit exact details</span></div>
  ${rows.length ? `<div class="entry-list">${rows.map(e => `<button class="entry-row" data-action="edit" data-id="${esc(e.id)}"><span class="entry-side" style="background:${CATEGORIES[e.category].color}"></span><span class="entry-main"><span class="entry-category">${esc(CATEGORIES[e.category].label)}${e.is_live ? '<span class="tiny-live">LIVE</span>' : ''}</span><span class="entry-note">${esc(e.note || 'No note added')}</span></span><span class="entry-clock">${formatTime(e.start_ms)} <span>→</span> ${e.is_live ? 'Now' : formatTime(e.end_ms)}</span><strong>${duration(e.duration_ms, true)}</strong><span class="entry-edit">${icon('edit', 17)}</span></button>`).join('')}</div>` : `<div class="timeline-empty">${icon('calendar', 26)}<strong>Nothing logged on this day</strong><p>Add a past entry or stamp in to start building your timeline.</p>${button(`${icon('plus', 17)} Add an entry`, 'add', 'btn-outline')}</div>`}
  </section>`;
}
function insights() {
  const series = dailySeries(state.entries, state.days, state.now);
  const totals = summarize(state.entries, series[0].start, dayEnd(state.now), state.now);
  const activeDays = series.filter(e => e.total > 0).length;
  const average = totals.total / state.days;
  const most = [...series].sort((a,b) => b.total-a.total)[0];
  return `${headline('Your patterns<span class="heading-dot">.</span>', 'Notice the rhythm. Keep what works, change what doesn’t.', '')}
  <div class="insight-switch"><span>TIME PERIOD</span><div class="segmented"><button data-action="set-days" data-days="7" class="${state.days === 7 ? 'active' : ''}">Last 7 days</button><button data-action="set-days" data-days="30" class="${state.days === 30 ? 'active' : ''}">Last 30 days</button></div></div>
  <div class="insight-summary"><div class="mini-card"><span>Total tracked</span><strong>${duration(totals.total, true)}</strong><small>Over ${state.days} calendar days</small></div><div class="mini-card"><span>Daily average</span><strong>${duration(average, true)}</strong><small>Includes days without entries</small></div><div class="mini-card"><span>Days with activity</span><strong>${activeDays}<span class="count-suffix"> / ${state.days}</span></strong><small>Consistency over perfection</small></div></div>
  <section class="panel insights-chart"><div class="panel-heading"><div><h2>Time over time</h2><p>Each bar represents a calendar day</p></div><span class="tag-muted">${state.days} DAYS</span></div>${smallDayChart(state.days)}<div class="chart-foot">${KEYS.map(k => `<span>${catDot(k)}</span>`).join('')}</div></section>
  <section class="panel insights-bottom"><div class="panel-heading"><div><h2>Category distribution</h2><p>A balanced view of your tracked hours</p></div></div>${distribution(totals)}<div class="insight-comment">${icon('sparkles', 19)}${totals.total ? `Your busiest day in this period was ${formatDate(most.start, { weekday: 'long', month:'short', day:'numeric' })} with ${duration(most.total)} logged.` : 'Your insights will grow as you record more time.'}</div></section>`;
}
function settings() {
  const { theme, opacity, reminders_enabled, cooldown_minutes } = state.preferences;
  return `${headline('Your preferences<span class="heading-dot">.</span>', 'Make your workspace feel right, without unnecessary interruptions.')}
  <section class="panel setting-panel"><div class="setting-section-title">APPEARANCE</div>
    <div class="setting-line"><div class="setting-icon">${icon('monitor', 21)}</div><div class="setting-detail"><label for="color-theme" class="setting-control-label">Color theme</label><span>Choose a bright or dark workspace. Your choice applies to the dashboard and quick-stamp popup.</span></div><select id="color-theme" class="pref-select" aria-label="Color theme" data-field="theme"><option value="dark" ${theme==='dark'?'selected':''}>Dark</option><option value="light" ${theme==='light'?'selected':''}>Light</option></select></div>
    <div class="setting-line"><div class="setting-icon">${icon('layers', 21)}</div><div class="setting-detail"><strong>Surface tint</strong><span>Adjust the darkness of the dashboard surface. Browser pages cannot use Windows Acrylic.</span>
      <div class="pref-slider"><input id="window-opacity" aria-label="Main window opacity" data-field="opacity" type="range" min="85" max="100" step="1" value="${opacity}"/><div class="pref-scale"><span>Softer tint</span><span>Darker tint</span></div></div>
    </div><output id="opacity-value" class="setting-value" for="window-opacity">${opacity}%</output></div>
  </section>
  ${categoryAppearanceSettings(CATEGORIES, KEYS, state.savingCategory, icon)}
  <section class="panel setting-panel"><div class="setting-section-title">STAMP-IN REMINDERS</div>
    <div class="setting-line"><div class="setting-icon">${icon('clock', 21)}</div><div class="setting-detail"><strong>Remind me when I forget to stamp</strong><span>If you've used your PC for around 2 minutes without a running session, send a browser notification (while the browser is running). Pauses when you're away, and stops while tracking.</span></div>
      <label class="switch"><input type="checkbox" aria-label="Enable stamp-in reminders" data-field="reminders-enabled" ${reminders_enabled ? 'checked' : ''}/><span class="slider-toggle"></span></label></div>
    <div class="setting-line ${reminders_enabled ? '' : 'setting-line-disabled'}"><div class="setting-icon">${icon('timer', 21)}</div><div class="setting-detail"><label class="setting-control-label" for="reminder-cooldown">Notification cooldown</label><span>Minimum time between reminders while you're using the PC without tracking.</span></div>
      <select id="reminder-cooldown" class="pref-select" data-field="cooldown" aria-label="Notification cooldown" ${reminders_enabled ? '' : 'disabled'}>${[5,10,15,20,30,45,60,90,120,180].map(m=>`<option value="${m}" ${cooldown_minutes===m?'selected':''}>${reminderFrequencyLabel(m)}</option>`).join('')}</select>
    </div>
  </section>
  <section class="panel setting-panel"><div class="setting-section-title">FLOATING DESKTOP COMPANION</div>
  <div class="setting-line"><div class="setting-icon">${icon('timer',21)}</div><div class="setting-detail">
  <strong>Workflow Buddy for Windows</strong>
  <span>A tiny, draggable, always-on-top character with the large timer. It changes mood with your category. Only the active category, its color, and start time leave the extension, via 127.0.0.1 on this PC.</span>
  </div><span class="companion-status" role="status">${state.companion.online?'Connected':state.companion.paired?'Offline':'Not paired'}</span></div>
  <div class="setting-line companion-pair-row"><div class="setting-detail">
  <label class="setting-control-label" for="companion-key">Pairing key</label>
  <span>Open Workflow Companion.exe, right-click its floating character or tray icon → Copy pairing key. Paste it here and connect. Your key is stored separately from time-tracking backups.</span>
  <input id="companion-key" class="pref-select companion-key-input" type="password" autocomplete="off" spellcheck="false" maxlength="32" placeholder="Paste the 32-character pairing key" aria-label="Companion pairing key"/>
  </div><button type="button" class="btn-secondary" data-action="pair-companion">Connect</button>
  ${state.companion.paired?'<button type="button" class="btn-outline" data-action="unpair-companion">Disconnect</button>':''}
  </div></section>
  <section class="panel setting-panel"><div class="setting-section-title">BROWSER & TOOLBAR</div><div class="setting-line"><div class="setting-detail"><strong>Pin Workflow for quick stamping</strong><span>The toolbar icon opens the quick-stamp popup. It no longer shows a tiny timer badge; the companion is the dedicated always-on-top clock. Your tracker keeps working without the companion.</span></div></div><div class="setting-line"><div class="setting-detail"><strong>Always ready when the browser starts</strong><span>No separate launch switch needed. Closing this tab keeps tracking. An active session includes sleep and browser-closed time until you stamp out; correct forgotten sessions in Timeline. Alt+Shift+W opens quick stamp; Alt+Shift+S stamps out. Configure shortcuts in the browser’s extension settings.</span></div></div></section>
  <section class="panel setting-panel"><div class="setting-section-title">PRIVACY & DATA</div><div class="setting-line"><div class="setting-icon">${icon('layers', 21)}</div><div class="setting-detail"><strong>Stored locally, owned by you</strong><span>Time entries and preferences are stored in this browser profile. No accounts, network sync or telemetry.</span></div><span class="setting-value">Local only</span></div><div class="setting-line"><div class="setting-icon">${icon('clock', 21)}</div><div class="setting-detail"><strong>Private activity check</strong><span>Reminders check the time of your last keyboard or mouse activity, not the keys pressed or the applications you use. Sessions remain active until stamped out.</span></div></div></section>
  <section class="panel setting-panel"><div class="setting-section-title">BACKUP & RESTORE</div><div class="setting-line"><div class="setting-detail"><strong>Keep a portable copy</strong><span>Export all entries and preferences to JSON. Restoring replaces your current data after confirmation. For desktop SQLite migration, see the repository’s migration instructions.</span></div><button class="btn-secondary" data-action="export">Export JSON</button><label class="btn-outline">Restore JSON<input type="file" accept=".json,application/json" id="import-backup" hidden></label></div></section>
  <div class="setting-version">Workflow v1.2.0 <span>•</span> A calmer relationship with time.</div>`;
}
async function refreshCompanionStatus(){
  try {state.companion=await call('companion_status');}
  catch {state.companion={paired:false,online:false};}
  if(state.page==='settings')render();
}
async function savePreferences(next) {
  const previous = state.preferences;
  const candidate = normalizePreferences(next);
  state.preferences = candidate;
  applyAppearance();
  try {
    const result = await call('set_preferences', {
      opacity: candidate.opacity,
      theme: candidate.theme,
      remindersEnabled: candidate.reminders_enabled,
      cooldownMinutes: candidate.cooldown_minutes,
    });
    state.preferences = normalizePreferences(result);
    applyAppearance();
  } catch (error) {
    state.preferences = previous;
    applyAppearance();
    notify(niceError(error), true);
  }
  if (state.page === 'settings') render();
}

async function loadCategoryAppearances() {
  if (!native) return;
  const styles = await call('get_category_appearances');
  applyCategoryStyles(styles);
  render();
}
async function saveCategoryStyle(key, updates) {
  if (!KEYS.includes(key) || state.savingCategory) return;
  const before = { name: CATEGORIES[key].name, color: CATEGORIES[key].color, icon: CATEGORIES[key].icon };
  const name = updates.name ?? before.name;
  const color = updates.color ?? before.color;
  const chosenIcon = updates.icon ?? before.icon;
  if (color.toUpperCase() === before.color.toUpperCase() && chosenIcon === before.icon && name === before.name) return;
  state.savingCategory = key;
  const current = Object.fromEntries(KEYS.map(k => [k, CATEGORIES[k]]));
  applyCategoryStyles({ ...current, [key]: { name, color, icon: chosenIcon } });
  render();
  try {
    const saved = await call('set_category_appearance', { category: key, name, color, icon: chosenIcon });
    applyCategoryStyles({ ...Object.fromEntries(KEYS.map(k => [k, CATEGORIES[k]])), [key]: saved });
  } catch (error) {
    applyCategoryStyles({ ...Object.fromEntries(KEYS.map(k => [k, CATEGORIES[k]])), [key]: before });
    notify(niceError(error), true);
  } finally {
    state.savingCategory = null;
    render();
  }
}

function trayView() {
  return `<main class="tray-app"><div class="tray-header"><div class="tray-brand">${logo()}${brandName()}</div><div class="tray-header-right"><button title="Open dashboard" aria-label="Open dashboard" class="icon-button" data-action="open-dashboard">${icon('chart', 19)}</button><button title="Close" aria-label="Close quick stamp" class="icon-button" data-action="hide-tray">${icon('close', 19)}</button></div></div>
  <div class="tray-body"><div class="tray-label">${state.active ? 'CURRENT SESSION' : 'READY WHEN YOU ARE'}</div><div class="tray-timer"><div class="tray-timer-clock" data-live-timer>${state.active ? timerText(currentDuration()) : '00:00:00'}</div><span class="tray-status">${state.active ? `<span class="live-pulse"></span>${esc(CATEGORIES[state.active.category].label)}` : '<span class="idle-circle"></span>Not tracking'}</span></div>
  <div class="tray-caption">CHOOSE YOUR ACTIVITY</div><div class="tray-options">${KEYS.map(k => `<button data-action="stamp" data-category="${k}" class="tray-option ${state.active?.category === k ? 'selected' : ''}" style="--category-accent:${CATEGORIES[k].color}"><span class="tray-icon" style="color:${CATEGORIES[k].color};background:${CATEGORIES[k].color}18">${icon(CATEGORIES[k].icon, 19)}</span><span>${esc(CATEGORIES[k].label)}</span>${state.active?.category === k ? icon('check', 18) : icon('arrow', 17)}</button>`).join('')}</div>
  <input id="tray-note" class="tray-note" maxlength="500" placeholder="Optional note for next stamp..." aria-label="Optional session note"/>
  ${state.active ? button(`${icon('stop', 16)} Stamp out`, 'stop', 'btn-stop wide') : ''}
  ${state.toast?.error ? `<div class="tray-inline-error" role="alert">${icon('warning', 15)}<span>${esc(state.toast.message)}</span></div>` : ''}</div><div class="tray-footer"><span>Small steps count.</span><button data-action="open-dashboard">Open dashboard ${icon('arrow', 15)}</button></div></main>`;
}
function toastMarkup() { return state.toast ? `<div id="toast" role="status" class="toast ${state.toast.error ? 'toast-error' : ''}">${icon(state.toast.error ? 'warning' : 'check', 18)}${esc(state.toast.message)}<button data-action="dismiss-toast" aria-label="Dismiss">${icon('close', 14)}</button></div>` : ''; }
function modalMarkup() {
  if (!state.modal) return '';
  const m = state.modal;
  if (m.type === 'delete') return `<div class="modal-backdrop" data-action="close-overlay"><div class="modal-dialog compact" role="dialog" aria-modal="true" aria-label="Delete entry"><button class="modal-x" data-action="close-modal" aria-label="Close">${icon('close')}</button><div class="modal-icon-danger">${icon('trash', 22)}</div><h2>Delete this entry?</h2><p>This recorded interval will be removed from your timeline. Other entries will stay unchanged.</p><div class="modal-footer">${button('Keep entry', 'close-modal', 'btn-secondary')}${button('Delete entry', 'confirm-delete', 'btn-danger')}</div></div></div>`;
  return `<div class="modal-backdrop" data-action="close-overlay"><div class="modal-dialog" role="dialog" aria-modal="true" aria-label="Edit entry"><div class="modal-heading"><div class="modal-icon">${icon('edit', 20)}</div><div><h2>${m.id ? 'Edit time entry' : 'Add a time entry'}</h2><p>Get the time and category exactly right.</p></div><button class="modal-x" aria-label="Close" data-action="close-modal">${icon('close')}</button></div>
  <form id="entry-form"><div class="form-label">CATEGORY</div><div class="form-categories">${KEYS.map(k => `<label class="form-category ${m.category === k ? 'chosen' : ''}"><input type="radio" name="category" value="${k}" ${m.category === k ? 'checked' : ''}/><span class="dot" style="background:${CATEGORIES[k].color}"></span>${esc(CATEGORIES[k].label)}</label>`).join('')}</div>
  <div class="form-dates"><label><span>START</span><input type="datetime-local" name="start" value="${localInput(m.start)}" required/></label><label><span>END</span><input type="datetime-local" name="end" value="${localInput(m.end)}" required/></label></div>
  <label class="form-note"><span>NOTE <em>OPTIONAL</em></span><textarea name="note" rows="3" maxlength="500" placeholder="What were you working on?">${esc(m.note)}</textarea></label>
  <div class="modal-footer">${m.id ? button(`${icon('trash', 16)} Delete`, 'ask-delete', 'btn-text-danger', `data-id="${esc(m.id)}"`) : '<span></span>'}<div>${button('Cancel', 'close-modal', 'btn-secondary')}<button type="submit" class="btn-primary">Save entry ${icon('arrow', 16)}</button></div></div></form></div></div>`;
}
function render() {
  if (isTray) { const note=document.querySelector('#tray-note')?.value??''; app.innerHTML = trayView(); document.querySelector('#tray-note').value=note; if(state.error){const error=document.createElement('p');error.className='tray-inline-error';error.textContent=state.error;document.querySelector('.tray-body').append(error);} return; }
  const view = { dashboard, timeline, insights, settings }[state.page]();
  app.innerHTML = `<div class="app-shell">${sidebar()}<div class="main-shell">${topbar()}<main class="content"><div class="content-inner">${state.error ? `<div class="error-banner">${icon('warning', 18)} ${esc(state.error)}</div>` : ''}${view}</div></main>${state.page !== 'settings' ? '<div class="mobile-stamp"><button data-action="add">' + icon('plus', 18) + ' Add entry</button></div>' : ''}</div></div>${modalMarkup()}${toastMarkup()}`;
  updateLive();
}
function updateLive() {
  document.querySelectorAll('[data-live-timer]').forEach(el => { el.textContent = state.active ? timerText(currentDuration()) : '00:00:00'; });
}
function openEntry(id = null) {
  const entry = id ? state.entries.find(e => e.id === id) : null;
  if (entry && entry.end_ms === null) return notify('Stamp out before editing the running entry.', true);
  const now = Math.min(state.now, dayEnd(state.day) - 60000);
  state.modal = { type: 'entry', id, category: entry?.category || 'professional', note: entry?.note || '', start: entry?.start_ms || Math.max(dayStart(state.day), now - 30*60000), end: entry?.end_ms || now };
  render();
}
async function submitForm(form) {
  const data = new FormData(form);
  const start_ms = fromLocalInput(data.get('start'));
  const end_ms = fromLocalInput(data.get('end'));
  if (!Number.isFinite(start_ms) || !Number.isFinite(end_ms) || start_ms >= end_ms) return notify('Choose a valid start and end time.', true);
  const args = { category: data.get('category'), note: String(data.get('note') || '').trim(), startMs: start_ms, endMs: end_ms };
  // Keep the user's edits in the dialog if the backend rejects a conflicting interval.
  state.modal = { ...state.modal, category: args.category, note: args.note, start: start_ms, end: end_ms };
  return mutate('save_entry', { ...args, id: state.modal.id }, state.modal.id ? 'Entry updated.' : 'Entry added.');
}
async function runAction(action, el) {
  const id = el.dataset.id;
  switch (action) {
    case 'export': {
      const data=await call('export_data');
      const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
      const a=document.createElement('a');a.href=url;a.download='workflow-backup-'+dateKey(Date.now())+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);break;
    }
    case 'nav': state.page = el.dataset.page; window.scrollTo?.(0,0); render(); if(state.page==='settings')refreshCompanionStatus(); break;
    case 'pair-companion': {
      const key=document.querySelector('#companion-key')?.value.trim()??'';
      state.companion=await call('connect_companion',{key});render();notify('Companion connected. Your floating timer is ready.');break;
    }
    case 'unpair-companion': {
      state.companion=await call('disconnect_companion');render();notify('Companion disconnected.');break;
    }
    case 'previous-day': state.day = shiftDays(state.day, -1); state.selection = null; await refresh(); break;
    case 'next-day': if (dateKey(state.day) !== dateKey(state.now)) { state.day = shiftDays(state.day, 1); state.selection = null; await refresh(); } break;
    case 'today': state.day = dayStart(state.now); state.selection = null; await refresh(); break;
    case 'set-days': state.days = Number(el.dataset.days); render(); break;
    case 'add': openEntry(); break;
    case 'edit': openEntry(id); break;
    case 'cancel-selection': state.selection=null; render(); break;
    case 'select-segment': {
      const row = state.entries.find(e=>e.id===id);
      if (row) state.selection=selectionFromEntry(row, editorBounds());
      render(); break;
    }
    case 'choose-category-color': await saveCategoryStyle(el.dataset.category, { color: el.dataset.color }); break;
    case 'choose-category-icon': await saveCategoryStyle(el.dataset.category, { icon: el.dataset.icon }); break;
    case 'reset-category-style': {
      const key = el.dataset.category;
      if (KEYS.includes(key)) await saveCategoryStyle(key, DEFAULT_CATEGORY_STYLES[key]);
      break;
    }
    case 'select-category': {
      if (!state.selection) break;
      state.selection.category=el.dataset.category;
      render(); break;
    }
    case 'apply-range': await applyRange(); break;
    case 'ask-delete': state.modal = { type: 'delete', id }; render(); break;
    case 'confirm-delete': await mutate('delete_entry', { id: state.modal.id }, 'Entry deleted.'); break;
    case 'close-modal': state.modal = null; render(); break;
    case 'close-overlay': state.modal = null; render(); break;
    case 'dismiss-toast': state.toast = ''; document.getElementById('toast')?.remove(); break;
    case 'scroll-stamp': document.querySelector('#stamp-panel')?.scrollIntoView({ behavior:'smooth' }); break;
    case 'stamp':
      if (state.active?.category === el.dataset.category) { notify(`Already tracking ${CATEGORIES[el.dataset.category].label}.`); break; }
      await mutate('stamp_in', { category: el.dataset.category, note: isTray ? document.querySelector('#tray-note')?.value || '' : '' }, 'Stamped in. Your time is being tracked.');
      break;
    case 'stop': await mutate('stamp_out', {}, 'Stamped out. Nice work.'); break;
    case 'open-dashboard': await call('show_dashboard'); break;
    case 'hide-tray': await call('hide_tray'); break;
  }
}

document.addEventListener('click', async event => {
  const el = event.target.closest('[data-action]');
  if (!el || (el.disabled && el.tagName === 'BUTTON')) return;
  if (el.dataset.action === 'close-overlay' && event.target !== el) return;
  if (el.closest('#entry-form') && el.type === 'submit') return;
  event.preventDefault();
  try { await runAction(el.dataset.action, el); }
  catch (err) { notify(niceError(err), true); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'entry-form') return;
  e.preventDefault();
  submitForm(e.target);
});
document.addEventListener('change', async e => {
  if(e.target.id==='import-backup') {
    const file=e.target.files[0]; if(!file)return;
    try {
      if(file.size>20*1024*1024)throw new Error('Backup exceeds 20 MB.');
      const data=JSON.parse(await file.text());
      if(!confirm('Replace all current Workflow entries and preferences with this backup? Export a backup first if needed.'))return;
      if(await mutate('import_data',{data},'Backup restored.')){await loadCategoryAppearances();state.preferences=normalizePreferences(await call('get_preferences'));applyAppearance();render();}
    }catch(err){notify(niceError(err),true);}
    return;
  }
  if (e.target.dataset.field === 'day') {
    if (!e.target.value) return;
    state.day = Math.min(dayStart(state.now), parseDateKey(e.target.value));
    state.selection = null;
    await refresh();
  }
  if (e.target.matches('[data-range-input]')) {
    const selection=state.selection;
    if (!selection) return;
    const part=e.target.dataset.rangeInput;
    const result=timeOnDay(state.day,e.target.value);
    const b=editorBounds();
    if(!Number.isFinite(result) || result < b.min || result > b.max ||
       (part==='start' ? result >= selection.end : result <= selection.start)) {
      notify('Choose times in the selected day, with start before end.', true);
      return;
    }
    state.selection = { ...selection, [part]: result };
    render();
    return;
  }
  if (e.target.matches('[data-category-name]')) {
    await saveCategoryStyle(e.target.dataset.categoryName, { name: e.target.value });
    return;
  }
  if (e.target.matches('[data-category-color]')) {
    await saveCategoryStyle(e.target.dataset.categoryColor, { color: e.target.value });
    return;
  }
  if (e.target.dataset.field === 'theme') {
    await savePreferences({ ...state.preferences, theme: e.target.value });
    return;
  }
  if (e.target.dataset.field === 'opacity') {
    await savePreferences({ ...state.preferences, opacity: Number(e.target.value) });
    return;
  }
  if (e.target.dataset.field === 'reminders-enabled') {
    await savePreferences({ ...state.preferences, reminders_enabled: e.target.checked });
    return;
  }
  if (e.target.dataset.field === 'cooldown') {
    await savePreferences({ ...state.preferences, cooldown_minutes: Number(e.target.value) });
    return;
  }
  if (e.target.name === 'category' && e.target.closest('#entry-form')) {
    document.querySelectorAll('.form-category').forEach(label => label.classList.toggle('chosen', label.querySelector('input').checked));
  }
});
document.addEventListener('input', e => {
  if (e.target.dataset.field === 'opacity') {
    const value = Number(e.target.value);
    document.documentElement.style.setProperty('--surface-opacity', String(opacityFraction(value)));
    const output = document.querySelector('#opacity-value');
    if (output) output.textContent = `${value}%`;
  }

  if (e.target.matches('[data-range-note]') && state.selection) state.selection.note=e.target.value;
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if(state.modal) {state.modal=null; render();}
    else if(state.selection){state.selection=null;render();}
  }
  if(!state.selection || !e.target.matches('[data-range-part]') || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
  e.preventDefault();
  const part=e.target.dataset.rangePart;
  const delta=(e.key==='ArrowRight'?1:-1) * STEP;
  const b=editorBounds();
  const target=(part==='end'?state.selection.end:state.selection.start)+delta;
  state.selection=adjustSelection(state.selection,part,target,b,0);
  render();
  document.querySelector(`[data-range-part="${part}"]`)?.focus();
});

function editorBounds(){return bounds(dayStart(state.day),dayEnd(state.day),state.now);}
function trackTime(event, track){
  const r=track.getBoundingClientRect();
  const b=editorBounds();
  return clamp(b.min+(clamp(event.clientX-r.left,0,r.width)/r.width)*(b.end-b.min),b.min,b.max);
}
let dragging=null;
document.addEventListener('pointerdown', event=>{
  if (state.page!=='timeline' || event.button!==0) return;
  const target=event.target;
  const track=target.closest('[data-slider-track]');
  if(!track) return;
  const handle=target.closest('[data-range-part]');
  if (target.closest('[data-action="select-segment"]') && !handle) return;
  const b=editorBounds();
  if(b.max-b.min < STEP) return;
  // The striped area is future time: it must not create an editable selection.
  if(!handle){
    const rect=track.getBoundingClientRect();
    if(event.clientX > rect.left + rect.width*(b.max-b.min)/(b.end-b.min)) return;
  }
  let part='create', anchor=0;
  if(handle && state.selection){
    part=handle.dataset.rangePart;
    anchor=trackTime(event,track)-state.selection.start;
  } else {
    const when=trackTime(event,track);
    state.selection=selectionForInterval(when,when+STEP,b);
    if(!state.selection) return;
  }
  dragging={pointerId:event.pointerId,part,origin:trackTime(event,track),anchor,original:state.selection};
  event.preventDefault();
  // Capture on the stable track; selected handles can be replaced only on release.
  track.setPointerCapture?.(event.pointerId);
  syncSelectionVisual();
});
document.addEventListener('pointermove', event=>{
  if(!dragging || event.pointerId!==dragging.pointerId) return;
  const track=document.querySelector('[data-slider-track]');
  if(!track) return;
  const target=trackTime(event,track),b=editorBounds();
  if(dragging.part==='create') {
    state.selection=selectionForInterval(dragging.origin,target,b);
  } else {
    state.selection=adjustSelection(dragging.original,dragging.part,target,b,dragging.anchor);
  }
  syncSelectionVisual();
});
document.addEventListener('pointerup', event=>{
  if(!dragging || event.pointerId!==dragging.pointerId) return;
  dragging=null;
  render();
});
document.addEventListener('pointercancel', event=>{
  if(!dragging || event.pointerId!==dragging.pointerId) return;
  state.selection=dragging.original;dragging=null;render();
});
function syncSelectionVisual(){
  const track=document.querySelector('[data-slider-track]');
  if(!track || !state.selection)return;
  const b=editorBounds(), selected=state.selection;
  const overlay=track.querySelector('[data-slider-selection]');
  if(!overlay){ // Create selection overlay only once without recreating the track during a drag.
    const elem=document.createElement('div');
    elem.className='slider-selection';elem.dataset.sliderSelection='';
    track.append(elem);
  }
  const selection=track.querySelector('[data-slider-selection]');
  // Coordinates use the entire local day, even on a partially elapsed day.
  selection.style.left=((selected.start-b.min)/(b.end-b.min)*100)+'%';
  selection.style.width=((selected.end-selected.start)/(b.end-b.min)*100)+'%';
}
async function applyRange(){
  if(!state.selection?.category || state.busy)return;
  const {start,end,category,note}=state.selection;
  if(end>state.now || start>=end){notify('Select a valid past interval.',true);return;}
  const ok=category==='untracked'
    ? await mutate('clear_range',{startMs:start,endMs:end},'Selected time is now untracked.')
    : await mutate('reassign_range',{startMs:start,endMs:end,category,note:note||''},'Time allocation updated.');
  if(ok){state.selection=null;render();}
}

async function bootstrap() {
  render();
  await refresh();
  if (native) {
    listen('entries-changed', () => refresh());
    listen('category-appearance-changed', () => {
      // Each Tauri window has an independent WebView; synchronize on every saved change.
      if (!state.savingCategory) loadCategoryAppearances().catch(error => notify(niceError(error), true));
    });
    listen('preferences-changed', async () => { state.preferences = normalizePreferences(await call('get_preferences')); applyAppearance(); if(state.page==='settings')render(); });
    await loadCategoryAppearances().catch(error => notify(niceError(error), true));
    {
      const pref = call('get_preferences').then(value => {
        state.preferences = normalizePreferences(value);
        applyAppearance();
        if (state.page === 'settings') render();
      }).catch(error => notify(niceError(error), true));
      await pref;
    }
  }
  setInterval(() => {
    const previousDay = dateKey(state.now);
    state.now = Date.now();
    if (dateKey(state.now) !== previousDay) { state.day = dayStart(state.now); refresh(); }
    else updateLive();
  }, 1000);
  setInterval(() => { if (!state.modal && !state.selection && !dragging && !document.querySelector('input:focus,textarea:focus')) refresh(); }, 60000);
}
bootstrap();

