// Moment-to-moment feel that is not a rule: footstep dust, the roll puff, the ribbon the
// blade tip leaves, and the flower buds reinforcements hatch from.
//
// Footsteps, rolls and the ribbon are derived from a knight's own pose every frame, so
// every peer draws them for every knight without any network traffic. Buds are host
// decisions and arrive through game.fx('bud').
//
// Cost: dust borrows the blood particle pool (no new draw call); a ribbon is one draw
// call per knight and only while swinging; every bud on screen shares two instanced
// draw calls (fill + ink outline). Nothing here allocates per frame.
import * as THREE from 'three';
import { geo, toonMaterial, INK } from '../engine/render/toon.js';
import { fx } from '../engine/core/rng.js';
import { RAINBOW } from './models.js';

// Dusky lilac and rose rather than white: white puffs disappear on the pale tiles.
const DUST = [0xd9c8ec, 0xe9cfe0, 0xcdbfe0, 0xf0dccf];
const SWINGS = { light: 0.13, finisher: 0.16, heavy: 0.18, whirl: 0.2 }; // ribbon lifetime per swing, seconds
const _v = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Color(), _hot = new THREE.Color(0xff4f9a), _lilac = new THREE.Color(0xa98bff);

// ------------------------------------------------------------------ sword ribbon
const SAMPLES = 20;
class Ribbon {
  constructor(scene) {
    this.s = new Float32Array(SAMPLES * 7); // tip xyz, base xyz, age (newest first)
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(SAMPLES * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(SAMPLES * 2 * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('color', this.col);
    const idx = [];
    for (let i = 0; i < SAMPLES - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false; this.mesh.visible = false; this.mesh.renderOrder = 3;
    scene.add(this.mesh);
  }
  update(sword, active, life, dt) {
    const s = this.s;
    for (let i = 0; i < this.n; i++) s[i * 7 + 6] += dt;
    while (this.n && s[(this.n - 1) * 7 + 6] > life) this.n--;
    // Frozen frames (hitstop) add nothing: the ribbon hangs in the air with the blow.
    if (active && dt > 0) {
      sword.updateWorldMatrix(true, false);
      s.copyWithin(7, 0, (SAMPLES - 1) * 7);
      _v.set(0, -1.1, 0).applyMatrix4(sword.matrixWorld);
      _b.set(0, -0.3, 0).applyMatrix4(sword.matrixWorld);
      s[0] = _v.x; s[1] = _v.y; s[2] = _v.z; s[3] = _b.x; s[4] = _b.y; s[5] = _b.z; s[6] = 0;
      this.n = Math.min(SAMPLES, this.n + 1);
    }
    this.mesh.visible = this.n > 1;
    if (!this.mesh.visible) return;
    const P = this.pos.array, C = this.col.array;
    for (let i = 0; i < this.n; i++) {
      const k = i * 7, f = Math.min(1, s[k + 6] / life), a = Math.pow(1 - f, 1.5);
      P[i * 6] = s[k]; P[i * 6 + 1] = s[k + 1]; P[i * 6 + 2] = s[k + 2];
      // The hilt edge sits partway down the blade and fades out: a tapered ribbon.
      P[i * 6 + 3] = s[k] + (s[k + 3] - s[k]) * 0.8; P[i * 6 + 4] = s[k + 1] + (s[k + 4] - s[k + 1]) * 0.8; P[i * 6 + 5] = s[k + 2] + (s[k + 5] - s[k + 2]) * 0.8;
      // Hot pink at the edge, cooling to lilac: white vanishes against the pale floor.
      _c.copy(_hot).lerp(_lilac, f);
      C[i * 8] = C[i * 8 + 4] = _c.r; C[i * 8 + 1] = C[i * 8 + 5] = _c.g; C[i * 8 + 2] = C[i * 8 + 6] = _c.b;
      C[i * 8 + 3] = a * 0.9; C[i * 8 + 7] = a * 0.15;
    }
    this.mesh.geometry.setDrawRange(0, (this.n - 1) * 6);
    this.pos.needsUpdate = true; this.col.needsUpdate = true;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.material.dispose(); }
}

// ------------------------------------------------------------------ flower buds
// One instanced mesh for every petal, leaf and stamen on screen, and a second one in
// ink for their outlines. The engine's outline shader ignores instancing, so this one
// applies instanceMatrix itself.
const PARTS = 8, MAX_BUDS = 24;
const BUD_LIFE = 2.0;
export const BUD_HATCH = 0.85; // seconds from sprout to the bug popping out
function instancedOutline(thick) {
  return new THREE.ShaderMaterial({
    uniforms: { uThick: { value: thick }, uColor: { value: new THREE.Color(INK) } },
    vertexShader: `uniform float uThick;
      void main() {
        mat4 m = modelViewMatrix * instanceMatrix;
        vec4 mv = m * vec4(position, 1.0);
        vec3 n = normalize(mat3(m) * normal);
        mv.xyz += n * uThick * (-mv.z / 20.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; void main() { gl_FragColor = vec4(uColor, 1.0); }`,
    side: THREE.BackSide,
  });
}
class Buds {
  constructor(scene) {
    const n = MAX_BUDS * PARTS;
    this.fill = new THREE.InstancedMesh(geo.sphere(), toonMaterial(0xffffff), n);
    this.ink = new THREE.InstancedMesh(geo.sphere(), instancedOutline(0.03), n);
    for (const m of [this.fill, this.ink]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; m.count = 0; m.visible = false; scene.add(m); }
    this.fill.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.list = [];
    this.o = new THREE.Object3D(); this.o.rotation.order = 'YXZ';
  }
  add(x, z, color) {
    if (this.list.length >= MAX_BUDS) this.list.shift();
    this.list.push({ x, z, t: 0, yaw: fx.f(0, 6.28), color, popped: false });
  }
  // Petal angle: 1.22 rad is closed (standing up), 0 lies flat on the floor.
  // One part of the current bud: a squashed sphere hinged at the bud's centre.
  put(k, yaw, tilt, reach, sx, sy, sz, color, y0) {
    const o = this.o, b = this.bud, s = this.s, r = reach * s;
    o.rotation.set(-tilt, yaw, this.shiver * (k % 2 ? 1 : -1));
    o.position.set(b.x + Math.sin(yaw) * Math.cos(tilt) * r, y0 + Math.sin(tilt) * r, b.z + Math.cos(yaw) * Math.cos(tilt) * r);
    o.scale.set(sx * s, sy * s, sz * s);
    o.updateMatrix();
    this.fill.setMatrixAt(k, o.matrix); this.ink.setMatrixAt(k, o.matrix); this.fill.setColorAt(k, _c.set(color));
    return k + 1;
  }
  update(dt, onPop) {
    const F = this.fill, I = this.ink;
    let k = 0;
    for (let b = this.list.length - 1; b >= 0; b--) if ((this.list[b].t += dt) > BUD_LIFE) this.list.splice(b, 1);
    for (const bud of this.list) {
      const t = bud.t;
      if (!bud.popped && t >= BUD_HATCH) { bud.popped = true; onPop?.(bud); }
      // Sprout with an overshoot, swell and shiver while something kicks inside, burst
      // open past flat, settle, then sink away.
      const grow = t < 0.22 ? backOut(t / 0.22) : 1;
      const sink = t > BUD_LIFE - 0.45 ? Math.max(0, (BUD_LIFE - t) / 0.45) : 1;
      const pre = Math.max(0, Math.min(1, (t - 0.22) / (BUD_HATCH - 0.22)));
      const shiver = t < BUD_HATCH ? Math.sin(t * 60) * 0.12 * pre : 0;
      const swell = 1 + (t < BUD_HATCH ? pre * pre * 0.35 : 0);
      const open = t < BUD_HATCH ? 1.22 - pre * 0.1 : 0.1 + 1.13 * Math.exp(-(t - BUD_HATCH) * 9) * Math.cos((t - BUD_HATCH) * 22);
      this.bud = bud; this.s = grow * sink; this.shiver = shiver;
      for (let i = 0; i < 2; i++) k = this.put(k, bud.yaw + 0.6 + i * Math.PI, 0.04, 0.34, 0.24, 0.07, 0.56, 0x9fe3a8, 0.02);
      for (let i = 0; i < 5; i++) k = this.put(k, bud.yaw + i * 1.2566, open, 0.26 * swell, 0.3 * swell, 0.11, 0.56 * swell, bud.color, 0.04);
      k = this.put(k, 0, Math.PI / 2, 0.05, 0.24 * swell, 0.24 * swell, 0.24 * swell, 0xfff1a1, 0.04);
    }
    F.count = I.count = k;
    F.visible = I.visible = k > 0;
    if (k) { F.instanceMatrix.needsUpdate = I.instanceMatrix.needsUpdate = true; F.instanceColor.needsUpdate = true; }
  }
}
const backOut = t => { const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// ------------------------------------------------------------------ the kit
export class Juice {
  constructor(game) {
    this.g = game;
    this.ribbons = new Map();
    this.buds = new Buds(game.scene);
    this.onPop = b => game.gore.confettiBurst(b.x, 0.5, b.z, 16, 4, [b.color, 0xffffff, 0x9fe3a8]);
  }
  dust(x, z, vx, vz, n, size, life = 0.45) {
    const pool = this.g.gore.blood;
    for (let i = 0; i < n; i++) {
      pool.spawn(x + fx.f(-0.12, 0.12), 0.08, z + fx.f(-0.12, 0.12), vx + fx.f(-0.6, 0.6), fx.f(0.5, 1.2), vz + fx.f(-0.6, 0.6),
        { color: fx.pick(DUST), size: size * fx.f(0.8, 1.2), life: life * fx.f(0.8, 1.2), gravity: -1.5, drag: 5, land: 0, grow: 1.6 });
    }
  }
  // Called from Player.sync for every knight, local or remote.
  player(p, dt) {
    const r = p.rig, live = !p.ghost && !p.dead && r.root.visible !== false;
    let rb = this.ribbons.get(p);
    // Only the business half of a swing draws: not the heavy's wind-up or the finisher's raise.
    const life = SWINGS[p.action] && !(p.action === 'heavy' && p.actionP < 0.42) && !(p.action === 'finisher' && p.actionP < 0.33) ? SWINGS[p.action] : 0;
    if (life || rb) {
      rb ??= this.ribbons.set(p, new Ribbon(this.g.scene)).get(p);
      rb.update(r.parts.sword, live && life > 0, life || 0.12, dt);
    }
    if (!live || dt <= 0) { p.wasRolling = false; return; }
    const sp = Math.hypot(p.vx, p.vz);
    // Footfalls: one small puff each time a foot plants (every half walk cycle).
    const step = Math.floor(p.phase / Math.PI);
    if (step !== p.lastStep && sp > 3 && p.y < 0.05 && p.action !== 'dodge') {
      const side = step % 2 ? 0.15 : -0.15, c = Math.cos(p.facing), s = Math.sin(p.facing);
      this.dust(p.x + c * side - p.vx / sp * 0.2, p.z - s * side - p.vz / sp * 0.2, -p.vx * 0.12, -p.vz * 0.12, 2, 0.2, 0.4);
    }
    p.lastStep = step;
    // The roll kicks up a big puff where it starts and leaves a streak behind it.
    const rolling = p.action === 'dodge';
    if (rolling && !p.wasRolling) this.dust(p.x, p.z, -p.vx * 0.15, -p.vz * 0.15, 9, 0.3, 0.55);
    if (rolling && sp > 1) this.dust(p.x - p.vx / sp * 0.3, p.z - p.vz / sp * 0.3, -p.vx * 0.05, -p.vz * 0.05, 1, 0.24, 0.35);
    p.wasRolling = rolling;
  }
  forget(p) { this.ribbons.get(p)?.dispose(); this.ribbons.delete(p); }
  bud(x, z, c) { this.buds.add(x, z, c ?? fx.pick(RAINBOW)); }
  update(dt) {
    this.buds.update(dt, this.onPop);
  }
}
