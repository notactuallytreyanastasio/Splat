// Fixed-step loop. Hitstop freezes the simulation while rendering continues, which is
// what makes a hit feel heavy. timeScale slows the sim (kill slow-mo); speed runs
// several sim steps per frame (fast-forward for bot playtests).
export class Loop {
  constructor({ step = 1 / 60, update, render }) {
    Object.assign(this, { step, update, render });
    this.acc = 0;
    this.last = 0;
    this.timeScale = 1;
    this.hitstop = 0;
    this.speed = 1;
    this.time = 0;
    this.frames = 0;
    this.running = false;
    this.paused = false;
  }
  start() {
    this.running = true;
    this.last = performance.now();
    const tick = now => {
      if (!this.running) return;
      // Clamp both ways: a backgrounded tab can hand rAF a timestamp older than the
      // start time, and an unclamped negative dt buries the accumulator for seconds.
      const dt = Math.max(0, Math.min((now - this.last) / 1000, 0.1)) * this.speed;
      this.last = now;
      // Paused: no sim steps at all and nothing banked for later, but keep drawing, so
      // the menu sits over a live (frozen) frame. render(0) holds every timer still.
      if (this.paused) { this.acc = 0; this.frames++; this.render(0); requestAnimationFrame(tick); return; }
      this.acc += dt;
      let steps = 0;
      const maxSteps = 8 * this.speed;
      while (this.acc >= this.step && steps < maxSteps) {
        this.acc -= this.step;
        steps++;
        if (this.hitstop > 0) { this.hitstop -= this.step; this.update(0, true); continue; }
        const d = this.step * this.timeScale;
        this.time += d;
        this.update(d, false);
      }
      if (steps >= maxSteps) this.acc = 0;
      this.frames++;
      this.render(dt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  stop() { this.running = false; }
  freeze(seconds) { this.hitstop = Math.max(this.hitstop, seconds); }
}
