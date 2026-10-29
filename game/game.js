// The game: wires the engine to the content and owns the rules that make it feel good
// (hitstop, shake, streaks, slow-mo) and the core loop (rooms lock, fill, clear, reward).
import * as THREE from 'three';
import { IsoView } from '../engine/render/view.js';
import { makeLights, ToonKit } from '../engine/render/toon.js';
import { Loop } from '../engine/core/loop.js';
import { Input, emptyIntent } from '../engine/core/input.js';
import { RNG, fx } from '../engine/core/rng.js';
import { Events } from '../engine/core/events.js';
import { World } from '../engine/world/world.js';
import { FlowField } from '../engine/ai/flowfield.js';
import { Sfx } from '../engine/audio/sfx.js';
import { Floaters } from '../engine/ui/floaters.js';
import { parseLevel, buildLevelMeshes } from './level.js';
import { Player, Enemy, Mantis, Pollen, Gem, Potion, Breakable, ENEMIES } from './actors.js';
import { Gore } from './gore.js';
import { Hud } from './hud.js';
import { defineSounds } from './sounds.js';
import { rollBoons } from './boons.js';
import { Bot } from './bot.js';
import { Telemetry } from './telemetry.js';
import { RAINBOW, goreChunk } from './models.js';

const STREAKS = { 2: 'Double Tap!', 3: 'Triple Treat!', 4: 'Bug Splat Party!', 5: 'Petal Massacre!', 7: 'RAINBOW CARNAGE!', 10: 'EXTERMINATRIX!!', 15: 'APOCALYPSE PICNIC!!!' };
const ROOM_NAMES = ['the Petal Foyer', 'the Mushroom Court', 'the Beetle Den', "the Empress's Bower"];

export class Game {
  constructor(container, levelJson, opts = {}) {
    this.opts = opts;
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.rng = new RNG(this.seed);
    this.view = new IsoView(container);
    this.scene = this.view.scene;
    this.lights = makeLights(this.scene);
    this.input = new Input(this.view.renderer.domElement);
    this.sfx = new Sfx();
    defineSounds(this.sfx);
    const unlock = () => this.sfx.unlock();
    addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
    this.events = new Events();
    this.god = !!opts.god;
    this.difficulty = opts.difficulty ?? 1;
    this.goreKit = new ToonKit();

    this.level = parseLevel(levelJson);
    this.map = this.level.map;
    this.world = new World(this.map);
    this.world.onImpact = (a, b, rel) => this.impact(a, b, rel);
    this.levelMeshes = buildLevelMeshes(this.scene, this.level, new RNG(this.seed ^ 0x5eed));
    this.flow = new FlowField(this.map);
    this.gore = new Gore(this);
    this.floaters = new Floaters(this.view, document.getElementById('floaters'));
    this.telegraphs = [];
    this.slashes = [];
    this.pending = [];
    this.state = 'play';
    this.xp = 0; this.level_ = 1; this.gems = 0;
    this.streak = 0; this.streakT = 0; this.bestStreak = 0;
    this.slowmo = 0;
    this.time = 0;

    const s = this.level.start;
    this.player = this.world.add(new Player(this, s.x, s.z));
    this.setupRooms();
    this.telemetry = new Telemetry(this);
    this.hud = new Hud(this);
    this.bot = opts.bot ? new Bot(this, opts.botskill ?? 1) : null;
    this.intent = emptyIntent();
    if (opts.room != null) this.skipToRoom(+opts.room);
    this.view.snap(this.player.x, this.player.z);
    this.loop = new Loop({ update: (dt, frozen) => this.update(dt, frozen), render: dt => this.render(dt) });
    this.loop.speed = opts.speed ?? 1;
    this.loop.start();
    this.started = !!opts.bot;
    if (this.started) this.begin();
    else this.hud.title(() => { this.sfx.unlock(); this.started = true; this.begin(); });
  }

  begin() { this.hud.banner('THE PASTEL GARDEN', 'squish every pretty thing'); }

  // ------------------------------------------------------------------ rooms
  setupRooms() {
    const L = this.level;
    const startRoom = L.regionAt(Math.floor(L.start.x), Math.floor(L.start.z));
    // Progression order = door distance from the start room.
    const depth = new Map([[startRoom, 0]]), q = [startRoom];
    while (q.length) {
      const r = q.shift();
      for (const d of L.rooms[r].doors) for (const n of d.rooms) if (!depth.has(n)) { depth.set(n, depth.get(r) + 1); q.push(n); }
    }
    let combatIndex = 0;
    const order = [...L.rooms].sort((a, b) => (depth.get(a.id) ?? 99) - (depth.get(b.id) ?? 99));
    for (const room of order) {
      room.depth = depth.get(room.id) ?? 99;
      room.enemies = [];
      room.waves = [];
      if (room.combat) { room.index = combatIndex; room.name = ROOM_NAMES[combatIndex] ?? `garden ${combatIndex + 1}`; combatIndex++; }
      for (const sp of room.spawns) {
        if (sp.type === 'jar') { this.world.add(new Breakable(this, sp.x, sp.z, 'jar')); continue; }
        room.enemies.push(this.spawnEnemy(sp.type, sp.x, sp.z, room, room.index ?? 0));
      }
      // Roguelike layer: later rooms get a reinforcement wave rolled from the seed.
      if (room.combat && !room.boss && room.index > 0) {
        const types = room.spawns.map(s => s.type).filter(t => ENEMIES[t]);
        const n = Math.round(types.length * this.rng.float(0.7, 1.0));
        room.waves.push(Array.from({ length: n }, () => this.rng.pick(types)));
        if (room.index >= 2) room.waves.push(Array.from({ length: n + 2 }, () => this.rng.pick([...types, 'butterfly'])));
      }
    }
  }
  spawnEnemy(type, x, z, room, index = 0) {
    if (type === 'mantis') return this.world.add(new Mantis(this, x, z, room.id));
    const elite = this.rng.chance(0.06 + index * 0.05);
    return this.world.add(new Enemy(this, x, z, type, { elite, room: room.id, index }));
  }
  roomOf(e) { return this.level.regionAt(Math.floor(e.x), Math.floor(e.z)); }
  updateRooms(dt) {
    const p = this.player, rid = this.roomOf(p), room = this.level.rooms[rid];
    if (rid !== this.currentRoom && rid >= 0) { this.currentRoom = rid; this.telemetry.enterRoom(room); }
    if (room && room.combat && !room.cleared && !room.active) {
      const nearDoor = room.doors.some(d => Math.hypot(p.x - d.tx - 0.5, p.z - d.tz - 0.5) < 1.3);
      if (!nearDoor) this.activateRoom(room);
    }
    for (const r of this.level.rooms) {
      if (!r.active) continue;
      r.enemies = r.enemies.filter(e => !e.dead);
      if (r.enemies.length === 0) {
        if (r.waves.length) this.spawnWave(r, r.waves.shift());
        else this.clearRoom(r);
      }
    }
    for (const d of this.level.doors) {
      const target = d.open ? -2.0 : 0;
      d.mesh.position.y += (target - d.mesh.position.y) * Math.min(1, dt * (d.open ? 3 : 14));
    }
  }
  setDoor(d, open) {
    d.open = open;
    this.map.setBlocked(d.tx, d.tz, !open);
  }
  activateRoom(room) {
    room.active = true;
    for (const d of room.doors) this.setDoor(d, false);
    this.flow.compute(this.player.x, this.player.z, true);
    for (const e of room.enemies) e.active = true;
    this.sfx.play('gate');
    this.view.shake(0.25);
    if (room.boss) {
      this.boss = room.enemies.find(e => e.boss);
      this.hud.banner('EMPRESS MANTIS', 'she wants her babies back');
      this.sfx.play('roar');
      if (this.boss) this.boss.cooldown = 2;
    } else this.hud.banner(room.name?.toUpperCase() ?? 'AMBUSH', `${room.enemies.length} pretty little lives`);
    this.events.emit('roomStart', room);
  }
  spawnWave(room, types) {
    const tiles = room.tiles.filter(([x, z]) => !this.map.isSolid(x, z) && Math.hypot(x + 0.5 - this.player.x, z + 0.5 - this.player.z) > 5);
    for (const t of types) {
      const [x, z] = this.rng.pick(tiles);
      const e = this.spawnEnemy(t, x + 0.5, z + 0.5, room, room.index);
      e.active = true; e.y = 3; e.vy = -2;
      room.enemies.push(e);
      this.gore.confettiBurst(x + 0.5, 1, z + 0.5, 20, 4);
    }
    this.hud.banner('MORE BUGS!', 'they keep coming. good.');
    this.sfx.play('wave');
  }
  clearRoom(room) {
    room.active = false; room.cleared = true;
    for (const d of room.doors) this.setDoor(d, true);
    this.flow.compute(this.player.x, this.player.z, true);
    this.slowmo = 1.1;
    this.sfx.play('clear');
    this.telemetry.clearRoom(room);
    this.events.emit('roomClear', room);
    if (room.boss) { this.win(room); return; }
    this.hud.banner('CLEARED!', 'smack the cocoon for prizes');
    const c = room.center;
    const tile = room.tiles.map(([x, z]) => ({ x: x + 0.5, z: z + 0.5 })).filter(t => !this.map.solidAt(t.x, t.z))
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    this.world.add(new Breakable(this, tile.x, tile.z, 'cocoon'));
  }
  skipToRoom(index) {
    const target = this.level.rooms.find(r => r.combat && r.index === index);
    if (!target) return;
    for (const r of this.level.rooms) if (r.combat && r.index < index) { r.cleared = true; for (const e of r.enemies) { e.dead = true; } }
    const d = target.doors.find(d => d.rooms.some(id => this.level.rooms[id].depth < target.depth)) ?? target.doors[0];
    // Stand just inside the room, past the door.
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dz] of dirs) if (this.level.regionAt(d.tx + dx * 2, d.tz + dz * 2) === target.id) { this.player.x = d.tx + 0.5 + dx * 2.5; this.player.z = d.tz + 0.5 + dz * 2.5; }
    this.player.hp = this.player.stats.maxHp;
    // Grant the levels a real run would have earned by now.
    this.pendingLevels = index;
  }

  // ------------------------------------------------------------------ combat rules
  damage(target, info) {
    if (!target || target.dead) return false;
    const p = this.player;
    if (target === p && info.team === 'player') return false;
    if (target !== p && target.team === 'enemy' && info.team === 'enemy') return false;
    info = { ...info };
    if (info.team === 'player' && target !== p) {
      info.amount *= p.stats.damage;
      if (info.kind !== 'impact' && info.kind !== 'wall' && Math.random() < p.stats.crit) { info.crit = true; info.amount *= p.stats.critMul; info.knock = (info.knock ?? 0) * 1.3; }
    }
    info.amount = Math.max(1, Math.round(info.amount));
    if (!target.takeDamage(info)) return false;
    this.events.emit('hit', { target, info });
    this.telemetry.hit(target, info);
    if (target === p) {
      this.hud.hurt();
      this.view.shake(0.45);
      this.loop.freeze(0.07);
      this.sfx.play('hurt');
      this.gore.hit(p, info);
      this.floaters.spawn('-' + info.amount, p.x, 1.6, p.z, { cls: 'hurt' });
      if (p.hp <= 0) this.playerDie(info);
      return true;
    }
    if (target instanceof Breakable) return true;
    this.gore.hit(target, info);
    const big = { heavy: 1, finisher: 1, wall: 1, scythe: 1 }[info.kind];
    this.loop.freeze(info.kind === 'whirl' ? 0.012 : big ? 0.1 : info.crit ? 0.085 : info.kind === 'impact' ? 0.06 : 0.045);
    this.view.shake(big ? 0.35 : info.crit ? 0.28 : info.kind === 'whirl' ? 0.05 : 0.14);
    if (big || info.crit) this.view.kick(0.03);
    this.sfx.play('hit', { pitch: info.kind === 'heavy' ? 0.6 : info.crit ? 1.3 : 0.9 + Math.random() * 0.3 });
    this.floaters.spawn(info.crit ? info.amount + '!' : '' + info.amount, target.x, (target.rig?.height ?? 1) + 0.4, target.z, { cls: info.crit ? 'crit' : info.kind === 'impact' ? 'impact' : '', scale: Math.min(2, 0.8 + info.amount / 40) });
    if (info.team === 'player') {
      // The blender cannot refuel itself, and throws/pinballs fill it fastest: rage rewards the core mechanic.
      const rageRate = info.kind === 'whirl' ? 0 : info.kind === 'impact' || info.kind === 'wall' ? 0.5 : 0.2;
      p.rage = Math.min(100, p.rage + info.amount * rageRate * p.stats.rageGain);
      if (p.stats.lifesteal) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.lifesteal);
    }
    if (target.hp <= 0 && !target.dead) this.kill(target, info);
    return true;
  }
  kill(t, info) {
    t.dead = true;
    if (t.carried) { t.carried.holding = null; t.carried = null; }
    const overkill = -t.hp > t.maxHp * 0.3 || ['heavy', 'finisher', 'impact', 'wall', 'trample', 'scythe', 'boom', 'land'].includes(info.kind) || t.speed > 9 || t.boss;
    this.gore.kill(t, info, overkill);
    this.sfx.play('squish');
    this.sfx.play('squeak', { pitch: 0.8 + Math.random() * 0.6 });
    this.streak++; this.streakT = 2.6;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (STREAKS[this.streak]) { this.hud.streak(this.streak, STREAKS[this.streak]); this.sfx.play('streak', { pitch: 1 + this.streak * 0.04 }); }
    else if (this.streak > 1) this.hud.streak(this.streak);
    this.telemetry.kill(t, info, overkill);
    this.events.emit('kill', { target: t, info, overkill });
    const xp = (t.def?.xp ?? 1) * (t.elite ? 3 : 1);
    for (let i = 0; i < xp; i += i < 4 ? 1 : 5) this.world.add(new Gem(this, t.x, t.z, xp - i >= 5 && i >= 4 ? 5 : 1));
    if (Math.random() < (t.elite ? 0.5 : 0.08)) this.world.add(new Potion(this, t.x + fx.f(-0.5, 0.5), t.z + fx.f(-0.5, 0.5)));
    const splitRoom = this.level.rooms[t.room];
    if (t.def?.split && splitRoom?.active) {
      const room = splitRoom;
      for (const s of [-1, 1]) {
        const g = this.spawnEnemy(t.def.split, t.x + s * 0.3, t.z, room, 0);
        g.active = true; g.vx = s * 5 + (info.dirX ?? 0) * 4; g.vz = (info.dirZ ?? 0) * 4 + fx.f(-2, 2); g.vy = 6; g.y = 0.3; g.stun = 0.5;
        room?.enemies.push(g);
      }
    }
    const boom = this.player.stats.explodeOnKill;
    if (boom && info.kind !== 'boom') this.pending.push(() => this.explode(t.x, t.z, 1.8, boom));
    if (t.boss) this.bossDead(t);
    if (this.slowmo <= 0 && t.room != null && this.level.rooms[t.room]?.enemies.every(e => e.dead) && !this.level.rooms[t.room]?.waves.length) this.slowmo = 0.9;
  }
  explode(x, z, r, dmg) {
    this.gore.confettiBurst(x, 0.6, z, 30, 7);
    this.view.shake(0.25);
    this.sfx.play('pop');
    for (const e of this.world.query(x, z, r, e => e.team === 'enemy' && e.hittable && !(e instanceof Pollen))) {
      const a = Math.atan2(e.x - x, e.z - z);
      this.damage(e, { amount: dmg, dirX: Math.sin(a), dirZ: Math.cos(a), knock: 9, lift: 4, team: 'player', kind: 'boom' });
    }
  }
  // Launched bodies are projectiles. This is the game's core rule.
  impact(mover, other, rel) {
    if (mover.thrownBy !== 'player' || other === this.player || other.carried || !other.hittable || other instanceof Pollen) return;
    if (mover.impacted.has(other.id ?? other)) return;
    mover.impacted.add(other.id ?? other);
    const l = mover.speed || 1, dirX = mover.vx / l, dirZ = mover.vz / l;
    const chain = (mover.chain || 0) + 1;
    const dmg = rel * 2.4 * Math.sqrt(mover.mass) * (1 + 0.3 * (chain - 1));
    if (other.team === 'enemy') { other.chain = chain; other.thrownBy = 'player'; }
    this.damage(other, { amount: dmg, dirX, dirZ, knock: rel * 0.8 * mover.mass, lift: 3, stun: 0.7, team: 'player', kind: 'impact', chain });
    if (!mover.dead) this.damage(mover, { amount: dmg * 0.5, dirX: -dirX, dirZ: -dirZ, knock: 0, team: 'player', kind: 'impact' });
    mover.vx *= 0.55; mover.vz *= 0.55;
    this.telemetry.impact(chain);
    this.sfx.play('bonk', { pitch: 0.8 + chain * 0.15 });
    if (chain >= 2) {
      this.floaters.spawn(`PINBALL x${chain}!`, other.x, 2.2, other.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 });
      this.loop.freeze(0.08 + chain * 0.02);
    } else this.floaters.spawn('BONK!', other.x, 2, other.z, { cls: 'bonk' });
  }
  corpseImpact(it, e, sp) {
    const { mass, chain } = it.proj, dirX = it.v.x / sp, dirZ = it.v.z / sp;
    const dmg = sp * 1.9 * Math.sqrt(mass) * (1 + 0.3 * (chain - 1));
    e.chain = chain; e.thrownBy = 'player';
    this.damage(e, { amount: dmg, dirX, dirZ, knock: sp * 0.7 * Math.max(0.5, mass), lift: 2.5, stun: 0.6, team: 'player', kind: 'impact', chain });
    it.v.multiplyScalar(0.6);
    this.telemetry.impact(chain);
    this.sfx.play('bonk', { pitch: 0.7 + chain * 0.15 });
    if (chain >= 2) { this.floaters.spawn(`PINBALL x${chain}!`, e.x, 2.2, e.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 }); this.loop.freeze(0.06 + chain * 0.02); }
    else this.floaters.spawn(mass < 0.5 ? 'SHRAPNEL!' : 'CORPSE BOWLING!', e.x, 2, e.z, { cls: 'bonk' });
  }
  wallSlam(e, hit) {
    if (e.lastSlam != null && e.age - e.lastSlam < 0.3) return;
    e.lastSlam = e.age;
    const dmg = Math.max(4, (hit.speed - 5) * 3.4 * this.player.stats.wallDamage);
    this.gore.wallSplat(e.x, e.z, hit.nx, hit.nz, e.radius, dmg, e.def?.blood ?? [0xd4002e]);
    this.floaters.spawn('SPLAT!', e.x, 1.8, e.z, { cls: 'splat', scale: 1.3 });
    this.sfx.play('bonk', { pitch: 0.5 });
    this.sfx.play('splat');
    this.view.shake(0.3);
    this.telemetry.wallSlam();
    this.damage(e, { amount: dmg, dirX: hit.nx, dirZ: hit.nz, knock: 0, stun: 0.8, team: 'player', kind: 'wall' });
  }
  onLand(e, impact) {
    if (e === this.player) return;
    this.gore.decals.splat(e.x, e.z, 0.3, '#c8002c');
    this.sfx.play('thud', { gap: 0.05 });
    if (impact > 11 && e.thrownBy === 'player') this.damage(e, { amount: (impact - 11) * 2, team: 'player', kind: 'land', knock: 0, stun: 0.4 });
  }

  // ------------------------------------------------------------------ enemy abilities
  telegraph(mesh, dur, update) {
    mesh.position.y = 0.04;
    this.scene.add(mesh);
    const t = { mesh, dur, t: 0, update };
    this.telegraphs.push(t);
    return t;
  }
  teleMaterial(opacity) { return new THREE.MeshBasicMaterial({ color: 0xff2d6f, transparent: true, opacity, depthWrite: false }); }
  telegraphCircle(x, z, r, dur) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40), this.teleMaterial(0.8));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), this.teleMaterial(0.3));
    for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    g.position.set(x, 0, z);
    return this.telegraph(g, dur, p => fill.scale.setScalar(Math.max(0.01, p)));
  }
  telegraphLine(x, z, dx, dz, len, w, dur) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, len); geo.translate(0, len / 2, 0);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45));
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    g.rotation.y = Math.atan2(dx, dz) + Math.PI; g.rotation.order = 'YXZ';
    g.rotation.set(0, Math.atan2(dx, dz), 0);
    back.rotation.z = fill.rotation.z = Math.PI;
    g.position.set(x, 0, z);
    return this.telegraph(g, dur, p => fill.scale.set(1, Math.max(0.01, p), 1));
  }
  telegraphArc(src, r, arc, dur) {
    const g = new THREE.Group();
    const geo = new THREE.CircleGeometry(r, 32, Math.PI / 2 - arc / 2, arc);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45));
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    return this.telegraph(g, dur, p => {
      g.position.set(src.x, 0.04, src.z);
      g.rotation.y = src.facing - Math.PI / 2 + Math.PI / 2;
      fill.scale.setScalar(Math.max(0.01, p));
    });
  }
  slam(x, z, r, src) {
    this.view.shake(0.45);
    this.loop.freeze(0.05);
    this.sfx.play('slam');
    this.gore.confettiBurst(x, 0.2, z, 24, 6, [0xfff3e0, 0xe2d4ff, 0xc6f5d2]);
    this.gore.decals.paint(c => { c.strokeStyle = 'rgba(90,58,106,0.35)'; c.lineWidth = 0.05; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; c.beginPath(); c.moveTo(x, z); c.lineTo(x + Math.cos(a) * r, z + Math.sin(a) * r); c.stroke(); } });
  }
  spawnPollen(src, tx, tz, dmg) {
    const dx = tx - src.x, dz = tz - src.z, l = Math.hypot(dx, dz) || 1;
    this.world.add(new Pollen(this, src.x + dx / l * 0.5, src.z + dz / l * 0.5, dx / l * 7.5, dz / l * 7.5, dmg));
    this.sfx.play('spit');
  }
  pollenNova(src, rings) {
    for (let r = 0; r < rings; r++) {
      const n = 14, off = r * Math.PI / n, sp = 6 - r * 1.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off;
        this.world.add(new Pollen(this, src.x + Math.sin(a) * 1.2, src.z + Math.cos(a) * 1.2, Math.sin(a) * sp, Math.cos(a) * sp, 12, { heart: true }));
      }
    }
    this.sfx.play('screech', { pitch: 1.5 });
    this.view.shake(0.2);
  }
  summon(src, n) {
    const room = this.level.rooms[src.room];
    for (let i = 0; i < n; i++) {
      const a = src.facing + (i - (n - 1) / 2) * 0.7, x = src.x + Math.sin(a) * 1.6, z = src.z + Math.cos(a) * 1.6;
      if (this.map.solidAt(x, z)) continue;
      const e = this.spawnEnemy('ladybug', x, z, room, 0);
      // Babies land curled up: light, harmless for a moment, and begging to be thrown.
      e.active = true; e.vx = Math.sin(a) * 6; e.vz = Math.cos(a) * 6; e.vy = 7; e.y = 1.5; e.stun = 2.2; e.mass = 0.6; e.baby = true;
      room.enemies.push(e);
      this.gore.spray(x, 1.5, z, Math.sin(a), Math.cos(a), 12, 4, [0x7dffc0, 0xd4002e]);
    }
    this.hud.banner('', 'MY BABIES! (throw them at her)', 1.6);
    this.sfx.play('summon');
  }
  onBossPhase(b) { this.hud.banner('SHE IS FURIOUS', 'phase two', 1.6); this.sfx.play('roar'); this.view.shake(0.6); this.gore.confettiBurst(b.x, 2, b.z, 40, 8); }
  onBossWall(b, hit) {
    this.view.shake(0.8); this.loop.freeze(0.14); this.view.kick(0.06);
    this.sfx.play('bonk', { pitch: 0.35 }); this.sfx.play('slam');
    this.gore.wallSplat(b.x, b.z, hit.nx, hit.nz, b.radius, 30, b.def.blood);
    this.floaters.spawn('STUNNED!', b.x, 3.5, b.z, { cls: 'pinball', scale: 1.6, life: 1.4 });
    this.damage(b, { amount: 35, team: 'player', kind: 'wall', knock: 0 });
  }
  bossDead(b) {
    this.loop.freeze(0.35);
    this.slowmo = 2.5;
    this.view.shake(1);
    const room = this.level.rooms[b.room];
    for (const e of room.enemies) if (!e.dead && e !== b) this.pending.push(() => this.damage(e, { amount: 999, team: 'player', kind: 'boom', dirX: fx.f(-1, 1), dirZ: fx.f(-1, 1), knock: 10, lift: 8 }));
    this.boss = null;
  }

  // ------------------------------------------------------------------ player feedback hooks
  onSwing(p, kind) { this.slash(p, kind); this.telemetry.swing(); }
  slash(p, kind) {
    const arc = kind === 'finisher' ? 2.6 : 2.2, r = (kind === 'finisher' ? 2.1 : 1.9) * p.stats.reach;
    const geo = new THREE.RingGeometry(r * 0.45, r, 24, 1, -arc / 2, arc);
    const cols = [], pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); const c = new THREE.Color(RAINBOW[Math.floor(((a + arc / 2) / arc) * 5.99)]); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.order = 'YXZ';
    m.rotation.set(-Math.PI / 2, 0, 0);
    const g = new THREE.Group(); g.add(m);
    g.position.set(p.x, 0.7, p.z);
    g.rotation.y = Math.atan2(p.aimX, p.aimZ) - Math.PI / 2;
    this.scene.add(g);
    this.slashes.push({ g, t: 0, dur: 0.16 });
  }
  onWhirl(p) { this.hud.banner('', 'RAINBOW BLENDER', 1); this.sfx.play('whirl'); this.telemetry.special(); }
  onGrab(p, e) { this.sfx.play('grab'); this.floaters.spawn('GOTCHA', e.x, 2.2, e.z, { cls: 'bonk' }); this.telemetry.grab(); }
  onThrow(p, e) { this.sfx.play('throw'); this.telemetry.throw_(); this.view.shake(0.1); }
  onReflect(b) { this.sfx.play('bonk', { pitch: 1.8 }); this.floaters.spawn('RETURN TO SENDER', b.x, 1.8, b.z, { cls: 'bonk' }); this.telemetry.reflect(); }
  onPotion(p) { this.sfx.play('potion'); this.gore.confettiBurst(p.x, 1, p.z, 16, 3, [0xff5fa2, 0xffffff]); this.floaters.spawn('+HP', p.x, 2, p.z, { cls: 'heal' }); this.telemetry.potion(); }
  onPickupPotion(pt) { this.player.potions++; this.sfx.play('pickup', { pitch: 0.7 }); }
  onGem(gem) {
    this.gems += gem.value; this.xp += gem.value;
    this.sfx.play('pickup', { pitch: 1 + Math.min(1, (this.gemCombo = (this.gemCombo ?? 0) + 1) * 0.05), gap: 0.02 });
    this.gemComboT = 0.6;
    if (this.xp >= this.xpNeed()) this.levelUp();
  }
  xpNeed() { return 10 + this.level_ * 8; }
  levelUp() {
    this.xp -= this.xpNeed();
    this.level_++;
    this.offers = rollBoons(this.rng, 3);
    this.state = 'boon';
    this.hud.showBoons(this.offers);
    this.sfx.play('levelup');
    this.telemetry.levelUp();
  }
  chooseBoon(i) {
    const b = this.offers?.[i];
    if (!b) return;
    b.apply(this.player);
    this.player.boons = [...(this.player.boons ?? []), b.id];
    this.telemetry.boon(b);
    this.hud.hideBoons();
    this.state = 'play';
    this.gore.confettiBurst(this.player.x, 1.5, this.player.z, 30, 5);
    if (this.xp >= this.xpNeed()) this.levelUp();
  }
  onBreakableHit(b, info) { this.sfx.play('thud'); this.gore.confettiBurst(b.x, 0.8, b.z, 6, 3); }
  onBreak(b, info) {
    this.sfx.play(b.kind === 'jar' ? 'glass' : 'pop');
    const n = b.kind === 'jar' ? 6 : 10;
    for (let i = 0; i < n; i++) {
      const c = (b.kind === 'jar' ? ['glass', 'glass', 'candy'] : ['gut', 'heart', 'eye', 'candy', 'meat'])[i % (b.kind === 'jar' ? 3 : 5)];
      const o = goreChunk(c); o.position.set(b.x, 0.8, b.z); this.scene.add(o);
      this.gore.fling(o, b.x, b.z, fx.f(-5, 5), fx.f(4, 9), fx.f(-5, 5), b.kind === 'jar' ? [0xffc94d] : [0xd4002e, 0xff7eb6], 0.08);
    }
    if (b.kind === 'jar') this.gore.decals.splat(b.x, b.z, 0.45, '#ffc94d');
    else { this.gore.spray(b.x, 1.2, b.z, 0, 0, 60, 6, [0xd4002e, 0xff7eb6]); this.gore.confettiBurst(b.x, 1.5, b.z, 60, 8); this.loop.freeze(0.1); this.view.shake(0.4); }
    const gems = b.kind === 'jar' ? 3 : 14;
    for (let i = 0; i < gems; i++) this.world.add(new Gem(this, b.x, b.z, i < 2 && b.kind === 'cocoon' ? 5 : 1));
    if (b.kind === 'cocoon' || Math.random() < 0.15) this.world.add(new Potion(this, b.x + 0.6, b.z + 0.3));
    this.telemetry.breakable(b.kind);
  }
  playerDie(info) {
    const p = this.player;
    p.dead = true;
    this.gore.kill(p, { ...info, knock: 10 }, true);
    this.state = 'dead';
    this.slowmo = 3;
    this.sfx.play('death');
    this.telemetry.death(info);
    setTimeout(() => this.hud.showEnd(false), 1400);
  }
  win(room) {
    this.state = 'win';
    this.telemetry.win();
    this.hud.banner('EXTERMINATED', 'the garden is quiet now', 3);
    setTimeout(() => this.hud.showEnd(true), 2200);
  }
  restart(nextSeed = true) {
    const q = new URLSearchParams(location.search);
    if (nextSeed) q.set('seed', (this.seed + 1) >>> 0);
    location.search = q.toString();
  }

  // ------------------------------------------------------------------ loop
  humanIntent() {
    const i = this.input, it = emptyIntent(), p = this.player;
    const sx = (i.held('KeyD', 'ArrowRight') ? 1 : 0) - (i.held('KeyA', 'ArrowLeft') ? 1 : 0);
    const sy = (i.held('KeyW', 'ArrowUp') ? 1 : 0) - (i.held('KeyS', 'ArrowDown') ? 1 : 0);
    const d = this.view.screenToWorldDir(sx, sy), l = Math.hypot(d.x, d.z);
    if (l) { it.moveX = d.x / l; it.moveZ = d.z / l; }
    if (i.mouse.inside) {
      const g = this.view.screenToGround(i.mouse.x, i.mouse.y, 0.6);
      if (g) { it.aimX = g.x - p.x; it.aimZ = g.z - p.z; }
    } else if (l) { it.aimX = it.moveX; it.aimZ = it.moveZ; }
    it.attack = i.held('Mouse0', 'KeyJ');
    it.heavy = i.tapped('Mouse2', 'KeyK');
    it.dodge = i.tapped('Space', 'ShiftLeft', 'ShiftRight');
    it.special = i.tapped('KeyQ', 'KeyL');
    it.grab = i.tapped('KeyE', 'KeyF', 'Mouse1');
    it.potion = i.tapped('KeyR');
    for (let k = 0; k < 3; k++) if (i.tapped('Digit' + (k + 1))) it.choose = k;
    this.gamepad(it);
    return it;
  }
  gamepad(it) {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return;
    const dz = v => (Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    if (lx || ly) { const d = this.view.screenToWorldDir(lx, -ly); it.moveX = d.x; it.moveZ = d.z; it.aimX = d.x; it.aimZ = d.z; }
    if (rx || ry) { const d = this.view.screenToWorldDir(rx, -ry); it.aimX = d.x; it.aimZ = d.z; }
    const prev = this._gpPrev ?? [], b = gp.buttons.map(b => b.pressed), tap = k => b[k] && !prev[k];
    it.attack ||= b[0]; it.heavy ||= tap(2); it.dodge ||= tap(1); it.grab ||= tap(3); it.special ||= tap(5); it.potion ||= tap(4);
    if (this.state === 'boon') { if (tap(14)) it.choose = 0; if (tap(12) || tap(13)) it.choose = 1; if (tap(15)) it.choose = 2; }
    this._gpPrev = b;
  }
  update(dt, frozen) {
    if (frozen || !this.started) { this.input.endStep(); return; }
    this.time += dt;
    this.intent = this.bot ? this.bot.think(dt) : this.humanIntent();
    if (this.pendingLevels) { this.pendingLevels--; this.levelUp(); }
    if (this.state === 'boon') {
      if (this.intent.choose >= 0) this.chooseBoon(this.intent.choose);
      this.input.endStep();
      return;
    }
    if (this.state === 'play') {
      this.flow.compute(this.player.x, this.player.z);
      this.world.update(dt);
      for (const f of this.pending.splice(0)) f();
      this.updateRooms(dt);
      if (this.portal) this.updatePortal(dt);
    } else {
      // Dead or won: bodies keep settling but nothing thinks.
      for (const e of this.world.entities) if (!(e instanceof Player)) { e.desiredX = e.desiredZ = 0; e.springs?.(dt); }
      if (this.input.tapped('Enter', 'Space')) this.restart(this.state === 'dead');
    }
    this.gore.update(dt);
    this.streakT -= dt;
    if (this.streakT <= 0 && this.streak) { this.streak = 0; this.hud.streak(0); }
    this.gemComboT -= dt;
    if (this.gemComboT <= 0) this.gemCombo = 0;
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      t.update?.(Math.min(1, t.t / t.dur));
      if (t.t >= t.dur) { this.scene.remove(t.mesh); this.telegraphs.splice(i, 1); }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      s.g.children[0].material.opacity = 0.85 * (1 - s.t / s.dur);
      s.g.scale.setScalar(0.8 + (s.t / s.dur) * 0.3);
      if (s.t >= s.dur) { this.scene.remove(s.g); this.slashes.splice(i, 1); }
    }
    this.telemetry.update(dt);
    this.input.endStep();
  }
  updatePortal(dt) {}
  // Tall props standing between the camera and the player go see-through.
  fadeOccluders(dt) {
    const p = this.player, off = this.view.offset, l = Math.hypot(off.x, off.z), cx = off.x / l, cz = off.z / l;
    for (const m of this.levelMeshes.occluders) {
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      const along = dx * cx + dz * cz, side = Math.abs(dx * cz - dz * cx);
      const hide = along > 0 && along < 3.2 && side < 1.3;
      m.userData.fade = Math.max(0.3, Math.min(1, (m.userData.fade ?? 1) + (hide ? -dt * 5 : dt * 3)));
      m.traverse(o => {
        if (!o.material || o.name === 'outline') { if (o.name === 'outline') o.visible = m.userData.fade > 0.95; return; }
        o.material.transparent = m.userData.fade < 1; o.material.opacity = m.userData.fade; o.castShadow = true;
      });
    }
  }
  render(dt) {
    const frozen = this.loop.hitstop > 0;
    const sdt = frozen ? 0 : dt * this.loop.timeScale;
    for (const e of this.world.entities) e.sync?.(sdt);
    if (this.slowmo > 0) { this.slowmo -= dt / this.loop.speed; this.loop.timeScale = 0.3; }
    else this.loop.timeScale += (1 - this.loop.timeScale) * Math.min(1, dt * 4);
    const p = this.player;
    this.fadeOccluders(dt);
    this.view.follow(p.x + p.aimX * 1.2, p.z + p.aimZ * 1.2, dt, 5);
    this.lights.follow(this.view.focus.x, this.view.focus.z);
    this.view.update(dt);
    this.floaters.update(dt);
    this.hud.update(dt);
    this.view.render();
  }
}
