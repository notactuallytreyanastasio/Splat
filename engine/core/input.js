// Raw keyboard/mouse state. Presses are latched until a sim step consumes them, so a tap
// that lands between fixed steps is never lost.
export class Input {
  constructor(el) {
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, buttons: new Set(), inside: false };
    addEventListener('keydown', e => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.mouse.buttons.clear(); });
    el.addEventListener('mousemove', e => { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; });
    el.addEventListener('mousedown', e => { this.mouse.buttons.add(e.button); this.pressed.add('Mouse' + e.button); });
    addEventListener('mouseup', e => this.mouse.buttons.delete(e.button));
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  held(...codes) { return codes.some(c => this.down.has(c) || (c.startsWith('Mouse') && this.mouse.buttons.has(+c.slice(5)))); }
  tapped(...codes) { return codes.some(c => this.pressed.has(c)); }
  endStep() { this.pressed.clear(); }
}

// Every controller (human, bot, replay) produces this shape once per step.
export function emptyIntent() {
  return { moveX: 0, moveZ: 0, aimX: 0, aimZ: 1, attack: false, heavy: false, dodge: false, special: false, grab: false, potion: false, choose: -1 };
}
