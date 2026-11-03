export const CATEGORIES = {
  professional: { label: 'Professional', short: 'Work', color: '#ef793e', icon: 'briefcase' },
  personal: { label: 'Personal', short: 'Personal', color: '#68717e', icon: 'coffee' },
  adhd: { label: 'ADHD / Other', short: 'ADHD', color: '#b5a1d8', icon: 'sparkles' }
};
export const KEYS = Object.keys(CATEGORIES);
export const pad = value => String(value).padStart(2, '0');
export const minutes = ms => Math.max(0, Math.round(ms / 60000));
export function duration(ms, compact = false) {
  const total = minutes(ms), hours = Math.floor(total / 60), mins = total % 60;
  if (compact) return `${hours}h ${pad(mins)}m`;
  return hours ? `${hours}h ${mins}m` : `${mins}m`;
}
export function dayStart(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
export function dayEnd(date) { const d = new Date(dayStart(date)); d.setDate(d.getDate() + 1); return d.getTime(); }
export function shiftDays(date, days) { const d = new Date(dayStart(date)); d.setDate(d.getDate() + days); return d.getTime(); }
export function dateKey(date) { const d = new Date(date); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
export function parseDateKey(key) { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); }
export function formatTime(ms) { return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
export function formatDate(ms, opts = { weekday: 'long', month: 'long', day: 'numeric' }) { return new Date(ms).toLocaleDateString([], opts); }
export function localInput(ms) { const d = new Date(ms); return `${dateKey(ms)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
export function fromLocalInput(value) { return new Date(value).getTime(); }
export function clampEntry(entry, start, end, now) {
  const a = Math.max(entry.start_ms, start), b = Math.min(entry.end_ms ?? now, end, now);
  return b > a ? { ...entry, is_live: entry.end_ms === null, start_ms: a, end_ms: b, duration_ms: b - a } : null;
}
export function between(entries, start, end, now = Date.now()) {
  return entries.map(e => clampEntry(e, start, end, now)).filter(Boolean).sort((a, b) => a.start_ms - b.start_ms);
}
export function summarize(entries, start, end, now = Date.now()) {
  const totals = Object.fromEntries(KEYS.map(k => [k, 0]));
  for (const entry of between(entries, start, end, now)) totals[entry.category] += entry.duration_ms;
  return { ...totals, total: KEYS.reduce((sum, k) => sum + totals[k], 0) };
}
export function dailySeries(entries, days, now = Date.now()) {
  const today = dayStart(now);
  return Array.from({ length: days }, (_, i) => {
    const start = shiftDays(today, i - days + 1);
    return { start, ...summarize(entries, start, dayEnd(start), now) };
  });
}
export function percentage(part, total) { return total > 0 ? part / total * 100 : 0; }
export function htmlEscape(input) { return String(input ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

