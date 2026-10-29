// The soundtrack. Three songs, written out as notes:
//
// garden  F major, 116 bpm. A music box: Alberti harp, a melody in 8-bar periods
//         (antecedent to a half cadence on C7, consequent to F), a reed countermelody,
//         a voice-led pad that only moves the voices that change. Form
//         intro A A2 B A3 C A tag (56 bars, about 2 minutes) then again from A, with a
//         bell doubling the tune on the second pass. B is a lament bass (D C Bb A G F)
//         that turns on a borrowed Bbm; C is a bridge through Bbm(maj7) and Abmaj7.
//         A locked room brings in drive bass, 16th harp and a campy disco kit.
// empress A minor, 132 bpm. Her motif is a dotted rising fifth that sighs onto the flat
//         sixth (A. A E | F. E C), over an Andalusian descent; E2 climbs through a
//         Neapolitan Bb to an E7 pedal. Harpsichord 16ths, brass lead, timpani.
//
// Heat (music.heat, the game's combat heat) crossfades both songs into the machine:
// Kraftwerk underneath (motorik kick 1, 3, and-of-3, clean snare, 16th pulse-wave
// sequencer, 8th-note octave bass, a formant robot voice at the peak) and Eno on top
// (a slow pad on the reverb, tape loops of prime lengths that never line up, soft piano
// loops). Past 0.72 the harmony itself jumps to a vamp in the relative minor; under
// 0.32 it dissolves back to the next garden section while the haze fades slower. Inside
// the vamp the layers rotate through four 8-bar phrases (ARR) and a square-wave hook
// carries the tune.
//
// Players, not a sequencer: garden notes are humanized (a few ms, a little velocity) and
// shaped by an arch over each 8-bar period; plucks darken as they ring (a bright wave
// layered over a dull one); flute and reed get vibrato on held notes; the pad chorus-beats.
// `node tools/score.mjs` renders every scene to WAV + spectrogram to check by ear.
// A song may carry `transpose` (semitones): the pond and the hive play the garden's and
// the Empress's scores in their own keys and tempos. Chords stay as written, so the kill
// song's fitting (killsong.js) still works; only the pitch that sounds moves.
let playing = null;
const N = n => 440 * Math.pow(2, (n + (playing?.song?.transpose ?? 0) - 69) / 12);
const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ramp = (x, a, b) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function midi(s) {
  const m = /^([A-G])([b#]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`music: bad note "${s}"`);
  return 12 * (+m[3] + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
// A chord: its bass note, its voicing (written out so consecutive chords voice-lead), and
// its root pitch class for fifths.
function ch(root, bass, voices) {
  return { name: root, b: midi(bass), v: voices.split(' ').map(midi), r: (midi(root + '4') % 12) };
}
// One bar of a line: "A5:6 G5:2 r:4 C5:4" (note:steps, r is a rest) -> 16 slots of {n, d}.
// A bar that does not add up to exactly 16 steps is a typo, so it throws.
function bar(str, steps = 16) {
  const slots = new Array(steps).fill(null);
  let at = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [nm, d] = tok.split(':'), dur = +d;
    if (!(dur > 0)) throw new Error(`music: bad duration in "${tok}"`);
    if (nm !== 'r') slots[at] = { n: midi(nm), d: dur };
    at += dur;
  }
  if (at !== steps) throw new Error(`music: bar "${str}" fills ${at} of ${steps} steps`);
  return slots;
}
const line = (...bars) => bars.map(b => bar(b));
// The pitch with class pc nearest to ref.
const near = (pc, ref) => { const n = ref - ((ref - pc) % 12 + 12) % 12; return ref - n > 6 ? n + 12 : n; };
// A loop note that would rub a semitone against the chord moves to the nearest chord tone.
export function fit(n, chord) {
  const pcs = [...chord.v, chord.b].map(x => x % 12);
  if (!pcs.some(q => { const d = (n - q + 12) % 12; return d === 1 || d === 11; })) return n;
  let best = n, bd = 99;
  for (const q of pcs) { const c = near(q, n), d = Math.abs(c - n); if (d < bd) { bd = d; best = c; } }
  return best;
}

// Timbres, as harmonic amplitudes for one PeriodicWave each.
const W = {
  box: [1, 0.12, 0.32, 0.05, 0.18, 0, 0.08],
  // The same instruments a moment later, once the upper partials have died: a bright wave
  // that decays fast over a dull one that rings on sounds like a pluck darkening, and
  // costs an oscillator instead of a swept filter.
  boxSoft: [1, 0.06, 0.07, 0.01],
  sine2: [1, 0.08],
  warm: [1, 0.35, 0.12, 0.06, 0.03],
  reed: [1, 0.05, 0.4, 0.03, 0.2, 0.02, 0.1],
  saw6: [1, 0.5, 0.33, 0.25, 0.2, 0.16],
  aah: [1, 0.6, 0.45, 0.2, 0.25, 0.1, 0.05, 0.08],
  harpsi: [1, 0.8, 0.6, 0.5, 0.45, 0.4, 0.3, 0.3, 0.2, 0.2],
  brass: [1, 0.7, 0.5, 0.35, 0.25, 0.18, 0.12, 0.08],
  organ: [1, 0.6, 0.3, 0.25, 0.1, 0.08],
  // 25% pulse: sin(n pi d) * 2 / (n pi), the Kraftwerk sequencer.
  pulse: Array.from({ length: 14 }, (_, i) => Math.sin((i + 1) * Math.PI * 0.25) * 2 / ((i + 1) * Math.PI)),
};
const wave = (m, k) => m.wave(k, W[k]);
// A drained world wobbles like tape; the machine is perfectly in tune.
const wob = (m, t, amount = 1) => 1 + (m.warp(t) - 1) * amount;

// ---------------------------------------------------------------- garden voices
const haze = m => 0.18 + 0.55 * ramp(m.heat, 0.2, 0.8); // the garden drowns in reverb as heat rises
// The garden is played by people: each note a few ms early or late and a little louder or
// softer. The machine is never humanized; that contrast is the point of it.
const late = () => (Math.random() - 0.5) * 0.014;
const touch = () => 0.9 + Math.random() * 0.2;
// Phrasing: an 8-bar period swells toward its high point (bar 5 to 6, where the tune
// reaches up) and relaxes into the cadence, so a repeat is not a photocopy.
const arch = (info, step) => 0.78 + 0.32 * Math.sin(Math.PI * Math.pow(((info.bar % 8) + step / 16) / 8, 1.3));

// A melody track: lines keyed by section name; sections without a line are silent.
const melody = (level, lines, voice, { send = haze, human = true, pan } = {}) => ({ level, send, pan, play(s, t, step, chord, out, spb, m, info) {
  const bars = lines[info.section];
  const ev = bars?.[info.bar % bars.length][step];
  if (ev) voice(s, human ? t + late() : t, ev.n, ev.d * spb, m, out, step, (human ? touch() : 1) * arch(info, step));
} });
// A comb tine: a bright pluck that darkens as it rings, plus the faint inharmonic ping of
// the tooth (about 5.9x, the first bending mode) that makes it a music box and not a sine.
const musicBox = (s, t, n, len, m, out, step, vel = 1) => {
  const f = N(n) * wob(m, t), v = 0.08 * vel * (step === 0 ? 1.12 : step % 4 === 0 ? 1 : 0.86);
  s.tone(t, { wave: wave(m, 'box'), f0: f, dur: 0.4, vol: v * 0.65, out });
  s.tone(t, { wave: wave(m, 'boxSoft'), f0: f, dur: 1.25, vol: v * 0.6, attack: 0.008, out });
  s.tone(t, { type: 'sine', f0: f * 5.93, dur: 0.14, vol: v * 0.16, out });
};
// Breath on the attack, a slow chorus, vibrato that blooms only on held notes.
const flute = (s, t, n, len, m, out, step, vel = 1) => {
  const f = N(n) * wob(m, t);
  s.tone(t, { wave: wave(m, 'warm'), f0: f, dur: len + 0.25, hold: Math.max(0, len - 0.12), attack: 0.07, vol: 0.036 * vel, detune: 5, vib: len > 0.4 ? [5.3, 16, 0.28] : null, out });
  s.noise(t, { dur: 0.09, vol: 0.006 * vel, f0: Math.min(9000, f * 3), q: 2, out });
};
const reed = (s, t, n, len, m, out, step, vel = 1) =>
  s.tone(t, { wave: wave(m, 'reed'), f0: N(n) * wob(m, t), dur: len + 0.3, hold: Math.max(0, len * 0.8 - 0.05), attack: 0.05, vol: 0.04 * vel, vib: len > 0.5 ? [4.7, 11, 0.32] : null, out });
// The filter opens with the breath and settles, so the brass speaks instead of buzzing.
const brass = (s, t, n, len, m, out, step, vel = 1) =>
  s.tone(t, { wave: wave(m, 'brass'), f0: N(n) * wob(m, t), dur: len + 0.15, hold: Math.max(0, len * 0.85 - 0.03), attack: 0.03, vol: 0.052 * vel * (step % 4 === 0 ? 1.1 : 0.9), vib: len > 0.45 ? [5.5, 12, 0.25] : null, out });

// Voice-led pad: on a chord change only the voices that move are struck; a common tone
// keeps ringing. Each new note is held exactly as long as the coming bars keep it.
const pad = (level, { wave: wv = 'warm', vol = 0.03, attack = 0.35, release = 0.8, octave = 0, send = haze, bus, ease, shimmer = 0, wobble = 1, detune = 7 } = {}) => ({
  level, send, bus, ease, until: {},
  play(s, t, step, chord, out, spb, m, info) {
    if (!chord || step % 4) return;
    const steps = info.steps;
    for (const v of chord.v) {
      const n = v + octave;
      if ((this.until[n] ?? 0) > t + 0.05) continue;
      let len = 0;
      for (let k = 0; k < 32; k += 4) {
        const c = m.chordAt(Math.floor((step + k) / steps), (step + k) % steps);
        if (!c || !c.v.includes(v)) break;
        len += 4;
      }
      if (!len) continue;
      const d = len * spb;
      this.until[n] = t + d;
      const f = N(n);
      s.tone(t, { wave: wave(m, wv), f0: f * wob(m, t, wobble), f1: f * wob(m, t + d, wobble), dur: d + release, hold: Math.max(0, d - attack), attack, vol, detune, out });
      if (shimmer && v === chord.v[chord.v.length - 1]) s.tone(t, { type: 'sine', f0: N(n + 12), dur: d + release, hold: Math.max(0, d - attack), attack: attack * 1.5, vol: vol * shimmer, out });
    }
  },
});
// Alberti figure (low, high, middle, high) on the music box, 8ths or 16ths.
const alberti = (level, every, { wv = 'box', soft = 'boxSoft', vol = 0.036, oct = 0, dur = 0.6, human = true, pan = -0.25 } = {}) => ({ level, send: haze, pan, play(s, t, step, chord, out, spb, m) {
  if (step % every) return;
  const v = chord.v, i = [0, 2, 1, 2][(step / every) % 4], n = v[Math.min(i, v.length - 1)] + oct;
  const at = t + (human ? late() * 0.6 : 0), f = N(n) * wob(m, t), vv = vol * (step % 8 === 0 ? 1.15 : 0.85) * (human ? touch() : 1);
  if (!soft) return s.tone(at, { wave: wave(m, wv), f0: f, dur, vol: vv, out });
  s.tone(at, { wave: wave(m, wv), f0: f, dur: dur * 0.35, vol: vv * 0.7, out });
  s.tone(at, { wave: wave(m, soft), f0: f, dur, vol: vv * 0.55, attack: 0.008, out });
} });
// Calm bass: the chord's bass on beat 1, the fifth (or the next bass) on beat 3.
const softBass = level => ({ level, send: haze, play(s, t, step, chord, out, spb, m) {
  if (step !== 0 && step !== 8) return;
  const n = step === 0 || chord !== m.chordAt(0, 0) ? chord.b : near((chord.r + 7) % 12, chord.b + 4);
  // Plucked, not held: a held sine-ish bass under every bar was the low-end mud.
  s.tone(t, { wave: wave(m, 'warm'), f0: N(n), dur: spb * 2.5, attack: 0.012, vol: 0.05, out });
  s.tone(t, { wave: wave(m, 'sine2'), f0: N(n), dur: spb * 7, hold: spb * 1.5, attack: 0.015, vol: 0.05, out });
} });
// Drive bass in 8ths: root, root, fifth, root, octave, root, fifth, root.
const driveBass = (level, { wv = 'saw6', vol = 0.075, pattern = [0, 0, 7, 0, 12, 0, 7, 0], bus } = {}) => ({ level, bus, play(s, t, step, chord, out, spb, m) {
  if (step % 2) return;
  const p = pattern[step / 2], n = p === 7 ? near((chord.r + 7) % 12, chord.b + 4) : chord.b + p;
  s.tone(t, { wave: wave(m, wv), f0: N(n), dur: spb * 1.7, attack: 0.004, vol: vol * (step % 4 ? 0.8 : 1), out });
} });
const kick = (level, steps, { bus, f0 = 130, vol = 0.3 } = {}) => ({ level, bus, play(s, t, step, ch, out) {
  if (steps.includes(step)) s.thump(t, { f0, f1: 45, dur: 0.17, vol, body: 0.35, out });
} });
const snare = (level, steps, { bus, f = 2000, vol = 0.16, dur = 0.12 } = {}) => ({ level, bus, play(s, t, step, ch, out) {
  if (!steps.includes(step)) return;
  s.noise(t, { dur, vol, f0: f, f1: f * 0.5, q: 0.9, out });
  s.tone(t, { type: 'triangle', f0: 210, f1: 160, dur: 0.06, vol: 0.07, out });
} });
// hats: {step: [vol, dur]}
const hats = (level, map, { bus } = {}) => ({ level, bus, play(s, t, step, ch, out) {
  const h = map[step];
  if (h) s.noise(t, { dur: h[1], vol: h[0], f0: 8500, type: 'highpass', out });
} });
// The clockwork in the box: soft ticks on the beat.
const tick = level => ({ level, play(s, t, step, ch, out) {
  if (step % 4 === 0) s.tone(t, { type: 'triangle', f0: step ? 2300 : 2700, dur: 0.025, vol: 0.022, out });
} });
// A high bell: on the first pass a twinkle of chord tones, on later passes it doubles the
// tune an octave up on the strong beats.
const bell = (level, lines) => ({ level, pan: 0.4, send: m => 0.4 + 0.4 * ramp(m.heat, 0.2, 0.8), play(s, t, step, chord, out, spb, m, info) {
  let n = null;
  if (info.pass % 2) { const ev = lines[info.section]?.[info.bar % 8]?.[step]; if (ev && step % 8 === 0) n = ev.n + 12; }
  else if (step === 0 || step === 10) n = chord.v[step ? 1 : chord.v.length - 1] + 24;
  if (n == null) return;
  // Struck metal: the hum plus an inharmonic partial (2.76x) that dies first.
  const f = N(n) * wob(m, t);
  s.tone(t, { type: 'sine', f0: f, dur: 1.6, vol: 0.03, out });
  s.tone(t, { type: 'sine', f0: f * 2.76, dur: 0.5, vol: 0.011, out });
} });

// ---------------------------------------------------------------- the machine (heat)
const K = { bus: 'clear' };
const onlyMachine = m => m.sec.machine;
// 16th sequencer, pulse wave, up through the chord and back, never late, never swung.
const SEQ = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 5, 4, 3, 2];
const kArp = level => ({ level, ...K, echo: 0.22, send: 0.12, filter: { f: 800, q: 6 }, play(s, t, step, chord, out, spb, m) {
  const ext = [...chord.v.map(x => x + 12), ...chord.v.map(x => x + 24)];
  const n = ext[SEQ[step] % ext.length];
  // The resonant filter is the Kraftwerk part: it opens as heat climbs and breathes over
  // eight bars. One filter for the track, moved every beat.
  if (step % 4 === 0) out.filter.frequency.setTargetAtTime(500 + 3800 * ramp(m.heat, 0.5, 1.2) * (0.6 + 0.4 * Math.sin(m.abs / 128 * Math.PI * 2)), t, spb * 2);
  s.tone(t, { wave: wave(m, 'pulse'), f0: N(n), dur: spb * 0.75, attack: 0.002, vol: step % 4 === 0 ? 0.055 : 0.042, out });
} });
// A second sequencer on a 6-step loop: it drifts across the 16-step bar (3 against 8).
const kSeq = level => ({ level, ...K, loop: 6, echo: 0.3, send: 0.3, play(s, t, step, chord, out, spb, m, info) {
  if (info.loop !== 0 && info.loop !== 3) return;
  const v = chord.v, n = (info.loop ? v[1] : v[v.length - 1]) + 24;
  s.tone(t, { type: 'triangle', f0: N(n), dur: 0.09, attack: 0.002, vol: 0.03, out });
} });
const kBass = level => ({ level, ...K, filter: { f: 900, q: 3 }, play(s, t, step, chord, out, spb, m) {
  if (step % 2) return;
  const p = [0, 0, 12, 0, 0, 12, 7, 12][step / 2], n = p === 7 ? near((chord.r + 7) % 12, chord.b + 4) : chord.b + p;
  s.tone(t, { wave: wave(m, 'saw6'), f0: N(n), dur: spb * 1.5, attack: 0.003, vol: 0.1, out });
} });
const kClave = level => ({ level, ...K, echo: 0.2, play(s, t, step, ch, out) {
  if (step === 3 || step === 6 || step === 14) s.tone(t, { type: 'square', f0: 2400, dur: 0.018, attack: 0.001, vol: 0.012, out });
} });
// Syndrum tom fill on the last beat of every fourth machine bar.
const kToms = level => ({ level, ...K, send: 0.3, play(s, t, step, ch, out, spb, m, info) {
  if (!onlyMachine(m) || info.bar % 4 !== 3 || step < 12) return;
  const f = [330, 270, 220, 170][step - 12];
  s.tone(t, { type: 'sine', f0: f, f1: f * 0.4, dur: 0.22, vol: 0.16, out });
} });
// Robot voice: a sawtooth through two formant bandpasses that glide between vowels.
const VOWEL = { o: [450, 800], a: [780, 1150], e: [420, 1900], u: [320, 700] };
function formant(s, t, f, dur, from, to, vol, out) {
  const ctx = s.ctx, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.015);
  g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  for (let k = 0; k < 2; k++) {
    const b = ctx.createBiquadFilter();
    b.type = 'bandpass'; b.Q.value = 9;
    b.frequency.setValueAtTime(VOWEL[from][k], t); b.frequency.linearRampToValueAtTime(VOWEL[to][k], t + dur * 0.6);
    o.connect(b).connect(g);
  }
  g.connect(out);
  o.start(t); o.stop(t + dur + 0.02);
}
const ROBOT = { 0: [3, 'u', 'o'], 3: [3, 'o', 'o'], 6: [6, 'a', 'e'] }; // "ro-bo-ter"
const kVox = level => ({ level, ...K, echo: 0.35, send: 0.3, play(s, t, step, chord, out, spb, m, info) {
  const syl = ROBOT[step];
  if (!syl || !onlyMachine(m) || info.bar % 2 !== 1) return;
  const f = N(near(chord.r, 50) + (step === 6 ? 7 : 12));
  formant(s, t, f, syl[0] * spb, syl[1], syl[2], 0.22, out);
} });
// The hook. Kraftwerk always has one: a plain square-wave tune of four-note cells that a
// person could whistle. The arrangement (ARR) keeps it out of the first eight bars, so
// the groove builds first.
const HOOK = {
  M: line('D5:4 F5:4 A5:6 G5:2', 'F5:4 E5:4 D5:8', 'D5:4 F5:4 Bb5:6 A5:2', 'F5:8 r:8',
    'G5:4 Bb5:4 D6:6 C6:2', 'Bb5:4 A5:4 G5:8', 'F5:4 A5:4 D6:4 C6:4', 'D6:6 C6:2 G5:8'),
  EM: line('A4:4 C5:4 E5:6 D5:2', 'C5:4 B4:4 A4:8', 'A4:4 C5:4 E5:6 G5:2', 'E5:8 r:8',
    'F5:4 A5:4 C6:6 A5:2', 'A5:4 G5:4 F5:8', 'E5:4 B4:4 D5:4 E5:4', 'A5:6 B5:2 E5:8'),
};
const kLead = level => ({ level, ...K, pan: 0.1, filter: { f: 2600, q: 2 }, echo: 0.32, send: 0.2, play(s, t, step, chord, out, spb, m, info) {
  if (!onlyMachine(m)) return;
  const ev = HOOK[info.section]?.[info.bar % 8]?.[step];
  if (!ev) return;
  const len = ev.d * spb, f = N(ev.n);
  s.tone(t, { type: 'square', f0: f, dur: len * 0.92, hold: len * 0.7, attack: 0.004, vol: 0.026, out });
  s.tone(t, { type: 'sine', f0: f * 2, dur: len * 0.6, attack: 0.004, vol: 0.006, out });
} });
const MOTORIK = { kick: [0, 8, 10], snare: [4, 12], hats: { 0: [0.03, 0.03], 2: [0.05, 0.08], 4: [0.03, 0.03], 6: [0.05, 0.08], 7: [0.018, 0.02], 8: [0.03, 0.03], 10: [0.05, 0.08], 12: [0.03, 0.03], 14: [0.05, 0.08], 15: [0.018, 0.02] } };

// Eno: a slow pad on the reverb and tape loops whose lengths are primes in steps
// (73, 89, 103, 131 voices; 41, 53, 67, 79 piano), so their coincidences never repeat.
const ENO = { bus: 'clear', ease: [1.5, 3.5] };
const tapeVoice = (level, loop, at, note, pan) => ({ level, ...ENO, loop, send: 0.9, echo: 0.15, play(s, t, step, chord, out, spb, m, info) {
  if (info.loop !== at || !chord) return;
  const n = fit(midi(note), chord), f = N(n);
  s.tone(t, { wave: wave(m, 'aah'), f0: f * wob(m, t, 0.4), f1: f * wob(m, t + 5, 0.4), dur: 6, hold: 2.2, attack: 1.6, vol: 0.05, pan, out });
} });
const tapePiano = (level, loop, at, notes, pan) => ({ level, ...ENO, loop, send: 0.85, echo: 0.35, play(s, t, step, chord, out, spb, m, info) {
  const i = (info.loop - at + loop) % loop;
  if (i % 3 || i / 3 >= notes.length || !chord) return; // a short figure, one note per 8th
  const n = fit(midi(notes[i / 3]), chord);
  s.tone(t, { wave: wave(m, 'box'), f0: N(n) * wob(m, t, 0.4), dur: 3.2, attack: 0.006, vol: 0.05, pan, out });
} });

// Inside the machine section the layers are arranged, not stacked: four 8-bar phrases
// that loop (32 bars, about a minute). Everything at once was a wall; Kraftwerk is
// sparse and Eno is space. Missing names play at 1. Outside the section (heat rising
// over the garden) every layer just follows heat.
//   groove  motorik drums, octave bass, the sequencer
//   hook    the tune arrives, clave and a little of the second sequencer
//   voice   the robot sings, the sequencers trade places, tom fills, the tape loops come up
//   drift   the kick and snare drop out: hook over hats, tape voices and piano loops
const ARR = [
  { k_lead: 0, k_seq: 0, k_vox: 0, k_clave: 0, k_toms: 0, e_v1: 0.4, e_v2: 0.4, e_v3: 0, e_v4: 0, e_p1: 0.3, e_p2: 0.3, e_p3: 0, e_p4: 0 },
  { k_seq: 0.5, k_vox: 0, k_toms: 0, e_v1: 0.6, e_v2: 0.6, e_v3: 0.4, e_v4: 0.4, e_p1: 0.5, e_p2: 0.5, e_p3: 0, e_p4: 0 },
  { k_lead: 0, k_arp: 0.45, k_clave: 0.6 },
  { k_kick: 0, k_snare: 0, k_toms: 0, k_vox: 0, k_hats: 0.45, k_bass: 0.55, k_arp: 0.7, k_clave: 0 },
];
const arranged = (name, base) => (i, c, heat, m) => base(i, c, heat, m) * (m.sec?.machine ? ARR[Math.floor(m.barsIn / 8) % ARR.length][name] ?? 1 : 1);

// The heat layers, shared by both songs (same names, so their gains carry across).
function machine(loops) {
  const h = (a, b, k = 1) => (i, c, heat) => ramp(heat, a, b) * k;
  const layers = {
    k_hats: hats(h(0.2, 0.55), MOTORIK.hats, K),
    k_kick: kick(h(0.3, 0.65), MOTORIK.kick, { ...K, f0: 120, vol: 0.3 }),
    k_snare: snare(h(0.35, 0.7), MOTORIK.snare, { ...K, f: 1700, dur: 0.09, vol: 0.13 }),
    k_clave: kClave(h(0.5, 0.9)),
    k_bass: kBass(h(0.45, 0.85)),
    k_arp: kArp(h(0.4, 0.8)),
    k_seq: kSeq(h(0.6, 1, 0.8)),
    k_toms: kToms(h(0.7, 1)),
    k_vox: kVox(h(0.9, 1.15)),
    k_lead: kLead(h(0.75, 1)),
    e_pad: pad(h(0.3, 1), { wave: 'aah', vol: 0.026, attack: 1.2, release: 2.2, send: 0.9, ...ENO, shimmer: 0.5, wobble: 0.4 }),
    e_v1: tapeVoice(h(0.45, 1.05), 73, 5, loops.voices[0], -0.6),
    e_v2: tapeVoice(h(0.45, 1.05), 89, 40, loops.voices[1], 0.5),
    e_v3: tapeVoice(h(0.5, 1.1), 103, 70, loops.voices[2], -0.2),
    e_v4: tapeVoice(h(0.5, 1.1), 131, 20, loops.voices[3], 0.7),
    e_p1: tapePiano(h(0.45, 1.05), 41, 9, loops.piano[0], 0.3),
    e_p2: tapePiano(h(0.45, 1.05), 53, 30, loops.piano[1], -0.4),
    e_p3: tapePiano(h(0.55, 1.1), 67, 2, loops.piano[2], 0.6),
    e_p4: tapePiano(h(0.55, 1.1), 79, 50, loops.piano[3], -0.7),
  };
  for (const [name, tr] of Object.entries(layers)) tr.level = arranged(name, tr.level);
  return layers;
}
// Into the machine past 0.72 heat; out again under 0.32, never after less than 2 bars.
const router = name => m => {
  const inM = m.section === name;
  return m.heat > 0.72 || (inM && (m.heat > 0.32 || m.barsIn < 2)) ? name : null;
};

// ---------------------------------------------------------------- garden
const F = ch('F', 'F2', 'A3 C4 F4'), Bbma7 = ch('Bb', 'Bb2', 'A3 D4 F4'), Gm7 = ch('G', 'G2', 'Bb3 D4 F4');
const C7 = ch('C', 'C3', 'Bb3 C4 E4'), Dm7 = ch('D', 'D2', 'A3 C4 F4'), Bb = ch('Bb', 'Bb2', 'Bb3 D4 F4');
const Dm = ch('D', 'D3', 'A3 D4 F4'), AmC = ch('A', 'C3', 'A3 C4 E4'), FA = ch('F', 'A2', 'A3 C4 F4');
const DmF = ch('D', 'F2', 'A3 D4 F4'), Bbm = ch('Bb', 'Bb2', 'Bb3 Db4 F4'), C7sus = ch('C', 'C3', 'Bb3 C4 F4');
const BbmMa7 = ch('Bb', 'Bb2', 'A3 Db4 F4'), Am7 = ch('A', 'A2', 'G3 C4 E4'), Dm7h = ch('D', 'D3', 'A3 C4 F4');
const Abma7 = ch('Ab', 'Ab2', 'Ab3 C4 Eb4'), C9sus = ch('C', 'C3', 'Bb3 D4 F4'), BbmF = ch('Bb', 'F2', 'Bb3 Db4 F4');
// The machine vamp in D minor (the relative minor, same key signature as the garden).
const Dm9 = ch('D', 'D2', 'F3 A3 C4 E4'), BbM = ch('Bb', 'Bb2', 'F3 A3 D4 F4'), Gm9 = ch('G', 'G2', 'F3 Bb3 D4 A4'), Csus2 = ch('C', 'C3', 'G3 C4 D4 G4');

const A_THEME = [
  'A5:6 G5:2 F5:4 C5:4', 'D5:4 F5:4 A5:6 Bb5:2', 'Bb5:6 A5:2 G5:4 D5:4', 'C5:4 E5:4 G5:8', // to the half cadence
  'A5:6 G5:2 F5:4 C5:4', 'D5:4 F5:4 A5:4 C6:4', 'D6:6 C6:2 Bb5:4 G5:4', // and home, reaching higher
];
// The second time through, the music box ornaments the tune (passing tones, a turn, the
// run up to F6 in bar 7) while the flute keeps the plain line underneath: heterophony,
// the way two players would really take a repeat.
const A_VARIED = [
  'A5:4 Bb5:2 G5:2 F5:2 E5:2 F5:2 C5:2', 'D5:2 E5:2 F5:4 A5:4 C6:2 Bb5:2', 'Bb5:4 A5:2 G5:2 F5:2 G5:2 D5:4', 'C5:2 D5:2 E5:2 G5:2 Bb5:4 G5:4',
  'A5:4 C6:2 A5:2 F5:4 C5:4', 'D5:2 F5:2 A5:2 D6:2 C6:4 A5:4', 'D6:4 F6:2 D6:2 C6:2 Bb5:2 G5:2 E5:2', 'F5:6 E5:2 F5:4 r:4',
];
const GARDEN_LEAD = {
  intro: line('r:16', 'r:16', 'r:16', 'r:12 C5:4'),
  A: line(...A_THEME, 'F5:8 r:4 C5:4'),
  A2: line(...A_VARIED),
  A3: line(...A_THEME, 'F5:8 A5:4 C6:4'),
  B: line('r:2 A4:2 D5:6 E5:2 F5:4', 'E5:8 C5:4 A4:4', 'r:2 F4:2 Bb4:6 C5:2 D5:4', 'C5:8 A4:8',
    'r:2 D5:2 G5:6 A5:2 Bb5:4', 'A5:8 F5:4 D5:4', 'F5:4 D5:4 Db5:6 C5:2', 'C5:6 r:2 E5:4 G5:2 Bb5:2'),
  C: line('D6:8 C6:4 A5:4', 'Db6:8 Bb5:4 F5:4', 'C6:4 G5:4 E5:8', 'F5:4 E5:4 D5:4 A4:4',
    'Bb5:8 A5:4 G5:4', 'C6:8 Bb5:4 G5:4', 'F5:8 G5:4 D5:4', 'E5:4 G5:4 Bb5:6 r:2'),
  tag: line('A5:6 G5:2 F5:8', 'Db5:8 C5:8', 'C5:4 F5:4 A5:8', 'r:16'),
};
const A_COUNTER = line('F4:8 A4:8', 'Bb4:8 A4:8', 'G4:8 F4:8', 'E4:8 G4:4 Bb4:4', 'A4:8 C5:8', 'C5:8 F4:8', 'F4:8 E4:8', 'F4:8 A4:8');
const GARDEN_COUNTER = {
  A2: A_COUNTER, A3: A_COUNTER,
  B: line('F4:8 A4:8', 'G4:8 E4:8', 'D4:8 F4:8', 'A4:8 F4:8', 'Bb4:8 D5:8', 'C5:8 A4:8', 'Bb4:8 G4:8', 'F4:8 E4:4 Bb4:4'),
};
const GARDEN_OFF = { lead: 0, flute: 0, counter: 0, pad: 0, arp8: 0, arp16: 0, bassSoft: 0, bassDrive: 0, kick: 0, snare: 0, hats: 0, tick: 0, bell: 0 };

// ---------------------------------------------------------------- empress
const Am = ch('A', 'A2', 'A3 C4 E4'), G_ = ch('G', 'G2', 'G3 B3 D4'), F_ = ch('F', 'F2', 'A3 C4 F4'), E_ = ch('E', 'E2', 'G#3 B3 E4');
const Dm_ = ch('D', 'D3', 'A3 D4 F4'), E7 = ch('E', 'E3', 'G#3 D4 E4');
const CE = ch('C', 'E2', 'G3 C4 E4'), DmL = ch('D', 'D2', 'A3 D4 F4'), BbN = ch('Bb', 'Bb2', 'Bb3 D4 F4'), E7L = ch('E', 'E2', 'G#3 D4 E4');
const Am9 = ch('A', 'A2', 'G3 B3 C4 E4'), Fma9 = ch('F', 'F2', 'G3 A3 C4 E4'), Dm9h = ch('D', 'D3', 'F3 A3 C4 E4'), Esus = ch('E', 'E2', 'A3 B3 D4 E4');
const E1_LEAD = line('A4:3 A4:1 E5:4 F5:3 E5:1 C5:4', 'B4:8 D5:3 C5:1 B4:4', 'C5:3 C5:1 A5:4 G5:3 F5:1 C5:4', 'B4:6 C5:2 B4:4 G#4:4',
  'A4:3 A4:1 E5:4 A5:4 C6:4', 'D6:6 C6:2 A5:4 F5:4', 'E5:4 G#5:4 B5:4 D6:4', 'C6:6 B5:2 A5:8');
const EMPRESS_LEAD = {
  E1: E1_LEAD, E1b: E1_LEAD,
  E2: line('F5:2 E5:2 D5:2 E5:2 F5:4 A5:4', 'E5:2 D5:2 C5:2 D5:2 E5:4 A4:4', 'F5:4 A5:4 C6:8', 'G5:4 E5:4 C5:4 E5:4',
    'A5:2 G5:2 F5:2 G5:2 A5:4 D6:4', 'D6:6 C6:2 Bb5:4 F5:4', 'E5:2 F5:2 G#5:4 B5:4 D6:4', 'E6:8 D6:2 B5:2 G#5:2 E5:2'),
};
const EMPRESS_COUNTER = { E1b: line('E4:8 A4:8', 'G4:16', 'A4:16', 'E4:16', 'C5:8 E5:8', 'A4:8 D5:8', 'B4:8 G#4:8', 'A4:8 E4:8') };
// Timpani on the downbeat every other bar, and a roll into the next section.
const timp = level => ({ level, send: haze, play(s, t, step, chord, out, spb, m, info) {
  const last = info.bar === m.sec.bars.length - 1;
  if (!(step === 0 && info.bar % 2 === 0) && !(last && step >= 12)) return;
  const n = near(chord.r, 40);
  s.thump(t, { f0: N(n) * 1.06, f1: N(n), dur: last && step ? 0.25 : 0.7, vol: last && step ? 0.09 + (step - 12) * 0.025 : 0.19, body: 0.3, out });
} });
// Choir: the top of the chord an octave up, sung for the whole bar.
const choir = level => ({ level, send: 0.7, play(s, t, step, chord, out, spb, m) {
  if (step !== 0) return;
  for (const v of chord.v.slice(-2)) s.tone(t, { wave: wave(m, 'aah'), f0: N(v + 12) * wob(m, t), dur: spb * 16 + 0.4, hold: spb * 12, attack: 0.4, vol: 0.03, out });
} });

export function defineMusic(m) {
  playing = m;
  const G = (i, c, h) => 1 - ramp(h, 0.35, 0.95);
  // A killing spree sings over the score (killsong.js): the tune steps back for it.
  const tune = (i, c, h, mm) => G(i, c, h) * (1 - 0.6 * (mm.spree ?? 0));
  const drive = i => ramp(i, 0.4, 0.9);

  m.define('garden', {
    bpm: 116, echo: 3, root: 65, scale: [0, 2, 4, 7, 9], // F major pentatonic, for the kills
    sections: {
      intro: { bars: [F, Bbma7, Gm7, C7], mix: { counter: 0, flute: 0, tick: 1 } },
      A: { bars: [F, Bbma7, Gm7, C7, F, Dm7, [Bb, C7], F], mix: { counter: 0, flute: 0.3, tick: 0.5 } },
      A2: { bars: [F, Bbma7, Gm7, C7, F, Dm7, [Bb, C7], F], mix: { flute: 0.2, tick: 0 } },
      B: { bars: [Dm, AmC, Bbma7, FA, Gm7, DmF, [Bb, Bbm], [C7sus, C7]], mix: { counter: 0.9, flute: 0.8, lead: 0.75, arp8: 0.7, tick: 0 } },
      A3: { bars: [F, Bbma7, Gm7, C7, F, Dm7, [Bb, C7], F], mix: { flute: 0.5, bell: 1, tick: 0 } },
      C: { bars: [Bbma7, BbmMa7, Am7, Dm7h, Gm7, Abma7, C9sus, C7], mix: { counter: 0, flute: 1, lead: 0.8, arp8: 0.45, tick: 1, bell: 0.6 } },
      tag: { bars: [F, [BbmF, F], F, F], mix: { counter: 0, flute: 0.6, tick: 1 } },
      M: { bars: [Dm9, Dm9, BbM, BbM, Gm9, Gm9, BbM, Csus2], machine: true, mix: GARDEN_OFF },
    },
    form: ['intro', 'A', 'A2', 'B', 'A3', 'C', 'A', 'tag'], loopTo: 1,
    route: router('M'),
    mix: { bell: 0.5 },
    tracks: {
      pad: pad((i, c, h) => (0.85 - 0.25 * i) * (1 - 0.6 * ramp(h, 0.3, 0.9))),
      lead: melody(tune, GARDEN_LEAD, musicBox, { pan: 0.12 }),
      flute: melody(tune, { ...GARDEN_LEAD, A2: line(...A_THEME, 'F5:8 r:8') }, flute, { pan: -0.22 }),
      counter: melody(G, GARDEN_COUNTER, reed, { pan: 0.3 }),
      bell: bell(tune, GARDEN_LEAD),
      arp8: alberti((i, c, h) => (1 - drive(i)) * 0.9 * G(i, c, h), 2),
      arp16: alberti((i, c, h) => drive(i) * 0.8 * (1 - ramp(h, 0.3, 0.6)), 1, { vol: 0.034, dur: 0.35, soft: null }), // too short to darken: one oscillator a note
      tick: tick((i, c, h) => (1 - ramp(i, 0.3, 0.7)) * G(i, c, h)),
      bassSoft: softBass((i, c, h) => (1 - drive(i)) * 0.8 * G(i, c, h)),
      bassDrive: driveBass((i, c, h) => drive(i) * (1 - ramp(h, 0.45, 0.85))),
      kick: kick((i, c, h) => ramp(i, 0.5, 0.9) * (1 - ramp(h, 0.22, 0.5)), [0, 6, 8]),
      snare: snare((i, c, h) => ramp(i, 0.5, 0.9) * (1 - ramp(h, 0.22, 0.5)), [4, 12]),
      hats: hats((i, c, h) => ramp(i, 0.5, 0.9) * (1 - ramp(h, 0.22, 0.5)), { 2: [0.05, 0.05], 6: [0.05, 0.05], 10: [0.05, 0.05], 14: [0.06, 0.1] }),
      ...machine({ voices: ['A4', 'C5', 'F4', 'D5'], piano: [['A5', 'C6'], ['F5'], ['C6', 'D6', 'A5'], ['G5']] }),
    },
  });

  const EG = (i, c, h) => 1 - ramp(h, 0.4, 0.95);
  m.define('empress', {
    bpm: 132, echo: 3, root: 69, scale: [0, 3, 5, 7, 10], voice: 'harpsi', // A minor pentatonic
    sections: {
      E1: { bars: [Am, G_, F_, E_, Am, Dm_, E7, Am], mix: { counter: 0, choir: 0 } },
      E2: { bars: [Dm_, Am, F_, CE, DmL, BbN, E7L, E7L], mix: { counter: 0, choir: 1 } },
      E1b: { bars: [Am, G_, F_, E_, Am, Dm_, E7, Am], mix: { choir: 0.5 } },
      EM: { bars: [Am9, Am9, Fma9, Fma9, Dm9h, Dm9h, Esus, Esus], machine: true, mix: { pad: 0, lead: 0, counter: 0, harpsi: 0, bassDrive: 0, kick: 0, snare: 0, hats: 0, timp: 0, choir: 0 } },
    },
    form: ['E1', 'E2', 'E1b', 'E2'],
    route: router('EM'),
    tracks: {
      pad: pad((i, c, h) => 0.75 * (1 - 0.5 * ramp(h, 0.3, 0.9)), { wave: 'organ', vol: 0.03, attack: 0.15 }),
      lead: melody((i, c, h, mm) => EG(i, c, h) * (1 - 0.5 * (mm.spree ?? 0)), EMPRESS_LEAD, brass),
      counter: melody(EG, EMPRESS_COUNTER, reed, { pan: 0.3 }),
      harpsi: alberti((i, c, h) => 0.75 * EG(i, c, h), 1, { wv: 'harpsi', soft: null, vol: 0.03, oct: 12, dur: 0.25, human: false, pan: -0.2 }),
      bassDrive: driveBass(EG, { pattern: [0, 0, 12, 0, 0, 0, 7, 12] }),
      kick: kick((i, c, h) => 1 - ramp(h, 0.3, 0.7), [0, 4, 8, 12], { vol: 0.24 }), // four on the floor: softer per hit than the garden's three
      snare: snare((i, c, h) => 0.9 * (1 - ramp(h, 0.22, 0.5)), [4, 12]),
      hats: hats((i, c, h) => 0.8 * (1 - ramp(h, 0.22, 0.5)), { 2: [0.05, 0.05], 6: [0.05, 0.05], 10: [0.05, 0.05], 14: [0.05, 0.05], 15: [0.03, 0.03] }),
      timp: timp(EG),
      choir: choir(EG),
      ...machine({ voices: ['A4', 'E5', 'C5', 'D5'], piano: [['E6', 'D6'], ['A5'], ['C6', 'B5', 'E5'], ['D6']] }),
    },
  });

  // The other stages: the same scores in other keys and tempos, the mix leaning elsewhere.
  // The pond is slower and a whole step down, bells over the tick; the hive is quicker and
  // a step up. Their bosses take the Empress's score the same way.
  const variant = (from, name, o) => m.define(name, { ...m.songs[from], ...o, mix: { ...m.songs[from].mix, ...o.mix } });
  variant('garden', 'pond', { bpm: 102, transpose: -2, mix: { bell: 0.95 } });
  variant('garden', 'hive', { bpm: 128, transpose: 2, mix: { bell: 0.3 } });
  variant('empress', 'koi', { bpm: 120, transpose: -3 });
  variant('empress', 'queen', { bpm: 142, transpose: 2 });

  const FC = ch('F', 'C3', 'A3 C4 F4');
  m.define('victory', {
    bpm: 100, root: 65, scale: [0, 2, 4, 7, 9],
    sections: {
      V: { bars: [F, Bb, [Gm7, C7], F, F, [Bb, Bbm], [FC, C7], F] },
    },
    form: ['V'],
    tracks: {
      pad: pad(() => 0.9),
      lead: melody(() => 1, { V: line('C5:2 F5:2 A5:4 C6:8', 'D6:6 C6:2 Bb5:4 F5:4', 'Bb5:4 A5:4 G5:4 E5:4', 'F5:8 A5:8',
        'A5:6 G5:2 F5:4 C5:4', 'D5:4 F5:4 F5:4 Db5:4', 'C5:4 A5:4 G5:4 E5:4', 'F5:16') }, musicBox),
      flute: melody(() => 0.6, { V: line('r:16', 'r:16', 'r:16', 'r:16', 'A4:8 C5:8', 'Bb4:8 Ab4:8', 'A4:8 Bb4:8', 'A4:16') }, flute),
      arp8: alberti(() => 0.8, 2),
      bassSoft: softBass(() => 0.7),
      tick: tick(() => 0.6),
    },
  });
}
