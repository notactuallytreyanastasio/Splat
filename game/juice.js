// Moment-to-moment feel that is not a rule: footstep dust, the roll puff, and the ribbon
// the blade tip leaves.
//
// All of it is derived from a knight's own pose every frame, so every peer draws it for
// every knight without any network traffic.
//
// Cost: dust borrows the blood particle pool (no new draw call); a ribbon is one draw
// call per knight and only while swinging. Nothing here allocates per frame.
import * as THREE from 'three';
import { fx } from '../engine/core/rng.js';

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

// ------------------------------------------------------------------ the kit
export class Juice {
  constructor(game) {
    this.g = game;
    this.ribbons = new Map();
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
}
