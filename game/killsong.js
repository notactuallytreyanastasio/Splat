// The kills are the melody. Every bug that dies plays a note, quantized to the song's
// 16th grid, in its key, drawn from a bank of melodic contours; the longer a killing
// spree runs, the higher the notes climb. A blender pass through a crowd becomes a run
// up the scale instead of a pile of squishes.
//
// Taken from lumines_hd (src/shell/audio.ts, playClearRun and CLEAR_CONTOURS, MIT, same
// author), where every cleared block plays its own note. What changed for Splat:
// - kills arrive one at a time over seconds, not as a block count per sweep, so kills in
//   one frame make one run and a spree keeps one contour going (the register keeps
//   climbing across runs until 2.5 s of calm resets it, like the streak counter);
// - the scale is the current song's pentatonic and each note is checked against the
//   chord it lands under (a semitone rub moves to the nearest chord tone), because the
//   garden score changes chords where Lumines vamps on one;
// - the voice follows the score: a glass bell in the garden, a pulse blip with echo in
//   the machine, a harpsichord pluck for the Empress;
// - while a spree sings, the score's own tune steps back (music.spree, read by the songs).
import { fit } from './music.js';

const N = n => 440 * Math.pow(2, (n - 69) / 12);

// Scale-degree offsets for one motif; a long run repeats the motif lifted by `lift`
// degrees each cycle. `gap` is note spacing in 16ths. (CLEAR_CONTOURS from lumines_hd.)
const CONTOURS = [
  // rising runs
  [[0, 1, 2, 3], 4, 2], [[0, 1, 2, 3, 4], 5, 2], [[0, 0, 1, 2], 3, 2], [[0, 2, 3, 5], 3, 2], [[0, 1, 2], 3, 1],
  // descents, each wave lifted so they still trend up
  [[3, 2, 1, 0], 4, 2], [[5, 3, 2, 0], 3, 2], [[4, 3, 2, 1, 0], 4, 1], [[2, 1, 0], 2, 3], [[6, 4, 2, 0], 2, 2],
  // arches and valleys
  [[0, 2, 4, 2], 2, 2], [[0, 1, 3, 1], 2, 3], [[0, 3, 5, 3, 0], 2, 2], [[3, 1, 0, 1, 3], 2, 2], [[0, 2, 5, 2, 0], 3, 1], [[1, 3, 4, 3], 2, 2],
  // zigzags
  [[0, 2, 1, 3], 2, 2], [[0, 3, 1, 4], 2, 2], [[2, 0, 3, 1], 2, 2], [[0, 2, 1, 4, 3], 3, 1], [[1, 0, 2, 1, 3], 2, 2],
  // leaps and bounces
  [[0, 4, 2, 5], 1, 2], [[0, 4, 0, 5], 2, 2], [[0, 5, 2, 6], 1, 2], [[0, 3, 6, 3], 2, 2], [[4, 0, 5, 1], 2, 2], [[0, 6, 4, 2], 1, 3],
  // trills and ornaments
  [[0, 1, 0, 2], 3, 1], [[2, 3, 2, 3, 2], 2, 1], [[0, 1, 0, 1, 3], 3, 1], [[3, 2, 3, 5], 2, 2], [[1, 0, 1, 2, 1], 2, 1],
  // call and answer
  [[0, 2, 0, 4], 2, 2], [[0, 1, 4, 3], 2, 2], [[2, 4, 1, 3], 3, 2], [[0, 3, 2, 5, 4], 3, 2],
].map(([steps, lift, gap]) => ({ steps, lift, gap }));

const CALM = 2.5;      // seconds without a kill that end a spree
const AHEAD = 2.2;     // never schedule further ahead than this: a crowd gets a run, not a backlog
const TOP = 12;        // highest scale index (a pentatonic: two octaves and a bit)

export class KillSong {
  constructor(music) {
    this.music = music;
    this.pending = 0; this.accent = false;
    this.index = 0;          // notes sung this spree: the register
    this.n = 0;              // position in the current contour
    this.contour = null; this.last = -1;
    this.cursor = 0;         // audio time the last scheduled note sits at
    this.quiet = CALM;       // seconds since the last kill
    this.out = null;
  }
  kill(big = false) { this.pending++; this.accent ||= big; }
  update(dt) {
    const m = this.music;
    this.quiet += dt;
    if (this.quiet > CALM) { this.index = 0; this.contour = null; }
    // The score steps back while the spree sings, and comes back over a couple of seconds.
    m.spree = Math.max(0, (m.spree ?? 0) - dt * 0.5);
    if (!this.pending) return;
    const count = Math.min(this.pending, 10), accent = this.accent;
    this.pending = 0; this.accent = false; this.quiet = 0;
    if (!m.song || !m.sfx.ctx || m.sfx.ctx.state !== 'running' || !m.out) return;
    m.spree = 1;
    this.play(count, accent);
  }
  pick() {
    let i = Math.floor(Math.random() * CONTOURS.length);
    if (i === this.last) i = (i + 1) % CONTOURS.length;
    this.last = i; this.n = 0;
    return CONTOURS[i];
  }
  play(count, accent) {
    const m = this.music, ctx = m.sfx.ctx, spb = m.spb, scale = m.song.scale;
    if (!scale) throw new Error('killsong: the song has no scale');
    if (!this.out) {
      this.out = ctx.createGain();
      this.out.connect(m.tone);
      const v = ctx.createGain(); v.gain.value = 0.35; this.out.connect(v).connect(m.verb);
      this.echoSend = ctx.createGain(); this.echoSend.gain.value = 0; this.out.connect(this.echoSend).connect(m.echo);
    }
    const machine = !!m.sec?.machine;
    this.echoSend.gain.value = machine ? 0.4 : 0.1;
    this.contour ??= this.pick();
    // The first note goes on the next 8th; later notes follow the contour's spacing from
    // wherever the spree's last note fell, so a spree is one phrase, not many starts.
    const g = m.grid(2);
    let k = Math.max(g.k, Math.round((this.cursor - m.next) / spb) + this.contour.gap);
    for (let i = 0; i < count; i++) {
      const t = m.next + k * spb;
      if (t > ctx.currentTime + AHEAD) break;
      const c = this.contour, L = c.steps.length;
      const idx = Math.min(TOP, Math.max(0, Math.floor(this.index / 3) + c.steps[this.n % L] + Math.floor(this.n / L) * c.lift));
      const deg = idx % scale.length, oct = Math.floor(idx / scale.length);
      const chord = m.chordAhead(k);
      let n = m.song.root + scale[deg] + 12 * oct;
      if (chord) n = fit(n, chord);
      this.voice(t, n, accent && i === 0, machine);
      this.cursor = t;
      this.index++; this.n++;
      if (this.n >= L * 3) this.contour = this.pick(); // three cycles of one shape is enough
      k += this.contour.gap;
    }
  }
  voice(t, n, accent, machine) {
    const s = this.music.sfx, m = this.music, f = N(n), out = this.out, v = accent ? 1.35 : 1;
    if (machine) {
      s.tone(t, { wave: m.wave('kpulse', PULSE), f0: f, dur: 0.16, attack: 0.002, vol: 0.05 * v, out });
    } else if (m.song.voice === 'harpsi') {
      s.tone(t, { wave: m.wave('kharp', HARP), f0: f, dur: 0.5, attack: 0.002, vol: 0.05 * v, out });
      s.tone(t, { type: 'sine', f0: f * 2, dur: 0.25, vol: 0.015 * v, out });
    } else {
      // Glass bell: the hum, its octave dying fast, and on an accent the 12th on top.
      s.tone(t, { type: 'sine', f0: f, dur: 0.7, attack: 0.004, vol: 0.075 * v, out });
      s.tone(t, { type: 'sine', f0: f * 2, dur: 0.28, attack: 0.003, vol: 0.022 * v, out });
      if (accent) s.tone(t, { type: 'sine', f0: f * 3, dur: 0.4, vol: 0.02, out });
    }
  }
}
const PULSE = Array.from({ length: 10 }, (_, i) => Math.sin((i + 1) * Math.PI * 0.25) * 2 / ((i + 1) * Math.PI));
const HARP = [1, 0.8, 0.6, 0.5, 0.45, 0.4, 0.3, 0.3];
