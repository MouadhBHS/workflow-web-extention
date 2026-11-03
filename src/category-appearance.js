import { CATEGORIES, KEYS } from './lib.js';

// Stable database category IDs; names, colors and icons are configurable.
export const ICON_OPTIONS = Object.freeze([
  { id: 'briefcase', label: 'Work' }, { id: 'coffee', label: 'Break' },
  { id: 'sparkles', label: 'Creative' }, { id: 'clock', label: 'Clock' },
  { id: 'timer', label: 'Timer' }, { id: 'calendar', label: 'Calendar' },
  { id: 'chart', label: 'Progress' }, { id: 'monitor', label: 'Computer' },
  { id: 'bolt', label: 'Energy' }, { id: 'layers', label: 'Projects' },
  { id: 'pin', label: 'Focus' }, { id: 'circle', label: 'Circle' },
]);
export const COLOR_PRESETS = Object.freeze([
  '#F27C45', '#F2B84B', '#E95D78', '#C487E8', '#9F8EF0', '#6E8AF0',
  '#4CB0D1', '#55C5AC', '#78B96B', '#C7A38C', '#A0AAB7', '#EAEFF5',
]);
export const DEFAULT_CATEGORY_STYLES = Object.freeze(Object.fromEntries(
  KEYS.map(key => [key, Object.freeze({
    name: CATEGORIES[key].label, color: CATEGORIES[key].color.toUpperCase(), icon: CATEGORIES[key].icon,
  })])
));
const VALID_HEX = /^#[\da-fA-F]{6}$/;
const ICON_KEYS = new Set(ICON_OPTIONS.map(option => option.id));
export function normalizeColor(value, fallback) {
  return typeof value === 'string' && VALID_HEX.test(value) ? value.toUpperCase() : fallback;
}
export function normalizeCategoryStyles(input) {
  const rows = Array.isArray(input)
    ? Object.fromEntries(input.filter(row => row && KEYS.includes(row.category))
      .map(row => [row.category, row]))
    : (input && typeof input === 'object' ? input : {});
  return Object.fromEntries(KEYS.map(key => {
    const defaults = DEFAULT_CATEGORY_STYLES[key];
    const current = rows[key] ?? {};
    return [key, {
      name: typeof current.name === 'string' && current.name.trim() && current.name.trim().length <= 32 ? current.name.trim() : defaults.name,
      color: normalizeColor(current.color, defaults.color),
      icon: ICON_KEYS.has(current.icon) ? current.icon : defaults.icon,
    }];
  }));
}
export function applyCategoryStyles(input) {
  const styles = normalizeCategoryStyles(input);
  for (const key of KEYS) Object.assign(CATEGORIES[key], styles[key], {label:styles[key].name, short:styles[key].name});
  return styles;
}

