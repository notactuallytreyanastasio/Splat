// The soundtrack: a music box in a garden. Exploring is pad and arpeggio; a fight brings
// in bass and drums; the Empress gets her own faster minor-key tune.
const N = n => 440 * Math.pow(2, (n - 69) / 12);
const CH = { C: [60, 64, 67], Am: [57, 60, 64], F: [53, 57, 60], G: [55, 59, 62], Em: [52, 55, 59], Dm: [50, 53, 57], E: [52, 56, 59], Cm: [60, 63, 67], Fm: [53, 56, 60], Ab: [56, 60, 63], Bb: [58, 62, 65] };

const pad = level => ({ level, play(s, t, step, ch, out, spb, m) {
  if (step !== 0) return;
  for (const n of CH[ch]) s.tone(t, { type: 'triangle', f0: N(n) * m.warp(t), f1: N(n) * m.warp(t + spb * 15), dur: spb * 15, vol: 0.05, attack: 0.25, out });
} });
const bell = (level, pattern) => ({ level, play(s, t, step, ch, out, spb, m) {
  const i = pattern[step];
  if (i == null) return;
  const notes = CH[ch], n = notes[i % 3] + 12 * (1 + Math.floor(i / 3)), w = m.warp(t);
  s.tone(t, { type: 'sine', f0: N(n) * w, dur: 0.35, vol: 0.09, out });
  s.tone(t, { type: 'triangle', f0: N(n + 12) * w, dur: 0.12, vol: 0.025 * m.color, out });
} });
const bass = (level, pattern) => ({ level, play(s, t, step, ch, out, spb) {
  const i = pattern[step];
  if (i == null) return;
  const root = CH[ch][0] - 24 + (i === 1 ? 7 : 0);
  s.tone(t, { type: 'triangle', f0: N(root), dur: spb * 1.8, vol: 0.2, out });
  s.tone(t, { type: 'square', f0: N(root), dur: spb * 0.6, vol: 0.025, out });
} });
const kick = (level, steps) => ({ level, play(s, t, step, ch, out) { if (steps.includes(step)) s.tone(t, { type: 'sine', f0: 140, f1: 42, dur: 0.18, vol: 0.45, out }); } });
const snare = (level, steps) => ({ level, play(s, t, step, ch, out) { if (steps.includes(step)) { s.noise(t, { dur: 0.14, vol: 0.18, f0: 2200, f1: 900, q: 0.8, out }); s.tone(t, { type: 'triangle', f0: 220, f1: 160, dur: 0.06, vol: 0.08, out }); } } });
const hats = (level, every = 2) => ({ level, play(s, t, step, ch, out) { if (step % every === 0) s.noise(t, { dur: 0.035, vol: step % 4 === 2 ? 0.06 : 0.035, f0: 9000, type: 'highpass', out }); } });
const lead = (level, melody) => ({ level, play(s, t, step, ch, out, spb) {
  const bar = (lead.bar = step === 0 ? ((lead.bar ?? -1) + 1) : lead.bar ?? 0);
  const n = melody[(bar % (melody.length / 16)) * 16 + step];
  if (n == null) return;
  s.tone(t, { type: 'square', f0: N(n), dur: spb * 1.6, vol: 0.035, out });
  s.tone(t, { type: 'sine', f0: N(n), dur: spb * 2.2, vol: 0.06, out });
} });

// What creeps in as the garden goes grey: a low drone and a heartbeat.
const drone = level => ({ level, play(s, t, step, ch, out, spb) {
  if (step !== 0) return;
  const root = CH[ch][0] - 24;
  s.tone(t, { type: 'sawtooth', f0: N(root), f1: N(root) * 0.995, dur: spb * 16, vol: 0.03, attack: 0.6, out });
  s.tone(t, { type: 'sine', f0: N(root - 12), dur: spb * 16, vol: 0.08, attack: 0.4, out });
} });
const heartbeat = level => ({ level, play(s, t, step, ch, out) {
  if (step === 0 || step === 3) s.tone(t, { type: 'sine', f0: step ? 62 : 70, f1: 38, dur: 0.2, vol: step ? 0.22 : 0.32, out });
} });
const ARP = [0, null, 1, null, 2, null, 4, null, 3, null, 2, null, 1, null, 2, null];
const ARP_FAST = [0, 1, 2, 4, 3, 2, 1, 2, 0, 1, 2, 4, 5, 4, 3, 2];
const BASS = [0, null, null, 0, null, null, 1, null, 0, null, null, 0, null, 1, null, null];
const _ = null;
const BOSS_MELODY = [
  69, _, 72, _, 76, _, 74, 72, 71, _, 69, _, 68, _, _, _,
  65, _, 69, _, 72, _, 71, 69, 67, _, 64, _, 67, _, _, _,
  72, _, 71, 72, 74, _, 76, _, 79, _, 76, _, 74, _, 72, _,
  71, _, 68, _, 71, _, 74, _, 76, _, _, _, 75, 76, _, _,
];

export function defineMusic(m) {
  m.define('garden', {
    bpm: 104, bars: ['C', 'Am', 'F', 'G'], darkBars: ['Cm', 'Fm', 'Ab', 'G'],
    tracks: {
      pad: pad(() => 0.9),
      arp: bell((i, c) => (0.55 + i * 0.25) * (0.35 + 0.65 * c), ARP),
      sparkle: bell((i, c) => i * 0.55 * c * c, ARP_FAST),
      drone: drone((i, c) => Math.max(0, 0.75 - c) * 1.1),
      heartbeat: heartbeat((i, c) => Math.max(0, 0.6 - c) * (1.4 - i * 0.6)),
      bass: bass(i => i * 0.95, BASS),
      kick: kick(i => i > 0.5 ? i : 0, [0, 6, 8, 11]),
      snare: snare(i => i > 0.5 ? i * 0.9 : 0, [4, 12]),
      hats: hats(i => i * 0.8),
    },
  });
  m.define('empress', {
    bpm: 128, bars: ['Am', 'F', 'C', 'E'], darkBars: ['Am', 'Fm', 'Dm', 'E'],
    tracks: {
      drone: drone((i, c) => Math.max(0, 0.7 - c)),
      pad: pad(() => 0.8),
      arp: bell(() => 0.7, ARP_FAST),
      bass: bass(() => 1, [0, null, 0, null, 1, null, 0, null, 0, null, 0, null, 1, null, 1, null]),
      kick: kick(() => 1, [0, 4, 8, 10, 12]),
      snare: snare(() => 0.9, [4, 12]),
      hats: hats(() => 0.9, 1),
      lead: lead(i => 0.5 + i * 0.5, BOSS_MELODY),
    },
  });
  m.define('victory', {
    bpm: 96, bars: ['F', 'G', 'C', 'C'],
    tracks: { pad: pad(() => 1), arp: bell(() => 0.8, ARP_FAST), bass: bass(() => 0.5, BASS) },
  });
}
