// Look-ahead step sequencer on the Sfx context. A song is tracks of step functions;
// each track has a gain that eases toward level(intensity), so moods crossfade
// instead of cutting. Songs switch on a bar line.
export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.songs = {};
    this.song = null; this.queued = null;
    this.intensity = 0;
    this.color = 1;   // second knob, 1 bright .. 0 drained; songs decide what it means
    this.volume = 0.32;
    this.step = 0; this.next = 0;
    this.tracks = new Map();
    this.timer = null;
  }
  define(name, song) { this.songs[name] = song; }
  play(name) {
    if (!this.sfx.ctx) return;
    if (!this.out) {
      const ctx = this.sfx.ctx;
      this.out = ctx.createGain();
      this.out.gain.value = this.volume;
      // A tone filter on the whole band: wide open normally, an old record when muffled.
      this.tone = ctx.createBiquadFilter();
      this.tone.type = 'lowpass'; this.tone.frequency.value = 20000;
      this.out.connect(this.tone).connect(this.sfx.master);
    }
    if (!this.song) { this.song = this.songs[name]; this.next = this.sfx.ctx.currentTime + 0.1; this.step = 0; this.start(); }
    else if (this.song !== this.songs[name]) this.queued = this.songs[name];
  }
  setTone(hz) { if (this.tone) this.tone.frequency.setTargetAtTime(hz, this.sfx.ctx.currentTime, 0.15); }
  setVolume(v) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v, this.sfx.ctx.currentTime, 0.2); }
  start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 25);
  }
  // Tape warp: a slow pitch wobble that grows as the color drains.
  warp(t) { return 1 + (1 - this.color) * 0.018 * Math.sin(t * 2.3) + (1 - this.color) * 0.006 * Math.sin(t * 7.1); }
  stop() { clearInterval(this.timer); this.timer = null; this.song = null; }
  trackGain(name) {
    if (!this.tracks.has(name)) {
      const g = this.sfx.ctx.createGain();
      g.gain.value = 0;
      g.connect(this.out);
      this.tracks.set(name, g);
    }
    return this.tracks.get(name);
  }
  pump() {
    const ctx = this.sfx.ctx;
    if (!ctx || ctx.state !== 'running' || !this.song) return;
    // A tab that slept must not try to play the minutes it missed.
    if (this.next < ctx.currentTime - 0.2) this.next = ctx.currentTime + 0.05;
    while (this.next < ctx.currentTime + 0.12) {
      const song = this.song, spb = 60 / song.bpm / 4, steps = song.steps ?? 16;
      const bar = Math.floor(this.step / steps) % song.bars.length, s = this.step % steps;
      if (s === 0 && this.queued) { this.song = this.queued; this.queued = null; this.step = 0; continue; }
      // Darker harmony is chosen on the bar line so a chord never changes mid-bar.
      if (s === 0) this.dark = song.darkBars && this.color < 0.55;
      const chord = (this.dark ? song.darkBars : song.bars)[bar];
      for (const [name, tr] of Object.entries(song.tracks)) {
        const g = this.trackGain(name), level = tr.level(this.intensity, this.color);
        g.gain.setTargetAtTime(level, this.next, 0.4);
        if (level > 0.01) tr.play(this.sfx, this.next, s, chord, g, spb, this);
      }
      this.next += spb;
      this.step++;
    }
  }
}
