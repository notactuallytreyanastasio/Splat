// Autopilot. Plays like a competent-but-greedy human: dodges telegraphs, fights in the
// thick of it, throws small bugs at big ones, loots, then walks to the next door. It
// produces the same intent a keyboard does, so it exercises the real controls.
import { emptyIntent } from '../engine/core/input.js';
import { Pollen, Gem, Potion, Breakable, Enemy } from './actors.js';

const BOON_PRIORITY = ['confetti', 'sharp', 'vamp', 'bonk', 'sugar', 'crit', 'frost', 'long', 'yeet', 'rage', 'nectar'];

export class Bot {
  constructor(game, skill = 1) {
    this.g = game;
    // skill < 1 models a human: some threats go unnoticed (re-rolled every 0.6s).
    this.skill = skill; this.alertT = 0; this.alert = true;
    this.path = null; this.pathT = 0; this.goal = null;
    this.stuckT = 0; this.lastX = 0; this.lastZ = 0;
    this.holdT = 0;
    this.attackHold = 0;
  }
  think(dt) {
    const g = this.g, p = g.player, it = emptyIntent();
    if (g.offers) {
      const ids = g.offers.map(b => b.id);
      let best = 0, bestRank = 99;
      ids.forEach((id, i) => { const r = BOON_PRIORITY.indexOf(id); if (r >= 0 && r < bestRank) { bestRank = r; best = i; } });
      it.choose = best;
      return it;
    }
    if (p.dead || p.ghost || g.state !== 'play') return it;
    const ents = g.world.entities;
    this.ignore ??= new Map();
    const now = g.time;
    const foes = ents.filter(e => !e.dead && e.team === 'enemy' && e.hittable && !(e instanceof Pollen) && e.active && !e.carried && !(this.ignore.get(e) > now));
    const dist = e => Math.hypot(e.x - p.x, e.z - p.z);
    const aimAt = (x, z) => { it.aimX = x - p.x; it.aimZ = z - p.z; };
    const moveTo = (x, z, stop = 0.3) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d < stop) return true;
      if (g.map.los(p.x, p.z, x, z)) { it.moveX = dx / d; it.moveZ = dz / d; return false; }
      return this.follow(x, z, it, dt);
    };

    // 1. Survive: dodge whatever is about to hit us.
    if ((this.alertT -= dt) <= 0) { this.alertT = 0.6; this.alert = Math.random() < this.skill; }
    // Parry when the cue says now (the same cue a human gets).
    if (this.alert && g.threat < 0.18 && p.parryCd <= 0 && Math.random() < 0.8) it.parry = true;
    const danger = this.alert ? this.danger(foes) : null;
    if (danger && p.dodgeCd <= 0) {
      it.moveX = danger.x; it.moveZ = danger.z; it.dodge = true; it.aimX = danger.x; it.aimZ = danger.z;
      return it;
    }
    if (p.hp < p.stats.maxHp * 0.4 && p.potions > 0) it.potion = true;

    // 2. Holding something: throw it at the juiciest target.
    if (p.holding) {
      this.holdT += dt;
      const targets = foes.filter(e => e !== p.holding);
      const t = targets.find(e => e.boss) ?? targets.sort((a, b) => dist(a) - dist(b))[0];
      if (t) aimAt(t.x, t.z);
      if (this.holdT > 0.35) { it.attack = true; this.holdT = 0; }
      return it;
    }

    // 3. Fight.
    if (foes.length) {
      const boss = foes.find(e => e.boss);
      const near = foes.filter(e => dist(e) < 2.6);
      const target = boss && near.length < 2 && !foes.some(e => !e.boss && dist(e) < 4) ? boss : foes.slice().sort((a, b) => dist(a) - dist(b))[0];
      const d = dist(target);
      // Give up on anything we have chased for 6s without hurting (stuck in a corner, unreachable).
      if (target !== this.target || target.hp < this.targetHp) { this.target = target; this.targetHp = target.hp; this.targetT = now; }
      if (now - this.targetT > 6 && !target.boss) { this.ignore.set(target, now + 15); this.target = null; }
      // Throw a small bug at the boss or a crowd if one is right here.
      const grabbable = foes.find(e => e.grabbable?.() && dist(e) < 1.5) ?? (boss ? foes.find(e => e.baby && e.grabbable() && dist(e) < 4) : null);
      const throwTarget = boss ?? (foes.length >= 3 ? target : null);
      this.grabCd = (this.grabCd ?? 0) - dt;
      if (grabbable && throwTarget && grabbable !== throwTarget && this.grabCd <= 0) { aimAt(grabbable.x, grabbable.z); it.grab = true; this.grabCd = boss ? 0.5 : 2.5; this.grabbing = 0.35; return it; }
      // Hold off swinging while a grab is buffered.
      if ((this.grabbing = (this.grabbing ?? 0) - dt) > 0 && grabbable) { aimAt(grabbable.x, grabbable.z); moveTo(grabbable.x, grabbable.z, 0.6); return it; }
      if (p.rage >= 100 && (near.length >= 3 || (boss && dist(boss) < 3))) { it.special = true; }
      if (p.state === 'whirl') { moveTo(target.x, target.z, 0.5); return it; }
      const reach = target.boss ? 2.6 : 1.7;
      if (d < reach) {
        aimAt(target.x, target.z);
        // Batter Up: if another bug sits behind this one, aim to send one into the other.
        const tx = target.x - p.x, tz = target.z - p.z;
        const behind = foes.find(e => e !== target && !e.boss && Math.hypot(e.x - target.x, e.z - target.z) < 7 &&
          ((e.x - target.x) * tx + (e.z - target.z) * tz) / (Math.hypot(e.x - target.x, e.z - target.z) * d) > 0.55) ?? (boss !== target ? boss : null);
        if (behind && p.heavyCd <= 0 && !target.boss) { it.aimX = behind.x - target.x; it.aimZ = behind.z - target.z; it.heavy = true; }
        else if (near.length >= 3 && p.heavyCd <= 0) it.heavy = true;
        else it.attack = true;
        // Stay at striking distance from the boss instead of hugging her.
        if (target.boss && d < 1.9) { it.moveX = (p.x - target.x) / d; it.moveZ = (p.z - target.z) / d; }
      } else {
        // Butterflies stay away: dash in.
        if (target.def?.ai === 'ranged' && d > 4 && p.dodgeCd <= 0 && g.map.los(p.x, p.z, target.x, target.z) && Math.random() < 0.05) {
          it.dodge = true; it.moveX = (target.x - p.x) / d; it.moveZ = (target.z - p.z) / d;
          return it;
        }
        moveTo(target.x, target.z, 0.5);
        aimAt(target.x, target.z);
      }
      this.unstick(it, dt);
      return it;
    }

    // 4. Loot: cocoons and jars in reach, then gems and potions.
    const loot = ents.filter(e => !e.dead && ((e instanceof Breakable && dist(e) < 9) || ((e instanceof Gem || (e instanceof Potion && p.potions < 5)) && dist(e) < 7)))
      .sort((a, b) => dist(a) - dist(b))[0];
    if (loot && g.map.los(p.x, p.z, loot.x, loot.z)) {
      if (loot instanceof Breakable) {
        if (dist(loot) < 1.4) { aimAt(loot.x, loot.z); it.attack = true; }
        else moveTo(loot.x, loot.z, 1.0);
      } else moveTo(loot.x, loot.z, 0.1);
      this.unstick(it, dt);
      return it;
    }

    // 5. Next room.
    const next = this.nextRoom();
    if (next) moveTo(next.x, next.z, 0.5);
    this.unstick(it, dt);
    return it;
  }
  danger(foes) {
    const g = this.g, p = g.player;
    const away = (x, z) => { const dx = p.x - x, dz = p.z - z, l = Math.hypot(dx, dz) || 1; return { x: dx / l, z: dz / l }; };
    for (const e of g.world.entities) {
      if (!(e instanceof Pollen) || e.team !== 'enemy') continue;
      const rx = p.x - e.x, rz = p.z - e.z, d = Math.hypot(rx, rz), sp = Math.hypot(e.vx, e.vz) || 1;
      const closing = (rx * e.vx + rz * e.vz) / sp;
      const miss = Math.abs(rx * e.vz - rz * e.vx) / sp;
      if (d < 2.6 && closing > 0 && miss < 0.7) return { x: -e.vz / sp, z: e.vx / sp }; // sidestep across its path
    }
    for (const e of foes) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.boss) {
        if (e.state === 'telegraph' && e.next === 'charge') {
          const rx = p.x - e.x, rz = p.z - e.z, along = rx * e.lockX + rz * e.lockZ, side = rx * e.lockZ - rz * e.lockX;
          if (along > -1 && Math.abs(side) < 2 && e.stateT > 0.35) return { x: e.lockZ * Math.sign(side || 1), z: -e.lockX * Math.sign(side || 1) };
        }
        if (e.state === 'telegraph' && e.next === 'sweep' && d < 4.6 && e.stateT > 0.3) return away(e.x, e.z);
        if (e.state === 'charge' && d < 3) { const s = Math.sign((p.x - e.x) * e.lockZ - (p.z - e.z) * e.lockX) || 1; return { x: e.lockZ * s, z: -e.lockX * s }; }
        continue;
      }
      if (e.state === 'windup' && e.def.ai === 'brute' && e.stateT > e.windup * 0.5) {
        const cx = e.x + e.lockX * 1.3, cz = e.z + e.lockZ * 1.3;
        if (Math.hypot(p.x - cx, p.z - cz) < 2.1) return away(cx, cz);
      }
      if (e.state === 'windup' && e.def.ai === 'melee' && d < 1.4 && e.stateT > e.windup * 0.6 && Math.random() < 0.35) return away(e.x, e.z);
    }
    return null;
  }
  nextRoom() {
    const g = this.g, rooms = g.level.rooms, p = g.player;
    if (g.portal) return g.portal;
    const cands = rooms.filter(r => r.combat && !r.cleared).sort((a, b) => a.depth - b.depth);
    const r = cands[0];
    if (!r) return null;
    // Aim for the door into it, then its middle.
    const door = r.doors.find(d => d.open && d.rooms.includes(g.currentRoom)) ?? r.doors.find(d => d.open);
    if (door && g.currentRoom !== r.id) {
      const inner = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => ({ x: door.tx + 0.5 + dx * 2.5, z: door.tz + 0.5 + dz * 2.5 }))
        .find(t => g.level.regionAt(Math.floor(t.x), Math.floor(t.z)) === r.id);
      return inner ?? { x: door.tx + 0.5, z: door.tz + 0.5 };
    }
    return r.center;
  }
  follow(x, z, it, dt) {
    const g = this.g, p = g.player;
    this.pathT -= dt;
    if (!this.path || this.pathT <= 0 || !this.goal || Math.hypot(this.goal.x - x, this.goal.z - z) > 1) {
      this.path = g.flow.path(p.x, p.z, x, z);
      this.goal = { x, z }; this.pathT = 0.5;
    }
    if (!this.path) return false;
    while (this.path.length && Math.hypot(this.path[0].x - p.x, this.path[0].z - p.z) < 0.45) this.path.shift();
    const w = this.path[0];
    if (!w) return true;
    const dx = w.x - p.x, dz = w.z - p.z, d = Math.hypot(dx, dz) || 1;
    it.moveX = dx / d; it.moveZ = dz / d;
    return false;
  }
  unstick(it, dt) {
    const p = this.g.player;
    const moving = Math.hypot(it.moveX, it.moveZ) > 0.1;
    const moved = Math.hypot(p.x - this.lastX, p.z - this.lastZ);
    this.lastX = p.x; this.lastZ = p.z;
    if (moving && moved < dt * 0.8) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt);
    if (this.stuckT > 1.0) {
      const a = Math.random() * Math.PI * 2;
      it.moveX = Math.cos(a); it.moveZ = Math.sin(a); it.dodge = true;
      this.stuckT = 0; this.path = null;
    }
  }
}
