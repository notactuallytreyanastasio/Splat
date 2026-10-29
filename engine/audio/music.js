// Look-ahead step sequencer on the Sfx context. A song is tracks of step functions;
// each track has a gain that eases toward level(intensity), so moods crossfade
// instead of cutting. Songs switch on a bar line.
export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.songs = {};
    this.song = null; this.queued = null;
    this.intensity = 0;
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
      this.out.connect(this.sfx.master);
    }
    if (!this.song) { this.song = this.songs[name]; this.next = this.sfx.ctx.currentTime + 0.1; this.step = 0; this.start(); }
    else if (this.song !== this.songs[name]) this.queued = this.songs[name];
  }
  setVolume(v) { this.volume = v; if (this.out) this.out.gain.setTargetAtTime(v, this.sfx.ctx.currentTime, 0.2); }
  start() {
    clearInterval(this.timer);
    this.timer = setInterval(() => this.pump(), 25);
  }
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
      for (const [name, tr] of Object.entries(song.tracks)) {
        const g = this.trackGain(name), level = tr.level(this.intensity);
        g.gain.setTargetAtTime(level, this.next, 0.4);
        if (level > 0.01) tr.play(this.sfx, this.next, s, song.bars[bar], g, spb);
      }
      this.next += spb;
      this.step++;
    }
  }
}
