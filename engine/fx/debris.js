// Rigid-body debris: any Object3D can be thrown into this and it will tumble, bounce,
// bleed and come to rest on the floor. Severed limbs and broken props both live here.
import * as THREE from 'three';

const _w = new THREE.Quaternion(), _wp = new THREE.Vector3();

export class Debris {
  constructor(scene, { max = 140, floorY = 0, solidAt = null } = {}) {
    Object.assign(this, { scene, max, floorY, solidAt });
    this.items = [];
    this.onSettle = null; // (item) => true to take it out of the simulation
  }
  // Moves obj from wherever it lives into the scene, keeping its world transform.
  // onWall(item, tx, tz) => true when the owner handled hitting that solid tile itself.
  add(obj, { vx = 0, vy = 0, vz = 0, spin = [0, 0, 0], radius = 0.15, bleed = 0, bounce = 0.35, onBounce = null, onBleed = null, onWall = null, life = Infinity } = {}) {
    obj.updateWorldMatrix(true, false);
    this.scene.attach(obj);
    const it = { obj, v: new THREE.Vector3(vx, vy, vz), w: new THREE.Vector3(...spin), radius, bleed, bounce, onBounce, onBleed, onWall, rest: 0, life, sink: 0 };
    this.items.push(it);
    if (this.items.length > this.max) this.retire();
    return it;
  }
  retire() {
    const it = this.items.find(i => i.rest > 0.5 && !i.sink) ?? this.items.find(i => !i.sink);
    if (it) it.sink = 0.001;
  }
  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i], o = it.obj, p = o.position;
      it.life -= dt;
      if (it.life <= 0 && !it.sink) it.sink = 0.001;
      if (it.sink) {
        it.sink += dt;
        o.scale.multiplyScalar(Math.max(0, 1 - dt * 3));
        if (it.sink > 0.8) { this.scene.remove(o); this.items.splice(i, 1); }
        continue;
      }
      if (it.rest > 0.4) {
        it.rest += dt;
        if (it.rest > 1.2 && !it.proj && this.onSettle?.(it)) this.items.splice(i, 1);
        continue;
      }
      it.v.y -= 24 * dt;
      const nx = p.x + it.v.x * dt, nz = p.z + it.v.z * dt;
      if (this.solidAt && this.solidAt(nx, nz) && p.y < 1.5) {
        if (!it.onWall?.(it, Math.floor(nx), Math.floor(nz))) { it.v.x *= -0.4; it.v.z *= -0.4; it.onBounce?.(it, p.x, p.y, p.z, 'wall'); }
      }
      else { p.x = nx; p.z = nz; }
      p.y += it.v.y * dt;
      if (p.y < this.floorY + it.radius) {
        p.y = this.floorY + it.radius;
        if (it.v.y < -2) {
          it.onBounce?.(it, p.x, p.y, p.z, 'floor', -it.v.y);
          it.v.y *= -it.bounce;
          it.w.multiplyScalar(0.6);
        } else it.v.y = 0;
        it.v.x *= it.friction ?? 0.82; it.v.z *= it.friction ?? 0.82;
        it.w.multiplyScalar(0.9);
      }
      const wl = it.w.length();
      if (wl > 1e-4) { _w.setFromAxisAngle(_wp.copy(it.w).multiplyScalar(1 / wl), wl * dt); o.quaternion.premultiply(_w); }
      if (it.bleed > 0) { it.bleed -= dt; it.onBleed?.(it, p.x, p.y, p.z, dt); }
      if (p.y <= this.floorY + it.radius + 0.01 && it.v.lengthSq() < 0.3 && wl < 1) it.rest += dt; else it.rest = 0;
    }
  }
  clear() { for (const it of this.items) this.scene.remove(it.obj); this.items = []; }
}
