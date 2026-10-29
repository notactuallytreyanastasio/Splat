// Gameplay bodies. A Creature owns a rig, physics (knockback, launch, bounce), and the
// spring animation that makes hits read physically. Player/enemies/boss add behaviour.
import * as THREE from 'three';
import { Entity } from '../engine/world/world.js';
import { fx } from '../engine/core/rng.js';
import * as M from './models.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angleTo = (ax, az, bx, bz) => Math.atan2(bx - ax, bz - az);
const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export const LAUNCH_SPEED = 7;

export const ENEMIES = {
  ladybug: { name: 'Ladybug', model: () => M.ladybug(), hp: 24, radius: 0.38, mass: 1, speed: 4.4, ai: 'melee', reach: 1.0, windup: 0.38, attackTime: 0.25, recover: 0.55, dmg: 9, lunge: 9, xp: 2, grab: true, blood: [0xd4002e, 0xff1f4f, 0xff7eb6] },
  caterpillar: { name: 'Caterpillar', model: () => M.caterpillar(5), hp: 46, radius: 0.45, mass: 1.4, speed: 2.1, ai: 'melee', reach: 1.0, windup: 0.5, attackTime: 0.3, recover: 0.6, dmg: 11, lunge: 6, xp: 3, grab: true, split: 'grub', blood: [0xd4002e, 0x7dffc0, 0xb6ffd9] },
  grub: { name: 'Grub', model: () => M.caterpillar(2), hp: 14, radius: 0.3, mass: 0.6, speed: 3.4, ai: 'melee', reach: 0.8, windup: 0.3, attackTime: 0.2, recover: 0.5, dmg: 5, lunge: 7, xp: 1, grab: true, blood: [0xd4002e, 0x7dffc0] },
  butterfly: { name: 'Butterfly', model: () => M.butterfly(), hp: 22, radius: 0.4, mass: 0.7, speed: 2.8, ai: 'ranged', range: [4.5, 7.5], fireEvery: 1.8, windup: 0.5, dmg: 10, xp: 3, grab: true, blood: [0xd4002e, 0xc8b2ff, 0xffe066] },
  beetle: { name: 'Rhino Beetle', model: () => M.beetle(), hp: 140, radius: 0.75, mass: 3.2, speed: 1.8, ai: 'brute', reach: 2.0, windup: 0.85, attackTime: 0.2, recover: 1.1, dmg: 24, xp: 8, grab: 'stunned', armor: 0.5, blood: [0xd4002e, 0x8fa8ff, 0xd4002e] },
};

let nextId = 1;

export class Creature extends Entity {
  constructor(game, x, z, rig) {
    super(x, z);
    this.id = nextId++;
    this.game = game;
    this.rig = rig;
    this.body = true;
    this.launchSpeed = LAUNCH_SPEED;
    this.restitution = 0.25;
    this.facing = 0;
    this.squash = 1; this.squashV = 0;
    this.leanX = 0; this.leanZ = 0; this.leanVX = 0; this.leanVZ = 0;
    this.spinYaw = 0; this.tumble = 0;
    this.flash = 0; this.flashColor = 0xffffff;
    this.stun = 0; this.inv = 0;
    this.desiredX = 0; this.desiredZ = 0; this.accel = 14;
    this.phase = Math.random() * TAU; this.t = Math.random() * 10; this.seed = Math.random() * 10;
    this.action = null; this.actionP = 0;
    this.thrownBy = null; this.chain = 0; this.impacted = new Set();
    this.carried = null;
    this.wounds = 0;
    this.groundFriction = 10;
    game.scene.add(rig.root);
  }
  get airborne() { return this.y > 0.02 || this.vy > 0; }
  // Only a body somebody else knocked is a projectile. A ladybug's own 9 u/s lunge must
  // not count, or the lunge flags it launched, the AI drops the attack, and it never bites.
  get launched() { return this.thrownBy != null && this.speed > this.launchSpeed; }
  get controllable() { return this.stun <= 0 && !this.airborne && !this.launched && !this.carried; }
  takeDamage(info) {
    if (this.dead || this.inv > 0 || this.carried) return false;
    this.hp -= info.amount;
    this.flash = 1; this.flashColor = info.flashColor ?? 0xffffff;
    const armor = this.armor ?? 0;
    const k = (info.knock ?? 0) * (1 - armor) / this.mass;
    this.vx += (info.dirX ?? 0) * k;
    this.vz += (info.dirZ ?? 0) * k;
    this.vy += (info.lift ?? 0) * (1 - armor) / Math.sqrt(this.mass);
    this.stun = Math.max(this.stun, info.stun ?? 0.2);
    this.squashV -= 7 + info.amount * 0.2;
    this.leanVX += (info.dirX ?? 0) * 9; this.leanVZ += (info.dirZ ?? 0) * 9;
    if (info.team === 'player') this.thrownBy = 'player';
    return true;
  }
  physics(dt) {
    if (this.carried) return;
    const sp = this.speed;
    if (this.controllable) {
      const k = Math.min(1, this.accel * dt);
      this.vx += (this.desiredX - this.vx) * k;
      this.vz += (this.desiredZ - this.vz) * k;
    } else {
      // Launched bodies slide like pucks: that is what makes them good projectiles.
      const fr = this.airborne ? 0.4 : sp > this.launchSpeed ? 1.1 : this.groundFriction * 0.6;
      const d = Math.exp(-fr * dt);
      this.vx *= d; this.vz *= d;
    }
    if (!this.launched) { this.impacted.clear(); if (!this.airborne && this.stun <= 0) { this.thrownBy = null; this.chain = 0; } }
    this.world.move(this, dt);
    if (this.airborne) {
      this.vy -= 30 * dt;
      this.y += this.vy * dt;
      if (!this.boss) this.tumble += dt * Math.min(18, sp * 1.4);
      if (this.y <= 0) {
        this.y = 0;
        const impact = -this.vy;
        if (impact > 7) { this.vy = impact * 0.32; this.game.onLand(this, impact); }
        else { this.vy = 0; this.tumble = 0; }
        this.squashV -= impact * 0.8;
      }
    } else this.tumble *= Math.exp(-12 * dt);
    if (sp > this.launchSpeed && !this.airborne) this.spinYaw += sp * dt * 1.6;
  }
  springs(dt) {
    this.squashV += (-(this.squash - 1) * 260 - this.squashV * 14) * dt;
    this.squash += this.squashV * dt;
    this.squash = clamp(this.squash, 0.55, 1.5);
    for (const a of ['X', 'Z']) {
      this['leanV' + a] += (-this['lean' + a] * 160 - this['leanV' + a] * 12) * dt;
      this['lean' + a] += this['leanV' + a] * dt;
    }
    this.flash = Math.max(0, this.flash - dt * 7);
    this.stun = Math.max(0, this.stun - dt);
    this.inv = Math.max(0, this.inv - dt);
  }
  faceToward(x, z, dt, rate = 12) {
    const target = angleTo(this.x, this.z, x, z);
    this.facing += angDiff(target, this.facing) * Math.min(1, rate * dt);
  }
  sync(dt) {
    const r = this.rig;
    this.t += dt;
    const sp = this.speed;
    if (!this.airborne) this.phase += sp * dt * 3.2;
    r.root.position.set(this.x, this.y, this.z);
    r.root.rotation.y = this.facing + this.spinYaw;
    const c = Math.cos(this.facing + this.spinYaw), s = Math.sin(this.facing + this.spinYaw);
    const lx = this.leanX * c - this.leanZ * s, lz = this.leanX * s + this.leanZ * c;
    r.tilt.rotation.x = clamp(lz, -0.9, 0.9) + this.tumble;
    r.tilt.rotation.z = -clamp(lx, -0.9, 0.9);
    const sq = this.squash;
    r.tilt.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    r.kit.flash(this.flash * 0.9, this.flashColor);
    r.pose(r, { t: this.t, phase: this.phase, walk: clamp(sp / (this.def?.speed ?? 4), 0, 1), action: this.action, p: this.actionP, combo: this.combo ?? 0, seed: this.seed, air: this.airborne || this.launched || !!this.carried });
  }
  addWound() {
    if (this.wounds >= 7) return;
    this.wounds++;
    const host = fx.pick(this.rig.gibs);
    const b = M.wallBlob(fx.pick([0xd4002e, 0xb8002a]));
    b.scale.set(fx.f(0.08, 0.16), fx.f(0.04, 0.08), fx.f(0.08, 0.16));
    b.position.set(fx.f(-0.2, 0.2), fx.f(-0.1, 0.25), fx.f(-0.2, 0.2));
    host.add(b);
  }
  onRemove() { if (this.rig.root.parent) this.rig.root.parent.remove(this.rig.root); }
}

// ------------------------------------------------------------------ player
export const BASE_STATS = {
  maxHp: 100, damage: 1, speed: 5.4, atkSpeed: 1, crit: 0.05, critMul: 2.2, lifesteal: 0, knock: 1, reach: 1,
  rageGain: 1, wallDamage: 1, explodeOnKill: 0, throwPower: 1, potionHeal: 45,
};

export class Player extends Creature {
  constructor(game, x, z) {
    super(game, x, z, M.knight());
    this.team = 'player';
    this.radius = 0.4; this.mass = 1.6;
    this.launchSpeed = Infinity;
    this.stats = { ...BASE_STATS };
    this.hp = this.stats.maxHp;
    this.rage = 0;
    this.potions = 2;
    this.combo = 0; this.comboTimer = 0;
    this.state = 'move'; this.stateT = 0; this.stateDur = 0;
    this.hitSet = new Set();
    this.dodgeCd = 0; this.heavyCd = 0;
    this.aimX = 0; this.aimZ = 1;
    this.holding = null;
    this.whirlTick = 0;
    this.accel = 22;
    // Ground ring + facing pip so you can find yourself in the gore.
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: 0xff5fa2, transparent: true, opacity: 0.9, depthWrite: false }));
    const pip = new THREE.Mesh(new THREE.CircleGeometry(0.16, 3), ring.material);
    ring.rotation.x = pip.rotation.x = -Math.PI / 2;
    pip.position.set(0, 0, 0.8); pip.rotation.z = Math.PI / 2;
    for (const m of [ring, pip]) { m.position.y = 0.035; m.renderOrder = 2; this.rig.root.add(m); }
  }
  get controllable() { return this.state !== 'dodge' && this.stun <= 0; }
  set(state, dur) { this.state = state; this.stateT = 0; this.stateDur = dur; this.hitSet.clear(); }
  update(dt) {
    const g = this.game, it = g.intent, st = this.stats;
    this.dodgeCd -= dt; this.heavyCd -= dt; this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.combo = 0;
    const al = Math.hypot(it.aimX, it.aimZ);
    if (al > 0.01) { this.aimX = it.aimX / al; this.aimZ = it.aimZ / al; }
    let mx = it.moveX, mz = it.moveZ;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    this.stateT += dt;
    const p = this.stateDur ? this.stateT / this.stateDur : 0;
    let moveMul = 1;
    // Buffer the non-attack buttons briefly so presses mid-swing are not eaten.
    for (const k of ['grab', 'heavy', 'dodge', 'special']) if (it[k]) this.buffer = { k, t: 0.35 };
    if (this.buffer && (this.buffer.t -= dt) <= 0) this.buffer = null;
    const want = k => it[k] || this.buffer?.k === k;
    const take = () => { this.buffer = null; };
    // Rolling cancels the tail of any swing.
    if (want('dodge') && this.dodgeCd <= 0 && ['light', 'finisher', 'heavy', 'throw'].includes(this.state) && (this.state !== 'heavy' || p > 0.65)) this.set('move', 0);

    if (it.potion && this.potions > 0 && this.hp < st.maxHp) {
      this.potions--; this.hp = Math.min(st.maxHp, this.hp + st.potionHeal);
      g.onPotion(this);
    }

    if (this.state === 'move' || this.state === 'carry') {
      if (this.holding) {
        if (it.attack || want('heavy') || want('special') || (want('grab') && this.holding.carryT > 0.15)) { take(); this.throwHeld(); }
        else if (want('dodge')) { take(); this.throwHeld(0.5); }
        moveMul = 0.8;
      } else if (want('dodge') && this.dodgeCd <= 0) {
        take();
        const dx = ml > 0.1 ? mx : this.aimX, dz = ml > 0.1 ? mz : this.aimZ, l = Math.hypot(dx, dz) || 1;
        this.set('dodge', 0.32); this.dodgeX = dx / l; this.dodgeZ = dz / l; this.inv = 0.36; this.dodgeCd = 0.5;
        g.sfx.play('dodge');
      } else if (want('special') && this.rage >= 100) {
        take(); this.rage = 0; this.set('whirl', 2.6); g.onWhirl(this);
      } else if (want('grab') && this.tryGrab()) {
        take();
      } else if (want('heavy') && this.heavyCd <= 0) {
        take(); this.set('heavy', 0.62 / st.atkSpeed); this.heavyCd = 0.9;
      } else if (it.attack) {
        this.startLight();
      }
    } else if (this.state === 'light' || this.state === 'finisher') {
      moveMul = 0.25;
      const active = this.state === 'finisher' ? [0.4, 0.6] : [0.25, 0.55];
      if (p >= active[0] && p <= active[1]) this.swing(this.state);
      if (p > 0.6 && it.attack) this.queued = true;
      if (p >= 1) { this.set('move', 0); if (this.queued && !this.buffer) { this.queued = false; this.startLight(); } this.queued = false; }
      if (p < 0.4) { this.vx += this.aimX * 22 * dt; this.vz += this.aimZ * 22 * dt; }
    } else if (this.state === 'heavy') {
      moveMul = p < 0.45 ? 0.15 : 0.05;
      if (p >= 0.45 && p <= 0.65) this.swing('heavy');
      if (p >= 1) this.set('move', 0);
    } else if (this.state === 'dodge') {
      this.vx = this.dodgeX * 13; this.vz = this.dodgeZ * 13;
      if (p >= 1) { this.set('move', 0); this.vx *= 0.3; this.vz *= 0.3; }
    } else if (this.state === 'whirl') {
      moveMul = 0.85;
      this.whirlTick -= dt;
      if (this.whirlTick <= 0) { this.whirlTick = 0.11; this.whirlHit(); }
      if (p >= 1) this.set('move', 0);
    } else if (this.state === 'throw') {
      moveMul = 0.3;
      if (p >= 1) this.set('move', 0);
    }

    const speed = st.speed * moveMul;
    this.desiredX = mx * speed; this.desiredZ = mz * speed;
    if (this.state === 'dodge') { /* velocity set directly */ }
    else this.physics(dt);
    if (this.state === 'dodge') this.world.move(this, dt);

    // Face the aim while fighting, the stick while walking.
    const fighting = ['light', 'finisher', 'heavy', 'throw'].includes(this.state) || this.holding;
    if (fighting) this.facing += angDiff(Math.atan2(this.aimX, this.aimZ), this.facing) * Math.min(1, 20 * dt);
    else if (ml > 0.1 && this.state !== 'whirl') this.facing += angDiff(Math.atan2(mx, mz), this.facing) * Math.min(1, 14 * dt);

    if (this.holding) {
      const h = this.holding;
      h.x = this.x; h.z = this.z; h.y = 1.6; h.vx = h.vy = h.vz = 0;
      h.facing = this.facing; h.tumble = Math.PI + Math.sin(this.t * 18) * 0.25;
      h.carryT = (h.carryT ?? 0) + dt;
    }
    this.action = this.holding ? 'carry' : this.state === 'move' ? null : this.state;
    this.actionP = clamp(p, 0, 1);
    this.springs(dt);
  }
  startLight() {
    const finisher = this.combo === 2;
    this.set(finisher ? 'finisher' : 'light', (finisher ? 0.48 : 0.3) / this.stats.atkSpeed);
    this.comboStep = this.combo;
    this.combo = (this.combo + 1) % 3;
    this.comboTimer = 0.9;
    this.game.sfx.play('swing', { pitch: finisher ? 0.7 : 1 + this.comboStep * 0.1 });
    this.game.onSwing(this, this.state);
  }
  swing(kind) {
    const g = this.game, st = this.stats;
    const spec = {
      light: { range: 1.9, arc: 2.1, dmg: 12, knock: 5, lift: 1.5, stun: 0.35 },
      finisher: { range: 2.1, arc: 2.4, dmg: 22, knock: 12, lift: 6, stun: 0.8 },
      heavy: { range: 2.5, arc: 2.9, dmg: 30, knock: 17, lift: 3.5, stun: 1.2 },
    }[kind];
    const range = spec.range * st.reach, aim = Math.atan2(this.aimX, this.aimZ);
    for (const e of g.world.query(this.x, this.z, range, e => e.hittable && e !== this && !this.hitSet.has(e))) {
      const a = angleTo(this.x, this.z, e.x, e.z);
      if (Math.abs(angDiff(a, aim)) > spec.arc / 2 && Math.hypot(e.x - this.x, e.z - this.z) > e.radius + 0.5) continue;
      this.hitSet.add(e);
      if (e.reflect) { e.reflect(this.aimX, this.aimZ); continue; }
      // Knock along the aim line, not radially, so you can steer bodies into each other.
      let dx = kind === 'light' ? Math.sin(a) + this.aimX : this.aimX, dz = kind === 'light' ? Math.cos(a) + this.aimZ : this.aimZ;
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      g.damage(e, { amount: spec.dmg, dirX: dx, dirZ: dz, knock: spec.knock * st.knock, lift: spec.lift, stun: spec.stun, team: 'player', kind, source: this });
    }
  }
  whirlHit() {
    const g = this.game;
    g.sfx.play('swing', { pitch: 1.4, gap: 0.08 });
    for (const e of g.world.query(this.x, this.z, 2.2, e => e.hittable && e !== this)) {
      if (e.reflect) { e.reflect(e.x - this.x, e.z - this.z); continue; }
      const a = angleTo(this.x, this.z, e.x, e.z);
      // Outward plus tangential: the blender flings things in a spiral.
      g.damage(e, { amount: 6, dirX: Math.sin(a) * 0.7 + Math.cos(a) * 0.7, dirZ: Math.cos(a) * 0.7 - Math.sin(a) * 0.7, knock: 7 * this.stats.knock, lift: 2.5, stun: 0.3, team: 'player', kind: 'whirl', source: this });
    }
  }
  tryGrab() {
    const g = this.game;
    const e = g.world.nearest(this.x + this.aimX * 0.6, this.z + this.aimZ * 0.6, e => e.grabbable && e.grabbable(), 1.7);
    if (!e) return false;
    this.holding = e; e.carried = this; e.thrownBy = 'player';
    e.stun = 99; this.state = 'carry';
    g.onGrab(this, e);
    return true;
  }
  throwHeld(power = 1) {
    const g = this.game, e = this.holding;
    this.holding = null;
    e.carried = null; e.stun = 1.2; e.carryT = 0;
    const sp = 19 * power * this.stats.throwPower;
    e.x = this.x + this.aimX * 0.7; e.z = this.z + this.aimZ * 0.7; e.y = 1.2;
    e.vx = this.aimX * sp; e.vz = this.aimZ * sp; e.vy = 2.5;
    e.thrownBy = 'player'; e.chain = 0; e.impacted.clear();
    this.set('throw', 0.25);
    g.onThrow(this, e);
  }
  takeDamage(info) {
    if (this.state === 'dodge' || this.inv > 0 || this.game.god) return false;
    this.hp -= info.amount;
    this.flash = 1; this.flashColor = 0xff3060;
    this.vx += (info.dirX ?? 0) * (info.knock ?? 4) / this.mass;
    this.vz += (info.dirZ ?? 0) * (info.knock ?? 4) / this.mass;
    this.inv = 0.6;
    this.squashV -= 8;
    this.leanVX += (info.dirX ?? 0) * 8; this.leanVZ += (info.dirZ ?? 0) * 8;
    if (this.holding && info.amount > 10) this.throwHeld(0.3);
    return true;
  }
  physics(dt) { super.physics(dt); }
}

// ------------------------------------------------------------------ enemies
export class Enemy extends Creature {
  constructor(game, x, z, type, { elite = false, room = -1, index = 0 } = {}) {
    const def = ENEMIES[type];
    super(game, x, z, def.model());
    this.type = type; this.def = def; this.team = 'enemy'; this.room = room; this.elite = elite;
    this.hittable = true;
    this.radius = def.radius * (elite ? 1.25 : 1);
    this.mass = def.mass * (elite ? 1.5 : 1);
    // Deeper rooms hit harder and take longer to pop.
    this.dmgMul = (1 + index * 0.15) * (elite ? 1.4 : 1);
    this.windup = (def.windup ?? 0.5) * (1 - index * 0.08);
    this.maxHp = this.hp = Math.round(def.hp * (elite ? 1.9 : 1) * (1 + index * 0.15) * (game.difficulty ?? 1));
    this.armor = def.armor ?? 0;
    this.speed0 = def.speed * (elite ? 1.1 : 1) * fx.f(0.9, 1.1);
    this.state = 'idle'; this.stateT = 0; this.cooldown = fx.f(0.2, 1.2);
    this.strafe = fx.sign() * fx.f(0.2, 0.6);
    this.active = false;
    if (elite) {
      this.rig.root.scale.multiplyScalar(1.25);
      this.eliteHue = Math.random();
    }
    this.facing = Math.random() * TAU;
    if (this.rig.hover) this.flying = true;
  }
  grabbable() {
    if (this.dead || this.carried) return false;
    if (this.def.grab === true) return true;
    return this.def.grab === 'stunned' && this.stun > 0.2;
  }
  set(state) { this.state = state; this.stateT = 0; }
  update(dt) {
    const g = this.game, pl = g.player;
    this.stateT += dt;
    if (this.carried) {
      this.action = null;
      if (this.carryT > 0.5 && Math.random() < dt * 3) g.gore.drip(this);
      this.springs(dt);
      return;
    }
    this.cooldown -= dt;
    this.desiredX = this.desiredZ = 0;
    if (this.active && this.controllable && pl && !pl.dead) this.think(dt, pl);
    else if (!this.controllable && this.state !== 'idle') { this.set('chase'); this.action = null; }
    this.physics(dt);
    this.springs(dt);
    if (this.launched && this.thrownBy === 'player' && Math.random() < dt * 40) this.game.gore.trail(this);
    if (this.elite) this.rig.kit.flash(Math.max(this.flash * 0.9, 0.18), this.flash > 0.1 ? 0xffffff : new THREE.Color().setHSL((this.t * 0.5 + this.eliteHue) % 1, 1, 0.6).getHex());
  }
  // Steering toward the player: direct when visible, flow field otherwise.
  chaseDir(pl) {
    const g = this.game;
    if (g.map.los(this.x, this.z, pl.x, pl.z)) {
      const dx = pl.x - this.x, dz = pl.z - this.z, l = Math.hypot(dx, dz) || 1;
      return { x: dx / l, z: dz / l };
    }
    return g.flow.dirAt(this.x, this.z) ?? { x: 0, z: 0 };
  }
  think(dt, pl) {
    const def = this.def, d = Math.hypot(pl.x - this.x, pl.z - this.z);
    const sp = this.speed0;
    if (def.ai === 'melee' || def.ai === 'brute') {
      if (this.state === 'idle' || this.state === 'chase') {
        this.action = null;
        this.state = 'chase';
        const dir = this.chaseDir(pl);
        // Orbit a little instead of queueing in a conga line.
        const s = d > 2.5 ? this.strafe : 0;
        this.desiredX = (dir.x - dir.z * s) * sp; this.desiredZ = (dir.z + dir.x * s) * sp;
        this.faceToward(this.x + dir.x, this.z + dir.z, dt);
        if (d < def.reach + pl.radius + 0.3 && this.cooldown <= 0) {
          this.set('windup');
          this.lockX = (pl.x - this.x) / d; this.lockZ = (pl.z - this.z) / d;
          if (def.ai === 'brute') this.tele = this.game.telegraphCircle(this.x + this.lockX * 1.3, this.z + this.lockZ * 1.3, 1.7, this.windup);
          this.game.sfx.play('windup', { pitch: def.ai === 'brute' ? 0.5 : 1.3 });
        }
      } else if (this.state === 'windup') {
        this.action = 'windup'; this.actionP = this.stateT / this.windup;
        this.faceToward(this.x + this.lockX, this.z + this.lockZ, dt, 20);
        this.flash = Math.max(this.flash, 0.25 + 0.25 * Math.sin(this.stateT * 40));
        this.flashColor = 0xff5f9e;
        if (this.stateT >= this.windup) {
          this.set('attack'); this.hitDone = false;
          if (def.lunge) { this.vx = this.lockX * def.lunge; this.vz = this.lockZ * def.lunge; this.lungeT = 0.15; }
        }
      } else if (this.state === 'attack') {
        this.action = 'attack'; this.actionP = this.stateT / def.attackTime;
        if (this.lungeT > 0) { this.lungeT -= dt; this.desiredX = this.lockX * def.lunge; this.desiredZ = this.lockZ * def.lunge; }
        if (!this.hitDone) {
          const reach = def.ai === 'brute' ? 1.7 : def.reach * 0.75;
          const cx = def.ai === 'brute' ? this.x + this.lockX * 1.3 : this.x + this.lockX * def.reach * 0.4;
          const cz = def.ai === 'brute' ? this.z + this.lockZ * 1.3 : this.z + this.lockZ * def.reach * 0.4;
          if (def.ai === 'brute') { this.hitDone = true; this.game.slam(cx, cz, 1.7, this); }
          if (Math.hypot(pl.x - cx, pl.z - cz) < reach + pl.radius) {
            this.hitDone = true;
            this.game.damage(pl, { amount: Math.round(def.dmg * this.dmgMul), dirX: this.lockX, dirZ: this.lockZ, knock: def.ai === 'brute' ? 14 : 6, team: 'enemy', source: this });
          }
        }
        if (this.stateT >= def.attackTime) { this.set('recover'); this.action = null; }
      } else if (this.state === 'recover') {
        if (this.stateT >= def.recover) { this.set('chase'); this.cooldown = fx.f(0.3, 0.9); }
      }
    } else if (def.ai === 'ranged') {
      const [near, far] = def.range;
      this.faceToward(pl.x, pl.z, dt);
      if (this.state === 'windup') {
        this.action = 'windup'; this.actionP = this.stateT / def.windup;
        this.flash = Math.max(this.flash, 0.2 + 0.2 * Math.sin(this.stateT * 40)); this.flashColor = 0xffe066;
        if (this.stateT >= def.windup) {
          // Lead the target a little so standing still is not a strategy.
          const lead = d / 7.5 * 0.6;
          this.game.spawnPollen(this, pl.x + pl.vx * lead, pl.z + pl.vz * lead, Math.round(def.dmg * this.dmgMul));
          this.set('chase'); this.action = 'attack'; this.actionP = 0; this.cooldown = def.fireEvery * fx.f(0.8, 1.2);
        }
        return;
      }
      this.action = null;
      this.state = 'chase';
      const seen = this.game.map.los(this.x, this.z, pl.x, pl.z);
      let dir = this.chaseDir(pl), m = 0;
      if (!seen || d > far) m = 1; else if (d < near) m = -1;
      const sx = -dir.z * this.strafe * 1.6, sz = dir.x * this.strafe * 1.6;
      this.desiredX = (dir.x * m + sx) * sp; this.desiredZ = (dir.z * m + sz) * sp;
      if (seen && d < far + 1 && this.cooldown <= 0) { this.set('windup'); this.game.sfx.play('windup', { pitch: 1.8 }); }
    }
  }
  onWall(hit) { if (hit.speed > 6 && this.thrownBy === 'player') this.game.wallSlam(this, hit); }
}

// ------------------------------------------------------------------ boss
export class Mantis extends Creature {
  constructor(game, x, z, room) {
    super(game, x, z, M.mantis());
    this.def = { name: 'Empress Mantis', speed: 2.4, blood: [0xd4002e, 0x7dffc0, 0xb6ffd9], xp: 40 };
    this.team = 'enemy'; this.room = room; this.boss = true; this.hittable = true;
    this.radius = 1.1; this.mass = 9; this.armor = 0.6;
    this.maxHp = this.hp = Math.round(1300 * (game.difficulty ?? 1));
    this.state = 'idle'; this.stateT = 0; this.cooldown = 1.5; this.active = false;
    this.launchSpeed = 30;
    this.phase2 = false;
    this.pattern = 0;
  }
  grabbable() { return false; }
  set(state) { this.state = state; this.stateT = 0; }
  takeDamage(info) {
    // Swords barely scratch her unless she is dazed; her own children, thrown, hurt a lot.
    if (info.kind === 'impact') info.amount *= 2;
    else if (this.state !== 'stunned' && info.team === 'player' && !['wall', 'boom'].includes(info.kind)) info.amount *= 0.45;
    info.amount = Math.round(info.amount);
    const ok = super.takeDamage({ ...info, lift: 0, stun: 0 });
    if (ok && !this.phase2 && this.hp < this.maxHp * 0.5) { this.phase2 = true; this.game.onBossPhase(this); }
    return ok;
  }
  get controllable() { return !this.airborne; }
  update(dt) {
    const g = this.game, pl = g.player;
    this.stateT += dt; this.cooldown -= dt;
    this.desiredX = this.desiredZ = 0;
    if (this.active && pl && !pl.dead) this.think(dt, pl);
    this.accel = this.state === 'charge' ? 30 : 6;
    this.physics(dt);
    this.springs(dt);
  }
  think(dt, pl) {
    const g = this.game, d = Math.hypot(pl.x - this.x, pl.z - this.z), fast = this.phase2 ? 1.35 : 1;
    const toX = (pl.x - this.x) / (d || 1), toZ = (pl.z - this.z) / (d || 1);
    switch (this.state) {
      case 'idle': case 'stalk': {
        this.state = 'stalk'; this.action = null;
        this.faceToward(pl.x, pl.z, dt, 4);
        if (d > 3) { this.desiredX = toX * 2.4 * fast; this.desiredZ = toZ * 2.4 * fast; }
        if (this.cooldown > 0) break;
        // Sweep when crowded, but never twice in a row: hugging her must not stall her pattern.
        if (d < 4.2 && !this.justSwept) { this.justSwept = true; this.set('telegraph'); this.next = 'sweep'; this.tele = g.telegraphArc(this, 4.2, 3.6, 0.7 / fast); g.sfx.play('screech', { pitch: 1.2 }); break; }
        this.justSwept = false;
        const pick = ['summon', 'charge', 'nova', 'summon', 'charge'][this.pattern++ % 5];
        if (pick === 'charge') {
          this.set('telegraph'); this.next = 'charge';
          this.lockX = toX; this.lockZ = toZ;
          this.tele = g.telegraphLine(this.x, this.z, toX, toZ, 16, 1.6, 0.9 / fast);
          g.sfx.play('screech', { pitch: 0.8 });
        } else if (pick === 'nova') { this.set('cast'); this.next = 'nova'; }
        else { this.set('cast'); this.next = 'summon'; }
        break;
      }
      case 'telegraph':
        this.action = 'telegraph';
        if (this.next === 'sweep') this.faceToward(pl.x, pl.z, dt, 3);
        else this.faceToward(this.x + this.lockX, this.z + this.lockZ, dt, 20);
        if (this.stateT >= (this.next === 'sweep' ? 0.7 : 0.9) / fast) {
          if (this.next === 'sweep') { this.set('sweep'); this.swept = false; g.sfx.play('swing', { pitch: 0.5 }); }
          else { this.set('charge'); g.sfx.play('roar'); }
        }
        break;
      case 'sweep':
        this.action = 'sweep'; this.actionP = this.stateT / 0.6;
        if (!this.swept && this.stateT > 0.18) {
          this.swept = true;
          const a = this.facing;
          for (const e of g.world.query(this.x, this.z, 4.2, e => e !== this && (e === pl || e.team === 'enemy'))) {
            const ea = angleTo(this.x, this.z, e.x, e.z);
            if (Math.abs(angDiff(ea, a)) > 1.8) continue;
            const info = { amount: e === pl ? 22 : 40, dirX: Math.sin(ea), dirZ: Math.cos(ea), knock: 16, lift: 4, team: 'boss', kind: 'scythe', source: this };
            g.damage(e, info);
          }
        }
        if (this.stateT > 0.6) { this.set('stalk'); this.cooldown = 0.8 / fast; }
        break;
      case 'charge':
        this.action = 'charge';
        this.desiredX = this.lockX * 15 * fast; this.desiredZ = this.lockZ * 15 * fast;
        if (Math.hypot(pl.x - this.x, pl.z - this.z) < this.radius + pl.radius + 0.3 && !this.chargeHit) {
          this.chargeHit = true;
          g.damage(pl, { amount: 24, dirX: this.lockX, dirZ: this.lockZ, knock: 20, team: 'boss', source: this });
        }
        // Anything small in her way gets mulched.
        for (const e of g.world.query(this.x, this.z, this.radius + 0.2, e => e.team === 'enemy' && e !== this && !e.carried)) {
          g.damage(e, { amount: 60, dirX: this.lockX + (fx.f() - 0.5), dirZ: this.lockZ + (fx.f() - 0.5), knock: 18, lift: 6, team: 'boss', kind: 'trample', source: this });
        }
        if (this.stateT > 2.2) { this.set('stalk'); this.chargeHit = false; this.cooldown = 1; }
        break;
      case 'stunned':
        this.action = 'stunned';
        if (this.stateT > (this.phase2 ? 2.0 : 2.6)) { this.set('stalk'); this.cooldown = 0.6; }
        break;
      case 'cast':
        this.action = 'cast';
        this.faceToward(pl.x, pl.z, dt, 6);
        if (this.stateT > 0.8 / fast && !this.cast) {
          this.cast = true;
          if (this.next === 'nova') g.pollenNova(this, this.phase2 ? 2 : 1);
          else g.summon(this, this.phase2 ? 5 : 4);
        }
        if (this.stateT > 1.3 / fast) { this.cast = false; this.set('stalk'); this.cooldown = 1.0 / fast; }
        break;
    }
  }
  onWall(hit) {
    if (this.state === 'charge' && hit.speed > 5) {
      this.set('stunned'); this.chargeHit = false;
      this.vx = hit.nx * 4; this.vz = hit.nz * 4;
      this.game.onBossWall(this, hit);
    }
  }
}

// ------------------------------------------------------------------ small things
export class Pollen extends Entity {
  constructor(game, x, z, vx, vz, dmg, { heart = false } = {}) {
    super(x, z);
    this.game = game; this.vx = vx; this.vz = vz; this.dmg = dmg; this.y = heart ? 1.0 : 1.0;
    this.radius = 0.22; this.team = 'enemy'; this.hittable = true; this.restitution = 0;
    const k = game.goreKit;
    this.mesh = heart ? k.part('heart', 0xff5fa2, { s: 0.45, outline: 0.03 }) : k.part('sphere', 0xffe066, { s: 0.38, outline: 0.03, mat: { emissive: 0xffd23a, emissiveIntensity: 0.5 } });
    game.scene.add(this.mesh);
    this.life = 5;
  }
  reflect(dx, dz) {
    const l = Math.hypot(dx, dz) || 1, sp = Math.hypot(this.vx, this.vz) * 1.6 + 4;
    this.vx = dx / l * sp; this.vz = dz / l * sp;
    this.team = 'player'; this.dmg *= 2.5;
    this.game.onReflect(this);
  }
  update(dt) {
    this.life -= dt;
    const wall = this.world.move(this, dt);
    if (wall || this.life <= 0) { this.pop(); return; }
    const g = this.game;
    if (this.team === 'enemy') {
      const pl = g.player;
      if (pl && Math.hypot(pl.x - this.x, pl.z - this.z) < pl.radius + this.radius) {
        const l = Math.hypot(this.vx, this.vz) || 1;
        if (g.damage(pl, { amount: this.dmg, dirX: this.vx / l, dirZ: this.vz / l, knock: 4, team: 'enemy', source: this })) this.pop();
      }
    } else {
      for (const e of g.world.query(this.x, this.z, this.radius, e => e.team === 'enemy' && e.hittable && !(e instanceof Pollen))) {
        const l = Math.hypot(this.vx, this.vz) || 1;
        g.damage(e, { amount: this.dmg, dirX: this.vx / l, dirZ: this.vz / l, knock: 8, lift: 2, team: 'player', kind: 'reflect', source: this });
        this.pop(); break;
      }
    }
    this.mesh.position.set(this.x, this.y + Math.sin(this.age * 12) * 0.08, this.z);
    this.mesh.rotation.y += dt * 8;
  }
  pop() { this.dead = true; this.game.gore.puff(this.x, this.y, this.z, this.team === 'player' ? 0xff9ecb : 0xffe066); }
  onRemove() { this.game.scene.remove(this.mesh); }
}

export class Gem extends Entity {
  constructor(game, x, z, value) {
    super(x, z);
    this.game = game; this.value = value; this.radius = 0.2; this.collides = true; this.restitution = 0.5;
    const col = value >= 5 ? 0xff5fa2 : M.RAINBOW[(Math.random() * 6) | 0];
    this.mesh = game.goreKit.part('lowSphere', col, { s: [0.22, 0.32, 0.22].map(v => v * (value >= 5 ? 1.5 : 1)), outline: 0.025, mat: { emissive: col, emissiveIntensity: 0.25 } });
    game.scene.add(this.mesh);
    const a = Math.random() * TAU, sp = fx.f(1.5, 5);
    this.vx = Math.cos(a) * sp; this.vz = Math.sin(a) * sp; this.vy = fx.f(5, 9); this.y = 0.6;
  }
  update(dt) {
    const pl = this.game.player;
    this.vx *= Math.exp(-2 * dt); this.vz *= Math.exp(-2 * dt);
    if (pl && this.age > 0.5) {
      const dx = pl.x - this.x, dz = pl.z - this.z, d = Math.hypot(dx, dz);
      if (d < 3.2) { const pull = (3.2 - d) * 14; this.vx += dx / d * pull * dt; this.vz += dz / d * pull * dt; }
      if (d < 0.5) { this.dead = true; this.game.onGem(this); return; }
    }
    this.world.move(this, dt);
    this.vy -= 25 * dt; this.y += this.vy * dt;
    if (this.y < 0.25) { this.y = 0.25; this.vy = Math.abs(this.vy) > 3 ? -this.vy * 0.4 : 0; }
    this.mesh.position.set(this.x, this.y + (this.vy === 0 ? Math.sin(this.age * 4) * 0.06 + 0.06 : 0), this.z);
    this.mesh.rotation.y += dt * 3;
  }
  onRemove() { this.game.scene.remove(this.mesh); }
}

export class Potion extends Entity {
  constructor(game, x, z) {
    super(x, z);
    this.game = game; this.radius = 0.25;
    const k = game.goreKit, g = new THREE.Group();
    k.part('sphere', 0xff5fa2, { s: [0.32, 0.3, 0.32], p: [0, 0.16, 0], parent: g, mat: { emissive: 0xff5fa2, emissiveIntensity: 0.3 } });
    k.part('cylinder', 0xfff3e0, { s: [0.12, 0.14, 0.12], p: [0, 0.36, 0], parent: g });
    k.part('heart', 0xffffff, { s: 0.14, p: [0, 0.16, 0.16], parent: g, outline: 0.01 });
    this.mesh = g; game.scene.add(g);
  }
  update(dt) {
    const pl = this.game.player;
    this.mesh.position.set(this.x, 0.15 + Math.sin(this.age * 3) * 0.08, this.z);
    this.mesh.rotation.y += dt * 2;
    if (pl && Math.hypot(pl.x - this.x, pl.z - this.z) < 0.7 && pl.potions < 5) { this.dead = true; this.game.onPickupPotion(this); }
  }
  onRemove() { this.game.scene.remove(this.mesh); }
}

// Breakables: nectar jars (one hit) and the reward cocoon that appears on room clear.
export class Breakable extends Entity {
  constructor(game, x, z, kind) {
    super(x, z);
    this.game = game; this.kind = kind; this.hittable = true; this.team = 'prop';
    this.radius = kind === 'cocoon' ? 0.6 : 0.35;
    this.hp = kind === 'cocoon' ? 3 : 1;
    this.body = true; this.mass = 50; this.collides = true;
    const k = game.goreKit, g = new THREE.Group();
    if (kind === 'jar') {
      k.part('cylinder', 0xd8f6ff, { s: [0.5, 0.55, 0.5], p: [0, 0.28, 0], parent: g, mat: { transparent: true, opacity: 0.65 } });
      k.part('sphere', 0xffc94d, { s: [0.42, 0.3, 0.42], p: [0, 0.18, 0], parent: g, outline: false });
      k.part('cylinder', 0xff9ecb, { s: [0.36, 0.1, 0.36], p: [0, 0.6, 0], parent: g });
    } else {
      for (let i = 0; i < 5; i++) k.part('sphere', M.RAINBOW[i], { s: [0.9 - Math.abs(i - 2) * 0.15, 0.32, 0.9 - Math.abs(i - 2) * 0.15], p: [0, 0.25 + i * 0.25, 0], parent: g });
      k.part('cylinder', 0x7bc47f, { s: [0.04, 2, 0.04], p: [0, 2.2, 0], parent: g, outline: 0.012 });
    }
    this.mesh = g; this.squash = 1; this.squashV = 0;
    g.position.set(x, 0, z);
    game.scene.add(g);
  }
  takeDamage(info) {
    this.hp--; this.squashV -= 6;
    this.game.onBreakableHit(this, info);
    if (this.hp <= 0) { this.dead = true; this.game.onBreak(this, info); }
    return true;
  }
  update(dt) {
    this.squashV += (-(this.squash - 1) * 200 - this.squashV * 10) * dt;
    this.squash += this.squashV * dt;
    this.mesh.scale.set(1 / Math.sqrt(this.squash), this.squash, 1 / Math.sqrt(this.squash));
    if (this.kind === 'cocoon') this.mesh.rotation.z = Math.sin(this.age * 2) * 0.05;
  }
  onRemove() { this.game.scene.remove(this.mesh); }
}
