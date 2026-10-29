// Pause and settings. Solo, opening the menu stops the fixed-step loop dead (no steps,
// nothing banked) while the frame keeps rendering under a dim, and the band drops to a
// muffled murmur. Co-op cannot stop a world other people are fighting in, so the same
// menu opens over a live game and says so; your knight just stands still.
//
// Opens on Escape, P, the drawn HUD button, gamepad Start, and (solo) by itself when the
// tab is hidden or fullscreen is dropped, which is where Escape usually goes first.
import { icon } from './icons.js';
import { ICONS } from './tutorial.js';
import { loadSettings, saveSettings, quickStart, CHOICES, ZOOM, FLASH } from './settings.js';

const QUIPS = [
  'everybody freeze. yes, the blood too.',
  'the bugs are holding their breath',
  'a tiny moment of garden peace',
  'nobody move. especially the corpses.',
  'the confetti is waiting for you',
];
const LABELS = { shake: 'screen shake', flash: 'flashing &amp; noir', zoom: 'camera' };
const ICON_OF = { music: 'note', sound: 'speaker', shake: 'shake', flash: 'eye', zoom: 'zoom' };

export class Pause {
  constructor(game) {
    this.g = game;
    this.isOpen = false;
    this.s = loadSettings();
    this.solo = !game.net;
    const root = document.getElementById('hud');
    this.btn = document.createElement('button');
    this.btn.className = 'pausebtn';
    this.btn.type = 'button';
    this.btn.setAttribute('aria-label', 'pause');
    this.btn.innerHTML = icon('pause');
    this.btn.onclick = e => { e.stopPropagation(); this.toggle(); };
    root.appendChild(this.btn);
    this.el = document.createElement('div');
    this.el.className = 'pause';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'pause menu');
    this.el.innerHTML = this.html();
    root.appendChild(this.el);
    this.wire();
    this.apply();
    addEventListener('keydown', e => this.key(e));
    document.addEventListener('visibilitychange', () => this.visibility());
    document.addEventListener('fullscreenchange', () => {
      if (document.fullscreenElement) this.wasFull = true;
      else if (this.wasFull) { this.wasFull = false; if (this.solo) this.open(); }
    });
  }
  html() {
    const g = this.g, tut = !!g.tutorial, host = !g.guest;
    const act = (a, ic, label, cls = '') => `<button type="button" class="${cls}" data-a="${a}">${ic}<span>${label}</span></button>`;
    const slider = k => `<label class="row"><span class="lbl">${icon(ICON_OF[k])}${k}</span>
      <input type="range" min="0" max="100" step="5" data-k="${k}" aria-label="${k} volume"><output data-o="${k}"></output></label>`;
    const seg = k => `<div class="row"><span class="lbl">${icon(ICON_OF[k])}${LABELS[k]}</span>
      <div class="seg" data-k="${k}" role="radiogroup" aria-label="${LABELS[k].replace('&amp;', 'and')}">${CHOICES[k].map(v => `<button type="button" data-v="${v}" role="radio">${v}</button>`).join('')}</div></div>`;
    return `<div class="sheet">
      <div class="badge">${icon('pause')}</div>
      <h1>${this.solo ? 'PAUSED' : 'MENU'}</h1>
      <p class="sub">${this.solo ? (tut ? 'the lesson will wait' : QUIPS[0]) : '<b>co-op does not pause.</b> the garden keeps going while this is open.'}</p>
      <div class="cols">
        <div class="acts">
          ${act('resume', icon('play'), 'resume', 'go')}
          ${host ? act('restart', icon('restart'), tut ? 'restart lessons' : this.solo ? 'restart run' : 'restart run (everyone)') : ''}
          ${tut ? '' : act('howto', ICONS.howto, 'how to play')}
          ${act('title', icon('home'), this.solo ? 'back to title' : 'leave to title')}
        </div>
        <div class="settings">
          <h2>settings</h2>
          ${slider('music')}${slider('sound')}${seg('shake')}${seg('flash')}${seg('zoom')}
        </div>
      </div>
      <small class="hint">ESC or P to resume</small>
    </div>`;
  }
  wire() {
    const el = this.el, g = this.g;
    el.addEventListener('pointerdown', e => e.stopPropagation());
    el.onclick = e => { if (e.target === el) this.close(); }; // tap the dim to resume
    for (const b of el.querySelectorAll('[data-a]')) b.onclick = () => this.act(b.dataset.a);
    for (const r of el.querySelectorAll('input[type=range]')) {
      r.value = this.s[r.dataset.k];
      r.oninput = () => {
        this.set(r.dataset.k, +r.value);
        if (r.dataset.k === 'sound') g.sfx.play('squeak', { pitch: 0.7 + +r.value / 120, gap: 0.08 });
      };
    }
    for (const sg of el.querySelectorAll('.seg')) for (const b of sg.querySelectorAll('button')) b.onclick = () => { this.set(sg.dataset.k, b.dataset.v); g.sfx.play('pickup', { pitch: 1.3 }); };
  }
  set(k, v) { this.s[k] = v; saveSettings(this.s); this.apply(); }
  // Everything applies live, including under the menu: the zoom moves the frozen frame.
  apply() {
    const g = this.g, s = this.s, curve = v => Math.pow(v / 100, 1.6);
    g.sfx.setLevel(curve(s.sound));
    g.music.level = curve(s.music);
    if (g.sfx.ctx) g.music.setVolume();
    g.view.shakeScale = s.shake === 'on' ? 1 : 0;
    g.view.zoomScale = ZOOM[s.zoom];
    g.flashScale = FLASH[s.flash];
    document.body.style.setProperty('--fk', FLASH[s.flash]);
    document.body.classList.toggle('calmfx', FLASH[s.flash] < 1);
    for (const o of this.el.querySelectorAll('output')) o.textContent = s[o.dataset.o];
    for (const r of this.el.querySelectorAll('input[type=range]')) r.style.setProperty('--p', s[r.dataset.k] + '%');
    for (const sg of this.el.querySelectorAll('.seg')) for (const b of sg.querySelectorAll('button')) {
      const on = b.dataset.v === s[sg.dataset.k];
      b.classList.toggle('on', on); b.setAttribute('aria-checked', on);
    }
  }
  // Only a running fight pauses: not the title, not a tutorial card, not the end sheet.
  get allowed() {
    const g = this.g;
    return g.started && !g.bot && !g.tutorial?.modalEl && (g.state === 'play' || g.state === 'boon') && document.body.classList.contains('playing');
  }
  toggle() { if (this.isOpen) this.close(); else this.open(); }
  open() {
    if (this.isOpen || !this.allowed) return;
    const g = this.g;
    this.isOpen = true;
    if (this.solo) {
      g.loop.paused = true;
      g.music.duck = 0.4; if (g.sfx.ctx) g.music.setVolume();
    }
    g.touch.reset();
    this.el.querySelector('.sub').innerHTML = this.solo
      ? (g.tutorial ? 'the lesson will wait' : QUIPS[(this.opens = (this.opens ?? -1) + 1) % QUIPS.length])
      : '<b>co-op does not pause.</b> the garden keeps going while this is open.';
    this.el.querySelector('.hint').textContent = g.touch.active ? 'tap outside the card to resume' : navigator.getGamepads?.()[0] ? 'START or B to resume' : 'ESC or P to resume';
    this.el.classList.add('on');
    document.body.classList.add('paused');
    g.sfx.play('card');
    this.el.querySelector('[data-a=resume]').focus({ preventScroll: true });
  }
  close() {
    if (!this.isOpen) return;
    const g = this.g;
    this.isOpen = false;
    g.loop.paused = false;
    g.music.duck = 1; if (g.sfx.ctx) g.music.setVolume();
    // Presses made while the menu was up belong to the menu, not to the knight.
    g.input.pressed.clear();
    g.touch.reset();
    g._gpPrev = navigator.getGamepads?.()[0]?.buttons.map(b => b.pressed);
    this.el.classList.remove('on');
    document.body.classList.remove('paused');
    document.activeElement?.blur?.();
    g.sfx.play('pickup', { pitch: 0.8 });
  }
  act(a) {
    const g = this.g;
    g.sfx.play('pickup');
    if (a === 'resume') return this.close();
    if (a === 'restart') {
      if (g.tutorial) return location.reload();
      if (g.net) { this.close(); return g.fx('restart', { seed: (g.seed + 1) >>> 0 }); }
      quickStart(true);
      return g.restart(true);
    }
    // Co-op: the lessons open in a new tab, so reading them does not walk out of the room.
    if (a === 'howto') { if (g.net) window.open('?tutorial', '_blank', 'noopener'); else location.search = '?tutorial'; return; }
    if (a === 'title') { location.search = ''; }
  }
  key(e) {
    if (e.target?.matches?.('input[type=text], input:not([type])')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (e.repeat) return;
      if (this.isOpen || this.allowed) e.preventDefault();
      this.toggle();
      return;
    }
    if (!this.isOpen) return;
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') { e.preventDefault(); this.step(e.code === 'ArrowDown' ? 1 : -1); }
    else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement?.closest?.('.seg')) { e.preventDefault(); this.nudge(e.code === 'ArrowRight' ? 1 : -1); }
  }
  // Keyboard and gamepad focus walk: actions, then each slider, then each choice group
  // as a single stop (left/right picks inside it).
  stops() {
    return [...this.el.querySelectorAll('[data-a], input[type=range], .seg button.on')];
  }
  step(d) {
    const list = this.stops(), i = list.indexOf(document.activeElement);
    list[(i + d + list.length) % list.length]?.focus();
  }
  nudge(d) {
    const a = document.activeElement;
    if (a?.type === 'range') { a.value = Math.max(0, Math.min(100, +a.value + d * 5)); a.oninput(); return; }
    const sg = a?.closest?.('.seg');
    if (!sg) return;
    const opts = CHOICES[sg.dataset.k], i = opts.indexOf(this.s[sg.dataset.k]), v = opts[Math.max(0, Math.min(opts.length - 1, i + d))];
    this.set(sg.dataset.k, v);
    sg.querySelector(`[data-v="${v}"]`).focus();
  }
  // Polled every rendered frame (the sim, and so the game's own gamepad read, is stopped).
  poll() {
    // Co-op runs on under the menu, so the run can end there: get out of the end sheet's way.
    if (this.isOpen && !this.solo && !this.allowed) this.close();
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return;
    const b = gp.buttons.map(x => x.pressed), prev = this.gpPrev ?? b, tap = k => b[k] && !prev[k];
    this.gpPrev = b;
    if (tap(9)) return this.toggle();
    if (!this.isOpen) return;
    if (tap(1)) return this.close();
    const y = Math.abs(gp.axes[1]) > 0.6 ? Math.sign(gp.axes[1]) : 0, x = Math.abs(gp.axes[0]) > 0.6 ? Math.sign(gp.axes[0]) : 0;
    const now = performance.now(), held = (v, k) => v && (k !== this.gpStick || now - this.gpT > 260);
    if (tap(12) || tap(13)) this.step(tap(13) ? 1 : -1);
    else if (held(y, 'y' + y)) { this.step(y); this.gpStick = 'y' + y; this.gpT = now; }
    if (tap(14) || tap(15)) this.nudge(tap(15) ? 1 : -1);
    else if (held(x, 'x' + x)) { this.nudge(x); this.gpStick = 'x' + x; this.gpT = now; }
    if (!x && !y) this.gpStick = null;
    if (tap(0) && this.el.contains(document.activeElement)) document.activeElement.click();
  }
  // Solo: a hidden tab pauses and silences the band; coming back leaves the menu up, so
  // nobody is ambushed on their return.
  visibility() {
    const g = this.g;
    if (!this.solo || g.bot) return;
    if (document.hidden) { this.open(); g.sfx.ctx?.suspend?.(); }
    else g.sfx.ctx?.resume?.();
  }
}
