// Keep the appearance and reminder controls in sync with the native SQLite store.
export const DEFAULT_PREFERENCES = Object.freeze({
  opacity: 97,
  reminders_enabled: false,
  cooldown_minutes: 15,
});
export function normalizePreferences(input = {}) {
  const rawOpacity = Number(input.opacity);
  const rawCooldown = Number(input.cooldown_minutes);
  return {
    opacity: Number.isInteger(rawOpacity) && rawOpacity >= 85 && rawOpacity <= 100
      ? rawOpacity : DEFAULT_PREFERENCES.opacity,
    reminders_enabled: typeof input.reminders_enabled === 'boolean'
      ? input.reminders_enabled : DEFAULT_PREFERENCES.reminders_enabled,
    cooldown_minutes: Number.isInteger(rawCooldown) && rawCooldown >= 5 && rawCooldown <= 180
      ? rawCooldown : DEFAULT_PREFERENCES.cooldown_minutes,
  };
}
export function opacityFraction(value) {
  return normalizePreferences({ opacity: value }).opacity / 100;
}
export function reminderFrequencyLabel(minutes) {
  const m = Number(minutes);
  return m >= 60 && m % 60 === 0 ? `${m / 60} ${m === 60 ? 'hour' : 'hours'}` : `${m} minutes`;
}

