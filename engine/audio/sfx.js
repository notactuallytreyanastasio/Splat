// Procedural WebAudio. The game registers recipes; play() is safe before the first user
// gesture (it simply stays silent until the context can start).
//
// The mix:
//
//   voice gain (per play: trim x pile-up attenuation) -> sfx bus ----------\
//   music (engine/audio/music.js) -> music bus -> duck ---------------------> master
//   master (volume / mute) -> glue compressor -> limiter -> trim -> speakers
//
// Each recipe can carry mix settings (define's third argument):
//   db      level trim in dB, so every sound lands in its loudness window
//   voices  how many of this sound may ring at once; a new one steals the oldest
//   group   sounds in a group (gore) attenuate each other as they pile up
//   duck    [depth 0..1, hold s, release s]: pull the music down under this sound
export class Sfx {
  constructor() {
    this.recipes = {}; this.mix = {}; this.ctx = null; this.volume = 0.5; this.level = 1; this.last = {};
    this.voices = {}; this.groups = {}; this.offline = false;
  }
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try { this.attach(new AudioContext()); } catch { this.ctx = null; }
  }
  // Build the graph on any context (an OfflineAudioContext too: tools/mix.mjs meters it).
  attach(ctx) {
    this.ctx = ctx;
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Glue: a slow, gentle compressor so the music sits under the fight instead of beside it.
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20; glue.knee.value = 10; glue.ratio.value = 2.5;
    glue.attack.value = 0.012; glue.release.value = 0.25;
    // Limiter: hard and fast, so a pile of gore can get loud but never clip.
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -6; lim.knee.value = 0; lim.ratio.value = 20;
    lim.attack.value = 0.001; lim.release.value = 0.12;
    // Chrome's compressor adds its own make-up gain; this trims the chain back so the
    // limiter's ceiling lands under 0 dBFS (tools/mix.mjs: the 24-kill pile-up peaks there).
    this.out = ctx.createGain(); this.out.gain.value = 0.84;
    this.master.connect(glue).connect(lim).connect(this.out).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = this.level; // the sound-volume setting (pause menu)
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.55; // garden in a fight at about -30 dBFS short-term, 9 dB under a hit
    this.duckGain = ctx.createGain();
    this.musicBus.connect(this.duckGain).connect(this.master);
    this.duckLevel = 1; this.duckEnd = 0;
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  setLevel(v) { this.level = v; if (this.sfxBus) this.sfxBus.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  define(name, fn, mix) { this.recipes[name] = fn; if (mix) this.mix[name] = mix; }
  // `at` is only for offline rendering; the game always plays now.
  play(name, opts = {}, at) {
    if (!this.ctx || (this.ctx.state !== 'running' && !this.offline)) return;
    const recipe = this.recipes[name];
    if (!recipe) return;
    const now = at ?? this.ctx.currentTime;
    if (this.last[name] != null && now - this.last[name] < (opts.gap ?? 0.03) && now >= this.last[name]) return; // avoid stacking the same sound
    this.last[name] = now;
    const mix = this.mix[name] ?? {};
    // Voice limiting: drop the voices that have ended, steal the oldest past the cap.
    const list = (this.voices[name] ??= []);
    for (let i = list.length - 1; i >= 0; i--) if (list[i].end <= now) list.splice(i, 1);
    while (list.length >= (mix.voices ?? 4)) {
      const v = list.shift();
      v.g.gain.cancelScheduledValues(now);
      v.g.gain.setTargetAtTime(0, now, 0.008);
      v.end = now; // it no longer counts toward its group
    }
    // A pile-up of one group grows by about 3 dB per doubling of voices instead of 6 to 10:
    // a gore voice plays at 1/sqrt(1 + n), n being the gore voices from earlier events still
    // ringing. Voices started within 10 ms of each other are one event (a kill is a hit, a
    // squish and a squeak in the same frame) and do not duck each other, or every ordinary
    // kill would play its squish 3 dB and its squeak 5 dB under their measured level.
    let pile = 1;
    if (mix.group) {
      const gl = (this.groups[mix.group] ??= []);
      for (let i = gl.length - 1; i >= 0; i--) if (gl[i].end <= now) gl.splice(i, 1);
      let n = 0;
      for (const v of gl) if (now - v.t0 > 0.01) n++;
      pile = 1 / Math.sqrt(1 + n);
    }
    const g = this.ctx.createGain();
    g.gain.value = Math.pow(10, (mix.db ?? 0) / 20) * pile;
    g.connect(this.sfxBus);
    this.voice = g; this.voiceEnd = now;
    try { recipe(this, now, opts); } finally { this.voice = null; }
    const v = { g, t0: now, end: this.voiceEnd };
    list.push(v);
    if (mix.group) this.groups[mix.group].push(v);
    if (mix.duck) this.duck(...mix.duck, now);
  }
  // Side-chain style ducking: the music dips under a big moment and swells back. A deeper
  // duck wins over a shallower one already in progress; a second hit extends the hold.
  duck(depth = 0.5, hold = 0.15, release = 0.5, at) {
    if (!this.duckGain) return;
    const now = at ?? this.ctx.currentTime, g = this.duckGain.gain;
    let level = 1 - depth;
    if (now < this.duckEnd) level = Math.min(level, this.duckLevel);
    const end = Math.max(now + hold, now < this.duckEnd ? this.duckEnd : 0);
    if (g.cancelAndHoldAtTime) g.cancelAndHoldAtTime(now);
    else { g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); }
    g.setTargetAtTime(level, now, 0.012);
    g.setTargetAtTime(1, end, release / 4); // about 98% back after `release`
    this.duckLevel = level; this.duckEnd = end;
  }
  // Building blocks for recipes. Inside a recipe the default output is the voice's own
  // gain (so trims, voice stealing and pile-up attenuation apply); music passes `out`.
  // `wave` is a PeriodicWave (one oscillator for a whole timbre); `hold` sustains the peak
  // for that many seconds before the decay, so a pad swells and rings instead of plucking;
  // `pan` adds a stereo panner only when asked for.
  tone(t, { type = 'sine', wave = null, f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, attack = 0.005, hold = 0, pan = null, out = this.voice ?? this.sfxBus } = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (hold > 0) g.gain.setValueAtTime(vol, t + attack + hold);
    const end = Math.max(t + dur, t + attack + hold + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, end);
    let node = o.connect(g);
    if (pan != null && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(out);
    o.start(t); o.stop(end + 0.02);
    if (this.voice) this.voiceEnd = Math.max(this.voiceEnd, end + 0.02);
  }
  noise(t, { dur = 0.2, vol = 0.3, f0 = 2000, f1 = f0, q = 1, type = 'bandpass', out = this.voice ?? this.sfxBus } = {}) {
    const s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.5 + Math.random();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
    if (this.voice) this.voiceEnd = Math.max(this.voiceEnd, t + dur + 0.02);
  }
  // A sub-bass thump that a phone speaker can still hear. Phones roll off below about
  // 300 Hz, so a 70 Hz sine is silence there. The sine stays clean (headphones get the
  // same weight as before) and a quieter layer of harmonics 2 to 7, following the same
  // pitch drop but decaying faster, gives the ear a knock it reads as the missing
  // fundamental. No fundamental in that layer, so the low end does not thicken.
  thump(t, { f0 = 80, f1 = 40, dur = 0.2, vol = 0.3, body = 0.4, out = this.voice ?? this.sfxBus, ...rest } = {}) {
    this.tone(t, { type: 'sine', f0, f1, dur, vol, out, ...rest });
    if (!this.thumpWave) {
      const amps = [0, 0, 1, 0.75, 0.55, 0.4, 0.28, 0.18], re = new Float32Array(amps.length), im = new Float32Array(amps);
      this.thumpWave = this.ctx.createPeriodicWave(re, im);
    }
    this.tone(t, { wave: this.thumpWave, f0, f1, dur: dur * 0.7, vol: vol * body, out, ...rest });
  }
}
