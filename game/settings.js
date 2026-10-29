// Player settings: remembered per browser, applied live by the pause menu.
// A bad or missing entry falls back to its default one field at a time, so a stale
// localStorage blob from an older build can never put the game in a broken state.
const KEY = 'splat:settings';
export const DEFAULTS = { music: 80, sound: 80, shake: 'on', flash: 'full', zoom: 'normal' };
export const CHOICES = {
  shake: ['on', 'off'],
  flash: ['full', 'soft', 'calm'],
  zoom: ['near', 'normal', 'far'],
};
// Camera distance per zoom choice, and how much of the noir/flash punch each flash
// level keeps (soft and calm also slow the slide into noir, which is the real flash).
export const ZOOM = { near: 0.8, normal: 1, far: 1.22 };
export const FLASH = { full: 1, soft: 0.55, calm: 0.2 };

export function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch {}
  const s = { ...DEFAULTS };
  // Someone who asked their OS for less motion starts with calmer defaults.
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) Object.assign(s, { shake: 'off', flash: 'soft' }); } catch {}
  for (const k of ['music', 'sound']) if (Number.isFinite(saved[k])) s[k] = Math.max(0, Math.min(100, Math.round(saved[k])));
  for (const k in CHOICES) if (CHOICES[k].includes(saved[k])) s[k] = saved[k];
  return s;
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} }

// "restart run" skips the title screen once: a flag that lives for one navigation.
export function quickStart(set) {
  try {
    if (set) { sessionStorage.setItem('splat:go', '1'); return true; }
    const on = sessionStorage.getItem('splat:go') === '1';
    sessionStorage.removeItem('splat:go');
    return on;
  } catch { return false; }
}
