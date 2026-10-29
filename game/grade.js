// End-of-run grade and personal bests. Pure scoring, so it can be checked from node.
//
// Four parts, each 0..1: how fast you won, how little you bled, the longest pinball chain,
// how many bugs you squished. Calibrated on the bot (skill 0.5, seeds 3 and 21): it wins in
// 112-122 s of game time, takes 88-202 damage, kills 72-80 and never chains past x2, which
// scores 71-81: an A. An S needs pinball chains the bot does not play for.
const lerp01 = (v, bad, good) => Math.max(0, Math.min(1, (v - bad) / (good - bad)));
export const GRADES = ['C', 'B', 'A', 'S'];

export function gradeRun(t, won) {
  const parts = {
    time: won ? lerp01(t.time, 420, 120) : 0,
    taken: lerp01(t.taken, 500, 50),
    chain: lerp01(t.maxChain, 1, 5),
    kills: lerp01(t.kills, 20, 85),
  };
  const score = Math.round(100 * (0.3 * parts.time + 0.3 * parts.taken + 0.2 * parts.chain + 0.2 * parts.kills));
  let grade = score >= 86 ? 'S' : score >= 64 ? 'A' : score >= 42 ? 'B' : 'C';
  // Dying caps you at B: an S is for finishing.
  if (!won && grade !== 'C') grade = GRADES[Math.min(GRADES.indexOf(grade), 1)];
  return { score, grade, parts };
}

const KEY = 'pgm.bests';
export function loadBests() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
// Returns which records this run broke; saves only when `save` (not for bot/debug runs).
export function recordBests(t, won, grade, save = true) {
  const old = loadBests(), next = { ...old }, broke = {};
  if (won && (old.time == null || t.time < old.time)) { next.time = t.time; broke.time = old.time != null; }
  if (old.grade == null || GRADES.indexOf(grade) > GRADES.indexOf(old.grade)) { next.grade = grade; broke.grade = old.grade != null; }
  if (t.maxChain > (old.chain ?? 0)) { next.chain = t.maxChain; broke.chain = old.chain != null; }
  next.runs = (old.runs ?? 0) + 1;
  if (save) try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  // A first-ever run sets records but does not brag about beating nothing.
  return { old, next, broke };
}
