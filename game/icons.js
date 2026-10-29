// Hand-drawn boon icons: inline SVG in the house style (fat ink outline, pastel fills),
// so nothing on screen depends on the platform's emoji font.
const INK = '#3a2346';
const wrap = body => `<svg class="ico" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const BOON_ICONS = {
  // Stinger: a tapered blade with a candy handle.
  sharp: `<path d="M24 4 L30 28 L18 28 Z" fill="#fffbff"/><path d="M24 9 L26.5 25" stroke="#c8b2ff" stroke-width="2.5"/><rect x="14" y="28" width="20" height="6" rx="3" fill="#ff9ecb"/><rect x="20.5" y="34" width="7" height="10" rx="3" fill="#c8b2ff"/>`,
  // Wrapped sweet.
  sugar: `<path d="M13 24 L4 15 L5 33 Z" fill="#fff1a1"/><path d="M35 24 L44 15 L43 33 Z" fill="#fff1a1"/><circle cx="24" cy="24" r="11" fill="#ff9ecb"/><path d="M17 18 Q24 24 19 32 M25 14 Q31 22 27 34" stroke="#fffbff" stroke-width="3"/><circle cx="24" cy="24" r="11"/>`,
  // A kiss with a bead of blood.
  vamp: `<path d="M5 22 Q14 10 24 18 Q34 10 43 22 Q34 36 24 36 Q14 36 5 22 Z" fill="#ff5fa2"/><path d="M8 22 Q24 27 40 22" /><path d="M30 34 Q33 40 30 44 Q27 40 30 34 Z" fill="#d4002e"/>`,
  // Party popper.
  confetti: `<path d="M8 42 L18 16 L32 30 Z" fill="#c8b2ff"/><path d="M12 32 L22 36 M15 24 L27 30" stroke="#fffbff" stroke-width="2.5"/><circle cx="30" cy="10" r="3" fill="#ff9ecb"/><circle cx="40" cy="18" r="3" fill="#9ff0d4"/><circle cx="38" cy="7" r="2.5" fill="#fff1a1"/><path d="M24 12 Q26 6 22 3 M36 26 Q42 26 44 30"/>`,
  // Mallet.
  bonk: `<rect x="6" y="8" width="26" height="15" rx="5" fill="#ff9ecb" transform="rotate(-20 19 15)"/><path d="M9 10 L13 23" stroke="#fffbff" stroke-width="2.5" transform="rotate(-20 19 15)"/><path d="M24 20 L36 42" stroke-width="7"/><path d="M24 20 L36 42" stroke="#fff1a1" stroke-width="2.5"/>`,
  // Four-point sparkle.
  crit: `<path d="M24 3 Q27 21 45 24 Q27 27 24 45 Q21 27 3 24 Q21 21 24 3 Z" fill="#fff1a1"/><path d="M38 6 Q39 10 43 11 Q39 12 38 16 Q37 12 33 11 Q37 10 38 6 Z" fill="#fffbff" stroke-width="2.5"/>`,
  // Cupcake.
  frost: `<path d="M10 26 L14 44 L34 44 L38 26 Z" fill="#c8b2ff"/><path d="M19 28 L20 43 M29 28 L28 43" stroke-width="2.5"/><path d="M8 26 Q6 16 16 15 Q18 6 26 8 Q34 6 34 14 Q42 15 40 26 Z" fill="#fffbff"/><circle cx="25" cy="6" r="3.5" fill="#ff5fa2"/>`,
  // Cake slice with a candle.
  rage: `<path d="M5 26 L43 18 L43 40 L5 42 Z" fill="#fff1a1"/><path d="M5 26 L43 18 L43 25 L5 32 Z" fill="#ff9ecb"/><path d="M5 34 L43 31" stroke-width="2.5"/><rect x="21" y="8" width="5" height="13" rx="2" fill="#9ff0d4"/><path d="M23.5 1 Q28 5 23.5 8 Q19 5 23.5 1 Z" fill="#ff5fa2" stroke-width="2.5"/>`,
  // Five petals.
  long: `<g fill="#ffb0d6"><ellipse cx="24" cy="11" rx="6" ry="9"/><ellipse cx="24" cy="11" rx="6" ry="9" transform="rotate(72 24 24)"/><ellipse cx="24" cy="11" rx="6" ry="9" transform="rotate(144 24 24)"/><ellipse cx="24" cy="11" rx="6" ry="9" transform="rotate(216 24 24)"/><ellipse cx="24" cy="11" rx="6" ry="9" transform="rotate(288 24 24)"/></g><circle cx="24" cy="24" r="6" fill="#fff1a1"/>`,
  // Flying disc with speed lines.
  yeet: `<ellipse cx="28" cy="26" rx="17" ry="9" fill="#9ff0d4"/><ellipse cx="28" cy="24" rx="9" ry="4" fill="#fffbff" stroke-width="2.5"/><path d="M3 14 L13 14 M2 22 L9 22 M4 32 L11 32"/>`,
  // Honey pot.
  nectar: `<path d="M10 20 Q6 42 24 43 Q42 42 38 20 Z" fill="#ffc94d"/><rect x="11" y="12" width="26" height="9" rx="4" fill="#fff1a1"/><path d="M17 21 Q17 29 20 29 Q23 29 23 21" fill="#fffbff" stroke-width="2.5"/><path d="M16 32 L32 32" stroke-width="2.5"/>`,
  // A ball banking off a wall, twice.
  ricochet: `<rect x="37" y="4" width="8" height="40" rx="2" fill="#c8b2ff"/><path d="M5 40 L33 22 L12 8" stroke-dasharray="1 6"/><path d="M28 14 L33 22 L24 22" stroke-width="3"/><circle cx="11" cy="9" r="6" fill="#ff9ecb"/><path d="M33 22 L37 16 M33 22 L37 28" stroke="#fff1a1" stroke-width="2.5"/>`,
  // Round bomb dripping goo, fuse lit.
  sticky: `<circle cx="22" cy="28" r="15" fill="#ff5fa2"/><path d="M12 36 Q12 44 15 44 Q18 44 17 38" fill="#ff9ecb" stroke-width="3"/><ellipse cx="16" cy="22" rx="4" ry="2.5" fill="#fffbff" stroke="none"/><rect x="25" y="10" width="9" height="7" rx="2" fill="#c8b2ff" transform="rotate(35 29 13)"/><path d="M33 9 Q36 4 40 6"/><path d="M42 2 L43 7 L47 6 L43 9 L44 13 L41 10 L37 11 L40 8 Z" fill="#fff1a1" stroke-width="2"/>`,
  // A long, long arm ending in a grabby claw.
  longarms: `<path d="M3 38 Q18 38 26 22" stroke-width="10"/><path d="M3 38 Q18 38 26 22" stroke="#9ff0d4" stroke-width="4"/><circle cx="31" cy="15" r="8" fill="#9ff0d4"/><path d="M36 8 L42 3 M38 14 L45 12 M35 20 L41 24" stroke-width="4"/>`,
  // Bowling ball meeting a pin.
  bowling: `<path d="M38 4 Q43 4 42 12 Q40 16 42 22 Q45 32 40 44 L34 44 Q30 32 34 22 Q36 16 34 12 Q33 4 38 4 Z" fill="#fffbff"/><path d="M34.5 14 L41.5 14" stroke="#ff5fa2" stroke-width="3"/><circle cx="19" cy="29" r="15" fill="#c8b2ff"/><circle cx="14" cy="24" r="2.2" fill="${INK}" stroke="none"/><circle cx="20" cy="21" r="2.2" fill="${INK}" stroke="none"/><circle cx="17" cy="30" r="2.2" fill="${INK}" stroke="none"/>`,
};

export const icon = id => wrap(BOON_ICONS[id] ?? `<circle cx="24" cy="24" r="16" fill="#fff1a1"/>`);
