// Pooled instanced particles with real ballistics. Droplets stretch along their velocity
// and report where they land, so the game can paint a splat exactly there.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();

export const LAND_DIE = 0, LAND_BOUNCE = 1, LAND_SPLAT = 2;

export class Particles {
  constructor(scene, { max = 2000, geometry, material, stretch = 0.06, floorY = 0 }) {
    this.max = max; this.n = 0; this.stretch = stretch; this.floorY = floorY;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.land = new Uint8Array(max);
    this.spin = new Float32Array(max);
    this.mesh = new THREE.InstancedMesh(geometry, material, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.color = new THREE.Color();
    this.onLand = null; // (x, z, vx, vz, size, colorIndex) => void
    this.solidAt = null;
  }
  spawn(x, y, z, vx, vy, vz, { life = 1.5, size = 0.1, color = 0xff2244, gravity = 22, drag = 0.4, land = LAND_SPLAT } = {}) {
    let i = this.n;
    if (i >= this.max) i = (Math.random() * this.max) | 0; // full: recycle a random slot
    else this.n++;
    this.p.set([x, y, z], i * 3);
    this.v.set([vx, vy, vz], i * 3);
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size; this.grav[i] = gravity; this.drag[i] = drag; this.land[i] = land;
    this.spin[i] = Math.random() * 6.28;
    this.mesh.setColorAt(i, this.color.set(color));
    return i;
  }
  kill(i) {
    const last = --this.n;
    if (i !== last) {
      for (const a of [this.p, this.v]) a.copyWithin(i * 3, last * 3, last * 3 + 3);
      for (const a of [this.life, this.maxLife, this.size, this.grav, this.drag, this.land, this.spin]) a[i] = a[last];
      this.mesh.instanceColor.array.copyWithin(i * 3, last * 3, last * 3 + 3);
    }
  }
  update(dt) {
    const { p, v } = this;
    for (let i = this.n - 1; i >= 0; i--) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const k = i * 3, dr = Math.exp(-this.drag[i] * dt);
      v[k] *= dr; v[k + 2] *= dr;
      v[k + 1] -= this.grav[i] * dt;
      const nx = p[k] + v[k] * dt, nz = p[k + 2] + v[k + 2] * dt;
      if (this.solidAt && this.solidAt(nx, nz) && p[k + 1] < 1.4) { v[k] *= -0.3; v[k + 2] *= -0.3; }
      else { p[k] = nx; p[k + 2] = nz; }
      p[k + 1] += v[k + 1] * dt;
      if (p[k + 1] <= this.floorY && v[k + 1] < 0) {
        const mode = this.land[i];
        if (mode === LAND_SPLAT) {
          this.onLand?.(p[k], p[k + 2], v[k], v[k + 2], this.size[i], i);
          this.kill(i); continue;
        } else if (mode === LAND_BOUNCE) {
          p[k + 1] = this.floorY;
          v[k + 1] = Math.abs(v[k + 1]) > 2 ? -v[k + 1] * 0.3 : 0;
          v[k] *= 0.5; v[k + 2] *= 0.5;
          this.grav[i] = v[k + 1] === 0 ? 0 : this.grav[i];
        } else { this.kill(i); continue; }
      }
    }
    this.sync();
  }
  sync() {
    const { p, v } = this;
    for (let i = 0; i < this.n; i++) {
      const k = i * 3;
      _v.set(v[k], v[k + 1], v[k + 2]);
      const sp = _v.length(), s = this.size[i] * Math.min(1, this.life[i] / 0.25 + 0.2);
      if (this.stretch > 0 && sp > 0.5) {
        _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / sp));
        _s.set(s, s * (1 + sp * this.stretch), s);
      } else {
        this.spin[i] += sp * 0.02;
        _q.setFromAxisAngle(_up, this.spin[i]);
        _s.set(s, s * (this.stretch > 0 ? 0.35 : 1), s); // resting droplets flatten into beads
      }
      _m.compose(_p.set(p[k], p[k + 1], p[k + 2]), _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.n = 0; this.mesh.count = 0; }
}
