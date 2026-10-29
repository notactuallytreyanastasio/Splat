// Hand-drawn UI icons: thick ink outline, pastel fills, nothing quite symmetrical.
// Every icon is a 64x64 inline SVG string, so the HUD never depends on a system emoji
// font (which renders differently on every OS and not at all on some Linux boxes).
// The ink width is inherited from the root <svg>, so CSS can thicken it for tiny sizes:
//   .roster .ic { stroke-width: 7 }
const INK = '#3a2346';
const C = {
  pink: '#ff9ecb', hot: '#ff5fa2', mint: '#9ff0d4', lilac: '#c8b2ff', lemon: '#fff1a1',
  peach: '#ffc3a0', sky: '#a6dcff', cream: '#fffbff', blood: '#ff3b6b', honey: '#ffcf6e',
};
const svg = body => `<svg class="ic" viewBox="0 0 64 64" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
// A white glint with no ink, drawn last.
const shine = (d, w = 3.5) => `<path d="${d}" stroke="#fff" stroke-width="${w}" opacity=".9"/>`;
const g = (t, body) => `<g transform="${t}">${body}</g>`;
// Four-point twinkle with concave sides.
const star4 = (x, y, r, fill, w) => {
  const k = r * 0.16;
  return `<path d="M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z" fill="${fill}"${w ? ` stroke-width="${w}"` : ''}/>`;
};
const heartPath = 'M32 55C14 44 7 33 8 23C9 13 23 9 32 21C40 9 55 12 56 23C57 33 50 44 32 55Z';

const DRAW = {
  // Boons, one per BOONS entry (keyed by its `icon` field).
  sharp: () => g('rotate(42 32 32)',
    `<path d="M32 3C37 13 38.5 24 37.5 38L26.5 38C25.5 24 27 13 32 3Z" fill="#eaf6ff"/>
     <path d="M32 11L32 33" stroke="${C.sky}" stroke-width="3"/>
     <rect x="17" y="37" width="30" height="7.5" rx="3.75" fill="${C.hot}"/>
     <rect x="28" y="44.5" width="8" height="11" rx="3" fill="${C.lilac}"/>
     <circle cx="32" cy="58.5" r="4" fill="${C.lemon}"/>`) +
    star4(50, 12, 8, C.lemon, 3),
  sugar: () => g('rotate(-16 32 32)',
    `<path d="M21 32L5 21C8 27 8 37 5 43Z" fill="${C.mint}"/>
     <path d="M43 32L59 21C56 27 56 37 59 43Z" fill="${C.mint}"/>
     <circle cx="32" cy="32" r="13" fill="${C.pink}"/>
     <path d="M24 24.5Q33 31 26 41.5M33 19.5Q43 28 37 44" stroke="#fff" stroke-width="3.5"/>`) +
    shine('M24 26Q26 22 30 21', 3),
  vamp: () =>
    `<path d="M7 33C13 22 21 17 27 20C29 21 31 23 32 24C33 23 35 21 37 20C43 17 51 22 57 33Q32 39 7 33Z" fill="#ff86bd"/>
     <path d="M7 33Q32 39 57 33C49 45 39 48 32 48C25 48 15 45 7 33Z" fill="${C.hot}"/>
     <path d="M22.5 35.3L26 46L30 36.2Z" fill="#fff" stroke-width="3"/>
     <path d="M34 36.2L38 46L41.5 35.3Z" fill="#fff" stroke-width="3"/>
     <path d="M45 45C43 51 43 56 46 56C49 56 49.5 51 47.5 44" fill="${C.blood}" stroke-width="3.5"/>` +
    shine('M19 41Q25 44.5 30 44.5') + shine('M17 27Q20 24 24 23.5', 3),
  confetti: () =>
    `<path d="M8 57L20 27L38 45Z" fill="${C.lemon}"/>
     <path d="M13.5 43.5L24 54M17 35L32.5 50.5" stroke="${C.hot}" stroke-width="4"/>
     <path d="M8 57L20 27L38 45Z"/>
     <circle cx="42" cy="16" r="4" fill="${C.mint}" stroke-width="3.5"/>
     <rect x="47" y="31" width="8" height="8" rx="2" transform="rotate(24 51 35)" fill="${C.lilac}" stroke-width="3.5"/>
     <path d="M28 14q3-6 7-2" stroke-width="3.5"/>
     <path d="M50 22q4-3 8 1" stroke-width="3.5"/>
     <path d="M37 27C35 31 35 34 37.5 34C40 34 40 31 38.5 26.5" fill="${C.blood}" stroke-width="3"/>` +
    star4(52, 9, 6, C.pink, 3) + star4(17, 15, 4, C.sky, 2.5),
  bonk: () => g('translate(35 36) scale(.84) translate(-32 -34) rotate(-32 32 34)',
    `<rect x="28.5" y="27" width="7" height="33" rx="3.5" fill="${C.peach}"/>
     <rect x="11" y="9" width="42" height="21" rx="7" fill="${C.pink}"/>
     <rect x="7" y="6" width="9" height="27" rx="4.5" fill="${C.lilac}"/>
     <rect x="48" y="6" width="9" height="27" rx="4.5" fill="${C.lilac}"/>` +
    shine('M20 22Q22 15 30 14')) +
    `<path d="M50 44L58 46M47 51L53 57M41 53L42 61" stroke-width="4"/>`,
  crit: () =>
    star4(30, 35, 24, C.lemon) + star4(51, 13, 10, C.pink, 3.5) + star4(12, 12, 6.5, C.mint, 3) + star4(53, 53, 5, C.sky, 3) +
    shine('M26 28Q28 25 29 20', 3),
  frost: () =>
    `<path d="M15 35L49 35L44.5 58L19.5 58Z" fill="${C.mint}"/>
     <path d="M25 38L26.5 55M32 38L32 55M39 38L37.5 55" stroke-width="3"/>
     <path d="M11 37C6 29 14 22 19 24C19 14 30 11 34 17C39 10 51 14 48 23C56 23 57 35 51 37Z" fill="${C.pink}"/>
     <path d="M21 31L25 29M31 26L34 28M40 31L44 29M27 20L30 18" stroke="${C.cream}" stroke-width="3.5"/>
     <path d="M35 13Q38 6 43 4" stroke-width="3.5"/>
     <circle cx="34" cy="12" r="5" fill="${C.hot}"/>` +
    shine('M31.5 10.5Q32.5 9 34 8.5', 2.5),
  rage: () =>
    `<rect x="8" y="28" width="48" height="32" rx="7" fill="${C.lilac}"/>
     <path d="M8 35Q8 28 15 28L49 28Q56 28 56 35Q52 41 47 35Q43 41.5 38 35Q33 41 27.5 35Q23 41.5 18 35Q13 41 8 35Z" fill="${C.cream}"/>
     <rect x="29" y="14" width="6" height="14" rx="2" fill="${C.sky}"/>
     <path d="M32 2C39 8 38 15 32 15C26 15 25.5 9 32 2Z" fill="#ffad7a"/>
     <path d="M32 8C34.5 11 34 13 32 13C30 13 29.5 11 32 8Z" fill="${C.lemon}" stroke-width="2.5"/>
     <path d="M17 43.5L27 47M47 43.5L37 47" stroke-width="4"/>
     <circle cx="23" cy="50.5" r="2.4" fill="${INK}" stroke-width="2"/><circle cx="41" cy="50.5" r="2.4" fill="${INK}" stroke-width="2"/>
     <path d="M26 56.5Q32 52.5 38 56.5" stroke-width="3.5"/>`,
  long: () => g('rotate(40 32 32)',
    `<path d="M32 2C38.5 14 38 32 32 41C26 32 25.5 14 32 2Z" fill="#ffd3ec"/>
     <path d="M32 9L32 34" stroke="${C.pink}" stroke-width="3"/>
     <rect x="29" y="48" width="6" height="13" rx="3" fill="${C.mint}"/>
     ${[0, 72, 144, 216, 288].map(a => `<circle cx="${(32 + Math.sin(a * Math.PI / 180) * 6.5).toFixed(1)}" cy="${(45 - Math.cos(a * Math.PI / 180) * 6.5).toFixed(1)}" r="5" fill="${C.pink}" stroke-width="3.5"/>`).join('')}
     <circle cx="32" cy="45" r="4" fill="${C.lemon}" stroke-width="3.5"/>` +
    shine('M30 12Q29 18 29 26', 2.5)),
  yeet: () => g('rotate(-14 36 34)',
    `<ellipse cx="37" cy="34" rx="22" ry="11" fill="${C.sky}"/>
     <ellipse cx="37" cy="32.5" rx="12" ry="5" fill="#dff2ff" stroke-width="3"/>
     <path d="M17 37Q37 47 57 37" stroke="#fff" stroke-width="3" opacity=".8"/>`) +
    `<path d="M3 22L12 24M2 33L9 33M4 44L13 41" stroke-width="4"/>` + star4(54, 12, 6, C.lemon, 3),
  nectar: () =>
    `<path d="M41 25L54 5" stroke-width="10"/><path d="M41 25L54 5" stroke="${C.peach}" stroke-width="3.5"/>
     <path d="M14 31C9 46 17 59 32 59C47 59 55 46 50 31Z" fill="${C.honey}"/>
     <rect x="11" y="23" width="42" height="10" rx="5" fill="${C.lemon}"/>
     <path d="M18 33L18 37Q20.5 41 23 37L23 33M40 33L40 39Q43 44 46 39L46 33" fill="${C.lemon}" stroke-width="3.5"/>
     <g transform="translate(20 34) scale(.38)"><path d="${heartPath}" fill="${C.hot}" stroke-width="9"/></g>` +
    shine('M16 42Q17 49 21 53'),

  // HUD and touch glyphs.
  // The projectile boons (drawn on a 48 grid, scaled onto the 64 one).
  ricochet: () => g('scale(1.3333)', `<g stroke-width="3.4"><rect x="37" y="4" width="8" height="40" rx="2" fill="#c8b2ff"/><path d="M5 40 L33 22 L12 8" stroke-dasharray="1 6"/><path d="M28 14 L33 22 L24 22" stroke-width="3"/><circle cx="11" cy="9" r="6" fill="#ff9ecb"/><path d="M33 22 L37 16 M33 22 L37 28" stroke="#fff1a1" stroke-width="2.5"/></g>`),
  sticky: () => g('scale(1.3333)', `<g stroke-width="3.4"><circle cx="22" cy="28" r="15" fill="#ff5fa2"/><path d="M12 36 Q12 44 15 44 Q18 44 17 38" fill="#ff9ecb" stroke-width="3"/><ellipse cx="16" cy="22" rx="4" ry="2.5" fill="#fffbff" stroke="none"/><rect x="25" y="10" width="9" height="7" rx="2" fill="#c8b2ff" transform="rotate(35 29 13)"/><path d="M33 9 Q36 4 40 6"/><path d="M42 2 L43 7 L47 6 L43 9 L44 13 L41 10 L37 11 L40 8 Z" fill="#fff1a1" stroke-width="2"/></g>`),
  longarms: () => g('scale(1.3333)', `<g stroke-width="3.4"><path d="M3 38 Q18 38 26 22" stroke-width="10"/><path d="M3 38 Q18 38 26 22" stroke="#9ff0d4" stroke-width="4"/><circle cx="31" cy="15" r="8" fill="#9ff0d4"/><path d="M36 8 L42 3 M38 14 L45 12 M35 20 L41 24" stroke-width="4"/></g>`),
  bowling: () => g('scale(1.3333)', `<g stroke-width="3.4"><path d="M38 4 Q43 4 42 12 Q40 16 42 22 Q45 32 40 44 L34 44 Q30 32 34 22 Q36 16 34 12 Q33 4 38 4 Z" fill="#fffbff"/><path d="M34.5 14 L41.5 14" stroke="#ff5fa2" stroke-width="3"/><circle cx="19" cy="29" r="15" fill="#c8b2ff"/><circle cx="14" cy="24" r="2.2" fill="${INK}" stroke="none"/><circle cx="20" cy="21" r="2.2" fill="${INK}" stroke="none"/><circle cx="17" cy="30" r="2.2" fill="${INK}" stroke="none"/></g>`),
  // Laps: a mint loop-the-loop arrow round a little pink pennant.
  lap: () =>
    `<path d="M45 17.5A20 20 0 1 0 52.5 31" stroke-width="12"/>
     <path d="M45 17.5A20 20 0 1 0 52.5 31" stroke="${C.mint}" stroke-width="5"/>
     <path d="M43 30L60 27.5L53 15Z" fill="${C.lemon}"/>
     <path d="M26 46L26 20" stroke-width="5"/>
     <path d="M26 21L41 26.5L26 32Z" fill="${C.hot}"/>
     <circle cx="26" cy="19" r="2.8" fill="${C.lemon}" stroke-width="3"/>` + shine('M14 30Q15 23 20 19', 2.5),
  heart: () => `<path d="${heartPath}" fill="#ff7eb6"/>` + shine('M15 22Q17 16 23 16.5'),
  gem: () =>
    `<path d="M13 24L22 11L42 11L51 24L32 55Z" fill="${C.lemon}"/>
     <path d="M13 24L51 24M22 11L27 24L32 55L37 24L42 11" stroke-width="3"/>` + shine('M19 22L24 15', 3),
  rainbow: () =>
    `<path d="M14 46A18 18 0 0 1 50 46" stroke-width="27" stroke-linecap="butt"/>
     ${[[27, C.hot], [22.5, C.lemon], [18, C.mint], [13.5, C.sky], [9, C.lilac]].map(([r, c]) => `<path d="M${32 - r} 46A${r} ${r} 0 0 1 ${32 + r} 46" stroke="${c}" stroke-width="4.8" stroke-linecap="butt"/>`).join('')}
     <path d="M2 50C1 44 7 41 10 43C11 38 19 38 20 43C25 42 27 49 22 51L5 52C3.5 52 2.2 51.5 2 50Z" fill="#fff"/>
     <path d="M42 51C38 49 40 43 44 44C45 39 53 39 54 44C58 43 63 46 61 51L45 52C43.5 52 42.5 51.6 42 51Z" fill="#fff"/>`,
  note: () =>
    `<path d="M25 46L25 15L52 8L52 39" stroke-width="5"/>
     <path d="M25 15L52 8L52 17L25 24Z" fill="${C.lilac}"/>
     <ellipse cx="18" cy="47" rx="8.5" ry="6.5" transform="rotate(-20 18 47)" fill="${C.pink}"/>
     <ellipse cx="45" cy="40" rx="8.5" ry="6.5" transform="rotate(-20 45 40)" fill="${C.pink}"/>`,
  speaker: () =>
    `<path d="M8 25L19 25L33 12L33 52L19 39L8 39Z" fill="${C.lemon}"/>
     <path d="M41 25Q46 32 41 39"/><path d="M48 19Q57 32 48 45"/>`,
  mute: () =>
    `<path d="M8 25L19 25L33 12L33 52L19 39L8 39Z" fill="#e6dcef"/>
     <path d="M42 24L56 40M56 24L42 40" stroke-width="10"/>
     <path d="M42 24L56 40M56 24L42 40" stroke="${C.hot}" stroke-width="4"/>`,
  ghost: () =>
    `<path d="M13 56L13 29C13 15 21 7 32 7C43 7 51 15 51 29L51 56L45 50L38.5 56L32 50L25.5 56L19 50Z" fill="#f4efff"/>
     <ellipse cx="25" cy="29" rx="3.5" ry="5" fill="${INK}" stroke-width="1"/><ellipse cx="39" cy="29" rx="3.5" ry="5" fill="${INK}" stroke-width="1"/>
     <ellipse cx="32" cy="41" rx="3" ry="3.5" fill="${C.pink}" stroke-width="3"/>`,
};

const CACHE = {};
// Unknown names throw: a missing icon must surface as a located error, not as a blank
// square or a stray emoji someone pasted into a data table.
export function icon(name) {
  if (CACHE[name]) return CACHE[name];
  const draw = DRAW[name];
  if (!draw) throw new Error(`icons.js: no icon named ${JSON.stringify(name)}`);
  return (CACHE[name] = svg(draw()));
}
export const ICON_NAMES = Object.keys(DRAW);
