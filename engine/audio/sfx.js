// Procedural WebAudio. The game registers recipes; play() is safe before the first user
// gesture (it simply stays silent until the context can start).
export class Sfx {
  constructor() { this.recipes = {}; this.ctx = null; this.volume = 0.5; this.last = {}; }
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp).connect(this.ctx.destination);
      this.noiseBuf = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }
  define(name, fn) { this.recipes[name] = fn; }
  play(name, opts = {}) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < (opts.gap ?? 0.03)) return; // avoid stacking the same sound
    this.last[name] = now;
    this.recipes[name]?.(this, now, opts);
  }
  // Building blocks for recipes.
  // `wave` is a PeriodicWave (one oscillator for a whole timbre); `hold` sustains the peak
  // for that many seconds before the decay, so a pad swells and rings instead of plucking;
  // `pan` adds a stereo panner only when asked for.
  tone(t, { type = 'sine', wave = null, f0 = 440, f1 = f0, dur = 0.15, vol = 0.3, attack = 0.005, hold = 0, pan = null, out = this.master } = {}) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    if (hold > 0) g.gain.setValueAtTime(vol, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, Math.max(t + dur, t + attack + hold + 0.05));
    let node = o.connect(g);
    if (pan != null && this.ctx.createStereoPanner) { const p = this.ctx.createStereoPanner(); p.pan.value = pan; node = node.connect(p); }
    node.connect(out);
    o.start(t); o.stop(Math.max(t + dur, t + attack + hold + 0.05) + 0.02);
  }
  noise(t, { dur = 0.2, vol = 0.3, f0 = 2000, f1 = f0, q = 1, type = 'bandpass', out = this.master } = {}) {
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
  }
}
