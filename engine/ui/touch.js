// Virtual twin-stick controls. The left half of the screen spawns a floating stick
// wherever the thumb lands; buttons are declared by the game and may double as an aim
// stick (drag away from the button while holding it). Nothing shows until the first
// touch, so mouse-and-keyboard players never see it.
export class TouchControls {
  constructor(root, buttons) {
    this.root = root;
    this.active = false;
    this.move = { x: 0, y: 0 };      // screen space, y up, length <= 1
    this.aim = null;                 // screen-space direction while an aim button is dragged
    this.held = new Set();
    this.tapped = new Set();
    this.stick = null;
    this.el = document.createElement('div');
    this.el.className = 'touch';
    this.el.innerHTML = `<div class="stick"><div class="knob"></div></div>` +
      buttons.map(b => `<button data-id="${b.id}" class="tb ${b.cls ?? ''}" style="${b.style ?? ''}"><span>${b.label}</span></button>`).join('');
    root.appendChild(this.el);
    this.stickEl = this.el.querySelector('.stick');
    this.knob = this.el.querySelector('.knob');
    this.buttons = new Map(buttons.map(b => [b.id, { ...b, el: this.el.querySelector(`[data-id="${b.id}"]`), pointer: null }]));
    const opts = { passive: false };
    addEventListener('pointerdown', e => this.down(e), opts);
    addEventListener('pointermove', e => this.moveEv(e), opts);
    addEventListener('pointerup', e => this.up(e), opts);
    addEventListener('pointercancel', e => this.up(e), opts);
    if (matchMedia('(pointer: coarse)').matches) this.show();
    TouchControls.noZoom();
  }
  // iOS Safari zooms on a quick second tap wherever touch-action is not 'none', and
  // pointer-event preventDefault does not stop it; cancelling the touchend does. Pinch
  // is blocked only while body.playing, so a menu zoom can still be undone.
  static noZoom() {
    if (TouchControls.zoomGuard) return;
    TouchControls.zoomGuard = true;
    let last = -Infinity; // 0 would swallow a tap in the first 350ms after page load
    document.addEventListener('touchend', e => {
      const now = performance.now();
      if (now - last < 350 && !e.target.closest?.('input, textarea')) e.preventDefault();
      last = now;
    }, { passive: false });
    document.addEventListener('dblclick', e => e.preventDefault(), { passive: false });
    for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, e => { if (document.body.classList.contains('playing')) e.preventDefault(); }, { passive: false });
    document.addEventListener('touchmove', e => { if (e.touches.length > 1 && document.body.classList.contains('playing')) e.preventDefault(); }, { passive: false });
  }
  show() { if (!this.active) { this.active = true; document.body.classList.add('touching'); } }
  down(e) {
    if (e.pointerType !== 'touch') return;
    this.show();
    const btn = e.target.closest?.('.tb');
    if (btn && this.el.contains(btn)) {
      e.preventDefault();
      const b = this.buttons.get(btn.dataset.id);
      b.pointer = e.pointerId; b.ox = e.clientX; b.oy = e.clientY;
      this.held.add(b.id); this.tapped.add(b.id);
      btn.classList.add('on');
      navigator.vibrate?.(8);
      return;
    }
    // Anything else on the left half grabs the move stick, unless it is real UI.
    if (e.target.closest?.('button, input, a, .boons, .end, .title')) return;
    if (e.clientX < innerWidth * 0.5 && !this.stick) {
      e.preventDefault();
      this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY };
      this.stickEl.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
      this.stickEl.classList.add('on');
      this.knob.style.transform = '';
    }
  }
  moveEv(e) {
    if (e.pointerType !== 'touch') return;
    const r = Math.min(innerWidth, innerHeight) * 0.11;
    if (this.stick?.id === e.pointerId) {
      e.preventDefault();
      let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
      const l = Math.hypot(dx, dy);
      // Drag past the rim and the stick follows the thumb, so it never runs out of room.
      if (l > r) { this.stick.ox += dx * (1 - r / l); this.stick.oy += dy * (1 - r / l); dx *= r / l; dy *= r / l; this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.min(1, l / r);
      this.move = l > 4 ? { x: (dx / (Math.hypot(dx, dy) || 1)) * m, y: (-dy / (Math.hypot(dx, dy) || 1)) * m } : { x: 0, y: 0 };
      return;
    }
    for (const b of this.buttons.values()) {
      if (b.pointer !== e.pointerId || !b.aims) continue;
      e.preventDefault();
      const dx = e.clientX - b.ox, dy = e.clientY - b.oy;
      if (Math.hypot(dx, dy) > 18) this.aim = { x: dx, y: -dy };
    }
  }
  up(e) {
    if (e.pointerType !== 'touch') return;
    if (this.stick?.id === e.pointerId) { this.stick = null; this.move = { x: 0, y: 0 }; this.stickEl.classList.remove('on'); }
    for (const b of this.buttons.values()) {
      if (b.pointer !== e.pointerId) continue;
      b.pointer = null; this.held.delete(b.id); b.el.classList.remove('on');
      if (b.aims) this.aim = null;
    }
  }
  setLabel(id, html, lit) { const b = this.buttons.get(id); if (!b) return; b.el.firstChild.innerHTML = html; b.el.classList.toggle('lit', !!lit); }
  endStep() { this.tapped.clear(); }
}
