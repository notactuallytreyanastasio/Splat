// Every creature is a hierarchy of toon primitives. A model returns:
//   root  - placed at the entity's feet, yawed to face
//   tilt  - leaned by hit springs
//   body  - squashed/bobbed by animation
//   gibs  - the pieces that fly apart when it dies (together they cover the whole model)
//   pose(rig, s) - procedural animation from a small state object
import * as THREE from 'three';
import { ToonKit, geo, withOutline } from '../engine/render/toon.js';

export const PAL = {
  ink: 0x3a2346, white: 0xfffbff, pink: 0xff9ecb, hotpink: 0xff5fa2, peach: 0xffc3a0, lemon: 0xfff1a1,
  mint: 0x9ff0d4, sky: 0xa6dcff, lilac: 0xc8b2ff, lavender: 0xe2d4ff, gold: 0xffd66b, blood: 0xd4002e,
  gum: 0xffb3d1, cream: 0xfff3e0, black: 0x2a1830,
};
export const RAINBOW = [0xff9ecb, 0xffc3a0, 0xfff1a1, 0x9ff0d4, 0xa6dcff, 0xc8b2ff];

const cupGeo = new THREE.CylinderGeometry(0.5, 0.36, 1, 14, 1);
const discGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.2, 24);

function base() {
  const root = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group();
  root.add(tilt); tilt.add(body);
  return { root, tilt, body, kit: new ToonKit(), gibs: [], parts: {} };
}
function joint(parent, x, y, z, name) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.order = 'YXZ';
  if (name) g.name = name;
  parent.add(g);
  return g;
}
// Capsule of radius r and total length L hanging down from its joint.
function limb(kit, parent, color, r, L, o = {}) {
  return kit.part('capsule', color, { s: [2 * r, L / 2, 2 * r], p: [0, -L / 2 + r, 0], parent, ...o });
}
function eye(kit, parent, x, y, z, s, { pupil = PAL.black, white = PAL.white, look = 0 } = {}) {
  const e = kit.part('sphere', white, { s, p: [x, y, z], parent, outline: 0.02 });
  kit.part('sphere', pupil, { s: 0.6, p: [look * 0.15, 0.02, 0.32], parent: e, outline: false });
  kit.part('sphere', PAL.white, { s: 0.22, p: [0.12, 0.18, 0.45], parent: e, outline: false, shadow: false });
  return e;
}
const walkSwing = s => Math.sin(s.phase) * 0.9 * s.walk;

// ------------------------------------------------------------------ the Candy Knight
export function knight(tint = {}) {
  const r = base(), k = r.kit, b = r.body, helm = tint.helm ?? PAL.mint;
  const legL = joint(b, 0.15, 0.42, 0), legR = joint(b, -0.15, 0.42, 0);
  for (const l of [legL, legR]) {
    limb(k, l, PAL.lilac, 0.11, 0.36);
    k.part('sphere', PAL.hotpink, { s: [0.26, 0.2, 0.34], p: [0, -0.36, 0.05], parent: l });
  }
  const torso = joint(b, 0, 0.45, 0);
  k.part('cylinder', helm, { s: [0.62, 0.16, 0.5], p: [0, 0.03, 0], parent: torso });
  k.part('box', PAL.lavender, { s: [0.56, 0.48, 0.42], p: [0, 0.3, 0], parent: torso });
  k.part('heart', PAL.hotpink, { s: 0.22, p: [0, 0.34, 0.22], parent: torso, outline: 0.02 });
  const head = joint(b, 0, 0.98, 0);
  k.part('sphere', helm, { s: [0.6, 0.56, 0.6], p: [0, 0.12, 0], parent: head });
  k.part('box', PAL.black, { s: [0.44, 0.1, 0.12], p: [0, 0.12, 0.25], parent: head, outline: false });
  k.part('sphere', 0xfff6a8, { s: 0.07, p: [0.09, 0.12, 0.3], parent: head, outline: false, mat: { emissive: 0xfff6a8, emissiveIntensity: 1 } });
  k.part('sphere', 0xfff6a8, { s: 0.07, p: [-0.09, 0.12, 0.3], parent: head, outline: false, mat: { emissive: 0xfff6a8, emissiveIntensity: 1 } });
  const plume = joint(head, 0, 0.42, -0.05);
  [0.2, 0.17, 0.14, 0.11].forEach((s, i) => k.part('sphere', RAINBOW[i], { s, p: [0, i * 0.06, -i * 0.11], parent: plume }));
  const armR = joint(b, 0.36, 0.86, 0), armL = joint(b, -0.36, 0.86, 0);
  for (const a of [armR, armL]) {
    k.part('sphere', PAL.pink, { s: 0.28, p: [0, 0.02, 0], parent: a });
    limb(k, a, PAL.lavender, 0.09, 0.42);
    k.part('sphere', PAL.cream, { s: 0.15, p: [0, -0.4, 0], parent: a });
  }
  // The sword continues the arm's line so a swing reads as one long lever.
  const sword = joint(armR, 0, -0.42, 0);
  k.part('cylinder', PAL.hotpink, { s: [0.06, 0.18, 0.06], p: [0, 0.02, 0], parent: sword });
  k.part('box', PAL.gold, { s: [0.32, 0.06, 0.1], p: [0, -0.08, 0], parent: sword });
  const blade = k.part('box', 0xd8f3ff, { s: [0.14, 0.95, 0.05], p: [0, -0.58, 0], parent: sword });
  for (let i = 0; i < 4; i++) k.part('sharpBox', PAL.pink, { s: [1.02, 0.07, 1.1], p: [0, -0.35 + i * 0.2, 0], r: [0, 0, 0.35], parent: blade, outline: false });
  const shield = joint(armL, 0, -0.3, 0.08);
  k.part('cylinder', PAL.lemon, { s: [0.42, 0.06, 0.42], r: [Math.PI / 2, 0, 0], parent: shield });
  k.part('heart', PAL.hotpink, { s: 0.18, p: [0, 0, 0.05], parent: shield, outline: 0.015 });
  Object.assign(r.parts, { legL, legR, torso, head, armR, armL, sword, blade });
  r.gibs = [head, armR, armL, legL, legR, torso];
  r.height = 1.5;
  r.pose = poseKnight;
  return r;
}

function poseKnight(r, s) {
  const { legL, legR, armR, armL, head, sword } = r.parts;
  const sw = walkSwing(s);
  legL.rotation.set(sw, 0, 0); legR.rotation.set(-sw, 0, 0);
  r.body.position.y = Math.abs(Math.sin(s.phase)) * 0.06 * s.walk + Math.sin(s.t * 3) * 0.01;
  r.body.rotation.set(0, 0, 0);
  r.body.scale.set(1, 1, 1);
  armL.rotation.set(-sw * 0.6 - 0.2, 0, 0.15);
  armR.rotation.set(sw * 0.6 - 0.5, 0.3, -0.1);
  head.rotation.set(0, 0, 0);
  sword.rotation.set(0, 0, 0);
  const a = s.action, p = s.p ?? 0;
  // Every strike drops into a low, wide stance and leans into the blow. The motion has
  // three beats: a fast coil (anticipation), a snap that covers most of the arc in a
  // few frames, and a held follow-through, which is what reads as speed.
  const low = (k = 1) => { r.body.position.y -= 0.12 * k; legL.rotation.x = -0.75 * k; legR.rotation.x = 0.55 * k; legL.rotation.z = 0.25 * k; legR.rotation.z = -0.25 * k; };
  const snap = (p, a, b) => easeOut(Math.min(1, Math.max(0, (p - a) / (b - a))));
  if (a === 'slash') {
    // Reverse grip: the blade runs back along the forearm and the fist leads the cut.
    const k = snap(p, 0.18, 0.5), coil = Math.min(1, p / 0.18);
    sword.rotation.x = Math.PI;
    low(); r.body.rotation.x = 0.22;
    armR.rotation.set(-1.45, 1.9 * coil - k * 3.6, 0.2);
    armL.rotation.set(-0.5, 0.8, 0.3);
    r.body.rotation.y = 0.7 * coil - k * 1.4;
    head.rotation.y = -r.body.rotation.y * 0.6;
  } else if (a === 'backhand') {
    const k = snap(p, 0.15, 0.5), coil = Math.min(1, p / 0.15);
    low(); r.body.rotation.x = 0.18;
    armR.rotation.set(-1.5, -1.9 * coil + k * 3.8, -0.2);
    armL.rotation.set(-1.0, -0.4, 0.2);
    r.body.rotation.y = -0.8 * coil + k * 1.6;
    r.body.position.y += Math.sin(p * Math.PI) * 0.12; // a skip into it
    head.rotation.y = -r.body.rotation.y * 0.6;
  } else if (a === 'spin') {
    // A full turn on one foot, blade straight out, a little off the ground.
    const k = snap(p, 0.12, 0.8);
    low(0.7);
    armR.rotation.set(-1.55, 1.2, 0); armL.rotation.set(-1.3, -1.3, 0);
    r.body.rotation.y = 1.0 - k * (Math.PI * 2 + 1.0);
    r.body.position.y += Math.sin(Math.min(1, p / 0.8) * Math.PI) * 0.25;
    legR.rotation.x = 0.2; legL.rotation.x = -1.1;
  } else if (a === 'finisher') {
    // The leaping slam: crouch, spring up into a forward somersault with the blade
    // overhead, come down blade-first, and hold the landing low.
    if (p < 0.12) { const c = p / 0.12; low(1.3 * c); armR.rotation.set(-0.4 - c * 0.6, 0.3, 0); }
    else if (p < 0.48) {
      const j = (p - 0.12) / 0.36;
      r.body.position.y = Math.sin(j * Math.PI * 0.5) * 1.1 + 0.2;
      r.body.rotation.x = -j * Math.PI * 2;
      armR.rotation.set(-3.0, 0.1, 0); armL.rotation.set(-2.6, -0.3, 0);
      legL.rotation.x = legR.rotation.x = -1.6 * Math.sin(j * Math.PI);
    } else {
      const k = snap(p, 0.48, 0.56), hold = Math.min(1, (p - 0.48) / 0.1);
      r.body.position.y = 1.3 * (1 - k);
      low(1.5 * hold);
      r.body.rotation.x = 0.45 * hold;
      armR.rotation.set(-3.0 + k * 2.75, 0.1, 0); armL.rotation.set(-0.6, -0.9, 0.6);
    }
  } else if (a === 'rising') {
    // Rising Dragon: crouch with the blade low behind, then an uppercut that carries
    // the knight up after the bug, leaning back at the top.
    if (p < 0.2) { const c = p / 0.2; low(1.4 * c); armR.rotation.set(0.7 * c, 0.4, 0.3); r.body.rotation.x = 0.3 * c; }
    else {
      const k = snap(p, 0.2, 0.45), up = Math.sin(Math.min(1, (p - 0.2) / 0.8) * Math.PI);
      r.body.position.y = up * 0.9;
      armR.rotation.set(0.7 - k * 3.9, 0.3, 0.1); armL.rotation.set(-0.3, -0.6, 0.5);
      r.body.rotation.x = 0.3 - k * 0.65;
      legL.rotation.x = -1.2 * up; legR.rotation.x = 0.3 * up;
      r.body.rotation.y = -k * 0.6;
    }
  } else if (a === 'shadow') {
    // Shadow Step: a blur forward almost lying flat, blade reversed and trailing; then a
    // frozen iai finish, arm straight out, while the cuts land behind.
    sword.rotation.x = Math.PI;
    if (p < 0.45) {
      low(1.6); r.body.rotation.x = 0.7;
      r.body.scale.set(0.85, 0.9, 1.35);
      armR.rotation.set(-0.3, -0.4, 0.9); armL.rotation.set(0.6, 0, -0.4);
    } else {
      const hold = Math.min(1, (p - 0.45) / 0.12);
      low(1.3); r.body.rotation.x = 0.35 * hold + 0.7 * (1 - hold);
      armR.rotation.set(-1.5, -1.6, 0); armL.rotation.set(-0.8, 0.9, 0.3);
      r.body.rotation.y = -0.5 * hold;
      head.rotation.y = 0.5 * hold;
    }
  } else if (a === 'fang') {
    // A lunging thrust straight down the aim, the whole body behind the point.
    const k = snap(p, 0.1, 0.35), coil = Math.min(1, p / 0.1);
    low(1.2); r.body.rotation.x = 0.15 + k * 0.35;
    armR.rotation.set(-1.0 - k * 0.57, 0.6 * coil * (1 - k), 0);
    armL.rotation.set(-0.4, 1.2, 0.4);
    r.body.scale.set(1, 1, 1 + k * 0.15 * (1 - p));
  } else if (a === 'heavy') {
    // Batter Up: big wind-up behind, then a full-body sweep.
    low(0.8);
    if (p < 0.45) { const w = p / 0.45; armR.rotation.set(-1.4, 2.2 * w, 0); r.body.rotation.y = 0.9 * w; }
    else { const e = easeOut((p - 0.45) / 0.55); armR.rotation.set(-1.5, 2.2 - e * 4.6, 0); r.body.rotation.y = 0.9 - e * 2.2; }
    armL.rotation.set(-1.2, -0.4, 0);
  } else if (a === 'whirl') {
    armR.rotation.set(-1.55, 1.4, 0); armL.rotation.set(-1.4, -1.4, 0);
    r.body.rotation.y = s.t * 22;
  } else if (a === 'carry') {
    armR.rotation.set(-3.0, 0.2, 0); armL.rotation.set(-3.0, -0.2, 0);
  } else if (a === 'throw') {
    armR.rotation.set(-3 + p * 2.2, 0.2, 0); armL.rotation.set(-3 + p * 2.2, -0.2, 0);
  } else if (a === 'guard') {
    // Blade held flat across the body: the parry stance.
    armR.rotation.set(-1.5, -0.9, 0); armL.rotation.set(-1.2, 0.6, 0);
    r.body.rotation.y = 0.35;
  } else if (a === 'dodge') {
    r.body.rotation.x = p * Math.PI * 2;
    r.body.position.y = 0.3 + Math.sin(p * Math.PI) * 0.3;
    legL.rotation.x = legR.rotation.x = -1.4;
  }
}
const easeOut = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

const halfSphere = new THREE.SphereGeometry(0.5, 18, 12, 0, Math.PI);
const DOUBLE = { side: THREE.DoubleSide };
function legPair(k, parent, color, z, spread, r, L) {
  const out = [];
  for (const side of [1, -1]) {
    const hip = joint(parent, side * spread, 0, z);
    hip.rotation.z = side * 1.0;
    const upper = limb(k, hip, color, r, L);
    const knee = joint(hip, 0, -L + r * 2, 0);
    knee.rotation.z = -side * 1.3;
    limb(k, knee, color, r * 0.8, L * 0.9);
    hip.userData.side = side;
    out.push(hip);
  }
  return out;
}
function antenna(k, parent, x, color, tip, len = 0.35, curl = 0.4) {
  const a = joint(parent, x, 0, 0);
  a.rotation.set(-0.5, 0, x > 0 ? -curl : curl);
  k.part('cylinder', color, { s: [0.025, len, 0.025], p: [0, len / 2, 0], parent: a, outline: 0.012 });
  k.part('sphere', tip, { s: 0.09, p: [0, len, 0], parent: a, outline: 0.015 });
  return a;
}
const crawl = (legs, s, amp = 0.5) => legs.forEach((l, i) => {
  l.rotation.y = Math.sin(s.phase * 1.4 + i * 1.9) * amp * Math.max(0.15, s.walk);
});

// ------------------------------------------------------------------ Ladybug Lunger
export function ladybug(shell = 0xff8fb8) {
  const r = base(), k = r.kit, b = r.body, plum = 0x6b4682;
  const torso = joint(b, 0, 0.3, 0);
  k.part('sphere', plum, { s: [0.6, 0.36, 0.78], p: [0, 0, 0], parent: torso });
  const legs = legPair(k, torso, plum, 0.2, 0.22, 0.04, 0.22).concat(legPair(k, torso, plum, -0.15, 0.22, 0.04, 0.22));
  const shellL = joint(torso, 0.01, 0.06, -0.02), shellR = joint(torso, -0.01, 0.06, -0.02);
  for (const [sh, side] of [[shellL, 1], [shellR, -1]]) {
    const m = new THREE.Mesh(halfSphere, k.mat(shell, DOUBLE));
    m.scale.set(0.72, 0.6, 0.86); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; m.castShadow = true;
    withOutline(m, 0.03); sh.add(m);
    [[0.18, 0.18, 0.12], [0.2, 0.12, -0.18], [0.1, 0.22, -0.02]].forEach(([x, y, z]) =>
      k.part('heart', PAL.white, { s: 0.11, p: [side * x, y, z], r: [-Math.PI / 2 + 0.5, 0, side * 0.6], parent: sh, outline: false }));
  }
  const wings = joint(torso, 0, 0.12, -0.1);
  for (const side of [1, -1]) k.part('sphere', 0xe9f7ff, { s: [0.4, 0.02, 0.6], p: [side * 0.22, 0, -0.15], r: [0, side * 0.3, 0], parent: wings, outline: 0.012, mat: { transparent: true, opacity: 0.6 } });
  wings.visible = false;
  const head = joint(b, 0, 0.32, 0.38);
  k.part('sphere', plum, { s: [0.42, 0.36, 0.36], parent: head });
  eye(k, head, 0.1, 0.06, 0.13, 0.16, { pupil: 0xff2d6f });
  eye(k, head, -0.1, 0.06, 0.13, 0.16, { pupil: 0xff2d6f });
  const jawL = joint(head, 0.07, -0.1, 0.15), jawR = joint(head, -0.07, -0.1, 0.15);
  for (const [j, side] of [[jawL, 1], [jawR, -1]]) k.part('cone', PAL.cream, { s: [0.06, 0.16, 0.06], p: [0, 0, 0.06], r: [Math.PI / 2, 0, -side * 0.5], parent: j, outline: 0.012 });
  const ant = [antenna(k, head, 0.08, plum, PAL.hotpink, 0.3), antenna(k, head, -0.08, plum, PAL.hotpink, 0.3)];
  ant.forEach(a => a.position.y = 0.14);
  Object.assign(r.parts, { torso, head, shellL, shellR, wings, legs, jawL, jawR });
  r.gibs = [head, shellL, shellR, ...legs, torso];
  r.height = 0.9;
  r.pose = (r, s) => {
    crawl(legs, s);
    r.body.position.y = s.walk ? Math.abs(Math.sin(s.phase * 1.4)) * 0.03 : 0;
    const open = s.action === 'attack' || s.air ? 1 : s.action === 'windup' ? s.p * 0.4 : 0;
    shellL.rotation.z = -open * 0.9; shellR.rotation.z = open * 0.9;
    shellL.rotation.x = shellR.rotation.x = -open * 0.3;
    wings.visible = open > 0.5;
    wings.rotation.z = Math.sin(s.t * 60) * 0.3;
    const chomp = Math.sin(s.t * (s.action === 'windup' ? 30 : 6)) * 0.3;
    jawL.rotation.y = chomp; jawR.rotation.y = -chomp;
    r.body.rotation.x = s.action === 'windup' ? -0.3 * s.p : s.action === 'attack' ? 0.3 * (1 - s.p) : 0;
  };
  return r;
}

// ------------------------------------------------------------------ Caterpillar (splits)
export function caterpillar(n = 5) {
  const r = base(), k = r.kit, b = r.body;
  const cols = [0x9ff0d4, 0xa6dcff, 0xc8b2ff, 0xffb3d1, 0xfff1a1, 0x9ff0d4];
  const segs = [];
  for (let i = 0; i < n; i++) {
    const s = joint(b, 0, 0.25, -i * 0.3);
    const size = i === 0 ? 0.48 : 0.42 - i * 0.02;
    k.part('sphere', cols[i % cols.length], { s: size, parent: s });
    k.part('sphere', PAL.white, { s: [size * 0.5, size * 0.3, size * 0.5], p: [0, size * 0.35, 0], parent: s, outline: false, shadow: false });
    if (i > 0) for (const side of [1, -1]) k.part('capsule', 0x6b4682, { s: [0.05, 0.07, 0.05], p: [side * 0.16, -0.18, 0], parent: s, outline: 0.012 });
    segs.push(s);
  }
  const head = segs[0];
  eye(k, head, 0.11, 0.06, 0.2, 0.16);
  eye(k, head, -0.11, 0.06, 0.2, 0.16);
  k.part('torus', PAL.hotpink, { s: [0.1, 0.08, 0.08], p: [0, -0.07, 0.23], r: [0, 0, Math.PI], parent: head, outline: false });
  antenna(k, head, 0.08, 0x6b4682, PAL.lemon, 0.22).position.y = 0.2;
  antenna(k, head, -0.08, 0x6b4682, PAL.lemon, 0.22).position.y = 0.2;
  const flower = joint(head, 0.12, 0.25, 0);
  for (let i = 0; i < 5; i++) k.part('sphere', PAL.white, { s: [0.09, 0.03, 0.09], p: [Math.cos(i * 1.256) * 0.06, 0, Math.sin(i * 1.256) * 0.06], parent: flower, outline: 0.01 });
  k.part('sphere', PAL.lemon, { s: 0.06, p: [0, 0.01, 0], parent: flower, outline: 0.01 });
  Object.assign(r.parts, { segs, head });
  r.gibs = segs.slice().reverse();
  r.height = 0.6;
  r.segments = n;
  r.pose = (r, s) => {
    segs.forEach((seg, i) => {
      const w = Math.sin(s.phase * 0.8 - i * 0.9) * (0.06 + s.walk * 0.08);
      seg.position.x = w;
      seg.position.y = 0.25 + Math.max(0, Math.sin(s.phase * 0.8 - i * 0.9 + 1.5)) * 0.1 * s.walk;
    });
    const rear = s.action === 'windup' ? s.p : s.action === 'attack' ? 1 - s.p : 0;
    segs[0].position.y += rear * 0.4; segs[0].position.z = rear * -0.1;
    if (segs[1]) segs[1].position.y += rear * 0.2;
  };
  return r;
}

// ------------------------------------------------------------------ Butterfly Spitter (ranged, hovers)
export function butterfly(wing = [0xc8b2ff, 0xffb3d1]) {
  const r = base(), k = r.kit, b = r.body;
  const torso = joint(b, 0, 1.0, 0);
  k.part('capsule', 0x8a6aa8, { s: [0.16, 0.26, 0.16], r: [Math.PI / 2 - 0.3, 0, 0], parent: torso });
  k.part('capsule', PAL.lavender, { s: [0.2, 0.2, 0.2], p: [0, -0.08, -0.25], r: [Math.PI / 2 - 0.5, 0, 0], parent: torso });
  const head = joint(torso, 0, 0.12, 0.25);
  k.part('sphere', 0x8a6aa8, { s: 0.26, parent: head });
  eye(k, head, 0.08, 0.03, 0.08, 0.13, { pupil: 0x7b3fa0 });
  eye(k, head, -0.08, 0.03, 0.08, 0.13, { pupil: 0x7b3fa0 });
  antenna(k, head, 0.05, 0x5a3a6a, PAL.lemon, 0.35, 0.5).position.y = 0.08;
  antenna(k, head, -0.05, 0x5a3a6a, PAL.lemon, 0.35, 0.5).position.y = 0.08;
  const wingL = joint(torso, 0.06, 0.05, 0), wingR = joint(torso, -0.06, 0.05, 0);
  for (const [w, side] of [[wingL, 1], [wingR, -1]]) {
    k.part('sphere', wing[0], { s: [0.75, 0.03, 0.6], p: [side * 0.4, 0, 0.12], r: [0, side * 0.3, 0], parent: w, outline: 0.015, mat: DOUBLE });
    k.part('sphere', wing[1], { s: [0.5, 0.03, 0.42], p: [side * 0.32, -0.02, -0.32], r: [0, -side * 0.4, 0], parent: w, outline: 0.015, mat: DOUBLE });
    k.part('sphere', PAL.white, { s: [0.16, 0.035, 0.16], p: [side * 0.5, 0.01, 0.15], parent: w, outline: false });
    k.part('sphere', PAL.lemon, { s: [0.08, 0.04, 0.08], p: [side * 0.5, 0.015, 0.15], parent: w, outline: false });
  }
  const snout = joint(head, 0, -0.06, 0.12);
  k.part('cylinder', PAL.hotpink, { s: [0.04, 0.14, 0.04], p: [0, 0, 0.06], r: [Math.PI / 2, 0, 0], parent: snout, outline: 0.01 });
  Object.assign(r.parts, { torso, head, wingL, wingR, snout });
  r.gibs = [wingL, wingR, head, torso];
  r.height = 1.4;
  r.hover = 1.0;
  r.pose = (r, s) => {
    const flap = Math.sin(s.t * (s.action === 'windup' ? 26 : 14)) * 0.7;
    wingL.rotation.z = flap + 0.2; wingR.rotation.z = -flap - 0.2;
    torso.position.y = s.air ? 0.4 : 1.0 + Math.sin(s.t * 3 + s.seed) * 0.12;
    torso.rotation.x = s.action === 'windup' ? -0.4 * s.p : s.action === 'attack' ? 0.3 * (1 - s.p) : s.walk * 0.25;
  };
  return r;
}

// ------------------------------------------------------------------ Rhino Beetle Brute
export function beetle() {
  const r = base(), k = r.kit, b = r.body, plum = 0x5a3a6a, shell = 0xa9b8ff;
  const torso = joint(b, 0, 0.6, 0);
  k.part('sphere', plum, { s: [1.1, 0.7, 1.4], parent: torso });
  const legs = legPair(k, torso, plum, 0.4, 0.42, 0.08, 0.45).concat(legPair(k, torso, plum, 0, 0.45, 0.08, 0.45), legPair(k, torso, plum, -0.4, 0.42, 0.08, 0.45));
  const shellL = joint(torso, 0.02, 0.15, -0.1), shellR = joint(torso, -0.02, 0.15, -0.1);
  for (const [sh, side] of [[shellL, 1], [shellR, -1]]) {
    const m = new THREE.Mesh(halfSphere, k.mat(shell, DOUBLE));
    m.scale.set(1.3, 1.0, 1.6); m.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; m.castShadow = true;
    withOutline(m, 0.03); sh.add(m);
    // A little garden grows on its back.
    for (let i = 0; i < 2; i++) {
      const f = joint(sh, side * (0.25 + i * 0.1), 0.42 - i * 0.05, 0.2 - i * 0.45);
      for (let j = 0; j < 5; j++) k.part('sphere', [PAL.pink, PAL.white, PAL.lemon][(i + j) % 3], { s: [0.13, 0.05, 0.13], p: [Math.cos(j * 1.256) * 0.08, 0, Math.sin(j * 1.256) * 0.08], parent: f, outline: 0.01 });
      k.part('sphere', PAL.gold, { s: 0.08, p: [0, 0.02, 0], parent: f, outline: 0.01 });
    }
  }
  const head = joint(b, 0, 0.62, 0.72);
  k.part('sphere', plum, { s: [0.7, 0.55, 0.55], parent: head });
  eye(k, head, 0.2, 0.08, 0.2, 0.17, { pupil: 0xff2d6f });
  eye(k, head, -0.2, 0.08, 0.2, 0.17, { pupil: 0xff2d6f });
  const horn = joint(head, 0, 0.1, 0.22);
  k.part('cone', PAL.gold, { s: [0.26, 0.9, 0.26], p: [0, 0.35, 0.22], r: [0.6, 0, 0], parent: horn });
  k.part('sphere', PAL.hotpink, { s: 0.12, p: [0, 0.75, 0.48], parent: horn, outline: 0.015 });
  Object.assign(r.parts, { torso, head, horn, shellL, shellR, legs });
  r.gibs = [horn, head, shellL, shellR, ...legs, torso];
  r.height = 1.6;
  r.pose = (r, s) => {
    crawl(legs, s, 0.35);
    r.body.position.y = s.walk ? Math.abs(Math.sin(s.phase)) * 0.04 : 0;
    const p = s.p ?? 0;
    if (s.action === 'windup') { r.body.rotation.x = -0.55 * easeOut(p * 1.4); r.body.position.y = 0.3 * p; }
    else if (s.action === 'attack') { r.body.rotation.x = -0.55 + easeOut(p * 3) * 0.8; }
    else r.body.rotation.x = 0;
    const open = s.action === 'stunned' ? 0.5 : 0;
    shellL.rotation.z = -open; shellR.rotation.z = open;
  };
  return r;
}

// ------------------------------------------------------------------ Empress Mantis (boss)
export function mantis() {
  const r = base(), k = r.kit, b = r.body, green = 0xb6f2c4, deep = 0x7fd6a0;
  const torso = joint(b, 0, 1.3, 0);
  const abdomen = joint(torso, 0, -0.1, -0.5);
  k.part('sphere', green, { s: [0.9, 0.8, 1.7], p: [0, 0, -0.5], r: [0.35, 0, 0], parent: abdomen });
  for (let i = 0; i < 4; i++) k.part('torus', PAL.pink, { s: [0.42 - i * 0.05, 0.42 - i * 0.05, 0.25], p: [0, 0.1 - i * 0.16, -0.15 - i * 0.32], r: [0.35, 0, 0], parent: abdomen, outline: false });
  const wings = joint(torso, 0, 0.3, -0.3);
  const wingL = [1, -1].map(side => k.part('sphere', 0xe6f4ff, { s: [0.5, 0.03, 1.7], p: [side * 0.22, 0.1, -0.6], r: [0.3, side * 0.15, side * 0.2], parent: wings, outline: 0.015, mat: { transparent: true, opacity: 0.65, side: THREE.DoubleSide } }));
  const wingMat = wingL[0].material;
  const thorax = joint(torso, 0, 0.1, 0.25);
  k.part('capsule', green, { s: [0.42, 0.65, 0.42], p: [0, 0.6, 0.1], r: [-0.25, 0, 0], parent: thorax });
  k.part('heart', PAL.hotpink, { s: 0.3, p: [0, 0.55, 0.32], r: [-0.25, 0, 0], parent: thorax, outline: 0.02 });
  const legs = [];
  for (const [z, side] of [[0.1, 1], [0.1, -1], [-0.5, 1], [-0.5, -1]]) {
    const l = joint(b, side * 0.35, 1.2, z);
    l.rotation.z = side * 0.6;
    limb(k, l, deep, 0.07, 1.4);
    legs.push(l);
  }
  const head = joint(thorax, 0, 1.35, 0.3);
  k.part('cone', green, { s: [0.85, 0.7, 0.45], p: [0, -0.05, 0], r: [Math.PI, 0, 0], parent: head });
  for (const side of [1, -1]) {
    const e = k.part('sphere', 0xd9b8ff, { s: [0.34, 0.4, 0.34], p: [side * 0.38, 0.12, 0.05], parent: head, outline: 0.02 });
    k.part('sphere', 0xff2d6f, { s: 0.35, p: [0, 0, 0.35], parent: e, outline: false });
    k.part('sphere', PAL.white, { s: 0.2, p: [0.15, 0.25, 0.4], parent: e, outline: false });
  }
  // Phase-two eyes: unlit and transparent, so the baker leaves them alone and hit flashes
  // (which drive the kit's emissive) cannot wash them out.
  const glowCore = new THREE.MeshBasicMaterial({ color: 0xff1040, transparent: true, opacity: 1 });
  const glowHalo = new THREE.MeshBasicMaterial({ color: 0xff3d6e, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Group();
  for (const side of [1, -1]) {
    const c = new THREE.Mesh(geo.sphere(), glowCore); c.scale.setScalar(0.2); c.position.set(side * 0.38, 0.12, 0.16);
    const h = new THREE.Mesh(geo.sphere(), glowHalo); h.scale.setScalar(0.5); h.position.copy(c.position);
    glow.add(c, h);
  }
  glow.visible = false;
  head.add(glow);
  // A throbbing red ring on the floor: phase two has to read from straight above too.
  const aura = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.7, 40), new THREE.MeshBasicMaterial({ color: 0xff1f5a, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.06; aura.visible = false; aura.renderOrder = 2; // over the blood layer
  r.root.add(aura);
  const crown = joint(head, 0, 0.32, -0.02);
  k.part('cylinder', PAL.gold, { s: [0.5, 0.1, 0.36], parent: crown });
  for (let i = 0; i < 5; i++) k.part('cone', PAL.gold, { s: [0.09, 0.24, 0.09], p: [(i - 2) * 0.1, 0.15, 0.12], parent: crown, outline: 0.015 });
  k.part('heart', PAL.hotpink, { s: 0.12, p: [0, 0.18, 0.2], parent: crown, outline: 0.012 });
  antenna(k, head, 0.12, deep, PAL.hotpink, 0.7, 0.3).position.y = 0.25;
  antenna(k, head, -0.12, deep, PAL.hotpink, 0.7, 0.3).position.y = 0.25;
  const jaws = joint(head, 0, -0.35, 0.1);
  k.part('cone', PAL.cream, { s: [0.08, 0.2, 0.08], p: [0.06, 0, 0.06], r: [2.6, 0, 0.2], parent: jaws, outline: 0.012 });
  k.part('cone', PAL.cream, { s: [0.08, 0.2, 0.08], p: [-0.06, 0, 0.06], r: [2.6, 0, -0.2], parent: jaws, outline: 0.012 });
  // Raptorial arms: shoulder -> forearm -> scythe. These are the attacks.
  const arms = [1, -1].map(side => {
    const sh = joint(thorax, side * 0.3, 1.05, 0.3);
    limb(k, sh, green, 0.1, 0.8);
    const fore = joint(sh, 0, -0.7, 0);
    limb(k, fore, deep, 0.09, 0.75);
    const scythe = k.part('cone', PAL.pink, { s: [0.12, 0.9, 0.05], p: [0, -1.05, 0], r: [Math.PI, 0, 0], parent: fore });
    for (let i = 0; i < 4; i++) k.part('cone', PAL.white, { s: [0.06, 0.12, 0.04], p: [0, -0.4 + i * 0.13, 0.03], r: [Math.PI / 2, 0, 0], parent: fore, outline: 0.01 });
    sh.userData.fore = fore; sh.userData.side = side;
    return sh;
  });
  Object.assign(r.parts, { torso, thorax, head, crown, arms, legs, wings, abdomen });
  r.gibs = [head, crown, ...arms, wings, ...legs, abdomen, thorax, torso];
  r.height = 3.3;
  r.pose = (r, s) => {
    const p = s.p ?? 0, mad = !!r.enraged;
    legs.forEach((l, i) => l.rotation.x = Math.sin(s.phase * 1.2 + i * 1.6) * 0.4 * Math.max(s.walk, s.action === 'charge' ? 1.5 : 0));
    thorax.rotation.x = 0; head.rotation.set(0, Math.sin(s.t * 0.7) * 0.2, 0); jaws.rotation.x = 0;
    // Enraged: wings flared and buzzing, rosy, eyes lit.
    wings.rotation.x = mad ? -0.45 + Math.sin(s.t * 38) * 0.08 : 0; wings.scale.set(mad ? 1.3 : 1, 1, mad ? 1.15 : 1);
    wingMat.color.setHex(mad ? 0xffc2d6 : 0xe6f4ff);
    glow.visible = mad || s.action === 'rear';
    if (glow.visible) glow.children.forEach((m, i) => { if (i % 2) m.scale.setScalar(0.45 + Math.sin(s.t * 9) * 0.08); });
    aura.visible = mad;
    if (mad) { aura.material.opacity = 0.5 + 0.25 * Math.sin(s.t * 6); aura.scale.setScalar(1 + 0.06 * Math.sin(s.t * 6)); }
    let armX = mad ? -1.4 + Math.sin(s.t * 5) * 0.12 : -1.4, armY = 0, fore = 2.4;
    if (s.action === 'rear' || s.action === 'roar') {
      // Rear up: chest back, scythes high and wide, jaws open, screaming at the ceiling.
      const e = easeOut(Math.min(1, p * (s.action === 'rear' ? 3.5 : 5))), shake = p > 0.22 && p < 0.85 ? Math.sin(s.t * 55) * 0.06 : 0;
      thorax.rotation.x = -0.55 * e; head.rotation.x = -0.45 * e + shake; head.rotation.y = 0;
      jaws.rotation.x = 0.5 * e + shake * 3;
      armX = -1.4 - 1.6 * e; armY = (s.action === 'roar' ? 1.5 : 0.9) * e; fore = 2.4 - 2.0 * e;
      wings.rotation.x = -0.8 * e + shake; wings.scale.set(1 + 0.4 * e, 1, 1 + 0.2 * e);
    } else if (s.action === 'telegraph') { armX = -2.6; fore = 0.6; thorax.rotation.x = -0.25; head.rotation.y = Math.sin(s.t * 40) * 0.08; }
    else if (s.action === 'sweep') { const e = easeOut(p * 1.6); armX = -2.6 + e * 1.4; armY = 1.6 - e * 3.2; fore = 0.6 + e * 0.6; thorax.rotation.x = 0.35 * e; }
    else if (s.action === 'charge') { thorax.rotation.x = 0.55; armX = -0.6; fore = 1.0; }
    else if (s.action === 'cast') { wings.rotation.x = -0.9; wings.scale.set(1.3, 1, 1.1); armX = -2.2; fore = 1.5; thorax.rotation.x = -0.3; }
    else if (s.action === 'stunned') { head.rotation.z = Math.sin(s.t * 5) * 0.35; armX = -0.3; fore = 0.8; thorax.rotation.x = 0.3; }
    arms.forEach(a => { a.rotation.set(armX, armY * a.userData.side, 0); a.userData.fore.rotation.x = fore; });
    r.body.position.y = Math.abs(Math.sin(s.phase)) * 0.05 * s.walk + (s.action === 'rear' || s.action === 'roar' ? 0.25 * easeOut(Math.min(1, p * 4)) : 0);
  };
  return r;
}

// ------------------------------------------------------------------ gore pieces (shared kit)
const gore = new ToonKit();
gore.shared = true; // chunks and blobs all share these materials
// ------------------------------------------------------------------ Pond Frog (hops, tongue)
export function frog() {
  const r = base(), k = r.kit, b = r.body, skin = 0x8fe08a, dark = 0x5cbf6a, belly = 0xfff3c8;
  const torso = joint(b, 0, 0.34, 0);
  k.part('sphere', skin, { s: [0.86, 0.56, 0.92], parent: torso });
  k.part('sphere', belly, { s: [0.62, 0.34, 0.6], p: [0, -0.12, 0.14], parent: torso, outline: false });
  for (const [x, z, sz] of [[0.18, -0.15, 0.16], [-0.2, 0.02, 0.13], [0.05, -0.32, 0.11], [-0.08, 0.2, 0.1]]) k.part('sphere', dark, { s: [sz, 0.05, sz], p: [x, 0.25, z], parent: torso, outline: false, shadow: false });
  const head = joint(torso, 0, 0.12, 0.3);
  const eyes = [];
  for (const side of [1, -1]) {
    const eb = joint(head, side * 0.2, 0.17, 0);
    k.part('sphere', skin, { s: 0.27, parent: eb });
    eye(k, eb, 0, 0.05, 0.07, 0.2, { pupil: PAL.black });
    k.part('sphere', 0xffb3d1, { s: [0.13, 0.07, 0.06], p: [side * 0.29, -0.03, 0.2], parent: head, outline: false, shadow: false });
    eyes.push(eb);
  }
  const jaw = joint(head, 0, -0.08, 0.16);
  k.part('sphere', 0xff7eb6, { s: [0.48, 0.05, 0.18], p: [0, 0, 0.06], parent: jaw, outline: 0.012 });
  const throat = joint(torso, 0, -0.12, 0.36);
  k.part('sphere', belly, { s: [0.32, 0.22, 0.22], parent: throat, outline: 0.015 });
  // The tongue runs along +z from the mouth, 1 unit long at scale 1: the pose stretches it.
  const tongue = joint(head, 0, -0.06, 0.2);
  k.part('cylinder', PAL.hotpink, { s: [0.11, 1, 0.11], p: [0, 0, 0.5], r: [Math.PI / 2, 0, 0], parent: tongue, outline: 0.012 });
  const tip = k.part('sphere', 0xff2d6f, { s: [0.22, 0.18, 0.08], p: [0, 0, 1], parent: tongue, outline: 0.012 });
  tongue.visible = false;
  const legs = [];
  for (const side of [1, -1]) {
    const hip = joint(torso, side * 0.36, -0.12, -0.22);
    k.part('sphere', skin, { s: [0.3, 0.28, 0.46], parent: hip });
    const foot = joint(hip, side * 0.06, -0.12, 0.18);
    k.part('sphere', dark, { s: [0.22, 0.06, 0.32], p: [0, 0, 0.06], parent: foot });
    const arm = joint(torso, side * 0.24, -0.14, 0.3);
    limb(k, arm, skin, 0.06, 0.2);
    k.part('sphere', dark, { s: [0.14, 0.05, 0.16], p: [0, -0.2, 0.04], parent: arm, outline: false });
    legs.push(hip, arm);
  }
  Object.assign(r.parts, { torso, head, jaw, throat, tongue, tip, legs, eyes });
  r.gibs = [head, ...legs, torso];
  r.height = 0.85;
  r.tongueLen = 5.2;
  r.pose = (r, s) => {
    const p = s.p ?? 0;
    r.body.scale.set(1, 1, 1); r.body.position.y = 0; r.body.rotation.x = 0;
    throat.scale.setScalar(1 + 0.3 * Math.max(0, Math.sin(s.t * 5 + s.seed)));
    jaw.rotation.x = 0; head.rotation.x = 0; tongue.visible = false;
    for (let i = 0; i < legs.length; i++) legs[i].rotation.set(0, 0, 0);
    if (s.action === 'crouch') {
      const c = easeOut(p * 1.5);
      r.body.scale.set(1 + 0.15 * c, 1 - 0.32 * c, 1 + 0.1 * c); r.body.position.y = -0.05 * c;
    } else if (s.action === 'hop' || (s.air && s.action !== 'tongue')) {
      // Kick out the back legs on the way up, gather them for the landing.
      const up = s.action === 'hop' ? Math.max(0, 1 - p * 1.6) : 0.5;
      r.body.rotation.x = -0.35 * up + 0.25 * (1 - up);
      legs[0].rotation.x = legs[2].rotation.x = 1.3 * up;
      legs[1].rotation.x = legs[3].rotation.x = -1.2;
      r.body.scale.set(1 - 0.1 * up, 1 + 0.15 * up, 1 + 0.12 * up);
    } else if (s.action === 'windup') {
      head.rotation.x = -0.25 * p; throat.scale.setScalar(1 + 0.6 * p);
      jaw.rotation.x = 0.2 * p;
    } else if (s.action === 'tongue') {
      const ext = p < 0.3 ? p / 0.3 : Math.max(0, 1 - (p - 0.3) / 0.7);
      tongue.visible = ext > 0.02; tongue.scale.set(1, 1, Math.max(0.01, ext * r.tongueLen));
      tip.scale.set(0.22, 0.18, 0.08 / Math.max(0.05, ext * r.tongueLen));
      jaw.rotation.x = 0.5;
    }
  };
  return r;
}

// ------------------------------------------------------------------ Old Gold, the pond koi (boss)
export function koi() {
  const r = base(), k = r.kit, b = r.body, white = PAL.white, orange = 0xff8a3d, red = 0xff4d4d, fin = 0xffc49a;
  const body = joint(b, 0, 0.75, 0);
  const head = joint(body, 0, 0, 0.95);
  k.part('sphere', white, { s: [1.2, 1.0, 1.35], parent: head });
  k.part('sphere', orange, { s: [0.8, 0.45, 0.75], p: [0.12, 0.33, 0.05], r: [0, 0, -0.2], parent: head, outline: false });
  eye(k, head, 0.46, 0.14, 0.34, 0.24, { pupil: PAL.black });
  eye(k, head, -0.46, 0.14, 0.34, 0.24, { pupil: PAL.black });
  const jaw = joint(head, 0, -0.16, 0.6);
  k.part('torus', 0xff9ecb, { s: [0.3, 0.26, 0.3], parent: jaw, outline: 0.02 });
  k.part('sphere', 0x7a2f4a, { s: [0.32, 0.26, 0.1], p: [0, 0, 0.02], parent: jaw, outline: false });
  for (const side of [1, -1]) {
    k.part('cylinder', fin, { s: [0.035, 0.55, 0.035], p: [side * 0.28, -0.32, 0.62], r: [1.0, 0, side * 0.5], parent: head, outline: 0.012 });
    const pec = joint(head, side * 0.55, -0.35, -0.1);
    k.part('sphere', fin, { s: [0.08, 0.5, 0.42], p: [side * 0.12, -0.12, -0.12], r: [0.4, 0, side * 0.7], parent: pec, outline: 0.015, mat: DOUBLE });
  }
  const crown = joint(head, 0, 0.5, 0.05);
  k.part('cylinder', PAL.gold, { s: [0.44, 0.1, 0.36], parent: crown });
  for (let i = 0; i < 5; i++) k.part('cone', PAL.gold, { s: [0.08, 0.22, 0.08], p: [(i - 2) * 0.09, 0.14, 0.12], parent: crown, outline: 0.015 });
  k.part('sphere', 0xa6dcff, { s: 0.12, p: [0, 0.16, 0.2], parent: crown, outline: 0.012, mat: { emissive: 0xa6dcff, emissiveIntensity: 0.4 } });
  const mid = joint(head, 0, 0, -0.85);
  k.part('sphere', orange, { s: [1.25, 1.05, 1.55], parent: mid });
  k.part('sphere', white, { s: [0.7, 0.5, 0.7], p: [-0.25, 0.3, -0.2], r: [0, 0, 0.3], parent: mid, outline: false });
  k.part('sphere', red, { s: [0.45, 0.3, 0.4], p: [0.3, 0.38, 0.35], parent: mid, outline: false });
  k.part('sphere', fin, { s: [0.08, 0.6, 1.0], p: [0, 0.6, -0.1], r: [-0.3, 0, 0], parent: mid, outline: 0.015, mat: DOUBLE });
  const rear = joint(mid, 0, 0, -0.9);
  k.part('sphere', white, { s: [0.85, 0.78, 1.15], parent: rear });
  k.part('sphere', orange, { s: [0.5, 0.35, 0.5], p: [0.1, 0.3, -0.1], parent: rear, outline: false });
  const tail = joint(rear, 0, 0, -0.6);
  for (const side of [1, -1]) k.part('sphere', fin, { s: [0.08, 0.75, 0.8], p: [0, side * 0.32, -0.38], r: [side * 0.65, 0, 0], parent: tail, outline: 0.018, mat: DOUBLE });
  Object.assign(r.parts, { body, head, jaw, crown, mid, rear, tail });
  r.gibs = [head, crown, mid, rear, tail];
  r.height = 1.7;
  r.pose = (r, s) => {
    const p = s.p ?? 0, a = s.action;
    const rate = a === 'beached' ? 11 : a === 'swim' ? 5 : 3, amp = a === 'beached' ? 1.4 : a === 'swim' ? 1 : 0.6;
    mid.rotation.y = Math.sin(s.t * rate) * 0.18 * amp;
    rear.rotation.y = Math.sin(s.t * rate - 1) * 0.3 * amp;
    tail.rotation.y = Math.sin(s.t * rate - 2) * 0.45 * amp;
    body.rotation.set(0, 0, 0); body.position.y = 0.75;
    jaw.scale.setScalar(1 + 0.15 * Math.sin(s.t * 3));
    if (a === 'breach') { body.rotation.x = -0.6 + p * 1.3; jaw.scale.setScalar(1.6); }
    else if (a === 'beached') { body.rotation.z = 1.2 + Math.sin(s.t * 11) * 0.15; body.position.y = 0.55 + Math.abs(Math.sin(s.t * 5.5)) * 0.25; jaw.scale.setScalar(1.2 + 0.3 * Math.sin(s.t * 9)); }
    else if (a === 'spit') { body.rotation.x = -0.5 * Math.sin(Math.min(1, p) * Math.PI); jaw.scale.setScalar(1 + 0.8 * p); }
    else if (a === 'choke') { body.rotation.z = Math.sin(s.t * 20) * 0.25; jaw.scale.setScalar(1.7); body.rotation.x = -0.3; }
  };
  return r;
}

// ------------------------------------------------------------------ Bee (swarms from hives)
export function bee(scale = 1) {
  const r = base(), k = r.kit, b = r.body, gold = 0xffd84d, ink = 0x3a2346;
  const torso = joint(b, 0, 0.95, 0);
  k.part('sphere', gold, { s: [0.36, 0.34, 0.46], p: [0, 0, -0.08], parent: torso });
  for (const z of [-0.02, -0.18]) k.part('sphere', ink, { s: [0.37, 0.3, 0.07], p: [0, 0.01, z], parent: torso, outline: false });
  k.part('cone', ink, { s: [0.06, 0.16, 0.06], p: [0, -0.02, -0.34], r: [-Math.PI / 2, 0, 0], parent: torso, outline: 0.01 });
  const head = joint(torso, 0, 0.04, 0.2);
  k.part('sphere', ink, { s: 0.24, parent: head });
  eye(k, head, 0.07, 0.03, 0.07, 0.11, { pupil: 0xff2d6f });
  eye(k, head, -0.07, 0.03, 0.07, 0.11, { pupil: 0xff2d6f });
  antenna(k, head, 0.04, ink, PAL.hotpink, 0.16, 0.5).position.y = 0.08;
  antenna(k, head, -0.04, ink, PAL.hotpink, 0.16, 0.5).position.y = 0.08;
  const wingL = joint(torso, 0.08, 0.16, -0.02), wingR = joint(torso, -0.08, 0.16, -0.02);
  for (const [w, side] of [[wingL, 1], [wingR, -1]]) k.part('sphere', 0xeaf8ff, { s: [0.36, 0.02, 0.2], p: [side * 0.18, 0, 0], parent: w, outline: 0.01, mat: { transparent: true, opacity: 0.7, side: THREE.DoubleSide } });
  Object.assign(r.parts, { torso, head, wingL, wingR });
  r.gibs = [head, wingL, wingR, torso];
  r.height = 1.2;
  r.hover = 0.95;
  r.root.scale.setScalar(scale);
  r.pose = (r, s) => {
    const flap = Math.sin(s.t * 70) * 0.6;
    wingL.rotation.z = flap + 0.3; wingR.rotation.z = -flap - 0.3;
    torso.position.y = s.air ? 0.45 : 0.95 + Math.sin(s.t * 6 + s.seed) * 0.1;
    // Stinger forward for the dive.
    torso.rotation.x = s.action === 'windup' ? -0.9 * Math.min(1, s.p * 1.5) : s.action === 'attack' ? 0.5 : s.walk * 0.2;
  };
  return r;
}

// ------------------------------------------------------------------ props for the hive
export function beehive() {
  const r = base(), k = r.kit, b = r.body;
  const tiers = [[1.1, 0.35], [1.25, 0.95], [1.1, 1.5], [0.8, 1.95], [0.42, 2.25]];
  const parts = tiers.map(([w, y], i) => { const t = joint(b, 0, y, 0); k.part('sphere', i % 2 ? 0xffc94d : 0xffb72e, { s: [w, 0.62, w], parent: t }); return t; });
  k.part('sphere', 0x5a3a2a, { s: [0.36, 0.26, 0.12], p: [0, 0, 0.6], parent: parts[1], outline: 0.02 });
  for (let i = 0; i < 4; i++) k.part('sphere', 0xffe08a, { s: [0.16, 0.24, 0.1], p: [Math.sin(i * 1.7) * 0.55, 0, Math.cos(i * 1.7) * 0.55], parent: parts[i], outline: false, mat: { transparent: true, opacity: 0.85 } });
  r.gibs = parts.slice().reverse();
  r.height = 2.6;
  r.pose = (r, s) => {
    // It hums: a slow breath, and a shudder when a bee is about to come out.
    const hum = 1 + Math.sin(s.t * 3 + s.seed) * 0.02 + (s.action === 'spawn' ? Math.sin(s.t * 40) * 0.05 : 0);
    r.body.scale.set(1 / Math.sqrt(hum), hum, 1 / Math.sqrt(hum));
  };
  return r;
}
export function puffball() {
  const g = new THREE.Group(), k = new ToonKit();
  k.part('cylinder', PAL.cream, { s: [0.3, 0.32, 0.3], p: [0, 0.16, 0], parent: g });
  const head = new THREE.Group(); head.position.y = 0.6; g.add(head);
  // A fat lilac cap, a frill of white where it meets the stalk, darker spore spots.
  k.part('sphere', 0xe4ccff, { s: [1.0, 0.78, 1.0], parent: head });
  k.part('torus', PAL.white, { s: [0.62, 0.62, 0.5], p: [0, -0.24, 0], r: [Math.PI / 2, 0, 0], parent: head, outline: 0.015 });
  for (let i = 0; i < 8; i++) { const a = i * 2.4, y = 0.05 + (i % 3) * 0.1, rr = 0.42 - (i % 3) * 0.08; k.part('sphere', 0xa77fe0, { s: [0.15, 0.08, 0.15], p: [Math.cos(a) * rr, y + 0.12, Math.sin(a) * rr], r: [Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6], parent: head, outline: false, shadow: false }); }
  k.part('sphere', 0xfff6ff, { s: [0.3, 0.12, 0.3], p: [0, 0.37, 0], parent: head, outline: false, shadow: false });
  return { g, kit: k, head };
}

// ------------------------------------------------------------------ the Queen Bee (boss)
export function queen() {
  const r = base(), k = r.kit, b = r.body, gold = 0xffc21f, ink = 0x3a2346;
  const torso = joint(b, 0, 2.1, 0);
  const abdomen = joint(torso, 0, -0.1, -0.55);
  k.part('sphere', gold, { s: [1.2, 1.1, 1.75], p: [0, 0, -0.35], r: [0.25, 0, 0], parent: abdomen });
  for (let i = 0; i < 3; i++) k.part('sphere', ink, { s: [1.18 - i * 0.2, 1.0 - i * 0.18, 0.2], p: [0, 0.02 - i * 0.12, -0.1 - i * 0.42], r: [0.25, 0, 0], parent: abdomen, outline: false });
  const sting = joint(abdomen, 0, -0.35, -1.15);
  k.part('cone', ink, { s: [0.16, 0.5, 0.16], r: [-Math.PI / 2 - 0.3, 0, 0], parent: sting, outline: 0.015 });
  k.part('sphere', 0xffe9a8, { s: [0.95, 0.5, 0.8], p: [0, 0.12, 0.15], parent: torso });
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.part('sphere', PAL.white, { s: [0.26, 0.12, 0.26], p: [Math.cos(a) * 0.45, 0.3, 0.15 + Math.sin(a) * 0.38], parent: torso, outline: 0.012 }); }
  const head = joint(torso, 0, 0.35, 0.65);
  k.part('sphere', ink, { s: [0.7, 0.62, 0.62], parent: head });
  eye(k, head, 0.2, 0.06, 0.2, 0.26, { pupil: 0xff2d6f });
  eye(k, head, -0.2, 0.06, 0.2, 0.26, { pupil: 0xff2d6f });
  k.part('sphere', PAL.hotpink, { s: [0.2, 0.1, 0.1], p: [0, -0.18, 0.28], parent: head, outline: 0.012 });
  antenna(k, head, 0.12, ink, PAL.gold, 0.45, 0.6).position.y = 0.25;
  antenna(k, head, -0.12, ink, PAL.gold, 0.45, 0.6).position.y = 0.25;
  const crown = joint(head, 0, 0.36, 0);
  k.part('cylinder', PAL.gold, { s: [0.5, 0.12, 0.44], parent: crown });
  for (let i = 0; i < 5; i++) k.part('cone', PAL.gold, { s: [0.1, 0.28, 0.1], p: [Math.cos(i * 1.256) * 0.2, 0.18, Math.sin(i * 1.256) * 0.18], parent: crown, outline: 0.015 });
  k.part('heart', PAL.hotpink, { s: 0.14, p: [0, 0.2, 0.22], parent: crown, outline: 0.012 });
  const wingL = joint(torso, 0.3, 0.45, -0.1), wingR = joint(torso, -0.3, 0.45, -0.1);
  for (const [w, side] of [[wingL, 1], [wingR, -1]]) {
    k.part('sphere', 0xeaf8ff, { s: [1.5, 0.03, 0.7], p: [side * 0.75, 0, 0.05], r: [0, side * 0.2, 0], parent: w, outline: 0.015, mat: { transparent: true, opacity: 0.65, side: THREE.DoubleSide } });
    k.part('sphere', 0xffeef8, { s: [1.0, 0.03, 0.5], p: [side * 0.55, -0.03, -0.45], r: [0, -side * 0.35, 0], parent: w, outline: 0.015, mat: { transparent: true, opacity: 0.6, side: THREE.DoubleSide } });
  }
  const legs = [];
  for (const z of [0.3, 0, -0.3]) for (const side of [1, -1]) { const l = joint(torso, side * 0.3, -0.2, z); limb(k, l, ink, 0.06, 0.55, {}); l.rotation.z = side * 0.4; legs.push(l); }
  Object.assign(r.parts, { torso, abdomen, head, crown, wingL, wingR, sting, legs });
  r.gibs = [head, crown, wingL, wingR, ...legs, abdomen, torso];
  r.height = 3.2;
  r.hover = 2.1;
  r.pose = (r, s) => {
    const p = s.p ?? 0, a = s.action;
    const flap = Math.sin(s.t * (a === 'grounded' ? 8 : 45)) * (a === 'grounded' ? 0.2 : 0.55);
    wingL.rotation.z = flap + 0.2; wingR.rotation.z = -flap - 0.2;
    torso.position.y = 2.1 + Math.sin(s.t * 2.5) * 0.18;
    torso.rotation.set(0, 0, 0); abdomen.rotation.x = 0;
    if (a === 'volley') { abdomen.rotation.x = -0.7 * Math.sin(Math.min(1, p) * Math.PI); torso.rotation.x = 0.2; }
    else if (a === 'rise') { torso.position.y = 2.1 + p * 1.2; abdomen.rotation.x = -0.4; }
    else if (a === 'dive') { torso.position.y = 0.9; torso.rotation.x = 0.7; }
    else if (a === 'grounded') { torso.position.y = 0.75; torso.rotation.z = Math.sin(s.t * 4) * 0.12; abdomen.rotation.x = 0.3; }
    else if (a === 'call') { torso.rotation.x = -0.3; abdomen.rotation.x = -0.2 + Math.sin(s.t * 20) * 0.1; }
    for (let i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(s.t * 3 + i) * 0.2;
  };
  return r;
}

export function goreChunk(kind) {
  const g = new THREE.Group();
  if (kind === 'meat') {
    gore.part('lowSphere', 0xd8263f, { s: [0.24, 0.18, 0.2], parent: g, outline: 0.02 });
    gore.part('lowSphere', 0xffb8c8, { s: [0.12, 0.08, 0.14], p: [0.06, 0.07, 0], parent: g, outline: false });
  } else if (kind === 'bone') {
    gore.part('capsule', PAL.cream, { s: [0.07, 0.16, 0.07], r: [0, 0, Math.PI / 2], parent: g, outline: 0.015 });
    for (const x of [-0.17, 0.17]) for (const z of [-0.04, 0.04]) gore.part('sphere', PAL.cream, { s: 0.08, p: [x, 0, z], parent: g, outline: 0.015 });
  } else if (kind === 'eye') {
    const e = gore.part('sphere', PAL.white, { s: 0.18, parent: g, outline: 0.015 });
    gore.part('sphere', 0x6ec6ff, { s: 0.55, p: [0, 0, 0.25], parent: e, outline: false });
    gore.part('sphere', PAL.black, { s: 0.3, p: [0, 0, 0.42], parent: e, outline: false });
    gore.part('cylinder', 0xd4002e, { s: [0.025, 0.14, 0.025], p: [0, 0, -0.14], r: [Math.PI / 2, 0, 0], parent: g, outline: false });
  } else if (kind === 'heart') {
    gore.part('heart', 0xe0103a, { s: 0.26, parent: g, outline: 0.02 });
  } else if (kind === 'gut') {
    for (let i = 0; i < 5; i++) gore.part('sphere', 0xff8fab, { s: 0.13, p: [Math.sin(i * 1.3) * 0.1, Math.cos(i * 1.7) * 0.03, i * 0.09 - 0.18], parent: g, outline: 0.015 });
  } else if (kind === 'leg') {
    gore.part('capsule', 0x6b4682, { s: [0.06, 0.14, 0.06], r: [0, 0, 1.2], parent: g, outline: 0.012 });
    gore.part('capsule', 0x6b4682, { s: [0.05, 0.12, 0.05], p: [0.12, 0.08, 0], r: [0, 0, -0.4], parent: g, outline: 0.012 });
  } else if (kind === 'wing') {
    gore.part('sphere', RAINBOW[(Math.random() * 6) | 0], { s: [0.3, 0.02, 0.2], parent: g, outline: 0.012, mat: { transparent: true, opacity: 0.7, side: THREE.DoubleSide } });
  } else if (kind === 'goo') {
    gore.part('lowSphere', 0xb6ffd9, { s: [0.2, 0.12, 0.2], parent: g, outline: 0.015, mat: { transparent: true, opacity: 0.85 } });
  } else if (kind === 'glass') {
    gore.part('sharpBox', 0xd8f6ff, { s: [0.16, 0.03, 0.1], r: [0, Math.random() * 3, 0], parent: g, outline: 0.012, mat: { transparent: true, opacity: 0.7 } });
  } else if (kind === 'candy') {
    gore.part('sphere', RAINBOW[(Math.random() * 6) | 0], { s: [0.16, 0.12, 0.16], parent: g, outline: 0.015 });
  }
  return g;
}
export function wallBlob(color = 0xd4002e) {
  const m = new THREE.Mesh(geo.lowSphere(), gore.mat(color));
  return m;
}
export const GORE_KINDS = ['meat', 'meat', 'meat', 'leg', 'leg', 'eye', 'gut', 'heart', 'goo', 'wing'];
