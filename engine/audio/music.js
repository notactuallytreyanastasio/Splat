// Look-ahead step sequencer on the Sfx context. A song is tracks of step functions;
// each track has a gain that eases toward level(intensity, color, heat, music), so moods
// crossfade instead of cutting. Songs switch on a bar line.
//
// A song is either the old flat shape { bpm, bars, darkBars?, tracks } or an arranged one:
//   { bpm, sections: { A: { bars, mix?, bpm?, steps? }, ... }, form: ['A', 'B', ...],
//     loopTo?, route?(music), echo?, tracks }
// A bar is a chord or an array of chords that split the bar evenly. The form plays in
// order and loops back to `loopTo`; `route` is asked on every bar line and may return a
// section outside the form to jump to (it plays, looping, until route returns null, then
// the form resumes at its next section). `mix` scales track levels per section, so the
// arrangement changes by easing gains, never by cutting.
//
// Tracks: { level, play(sfx, t, step, chord, out, spb, music, info), loop?, bus?, send?,
//   echo?, ease? }. `loop` gives the track its own period in steps, counted from the
// moment music started and never reset, so loops of different lengths phase against
// each other and against the bar (info.loop). bus 'clear' skips the tone filter. `send`
// and `echo` (numbers or fn(music)) feed the shared reverb and tape echo. `ease` is the
// gain time constant in seconds, or [rise, fall].
const IR_SECONDS = 1.8;

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.songs = {};
    this.song = null; this.queued = null;
    this.intensity = 0;
    this.color = 1;   // second knob, 1 bright .. 0 drained; songs decide what it means
    this.heat = 0;    // third knob, 0 calm .. ~1.3 frenzy; songs decide what it means
    this.volume = 0.32;
    this.level = 1;   // the player's music-volume setting
    this.duck = 1;    // a temporary dip (the pause menu)
    this.step = 0; this.next = 0; this.abs = 0;
    this.bar = 0; this.barsIn = 0; this.pass = 0; this.fi = 0; this.section = null; this.sec = null;
    this.tracks = new Map();
    this.waves = {};
    this.info = {};
    this.timer = null;
  }
  define(name, song) {
    if (!song.sections) { song.sections = { main: { bars: song.bars, dark: song.darkBars } }; song.form = ['main']; }
    for (const f of song.form) if (!song.sections[f]) throw new Error(`music: song ${name} form names missing section ${f}`);
    this.songs[name] = song;
  }
  play(name) {
    if (!this.sfx.ctx) return;
    if (!this.songs[name]) throw new Error(`music: no song ${name}`);
    if (!this.out) this.build();
    if (!this.song) { this.next = this.sfx.ctx.currentTime + 0.1; this.begin(this.songs[name]); this.start(); }
    else if (this.song !== this.songs[name]) this.queued = this.songs[name];
    else this.queued = null;
  }
  build() {
    const ctx = this.sfx.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.volume * this.level * this.duck;
    this.out.connect(this.sfx.main ?? this.sfx.master);
    // A tone filter on most of the band: wide open normally, an old record when muffled.
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass'; this.tone.frequency.value = 20000;
    this.tone.connect(this.out);
    // One shared reverb. The impulse is generated noise with a darkening exponential tail:
    // 1.8 s is enough for a wash and keeps the convolver cheap on a phone.
    const sr = ctx.sampleRate, len = Math.floor(sr * IR_SECONDS), ir = ctx.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.85 - 0.7 * x);
        d[i] = lp * Math.exp(-x * 5.5) * Math.min(1, i / (sr * 0.015));
      }
    }
    this.verb = ctx.createGain();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 220;
    const conv = ctx.createConvolver(); conv.buffer = ir;
    const ret = ctx.createGain(); ret.gain.value = 0.9;
    this.verb.connect(hp).connect(conv).connect(ret).connect(this.out);
    // A tape echo: a delay with filtered feedback, its time set per song in steps.
    this.echo = ctx.createGain();
    this.delay = ctx.createDelay(2);
    const fb = ctx.createGain(); fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    const eret = ctx.createGain(); eret.gain.value = 0.6;
    this.echo.connect(this.delay).connect(lp).connect(fb).connect(this.delay);
    lp.connect(eret).connect(this.out);
  }
  setTone(hz) { if (this.tone) this.tone.frequency.setTargetAtTime(hz, this.sfx.ctx.currentTime, 0.15); }
  setVolume(v = this.volume) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v * this.level * this.duck, this.sfx.ctx.currentTime, 0.2); }
  start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 25);
  }
  // Tape warp: a slow pitch wobble that grows as the color drains.
  warp(t) { return 1 + (1 - this.color) * 0.018 * Math.sin(t * 2.3) + (1 - this.color) * 0.006 * Math.sin(t * 7.1); }
  stop() { clearInterval(this.timer); this.timer = null; this.song = null; this.queued = null; }
  // A cached PeriodicWave from harmonic amplitudes [h1, h2, ...]: one oscillator per note.
  wave(name, amps) {
    if (!this.waves[name]) {
      const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
      amps.forEach((a, i) => { im[i + 1] = a; });
      this.waves[name] = this.sfx.ctx.createPeriodicWave(re, im);
    }
    return this.waves[name];
  }
  trackGain(name, tr) {
    if (!this.tracks.has(name)) {
      const ctx = this.sfx.ctx, g = ctx.createGain();
      g.gain.value = 0; g._target = 0; g._est = 0;
      g.connect(tr.bus === 'clear' ? this.out : this.tone);
      if (tr.send != null) { g._send = ctx.createGain(); g._send.gain.value = 0; g.connect(g._send).connect(this.verb); }
      if (tr.echo != null) { g._echo = ctx.createGain(); g._echo.gain.value = 0; g.connect(g._echo).connect(this.echo); }
      this.tracks.set(name, g);
    }
    return this.tracks.get(name);
  }
  begin(song) {
    this.song = song; this.fi = 0; this.pass = 0;
    this.enter(song.form[0]);
    if (this.delay) this.delay.delayTime.setValueAtTime(60 / song.bpm / 4 * (song.echo ?? 3), this.next);
    // Tracks the new song does not have fade out instead of hanging at their old level.
    for (const [name, g] of this.tracks) if (!song.tracks[name] && (g._target > 0 || g._est > 0)) { g.gain.setTargetAtTime(0, this.next, 0.5); g._target = 0; g._est = 0; }
  }
  enter(name) { this.section = name; this.sec = this.song.sections[name]; this.bar = 0; this.barsIn = 0; this.step = 0; }
  advance() {
    const form = this.song.form;
    if (++this.fi >= form.length) { this.fi = this.song.loopTo ?? 0; this.pass++; }
    this.enter(form[this.fi]);
  }
  // Everything that may change on a bar line: song, section, harmony.
  barLine() {
    if (this.queued) { const q = this.queued; this.queued = null; this.begin(q); }
    else {
      const want = this.song.route?.(this) ?? null, inForm = this.song.form[this.fi] === this.section;
      if (want && want !== this.section) this.enter(want);
      else if (!want && !inForm) this.advance();
      else if (this.bar >= this.sec.bars.length) { if (inForm) this.advance(); else this.bar = 0; }
    }
    // Darker harmony is chosen on the bar line so a chord never changes mid-bar.
    this.dark = !!this.sec.dark && this.color < 0.55;
  }
  // The chord `bars` bars ahead of the current one at step `s`, within this section
  // (null past its end): lets a voice see how long a note will stay in the harmony.
  chordAt(bars, s) {
    const list = this.dark ? this.sec.dark : this.sec.bars, i = this.bar + bars;
    if (i >= list.length) return null;
    const b = list[i], steps = this.sec.steps ?? this.song.steps ?? 16;
    return Array.isArray(b) ? b[Math.min(b.length - 1, Math.floor(s * b.length / steps))] : b;
  }
  pump() {
    const ctx = this.sfx.ctx;
    if (!ctx || ctx.state !== 'running' || !this.song) return;
    // A tab that slept must not try to play the minutes it missed.
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.12) {
      if (this.step === 0) this.barLine();
      const song = this.song, sec = this.sec, steps = sec.steps ?? song.steps ?? 16;
      const spb = 60 / (sec.bpm ?? song.bpm) / 4, s = this.step;
      const chord = this.chordAt(0, s);
      const info = this.info;
      info.bar = this.bar; info.section = this.section; info.pass = this.pass; info.abs = this.abs; info.steps = steps;
      for (const name in song.tracks) {
        const tr = song.tracks[name], g = this.trackGain(name, tr);
        const level = tr.level(this.intensity, this.color, this.heat, this) * (sec.mix?.[name] ?? song.mix?.[name] ?? 1);
        const ease = tr.ease ?? 0.4, tau = Array.isArray(ease) ? ease[level > g._est ? 0 : 1] : ease;
        if (Math.abs(level - g._target) > 0.004) { g.gain.setTargetAtTime(level, this.next, tau); g._target = level; }
        g._est += (g._target - g._est) * (1 - Math.exp(-spb / tau));
        if (s === 0) {
          if (g._send) g._send.gain.setTargetAtTime(typeof tr.send === 'function' ? tr.send(this) : tr.send, this.next, 0.5);
          if (g._echo) g._echo.gain.setTargetAtTime(typeof tr.echo === 'function' ? tr.echo(this) : tr.echo, this.next, 0.5);
        }
        // Keep playing while the gain is still audible on its way down, so a fade is a fade.
        if (Math.max(level, g._est) > 0.01) { info.loop = tr.loop ? this.abs % tr.loop : s; tr.play(this.sfx, this.next, s, chord, g, spb, this, info); }
      }
      this.next += spb;
      this.abs++;
      if (++this.step >= steps) { this.step = 0; this.bar++; this.barsIn++; }
    }
  }
}
