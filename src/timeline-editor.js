/** Helpers for the direct-manipulation day timeline. All intervals are [start,end). */
export const STEP = 5 * 60_000;
export const MIN_SELECTION = STEP;
export const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
export const snap = (ms, origin, step = STEP) => origin + Math.round((ms - origin) / step) * step;
export function bounds(dayStart, dayEnd, now) {
  const max = Math.min(dayEnd, now);
  return { min: dayStart, max: Math.max(dayStart, max), end: dayEnd };
}
export function selectionForInterval(start, end, b) {
  const a = clamp(snap(start, b.min), b.min, b.max);
  const z = clamp(snap(end, b.min), b.min, b.max);
  if (b.max - b.min < MIN_SELECTION) return null;
  const length = Math.max(MIN_SELECTION, Math.abs(z - a));
  let x = clamp(Math.min(a, z), b.min, b.max - length);
  return { start: x, end: x + length, category: null, note: '' };
}
export function selectionFromEntry(entry, b) {
  // Preserve the actual session's exact edges, even when it wasn't stamped
  // on a five-minute boundary. Dragging is still snapped to five minutes.
  const start = clamp(entry.start_ms, b.min, b.max);
  const end = clamp(entry.end_ms ?? b.max, b.min, b.max);
  if (end <= start) return null;
  return { start, end, category: null, note: entry.note || '' };
}
export function adjustSelection(selected, part, target, b, anchor = null) {
  if (!selected) return null;
  const t = clamp(snap(target, b.min), b.min, b.max);
  if (part === 'start') return { ...selected, start: Math.min(t, selected.end - MIN_SELECTION) };
  if (part === 'end') return { ...selected, end: Math.max(t, selected.start + MIN_SELECTION) };
  if (part === 'move') {
    const width = selected.end - selected.start;
    const next = clamp(t - (anchor ?? 0), b.min, b.max - width);
    return { ...selected, start: next, end: next + width };
  }
  return selected;
}
export function positionPct(ms, start, end) {
  return clamp((ms - start) / (end - start) * 100, 0, 100);
}
export function rangeImpact(entries, start, end, now) {
  const byCategory = { professional: 0, personal: 0, adhd: 0 };
  let covered = 0;
  for (const entry of entries) {
    const x = Math.max(start, entry.start_ms);
    const y = Math.min(end, entry.end_ms ?? now, now);
    if (y <= x) continue;
    byCategory[entry.category] += y - x;
    covered += y - x;
  }
  return { byCategory, covered, gap: Math.max(0, end - start - covered) };
}
export function timeOnDay(date, hhmm) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(hhmm)) return NaN;
  const [hours, minutes] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  return d.getTime();
}

