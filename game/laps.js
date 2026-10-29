// Laps: a win is not the end of the run. "another lap" reloads the page (the game's only
// restart path) into the same garden with a new seed, tougher bugs and a new time of day,
// and the knight keeps their boons, level and potions.
//
// The lap number travels in the URL (?lap=2) so a co-op guest, a reload or a shared link all
// agree on it; the build travels in sessionStorage, tagged with the lap it was saved for, so
// it only comes back on the reload it was written for and never leaks into a fresh run.
import * as THREE from 'three';

// How much harder each lap is. Lap 1 is the game as tuned; these multiply on top of the
// existing per-room scaling (deeper rooms already hit harder).
export function lapMods(lap) {
  const k = Math.max(0, lap - 1);
  return {
    hp: 1 + 0.3 * k,                         // lap 2: x1.3, lap 3: x1.6
    dmg: 1 + 0.2 * k,                        // every enemy-sourced hit on a knight
    speed: Math.min(1.3, 1 + 0.07 * k),
    elite: 0.08 * k,                         // added to the elite roll
    waves: Math.min(2, k),                   // extra reinforcement waves per non-boss room
    boss: 1 + 0.25 * k,
  };
}

// The garden at a different hour. `floor` and `hedge` are [tint, amount, brightness]
// applied to the lap-1 colors, so each room keeps its own pastel identity, just shifted.
// Flowers and mushrooms are left alone on purpose: at night they glow against the floor.
const THEMES = [
  { key: 'noon', name: 'THE PASTEL GARDEN', sub: 'squish every pretty thing', sky: 0xffe9f6, hemi: [0xfff4fb, 0xd9c8ff, 1.6], sun: [0xffffff, 2.2] },
  { key: 'dusk', name: 'AFTER DARK', sub: 'the bugs got bigger. so did you.', sky: 0x2c2350,
    floor: [0x4a52b8, 0.5, 0.95], hedge: [0x24306e, 0.55, 0.95], hemi: [0xc9c2ff, 0x5a4a9a, 1.35], sun: [0xd2dcff, 2.0] },
  { key: 'frost', name: 'SUGAR FROST', sub: 'snow shows the blood better', sky: 0xd6ecff,
    floor: [0xe4f3ff, 0.65, 1.0], hedge: [0xf2fbff, 0.55, 1.02], hemi: [0xf4fbff, 0xb9d4ff, 1.65], sun: [0xf0f7ff, 2.1] },
  { key: 'harvest', name: 'HARVEST MOON', sub: 'everything is ripe for squishing', sky: 0xf2957a,
    floor: [0xffb26b, 0.38, 0.98], hedge: [0xe0603a, 0.62, 0.84], hemi: [0xffe6c8, 0xc98a76, 1.55], sun: [0xffd2a0, 2.2] },
];
// Lap 1 is noon; after that the three other hours take turns.
export function lapTheme(lap) { return lap <= 1 ? THEMES[0] : THEMES[1 + ((lap - 2) % 3)]; }

// A color function for the level builder: identity on lap 1.
export function shader(spec) {
  if (!spec) return hex => hex;
  const [tint, amt, mul] = spec, t = new THREE.Color(tint), c = new THREE.Color();
  return hex => { c.set(hex).lerp(t, amt).multiplyScalar(mul); return c.getHex(); };
}

// ------------------------------------------------------------ the run between reloads
const KEY = 'pgm.run';
export function loadRun(lap) {
  if (lap <= 1) return null;
  try { const r = JSON.parse(sessionStorage.getItem(KEY)); return r && r.lap === lap ? r : null; } catch { return null; }
}
export function saveRun(run) { try { sessionStorage.setItem(KEY, JSON.stringify(run)); } catch {} }
export function clearRun() { try { sessionStorage.removeItem(KEY); } catch {} }
