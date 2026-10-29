// Everything wet. Hits spray droplets that paint the floor where they land; kills
// dismember the rig into rigid-body pieces that bleed as they tumble.
import * as THREE from 'three';
import { Particles, LAND_BOUNCE, LAND_SPLAT } from '../engine/fx/particles.js';
import { DecalLayer } from '../engine/fx/decals.js';
import { Debris } from '../engine/fx/debris.js';
import { geo, toonMaterial } from '../engine/render/toon.js';
import { bakeStatic } from '../engine/render/bake.js';
import { fx } from '../engine/core/rng.js';
import { goreChunk, wallBlob, GORE_KINDS, RAINBOW } from './models.js';

const _c = new THREE.Color(), _v = new THREE.Vector3();

export class Gore {
  constructor(game) {
    this.game = game;
    const { scene, map } = game;
    const solidAt = (x, z) => map.solidAt(x, z);
    this.blood = new Particles(scene, { max: matchMedia('(pointer: coarse)').matches ? 1500 : 3000, geometry: geo.lowSphere(), material: toonMaterial(0xffffff), stretch: 0.07 });
    this.blood.solidAt = solidAt;
    this.blood.onLand = (x, z, vx, vz, size, i) => {
      const a = this.blood.mesh.instanceColor.array;
      _c.setRGB(a[i * 3], a[i * 3 + 1], a[i * 3 + 2]);
      this.decals.splat(x, z, size * 1.5, _c.getStyle(), { dx: vx, dz: vz, speed: Math.hypot(vx, vz), gloss: size > 0.1 });
    };
    this.confetti = new Particles(scene, { max: 900, geometry: geo.sharpBox(), material: toonMaterial(0xffffff), stretch: 0 });
    this.confetti.solidAt = solidAt;
    this.decals = new DecalLayer(scene, map.w, map.h, { ppu: 22 });
    this.debris = new Debris(scene, { max: 170, solidAt });
    // Settled limbs and corpses are baked into static batches: the floor keeps every
    // body for the whole run at a couple of draw calls per dozen.
    this.settled = []; this.batches = [];
    this.debris.onSettle = it => { if (it.proj) return false; this.settled.push(it.obj); return true; };
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.wallMesh = new THREE.InstancedMesh(geo.lowSphere(), toonMaterial(0xffffff), coarse ? 250 : 500);
    this.wallMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.wallMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.wallMesh.count * 3), 3);
    this.wallMesh.count = 0; this.wallMesh.frustumCulled = false;
    scene.add(this.wallMesh);
    this.wallNext = 0; this.wallMax = coarse ? 250 : 500;
    this.fountains = [];
    this.draining = [];
    this.wallBlobs = [];
    this.stats = { droplets: 0, gibs: 0 };
  }
  drop(x, y, z, vx, vy, vz, color, size = fx.f(0.05, 0.13)) {
    this.stats.droplets++;
    this.blood.spawn(x, y, z, vx, vy, vz, { color, size, life: 3, gravity: 22, drag: 0.6, land: LAND_SPLAT });
  }
  spray(x, y, z, dx, dz, n, power, colors) {
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let i = 0; i < n; i++) {
      const sp = power * fx.f(0.25, 1.1), spread = fx.f(-0.8, 0.8);
      const vx = (dx + -dz * spread) * sp + fx.f(-1, 1), vz = (dz + dx * spread) * sp + fx.f(-1, 1);
      this.drop(x, y, z, vx, fx.f(1.5, 7), vz, fx.pick(colors));
    }
  }
  confettiBurst(x, y, z, n, power = 6, colors = RAINBOW) {
    for (let i = 0; i < n; i++) {
      const a = fx.f(0, 6.28), sp = fx.f(0.3, 1) * power;
      this.confetti.spawn(x, y, z, Math.cos(a) * sp, fx.f(3, 9), Math.sin(a) * sp, { color: fx.pick(colors), size: fx.f(0.06, 0.12), life: fx.f(2, 4), gravity: 12, drag: 1.5, land: LAND_BOUNCE });
    }
  }
  puff(x, y, z, color) { this.confettiBurst(x, y, z, 8, 3, [color, 0xffffff]); }
  hit(t, info) {
    const colors = t.def?.blood ?? [0xd4002e];
    const h = (t.rig?.height ?? 1) * 0.55;
    const n = Math.min(60, 6 + info.amount * 0.9);
    this.spray(t.x, t.y + h, t.z, info.dirX ?? 0, info.dirZ ?? 0, n, 4 + (info.knock ?? 0) * 0.5, colors);
    if (info.crit || info.kind === 'finisher' || info.kind === 'heavy') this.confettiBurst(t.x, t.y + h, t.z, 10, 4, [0xff5fa2, 0xffffff, 0xfff1a1]);
    if (t.addWound && Math.random() < 0.5) t.addWound();
  }
  trail(t) { this.drop(t.x, t.y + 0.4, t.z, -t.vx * 0.1 + fx.f(-0.5, 0.5), fx.f(1, 3), -t.vz * 0.1 + fx.f(-0.5, 0.5), fx.pick(t.def?.blood ?? [0xd4002e]), fx.f(0.05, 0.1)); }
  drip(t) { this.drop(t.x + fx.f(-0.2, 0.2), t.y + 0.3, t.z + fx.f(-0.2, 0.2), 0, -1, 0, fx.pick(t.def?.blood ?? [0xd4002e])); }
  kill(t, info, overkill) {
    const g = this.game, colors = t.def?.blood ?? [0xd4002e], h = (t.rig.height ?? 1) * 0.5;
    const dx = info.dirX ?? 0, dz = info.dirZ ?? 0, power = Math.min(14, 3 + (info.knock ?? 4) * 0.6);
    this.spray(t.x, t.y + h, t.z, dx, dz, overkill ? 75 : 40, power + 3, colors);
    this.decals.splat(t.x, t.z, 0.5 + t.radius * 0.6, '#c4002a');
    this.confettiBurst(t.x, t.y + h, t.z, overkill ? 40 : 18, 6);
    t.rig.kit.flash(0);
    // The dead lose their color; their blood keeps it.
    t.rig.kit.tint(0);
    for (const m of t.rig.kit.list) if (m.userData.desat) this.draining.push({ m, t: 0 });
    const pieces = overkill ? t.rig.gibs : [t.rig.gibs[0], t.rig.tilt];
    // The body keeps the momentum of the blow that killed it, and while it is fast it
    // is a projectile: corpses and shrapnel are weapons too.
    const mass = t.mass ?? 1, l = Math.hypot(dx, dz) || 1;
    const launch = Math.min(18, (info.knock ?? 4) / Math.sqrt(mass) * 0.95);
    const proj = info.team === 'player' && launch > 6;
    const chain = (t.chain || 0) + 1;
    for (const piece of pieces) {
      const isCorpse = piece === t.rig.tilt || piece === t.rig.gibs[t.rig.gibs.length - 1];
      const sp = isCorpse ? launch : Math.max(power, launch) * fx.f(0.6, 1.1);
      const it = this.fling(piece, t.x, t.z, dx / l * sp + fx.f(-1.5, 1.5), isCorpse ? fx.f(1.5, 3) : fx.f(4, 10), dz / l * sp + fx.f(-1.5, 1.5), colors, isCorpse ? 0.5 : 0.18 * (t.rig.height ?? 1));
      if (proj) it.proj = { mass: isCorpse ? mass : 0.25, chain, hit: new Set([t]), bw: info.bowling ?? 0, pins: 0 };
      if (info.bowling) it.friction = 0.95; // Bowling Ball: the pieces roll instead of skidding to a stop
      if (isCorpse) this.fountain(piece, 1.4, colors);
    }
    if (overkill) {
      const n = Math.round(4 + t.radius * 8);
      for (let i = 0; i < n; i++) {
        const c = goreChunk(fx.pick(GORE_KINDS));
        c.position.set(t.x, t.y + h, t.z);
        g.scene.add(c);
        this.fling(c, t.x, t.z, dx * power * fx.f(0.4, 1.3) + fx.f(-3, 3), fx.f(4, 11), dz * power * fx.f(0.4, 1.3) + fx.f(-3, 3), colors, 0.1);
      }
    }
  }
  fling(obj, x, z, vx, vy, vz, colors, radius) {
    this.stats.gibs++;
    return this.debris.add(obj, {
      vx, vy, vz, radius, bounce: 0.35,
      onWall: (it, tx, tz) => this.game.bumpDebris(it, tx, tz),
      spin: [fx.f(-12, 12), fx.f(-12, 12), fx.f(-12, 12)],
      bleed: fx.f(0.6, 1.6),
      onBleed: (it, px, py, pz, dt) => { if (Math.random() < dt * 30) this.drop(px, py, pz, it.v.x * 0.2, 0.5, it.v.z * 0.2, fx.pick(colors), fx.f(0.04, 0.08)); },
      onBounce: (it, px, py, pz, where, sp) => {
        if (where === 'floor') this.decals.splat(px, pz, Math.min(0.35, 0.08 + sp * 0.02), '#c8002c', { dx: it.v.x, dz: it.v.z, speed: Math.hypot(it.v.x, it.v.z) * 3 });
        if (sp > 6) this.game.sfx.play('splat', { gap: 0.05, vol: 0.4 });
      },
    });
  }
  projectiles() {
    const g = this.game;
    for (const it of this.debris.items) {
      if (!it.proj || it.sink) continue;
      const sp = Math.hypot(it.v.x, it.v.z), p = it.obj.position;
      // Bowling Ball: heavier pieces keep rolling as threats at lower speed and hit wider.
      const bw = it.proj.bw;
      if (sp < (bw ? 3.5 : 5) || p.y > 1.6) { if (sp < 3) it.proj = null; continue; }
      for (const e of g.world.query(p.x, p.z, 0.35 + 0.2 * Math.min(2, bw), e => e.team === 'enemy' && e.hittable && !e.carried && e.def && !it.proj.hit.has(e))) {
        it.proj.hit.add(e);
        g.corpseImpact(it, e, sp);
        if (!it.proj) break;
      }
    }
  }
  fountain(obj, dur, colors) { this.fountains.push({ obj, t: dur, colors }); }
  // Stick blood blobs onto the wall face that was hit (one instanced mesh, ring buffer).
  wallSplat(x, z, nx, nz, r, amount, colors) {
    const sx = x - nx * r, sz = z - nz * r, tx = -nz, tz = nx;
    const n = Math.min(14, 4 + amount * 0.2), w = this.wallMesh, o = this._o ??= new THREE.Object3D();
    const put = (px, py, pz, sxs, sys, color) => {
      o.position.set(px, py, pz);
      o.lookAt(px + nx, py, pz + nz);
      o.scale.set(sxs, sys, 0.05);
      o.updateMatrix();
      const i = this.wallNext; this.wallNext = (i + 1) % this.wallMax;
      w.setMatrixAt(i, o.matrix); w.setColorAt(i, _c.set(color));
      w.count = Math.max(w.count, i + 1);
    };
    for (let i = 0; i < n; i++) {
      const off = fx.f(-0.7, 0.7), hgt = fx.f(0.1, 1.5), s = fx.f(0.1, 0.32), c = fx.pick(colors);
      put(sx + tx * off + nx * 0.02, hgt, sz + tz * off + nz * 0.02, s, s * fx.f(0.8, 1.8), c);
      if (Math.random() < 0.5) put(sx + tx * off + nx * 0.02, hgt - s * 1.2, sz + tz * off + nz * 0.02, s * 0.25, s * fx.f(1.5, 3), c); // drip
    }
    w.instanceMatrix.needsUpdate = true; w.instanceColor.needsUpdate = true;
    this.spray(sx, 0.8, sz, nx, nz, 30 + amount, 5, colors);
    this.decals.splat(sx + nx * 0.4, sz + nz * 0.4, 0.6, '#c4002a');
  }
  bakeSettled() {
    const objs = this.settled.splice(0);
    const batch = bakeStatic(objs, { shadow: false });
    for (const o of objs) o.parent?.remove(o);
    this.game.scene.add(batch);
    this.batches.push(batch);
    if (this.batches.length > (matchMedia('(pointer: coarse)').matches ? 18 : 36)) { const old = this.batches.shift(); this.game.scene.remove(old); old.traverse(m => m.geometry?.dispose()); }
  }
  update(dt) {
    this.blood.update(dt);
    this.confetti.update(dt);
    this.debris.update(dt);
    this.decals.update(dt);
    this.projectiles();
    for (let i = this.draining.length - 1; i >= 0; i--) { const d = this.draining[i]; d.t += dt; d.m.userData.desat.value = Math.min(1, d.t / 0.35); if (d.t >= 0.35) this.draining.splice(i, 1); }
    if (this.settled.length >= 10 || (this.settled.length && (this.bakeT = (this.bakeT ?? 0) + dt) > 3)) { this.bakeT = 0; this.bakeSettled(); }
    for (let i = this.fountains.length - 1; i >= 0; i--) {
      const f = this.fountains[i];
      f.t -= dt;
      if (f.t <= 0 || !f.obj.parent) { this.fountains.splice(i, 1); continue; }
      f.obj.getWorldPosition(_v);
      const n = Math.random() < f.t ? 2 : 1;
      for (let k = 0; k < n; k++) this.drop(_v.x, _v.y + 0.3, _v.z, fx.f(-1.5, 1.5), fx.f(5, 9) * Math.min(1, f.t + 0.3), fx.f(-1.5, 1.5), fx.pick(f.colors));
    }
  }
}
