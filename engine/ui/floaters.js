// Floating combat text anchored to world positions, drawn as DOM so it can use real type.
export class Floaters {
  constructor(view, root) {
    this.view = view;
    this.root = root;
    this.items = [];
  }
  spawn(text, x, y, z, { cls = '', life = 0.9, vy = 2.2, scale = 1 } = {}) {
    const el = document.createElement('div');
    el.className = 'floater ' + cls;
    el.textContent = text;
    el.style.setProperty('--s', scale);
    this.root.appendChild(el);
    this.items.push({ el, x, y, z, vy, life, max: life, dx: (Math.random() - 0.5) * 1.2 });
    if (this.items.length > 60) this.kill(0);
  }
  kill(i) { this.items[i].el.remove(); this.items.splice(i, 1); }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const f = this.items[i];
      f.life -= dt;
      if (f.life <= 0) { this.kill(i); continue; }
      f.y += f.vy * dt; f.vy -= 3 * dt; f.x += f.dx * dt;
      const s = this.view.worldToScreen(f.x, f.y, f.z), t = 1 - f.life / f.max;
      f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%,-50%) scale(calc(var(--s) * ${t < 0.15 ? 0.6 + t * 4 : 1.2 - t * 0.3}))`;
      f.el.style.opacity = f.life < 0.25 ? f.life / 0.25 : 1;
    }
  }
}
