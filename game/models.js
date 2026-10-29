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
  const { legL, legR, armR, armL, head } = r.parts;
  const sw = walkSwing(s);
  legL.rotation.x = sw; legR.rotation.x = -sw;
  r.body.position.y = Math.abs(Math.sin(s.phase)) * 0.06 * s.walk + Math.sin(s.t * 3) * 0.01;
  r.body.rotation.y = 0;
  armL.rotation.set(-sw * 0.6 - 0.2, 0, 0.15);
  armR.rotation.set(sw * 0.6 - 0.5, 0.3, -0.1);
  head.rotation.set(0, 0, 0);
  const a = s.action, p = s.p ?? 0;
  if (a === 'light') {
    // Horizontal sweep, alternating direction per combo step.
    const dir = s.combo % 2 === 0 ? 1 : -1, e = easeOut(p);
    armR.rotation.set(-1.5, dir * (1.7 - e * 3.3), 0);
    r.body.rotation.y = dir * (0.5 - e * 1.0);
  } else if (a === 'finisher') {
    const e = p < 0.35 ? -p / 0.35 : easeOut((p - 0.35) / 0.65);
    armR.rotation.set(-2.6 + Math.max(0, e) * 2.4, 0.2, 0);
    r.body.position.y += p < 0.35 ? p * 0.5 : 0;
  } else if (a === 'heavy') {
    // Batter Up: big wind-up behind, then a full-body sweep.
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
  if (a !== 'dodge') r.body.rotation.x = 0;
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
  aura.rotation.x = -Math.PI / 2; aura.position.y = 0.06; aura.visible = false;
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
