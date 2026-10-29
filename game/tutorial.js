// "How to play": eight lessons on a small lawn, one card at a time. Each lesson spawns
// the bugs it needs and advances only when the player has really done the thing, read
// from the same signals the rest of the game uses: game.events hit/kill, telemetry
// counters and the player's own state. Solo only (main.js never pairs it with co-op).
import * as THREE from 'three';
import { Enemy } from './actors.js';

const INK = '#3a2346';
const r2 = v => Math.round(v * 100) / 100;

// ------------------------------------------------------------------ drawn icons
// House style: thick ink outline, pastel fills, round joins. No emoji anywhere.
const svg = (body, vb = '0 0 64 64') => `<svg viewBox="${vb}" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;
const arc = (d, color, w) => `<path d="${d}" stroke="${INK}" stroke-width="${w + 6}"/><path d="${d}" stroke="${color}" stroke-width="${w}"/>`;
const bug = (x, y, r, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})"><path d="M${x - r * 0.55} ${y - r * 0.8}a${r * 0.6} ${r * 0.6} 0 0 1 ${r * 1.1} 0" fill="${INK}"/><circle cx="${x}" cy="${y}" r="${r}" fill="#ff8fb8"/><path d="M${x} ${y - r}v${r * 2}" stroke-width="3"/><circle cx="${x - r * 0.45}" cy="${y + r * 0.1}" r="${r * 0.18}" fill="${INK}" stroke="none"/><circle cx="${x + r * 0.45}" cy="${y - r * 0.25}" r="${r * 0.18}" fill="${INK}" stroke="none"/><circle cx="${x + r * 0.4}" cy="${y + r * 0.45}" r="${r * 0.15}" fill="${INK}" stroke="none"/></g>`;
const star = (cx, cy, R, fill = '#fff1a1') => {
  let d = '';
  for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.45 : R, a = (i / 10) * Math.PI * 2 - Math.PI / 2; d += (i ? 'L' : 'M') + r2(cx + Math.cos(a) * r) + ' ' + r2(cy + Math.sin(a) * r); }
  return `<path d="${d}Z" fill="${fill}"/>`;
};
const rainbowBands = (cx, cy) => {
  const cols = ['#ff9ecb', '#ffc3a0', '#fff1a1', '#9ff0d4', '#a6dcff', '#c8b2ff'];
  const band = (r, c, w) => `<path d="M${cx - r} ${cy}A${r} ${r} 0 0 1 ${cx + r} ${cy}" stroke="${c}" stroke-width="${w}" stroke-linecap="butt"/>`;
  return band(18, INK, 24) + cols.map((c, i) => band(26.3 - i * 3.33, c, 3.5)).join('') +
    `<circle cx="${cx - 22}" cy="${cy + 2}" r="7" fill="#fff"/><circle cx="${cx - 14}" cy="${cy + 4}" r="6" fill="#fff"/><circle cx="${cx + 22}" cy="${cy + 2}" r="7" fill="#fff"/><circle cx="${cx + 14}" cy="${cy + 4}" r="6" fill="#fff"/>`;
};
export const ICONS = {
  move: svg(`<ellipse cx="32" cy="51" rx="25" ry="9" fill="#fff1a1"/><ellipse cx="32" cy="51" rx="12" ry="4" fill="#fff"/>${star(32, 25, 19)}<path d="M8 20l-4-3M56 20l4-3M12 8l-3-4M52 8l3-4" stroke-width="3.5"/>`),
  slash: svg(`<path d="M14 54A40 40 0 0 1 54 14" stroke="${INK}" stroke-width="16" stroke-linecap="butt"/>${['#ff9ecb', '#fff1a1', '#9ff0d4'].map((c, i) => { const r = 44.5 - i * 4.5; return `<path d="M${54 - r} 54A${r} ${r} 0 0 1 54 ${54 - r}" stroke="${c}" stroke-width="4.6" stroke-linecap="butt"/>`; }).join('')}<path d="M58 6l-3 12-24 24-9-9 24-24z" fill="#eaf6ff"/><path d="M17 31l16 16" stroke-width="7"/><path d="M17 31l16 16" stroke="#ff9ecb" stroke-width="2.5"/><path d="M22 42l-12 12" stroke-width="8"/><path d="M22 42l-12 12" stroke="#c8b2ff" stroke-width="3"/>`),
  combo: svg(`${arc('M4 38A13 13 0 0 1 16 25', '#ff9ecb', 4)}${arc('M14 50A20 20 0 0 1 33 27', '#ffc3a0', 6)}${arc('M28 60A30 30 0 0 1 58 24', '#fff1a1', 9)}${star(50, 13, 8, '#fff')}`),
  bonk: svg(`<path d="M2 36h6M1 45h6M4 54h6" stroke-width="3.5"/>${bug(21, 44, 13, 60)}${star(39, 28, 10)}${bug(51, 16, 10, -35)}`),
  // A cupped hand with the bug sitting in it: four equal fingertips along the rim (a lone
  // raised finger reads as a rude gesture at 46px) and two flick lines for the throw.
  grab: svg(`${bug(32, 24, 12)}<path d="M8 36q6-6 12 0q6-6 12 0q6-6 12 0q6-6 12 0c0 13-11 22-24 22S8 49 8 36z" fill="#ffc3a0"/><path d="M20 36v7M32 36v8M44 36v7" stroke-width="3"/><path d="M8 38c-5-1-7-7-5-12 5 0 8 4 9 9z" fill="#ffc3a0"/><path d="M50 10l6-6M55 18l7-2" stroke-width="3.5"/>`),
  parry: svg(`<path d="M30 8l20 7v15c0 13-9 22-20 26-11-4-20-13-20-26V15z" fill="#fff1a1"/><path d="M30 14v36M18 24h24" stroke="#ff9ecb" stroke-width="4"/><circle cx="55" cy="44" r="6" fill="#ffe066"/><path d="M50 6l3-4M57 12l4-2M58 22h5" stroke-width="3.5"/>`),
  roll: svg(`<ellipse cx="32" cy="56" rx="20" ry="5" fill="#d9c8ff"/><path d="M48 34A17 17 0 1 1 38 17" stroke="${INK}" stroke-width="12"/><path d="M48 34A17 17 0 1 1 38 17" stroke="#9ff0d4" stroke-width="5"/><path d="M33 7l15 9-12 10z" fill="#9ff0d4"/>`),
  blender: svg(rainbowBands(32, 44)),
  heart: svg(`<path d="M32 56C10 42 5 29 11 19c6-10 18-8 21 2 3-10 15-12 21-2 6 10 1 23-21 37z" fill="#ff8fbf"/><ellipse cx="20" cy="23" rx="5" ry="3" fill="#fff" stroke="none" transform="rotate(-30 20 23)"/>${star(54, 10, 6, '#fff')}${star(9, 46, 5, '#fff1a1')}`),
  ladybug: svg(`${bug(32, 34, 22)}<path d="M22 8c-2-4-6-4-8-2M42 8c2-4 6-4 8-2" stroke-width="3.5"/>`),
  check: svg(`<circle cx="32" cy="32" r="27" fill="#9ff0d4"/><path d="M19 33l9 9 17-20" stroke-width="7"/>`),
  howto: svg(`<path d="M8 10h48v32H30l-13 11V42H8z" fill="#fff1a1"/><path d="M26 21a6 6 0 1 1 9 5c-2 1-3 2-3 5" stroke-width="4.5"/><circle cx="32" cy="36.5" r="1.2" fill="${INK}"/>`),
};
const mouse = side => `<svg class="mouse" viewBox="0 0 22 30" aria-hidden="true" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"><rect x="2" y="2" width="18" height="26" rx="9" fill="#fff"/><path d="${side === 'l' ? 'M11 2a9 9 0 0 0-9 9v2h9z' : 'M11 2a9 9 0 0 1 9 9v2h-9z'}" fill="#ff9ecb"/><path d="M2 13h18M11 2v11"/></svg>`;
const K = k => `<kbd>${k}</kbd>`;
const C = (label, cls = '') => `<span class="chip ${cls}">${label}</span>`;
const RAINBOW_CHIP = C(svg(rainbowBands(32, 44), '4 14 56 36'), 'rage');

// ------------------------------------------------------------------ lessons
// need: how many times; got(t): progress since the lesson started; start/tick: staging.
const STEPS = [
  {
    title: 'Walk to the glowing star', icon: 'move', need: 1,
    kb: () => `${K('W')}${K('A')}${K('S')}${K('D')} to walk. Go stand in the glowing star.`,
    touch: () => 'Put a thumb down anywhere on the left half and drag to walk. Go stand in the glowing star.',
    start: t => { t.fitGoal(); t.showMarker(); },
    got: t => +(Math.hypot(t.game.player.x - t.goal.x, t.game.player.z - t.goal.z) < 1.1),
  },
  {
    title: 'Slash two ladybugs', icon: 'slash', need: 2,
    kb: () => `Aim with the mouse, ${mouse('l')} or ${K('J')} to slash. Hold it to keep swinging.`,
    touch: () => `Hold ${C('SLASH', 'slash')}. It aims at the nearest bug for you; drag it to aim yourself.`,
    start: t => { for (const s of [-1.3, 1.3]) t.spawn('ladybug', t.spot(4, s), { active: true }); },
    got: t => t.n.ladybugKills - t.base.ladybugKills,
  },
  {
    title: 'Land a combo finisher', icon: 'combo', need: 1,
    kb: () => `Keep swinging: ${mouse('l')}${mouse('l')}${mouse('l')}. Every third hit in a row is a finisher that sends bugs flying.`,
    touch: () => `Keep holding ${C('SLASH', 'slash')}. Every third hit in a row is a finisher that sends bugs flying.`,
    // A heavy, sleepy caterpillar: it barely slides, so all three swings connect.
    start: t => t.spawn('caterpillar', t.spot(2.4), { hp: 160, mass: 2.6 }),
    tick: t => { if (!t.alive().length) t.spawn('caterpillar', t.spot(2.4), { hp: 160, mass: 2.6 }); },
    got: t => t.n.finishers - t.base.finishers,
  },
  {
    title: 'Batter up', icon: 'bonk', need: 1,
    kb: () => `${mouse('r')} or ${K('K')} is a heavy swing. Bonk one bug into another: anything knocked fast enough is a projectile.`,
    touch: () => `${C('BONK')} is a heavy swing. Bonk one bug into another: anything knocked fast enough is a projectile.`,
    start: t => t.lineUp(),
    tick: t => { if (t.alive().length < 2) t.lineUp(); },
    got: t => t.n.bonks - t.base.bonks,
  },
  {
    title: 'Grab and throw', icon: 'grab', need: 1,
    kb: () => `${K('E')} picks up the bug in front of you. Aim, then ${mouse('l')} to throw it at something.`,
    touch: () => `${C('GRAB')} picks up the bug in front of you. Tap it again (it says ${C('THROW')}) to hurl it.`,
    start: t => t.spawn('ladybug', t.spot(1.8)),
    tick: t => { if (!t.alive().length && !t.game.player.holding) t.spawn('ladybug', t.spot(1.8)); },
    got: t => t.c.throws - t.base.throws,
  },
  {
    title: 'Parry the pollen', icon: 'parry', need: 1,
    kb: () => `The butterfly spits pollen. When the yellow ring closes on you, tap ${K('SHIFT')} to send it back.`,
    touch: () => `The butterfly spits pollen. When the yellow ring closes on you, tap ${C('PARRY', 'parry')} to send it back.`,
    start: t => t.spawn('butterfly', t.spot(5.5), { active: true, hp: 60 }),
    tick: (t, dt) => { if (!t.alive().length && (t.wait = (t.wait ?? 1.2) - dt) <= 0) { t.wait = null; t.spawn('butterfly', t.spot(5.5), { active: true, hp: 60 }); } },
    got: t => t.c.parries - t.base.parries,
  },
  {
    title: 'Roll twice', icon: 'roll', need: 2, keep: true,
    kb: () => `${K('SPACE')} rolls the way you walk. Nothing can hurt you mid-roll, and it cancels a swing.`,
    touch: () => `${C('ROLL')} rolls the way you walk. Nothing can hurt you mid-roll, and it cancels a swing.`,
    got: t => t.n.rolls - t.base.rolls,
  },
  {
    title: 'Rainbow blender', icon: 'blender', need: 1,
    kb: () => `Rage fills as you hurt things, fastest from throws and bonks. Here is a full tank: press ${K('Q')} and wade in.`,
    touch: () => `Rage fills as you hurt things, fastest from throws and bonks. Here is a full tank: tap ${RAINBOW_CHIP} and wade in.`,
    start: t => {
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; t.spawn(i % 2 ? 'ladybug' : 'grub', t.spot(2.8, 0, a)); }
      t.rageFill = true;
    },
    got: t => t.c.specials - t.base.specials,
    // Finish the spin before the cheer: the payoff is the blender, not the card.
    hold: t => t.game.player.state === 'whirl',
  },
];
const PRAISE = ['NICE!', 'GORGEOUS!', 'SO PRETTY!', 'DELICIOUS!', 'PERFECT!', 'YES!', 'LOVELY!'];

export class Tutorial {
  constructor(game, json) {
    this.game = game;
    const L = game.level, room = L.rooms[L.regionAt(Math.floor(L.start.x), Math.floor(L.start.z))];
    this.room = room;
    this.center = room.center;
    const g = json.marks?.goal ?? [room.center.x + 6, room.center.z];
    this.goal = { x: g[0], z: g[1] };
    this.mine = new Set();
    this.n = { ladybugKills: 0, finishers: 0, rolls: 0, bonks: 0 };
    this.heavyT = -9;
    this.i = -1; this.phase = 'intro';
    game.events.on('kill', ({ target }) => { if (this.mine.has(target) && target.type === 'ladybug') this.n.ladybugKills++; });
    game.events.on('hit', ({ target, info }) => {
      if (!(target instanceof Enemy)) return;
      const t = game.time;
      if (info.kind === 'finisher') this.n.finishers++;
      if (info.kind === 'heavy') target.tutHeavyT = t;
      // Batter up: an impact on a bug soon after a heavy swing, and not on the bug that was
      // swung at (the mover takes impact damage too). A finisher into a bug does not count.
      if (info.kind === 'impact' && t - this.heavyT < 2 && !(t - (target.tutHeavyT ?? -9) < 2)) this.n.bonks++;
    });
    document.body.classList.add('tutorial');
    this.root = document.getElementById('hud').appendChild(document.createElement('div'));
    this.root.className = 'tut';
    // Points at the star from the screen edge whenever the star is off screen.
    this.arrow = document.getElementById('hud').appendChild(document.createElement('div'));
    this.arrow.className = 'tut-arrow';
    this.arrow.innerHTML = svg(`<path d="M8 22h30V10l20 22-20 22V42H8z" fill="#fff1a1"/>`);
  }
  get c() { return this.game.telemetry.c; }

  // ---------------------------------------------------------------- cards
  intro(onStart) {
    const steps = STEPS.map(s => `<i title="${s.title}">${ICONS[s.icon]}</i>`).join('');
    this.modal(`<div class="badge">${ICONS.ladybug}</div><h1>HOW TO PLAY</h1>
      <p>Eight little lessons in pretty violence. The bugs here hit softly and you cannot pop.</p>
      <div class="lessons">${steps}</div>
      <div class="btns"><button class="go" type="button">let's squish</button></div>
      <button class="back" type="button">back to the title</button>`, {
      go: () => { this.closeModal(); onStart(); this.next(); },
      back: () => { location.search = ''; },
    });
  }
  modal(html, actions) {
    this.closeModal();
    const m = this.modalEl = document.createElement('div');
    m.className = 'tut-modal';
    m.innerHTML = `<div class="sheet">${html}</div>`;
    for (const [cls, fn] of Object.entries(actions)) m.querySelector('.' + cls).onclick = e => { e.stopPropagation(); fn(); };
    this.onKey = e => { if (e.code === 'Enter' || (e.code === 'Space' && this.phase === 'intro')) { e.preventDefault(); actions.go(); } };
    addEventListener('keydown', this.onKey);
    document.getElementById('hud').appendChild(m);
  }
  closeModal() { this.modalEl?.remove(); this.modalEl = null; if (this.onKey) removeEventListener('keydown', this.onKey); this.onKey = null; }
  renderCard() {
    const s = STEPS[this.i], touch = this.game.touch.active;
    this.touchMode = touch;
    this.root.innerHTML = `<div class="tut-card">
      <div class="tut-icon">${ICONS[s.icon]}</div>
      <div class="tut-text"><div class="kicker">lesson ${this.i + 1} of ${STEPS.length}</div><h3>${s.title}</h3><p>${touch ? s.touch() : s.kb()}</p></div>
      ${s.need > 1 ? `<div class="tut-count"><b>${Math.min(s.need, this.shown ?? 0)}</b>/${s.need}</div>` : ''}
      <div class="tut-check">${ICONS.check}</div>
      <div class="tut-pips">${STEPS.map((_, k) => `<i class="${k < this.i ? 'on' : k === this.i ? 'now' : ''}"></i>`).join('')}</div>
      <button class="tut-skip" type="button">skip tutorial</button></div>`;
    this.card = this.root.firstChild;
    this.card.querySelector('.tut-skip').onclick = e => { e.stopPropagation(); location.search = ''; };
  }
  next() {
    this.i++;
    if (this.i >= STEPS.length) return this.ready();
    const s = STEPS[this.i];
    if (!s.keep) this.clearBugs();
    this.base = { ...this.c, ...this.n };
    this.shown = 0;
    this.phase = 'step';
    this.renderCard();
    this.card.classList.add('in');
    this.game.fx('sx', { n: 'card' });
    s.start?.(this);
  }
  succeed() {
    const g = this.game, p = g.player;
    this.phase = 'done'; this.doneT = 1.3;
    this.card.classList.add('done');
    this.card.querySelector('.tut-pips .now')?.classList.add('on');
    this.confettiDom();
    g.fx('cf', { x: r2(p.x), y: 1.6, z: r2(p.z), n: 60, p: 7 });
    g.fx('sx', { n: 'sting' });
    g.fx('sh', { a: 0.12, k: 0.02 });
    // On a short screen the knight stands just under the card: stop the word below it.
    g.say(PRAISE[this.i % PRAISE.length], p.x, 2.7, p.z, { cls: 'pinball', scale: 1.25, life: 1.1, minY: Math.round(this.cardBottom() + 34) });
    this.hideMarker();
  }
  ready() {
    const g = this.game, p = g.player;
    this.phase = 'ready';
    this.root.innerHTML = '';
    this.clearBugs();
    document.body.classList.remove('playing');
    for (let k = 0; k < 3; k++) setTimeout(() => g.fx('cf', { x: r2(p.x + (k - 1) * 1.5), y: 2, z: r2(p.z), n: 70, p: 8 }), k * 180);
    g.fx('sx', { n: 'levelup' });
    this.modal(`<div class="badge">${ICONS.heart}</div><h1>YOU'RE READY</h1>
      <p>Anything you hit hard enough becomes a projectile. So do the bodies. Go make a mess.</p>
      <div class="btns"><button class="go" type="button">start a real run</button><button class="again" type="button">practice again</button></div>`, {
      go: () => { location.search = ''; },
      again: () => { location.reload(); },
    });
    this.modalEl.classList.add('win');
  }
  // Paper confetti bursting out of the card itself, so the HUD celebrates too.
  confettiDom() {
    const box = this.card, cols = ['#ff9ecb', '#ffc3a0', '#fff1a1', '#9ff0d4', '#a6dcff', '#c8b2ff', '#ff5fa2'];
    for (let k = 0; k < 28; k++) {
      const i = document.createElement('i');
      i.className = 'tut-conf';
      const a = Math.random() * Math.PI * 2, d = 70 + Math.random() * 140;
      i.style.cssText = `--dx:${(Math.cos(a) * d * 1.6).toFixed(0)}px;--dy:${(Math.sin(a) * d * 0.7 + 40).toFixed(0)}px;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;background:${cols[k % cols.length]};left:${(20 + Math.random() * 60).toFixed(0)}%;animation-delay:${(Math.random() * 0.08).toFixed(2)}s`;
      box.appendChild(i);
    }
  }

  // ---------------------------------------------------------------- bugs
  alive() { return [...this.mine].filter(e => !e.dead); }
  // Training bugs: a third of the bite, and dozing unless the lesson needs them awake.
  spawn(type, at, { active = false, hp, mass } = {}) {
    const g = this.game;
    const e = g.world.add(new Enemy(g, at.x, at.z, type, { room: this.room.id }));
    e.dmgMul = 0.3;
    if (hp) e.maxHp = e.hp = hp;
    if (mass) e.mass = mass;
    e.active = active;
    e.y = 3; e.vy = -2;
    e.facing = Math.atan2(g.player.x - at.x, g.player.z - at.z);
    this.mine.add(e);
    this.room.enemies.push(e);
    g.fx('cf', { x: r2(at.x), y: 1, z: r2(at.z), n: 18, p: 4 });
    g.fx('sx', { n: 'pop', o: { gap: 0.05 } });
    return e;
  }
  // Three in a row, pointing away from the player: one bonk sends the first into the rest.
  lineUp() {
    for (const e of this.alive()) { e.dead = true; this.puff(e); }
    for (const [d, s] of [[2.2, 0], [3.9, 0.35], [4.7, -0.45]]) this.spawn('ladybug', this.spot(d, s), { hp: 60 });
  }
  clearBugs() {
    const p = this.game.player;
    for (const e of this.alive()) {
      if (p.holding === e) { p.holding = null; p.state = 'move'; }
      e.dead = true; this.puff(e);
    }
    this.mine.clear();
    this.room.enemies.length = 0;
  }
  puff(e) { this.game.fx('pf', { x: r2(e.x), y: 1, z: r2(e.z), c: 0xffffff }); }
  // A floor spot `dist` ahead of the player, toward the middle of the lawn; `side` steps
  // sideways, `ang` rotates around the player instead.
  spot(dist, side = 0, ang = null) {
    const p = this.game.player, c = this.center, map = this.game.map;
    let dx = c.x - p.x, dz = c.z - p.z, l = Math.hypot(dx, dz);
    if (l < 2) { dx = p.aimX; dz = p.aimZ; l = Math.hypot(dx, dz) || 1; }
    dx /= l; dz /= l;
    if (ang != null) { const ca = Math.cos(ang), sa = Math.sin(ang); [dx, dz] = [dx * ca - dz * sa, dx * sa + dz * ca]; }
    let x = p.x + dx * dist - dz * side, z = p.z + dz * dist + dx * side;
    const blocked = () => [[0, 0], [0.5, 0], [-0.5, 0], [0, 0.5], [0, -0.5]].some(([ox, oz]) => map.solidAt(x + ox, z + oz));
    for (let k = 0; k < 12 && blocked(); k++) { x += (c.x - x) * 0.25; z += (c.z - z) * 0.25; }
    return { x, z };
  }

  // Screen y of the bottom of the lesson card (layout box, so the slide-in does not move it).
  cardBottom() {
    if (this.root.firstChild) {
      const b = this.root.offsetTop + this.root.offsetHeight;
      if (b !== this.cardB) document.body.style.setProperty('--tut-card-b', b + 'px');
      this.cardB = b;
    }
    return this.cardB ?? 0;
  }
  // The open lawn on screen: below the card, clear of the edges and the touch buttons.
  onScreen(s) {
    // A wider margin than the arrow uses (56), so camera drift does not flip the arrow on.
    const pad = 84, W = innerWidth, H = innerHeight, touch = this.game.touch.active;
    return s.visible && s.x > pad && s.x < W - pad - (touch && s.y > H - 300 ? 230 : 0) && s.y > this.cardBottom() + 40 && s.y < H - pad;
  }
  // The level's star sits east of the start, which a narrow portrait screen does not show.
  // Pull it toward the knight until it is on screen (never closer than 2.5 tiles), so the
  // first lesson starts with its goal in view instead of behind an arrow.
  fitGoal() {
    const p = this.game.player, v = this.game.view, map = this.game.map, g0 = { ...this.goal };
    // Judge it as framed once the camera has settled under the card (see updateCamBias).
    const shift = Math.max(0, this.cardBottom() + 130 - innerHeight / 2) - (this.camBias ?? 0) * this.ppu();
    v.update(0);
    for (let k = 1; k >= 0; k -= 0.05) {
      const x = p.x + (g0.x - p.x) * k, z = p.z + (g0.z - p.z) * k;
      if (Math.hypot(x - p.x, z - p.z) < 2.5) break;
      if ([[0, 0], [0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]].some(([ox, oz]) => map.solidAt(x + ox, z + oz))) continue;
      const sc = v.worldToScreen(x, 1, z);
      if (this.onScreen({ ...sc, y: sc.y + shift })) { this.goal = { x, z }; return; }
    }
  }
  // Short landscape screens: frame the knight in the space under the card rather than in
  // the middle of the screen, where the card covers its head and everything said above it.
  // Screen pixels per world unit of up-screen ground distance, at the view centre.
  ppu() {
    const v = this.game.view, a = v.worldToScreen(v.center.x, 0, v.center.z), b = v.worldToScreen(v.center.x + v.up.x, 0, v.center.z + v.up.z);
    return a.y - b.y;
  }
  updateCamBias(dt) {
    const H = innerHeight, want = this.cardBottom() + 130 - H / 2;
    const ppu = this.ppu(), target = want > 0 && ppu > 1 ? Math.min(4, want / ppu) : 0;
    this.camBias = (this.camBias ?? 0) + (target - (this.camBias ?? 0)) * Math.min(1, dt * 4);
  }

  // ---------------------------------------------------------------- marker
  showMarker() {
    if (!this.marker) {
      const g = new THREE.Group(), lemon = 0xfff1a1;
      const mat = o => new THREE.MeshBasicMaterial({ color: lemon, transparent: true, depthWrite: false, side: THREE.DoubleSide, ...o });
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), mat({ opacity: 0.95 }));
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.62, 40), mat({ opacity: 0.35 }));
      const ink = new THREE.Mesh(new THREE.RingGeometry(0.8, 0.88, 40), mat({ color: 0x3a2346, opacity: 0.9 }));
      for (const m of [ring, disc, ink]) { m.rotation.x = -Math.PI / 2; m.position.y = 0.03; g.add(m); }
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 4, 24, 1, true), mat({ opacity: 0.22 }));
      beam.position.y = 2;
      const starMesh = this.game.goreKit.part('star', lemon, { s: 0.95, outline: 0.03, shadow: false });
      g.add(beam, starMesh);
      this.game.scene.add(g);
      this.marker = { g, ring, beam, star: starMesh, k: 0 };
    }
    this.marker.g.position.set(this.goal.x, 0, this.goal.z);
    this.marker.g.visible = true; this.marker.out = false; this.marker.k = 0;
  }
  hideMarker() {
    if (!this.marker?.g.visible || this.marker.out) return;
    this.marker.out = true;
    this.game.fx('cf', { x: r2(this.goal.x), y: 1.4, z: r2(this.goal.z), n: 40, p: 6, c: [0xfff1a1, 0xffffff, 0xff9ecb] });
  }
  updateMarker(dt) {
    const m = this.marker;
    if (!m?.g.visible) return;
    const t = this.game.time;
    m.k = Math.max(0, Math.min(1, m.k + (m.out ? -dt * 5 : dt * 3)));
    if (m.out && m.k <= 0) { m.g.visible = false; return; }
    const ease = 1 - Math.pow(1 - m.k, 3);
    m.g.scale.setScalar(ease);
    m.star.position.y = 1.6 + Math.sin(t * 3) * 0.15;
    m.star.rotation.y = t * 2.2;
    m.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.08);
    m.beam.material.opacity = 0.18 + Math.sin(t * 4) * 0.06;
  }

  // ---------------------------------------------------------------- loop
  update(dt) {
    const g = this.game, p = g.player;
    // You cannot pop in practice: a floor under the health, and it creeps back up.
    p.hp = Math.min(p.stats.maxHp, Math.max(35, p.hp + dt * 6));
    if (p.state === 'dodge' && this.lastState !== 'dodge') this.n.rolls++;
    if (p.state === 'heavy' && this.lastState !== 'heavy') this.heavyT = g.time;
    this.lastState = p.state;
    if (this.rageFill) {
      p.rage = Math.min(100, p.rage + dt * 140);
      // A banner, not a floating word: pressing Q right away swaps it for RAINBOW BLENDER in
      // the same place instead of stacking the two.
      if (p.rage >= 100) { this.rageFill = false; if (p.state !== 'whirl') g.fx('bn', { t: '', s: 'FULL TANK', d: 1.6 }); g.fx('sx', { n: 'streak', o: { pitch: 1.3 } }); }
    }
    if (this.phase === 'step') {
      const s = STEPS[this.i];
      s.tick?.(this, dt);
      const got = Math.max(0, s.got(this));
      if (got !== this.shown) {
        this.shown = got;
        const b = this.card.querySelector('.tut-count b');
        if (b) { b.textContent = Math.min(s.need, got); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
        if (got < s.need) g.fx('sx', { n: 'pickup', o: { pitch: 1.4 } });
      }
      if (got >= s.need && !s.hold?.(this)) this.succeed();
    } else if (this.phase === 'done' && (this.doneT -= dt) <= 0) {
      this.phase = 'out';
      this.card.classList.add('out');
      setTimeout(() => this.next(), 260);
    }
  }
  updateArrow() {
    const m = this.marker, v = this.game.view, a = this.arrow;
    const s = m?.g.visible && !m.out ? v.worldToScreen(this.goal.x, 1, this.goal.z) : null;
    const pad = 56, W = innerWidth, H = innerHeight;
    const off = s && (!s.visible || s.x < pad || s.x > W - pad || s.y < Math.max(pad + 120, this.cardBottom() + 20) || s.y > H - pad);
    a.classList.toggle('on', !!off);
    if (!off) return;
    // Clamp along the ray from the screen centre so the arrow sits where the star is.
    const cx = W / 2, cy = H / 2, dx = s.x - cx, dy = s.y - cy;
    const k = Math.min((W / 2 - pad) / Math.abs(dx || 1e-6), (H / 2 - pad) / Math.abs(dy || 1e-6));
    a.style.transform = `translate(${cx + dx * Math.min(1, k)}px, ${cy + dy * Math.min(1, k)}px) rotate(${Math.atan2(dy, dx)}rad)`;
  }
  render(dt) {
    this.updateCamBias(dt);
    this.updateMarker(dt);
    this.updateArrow();
    if (this.phase === 'step' && this.game.touch.active !== this.touchMode) this.renderCard();
  }
}
