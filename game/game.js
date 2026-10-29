// The game: wires the engine to the content and owns the rules that make it feel good
// (hitstop, shake, streaks, slow-mo) and the core loop (rooms lock, fill, clear, reward).
//
// Every visible or audible consequence of a rule goes through fx(type, data). Solo, that
// just applies it. In co-op the host also queues it for the guests, who apply the same
// effect to their mirror of the world, so there is one code path for both.
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
import { TouchControls } from '../engine/ui/touch.js';
import { parseLevel, buildLevelMeshes } from './level.js';
import { Player, Enemy, Mantis, Pollen, Gem, Potion, Breakable, ENEMIES } from './actors.js';
import { Gore } from './gore.js';
import { Hud } from './hud.js';
import { defineSounds } from './sounds.js';
import { rollBoons } from './boons.js';
import { Bot } from './bot.js';
import { Telemetry } from './telemetry.js';
import { RAINBOW, goreChunk } from './models.js';
import { Coop, TINTS } from './coop.js';

const STREAKS = { 2: 'Double Tap!', 3: 'Triple Treat!', 4: 'Bug Splat Party!', 5: 'Petal Massacre!', 7: 'RAINBOW CARNAGE!', 10: 'EXTERMINATRIX!!', 15: 'APOCALYPSE PICNIC!!!' };
const ROOM_NAMES = ['the Petal Foyer', 'the Mushroom Court', 'the Beetle Den', "the Empress's Bower"];
const BIG = { heavy: 1, finisher: 1, wall: 1, scythe: 1 };

export class Game {
  constructor(container, levelJson, opts = {}) {
    this.opts = opts;
    this.net = opts.net ?? null;
    this.guest = !!this.net && !this.net.isHost;
    this.seed = opts.seed ?? ((Math.random() * 1e9) | 0);
    this.levelName = opts.levelName ?? 'garden';
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
    this.localId = this.net?.id ?? 'solo';
    const tint = this.net ? TINTS[[...this.net.peers.keys()].sort().indexOf(this.net.id) % TINTS.length] : TINTS[0];
    this.player = this.world.add(new Player(this, s.x + (this.guest ? 1 : 0), s.z, tint));
    this.player.pid = this.localId;
    this.player.name = this.net?.name;
    this.setupRooms(!this.guest);
    this.telemetry = new Telemetry(this);
    this.hud = new Hud(this);
    this.touch = new TouchControls(document.body, [
      { id: 'attack', label: 'SLASH', cls: 'big', aims: true, style: '--x:0;--y:0' },
      { id: 'parry', label: 'PARRY', cls: 'parry', style: '--x:1.25;--y:0' },
      { id: 'heavy', label: 'BONK', style: '--x:1.25;--y:1' },
      { id: 'dodge', label: 'ROLL', style: '--x:0;--y:1.25' },
      { id: 'grab', label: 'GRAB', style: '--x:2.3;--y:0' },
      { id: 'special', label: '🌈', style: '--x:0;--y:2.3' },
      { id: 'potion', label: '♥', style: '--x:2.3;--y:1' },
      { id: 'lock', label: 'LOCK', cls: 'small', style: '--x:1.25;--y:2' },
    ]);
    this.coop = this.net ? new Coop(this, this.net) : null;
    this.bot = opts.bot ? new Bot(this, opts.botskill ?? 1) : null;
    this.intent = emptyIntent();
    if (opts.start != null && !this.guest) this.skipToRoom(+opts.start);
    this.view.snap(this.player.x, this.player.z);
    this.loop = new Loop({ update: (dt, frozen) => this.update(dt, frozen), render: dt => this.render(dt) });
    this.loop.speed = opts.speed ?? 1;
    this.loop.start();
    this.started = !!opts.bot;
    if (this.started) this.begin();
    else this.hud.title(() => { this.sfx.unlock(); this.started = true; this.begin(); }, this.net);
  }
  begin() {
    document.body.classList.add('playing');
    // iOS keeps any accidental zoom; re-asserting the viewport snaps it back to 1.
    const vp = document.querySelector('meta[name=viewport]');
    if (vp) { const c = vp.content; vp.content = c + ', maximum-scale=1'; setTimeout(() => { vp.content = c; }, 50); } if (!this.guest) this.fx('bn', { t: 'THE PASTEL GARDEN', s: this.net ? 'squish every pretty thing, together' : 'squish every pretty thing' }); }
  get players() { return [this.player, ...(this.coop?.remotes.values() ?? [])].filter(p => !p.dead); }
  nearestPlayer(x, z) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (p.ghost) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }
  isLocal(pid) { return pid === this.localId; }

  // ------------------------------------------------------------------ effects
  fx(type, d) {
    this.applyFx(type, d);
    this.coop?.broadcast(type, d);
  }
  ent(d) { return d.pid != null ? (this.isLocal(d.pid) ? this.player : this.coop?.remotes.get(d.pid)) : this.world.byId.get(d.id); }
  applyFx(type, d) {
    switch (type) {
      case 'bn': return this.hud.banner(d.t, d.s, d.d);
      case 'fl': return this.floaters.spawn(d.t, d.x, d.y, d.z, d.o);
      case 'sx': return this.sfx.play(d.n, d.o);
      case 'sh': this.view.shake(d.a); if (d.k) this.view.kick(d.k); return;
      case 'cf': return this.gore.confettiBurst(d.x, d.y, d.z, d.n, d.p, d.c);
      case 'sp': return this.gore.spray(d.x, d.y, d.z, d.dx, d.dz, d.n, d.p, d.c);
      case 'dc': return this.gore.decals.splat(d.x, d.z, d.r, d.c);
      case 'ws': return this.gore.wallSplat(d.x, d.z, d.nx, d.nz, d.r, d.a, d.c);
      case 'pf': return this.gore.puff(d.x, d.y, d.z, d.c);
      case 'tc': return this.telegraphCircle_(d.x, d.z, d.r, d.d);
      case 'tl': return this.telegraphLine_(d.x, d.z, d.dx, d.dz, d.l, d.w, d.d);
      case 'ta': { const src = this.world.byId.get(d.id); if (src) this.telegraphArc_(src, d.r, d.a, d.d); return; }
      case 'slam': return this.slam_(d.x, d.z, d.r);
      case 'st': return this.hud.streak(d.n, d.t);
      case 'hit': return this.hitFx(d);
      case 'pb': { const p = this.ent(d); if (p && !this.isLocal(d.pid)) this.gore.hit(p, { amount: d.a, dirX: d.dx, dirZ: d.dz }); return; }
      case 'kill': return this.killFx(d);
      case 'brk': return this.breakFx(d);
      case 'boom': this.gore.confettiBurst(d.x, 0.6, d.z, 30, 7); this.view.shake(0.25); this.sfx.play('pop'); return;
      case 'hurt': return this.localHurt(d);
      case 'grabbed': { const e = this.world.byId.get(d.id); if (e && !e.dead) { this.player.holding = e; e.carried = this.player; this.player.state = 'carry'; this.onGrab(this.player, e); } return; }
      case 'potion': this.player.potions = Math.min(5, this.player.potions + 1); this.sfx.play('pickup', { pitch: 0.7 }); return;
      case 'tp': this.player.x = d.x; this.player.z = d.z; this.player.vx = this.player.vz = 0; return;
      case 'rez': return this.revive(d.x, d.z);
      case 'win': return this.win();
      case 'lose': return this.lose();
      case 'restart': return this.restart(false, d.seed);
      case 'parried': return this.parriedFx(d);
    }
  }

  // ------------------------------------------------------------------ rooms
  setupRooms(spawn = true) {
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
      if (!spawn) continue; // a guest mirrors the host's enemies instead of making its own
      for (const sp of room.spawns) {
        if (sp.type === 'jar') { this.world.add(new Breakable(this, sp.x, sp.z, 'jar')); continue; }
        room.enemies.push(this.spawnEnemy(sp.type, sp.x, sp.z, room, room.index ?? 0));
      }
      // Roguelike layer: later rooms get reinforcement waves rolled from the seed.
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
    // More knights, more bugs.
    const e = this.world.add(new Enemy(this, x, z, type, { elite, room: room.id, index }));
    e.maxHp = e.hp = Math.round(e.hp * (1 + 0.4 * ((this.net?.peers.size ?? 1) - 1)));
    return e;
  }
  roomOf(e) { return this.level.regionAt(Math.floor(e.x), Math.floor(e.z)); }
  updateRooms(dt) {
    const p = this.player, rid = this.roomOf(p), room = this.level.rooms[rid];
    if (rid !== this.currentRoom && rid >= 0) { this.currentRoom = rid; this.telemetry.enterRoom(room); }
    if (!this.guest) {
      // Any living knight walking into a fresh combat room springs it.
      for (const k of this.players) {
        if (k.ghost) continue;
        const r = this.level.rooms[this.roomOf(k)];
        if (r && r.combat && !r.cleared && !r.active && !r.doors.some(d => Math.hypot(k.x - d.tx - 0.5, k.z - d.tz - 0.5) < 1.3)) this.activateRoom(r, k);
      }
      for (const r of this.level.rooms) {
        if (!r.active) continue;
        r.enemies = r.enemies.filter(e => !e.dead);
        if (r.enemies.length === 0) {
          if (r.waves.length) this.spawnWave(r, r.waves.shift());
          else this.clearRoom(r);
        }
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
    this.flow.compute(this.player.x, this.player.z, true);
  }
  activateRoom(room, by) {
    room.active = true;
    for (const d of room.doors) this.setDoor(d, false);
    // Stragglers are pulled in behind whoever sprang it, so nobody is locked out.
    for (const k of this.players) {
      if (k === by || this.roomOf(k) === room.id) continue;
      const x = by.x + fx.f(-0.6, 0.6), z = by.z + fx.f(-0.6, 0.6);
      if (k.remote) this.fx('tp', { to: k.pid, x, z }); else { k.x = x; k.z = z; }
    }
    for (const e of room.enemies) e.active = true;
    this.fx('sx', { n: 'gate' });
    this.fx('sh', { a: 0.25 });
    if (room.boss) {
      this.boss = room.enemies.find(e => e.boss);
      this.fx('bn', { t: 'EMPRESS MANTIS', s: 'she wants her babies back' });
      this.fx('sx', { n: 'roar' });
      if (this.boss) this.boss.cooldown = 2;
    } else this.fx('bn', { t: room.name?.toUpperCase() ?? 'AMBUSH', s: `${room.enemies.length} pretty little lives` });
    this.events.emit('roomStart', room);
  }
  spawnWave(room, types) {
    const tiles = room.tiles.filter(([x, z]) => !this.map.isSolid(x, z) && this.players.every(k => Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) > 5));
    for (const t of types) {
      const [x, z] = this.rng.pick(tiles.length ? tiles : room.tiles);
      const e = this.spawnEnemy(t, x + 0.5, z + 0.5, room, room.index);
      e.active = true; e.y = 3; e.vy = -2;
      room.enemies.push(e);
      this.fx('cf', { x: x + 0.5, y: 1, z: z + 0.5, n: 20, p: 4 });
    }
    this.fx('bn', { t: 'MORE BUGS!', s: 'they keep coming. good.' });
    this.fx('sx', { n: 'wave' });
  }
  clearRoom(room) {
    room.active = false; room.cleared = true;
    for (const d of room.doors) this.setDoor(d, true);
    this.slowmo = 1.1;
    this.fx('sx', { n: 'clear' });
    this.telemetry.clearRoom(room);
    this.events.emit('roomClear', room);
    // The fallen get back up when the room is won.
    const alive = this.players.find(k => !k.ghost);
    for (const k of this.players) if (k.ghost && alive) this.fx('rez', { to: k.pid, x: alive.x + 0.8, z: alive.z });
    if (room.boss) { this.fx('win', {}); return; }
    this.fx('bn', { t: 'CLEARED!', s: 'smack the cocoon for prizes' });
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
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (this.level.regionAt(d.tx + dx * 2, d.tz + dz * 2) === target.id) { this.player.x = d.tx + 0.5 + dx * 2.5; this.player.z = d.tz + 0.5 + dz * 2.5; }
    this.player.hp = this.player.stats.maxHp;
    // Grant the levels a real run would have earned by now.
    this.pendingLevels = index;
  }

  // ------------------------------------------------------------------ combat rules (host)
  damage(target, info) {
    if (!target || target.dead || this.guest) return false;
    const isPlayer = target instanceof Player;
    if (isPlayer && (info.team === 'player' || target.ghost)) return false;
    if (!isPlayer && target.team === 'enemy' && info.team === 'enemy') return false;
    info = { ...info };
    const src = info.source instanceof Player ? info.source : null;
    if (info.team === 'player' && !isPlayer) {
      const st = (src ?? this.player).stats;
      info.amount *= st.damage;
      if (info.kind !== 'impact' && info.kind !== 'wall' && Math.random() < st.crit) { info.crit = true; info.amount *= st.critMul; info.knock = (info.knock ?? 0) * 1.3; }
    }
    info.amount = Math.max(1, Math.round(info.amount));
    if (isPlayer && target.parryT > 0 && info.source && !(info.source instanceof Pollen)) { this.parry(target, info.source); return false; }
    if (isPlayer && target.remote) {
      // A guest's knight lives on the guest. Tell them; they bleed for everyone else.
      if (target.inv > 0 || target.state === 'dodge') return false;
      this.fx('hurt', { to: target.pid, a: info.amount, dx: info.dirX ?? 0, dz: info.dirZ ?? 0, k: info.knock ?? 4 });
      this.fx('pb', { pid: target.pid, a: info.amount, dx: info.dirX ?? 0, dz: info.dirZ ?? 0 });
      return true;
    }
    if (!target.takeDamage(info)) return false;
    this.events.emit('hit', { target, info });
    this.telemetry.hit(target, info);
    if (isPlayer) {
      this.hurtFx(info);
      this.coop?.broadcast('pb', { pid: this.localId, a: info.amount, dx: info.dirX ?? 0, dz: info.dirZ ?? 0 });
      if (this.player.hp <= 0) this.playerDie(info);
      return true;
    }
    if (target instanceof Breakable) return true;
    if (info.team === 'player') { target.lastHitBy = src ?? this.player; }
    this.fx('hit', { id: target.nid, a: info.amount, dx: r2(info.dirX ?? 0), dz: r2(info.dirZ ?? 0), k: info.knock ?? 0, kind: info.kind, c: info.crit ? 1 : 0, src: info.team === 'player' ? (src?.pid ?? this.localId) : 0 });
    if (target.hp <= 0 && !target.dead) this.kill(target, info);
    return true;
  }
  hitFx(d) {
    const t = this.world.byId.get(d.id);
    if (!t) return;
    const mine = !this.net || d.src === this.localId;
    const info = { amount: d.a, dirX: d.dx, dirZ: d.dz, knock: d.k, kind: d.kind, crit: !!d.c };
    if (this.guest) t.flash = 1;
    this.gore.hit(t, info);
    const big = BIG[d.kind];
    // Hitstop freezes the whole simulation, so in co-op only your own blows stop time.
    if (mine) this.loop.freeze(d.kind === 'whirl' ? 0.012 : big ? 0.1 : d.c ? 0.085 : d.kind === 'impact' ? 0.06 : 0.045);
    this.view.shake((big ? 0.35 : d.c ? 0.28 : d.kind === 'whirl' ? 0.05 : 0.14) * (mine ? 1 : 0.35));
    if ((big || d.c) && mine) this.view.kick(0.03);
    this.sfx.play('hit', { pitch: d.kind === 'heavy' ? 0.6 : d.c ? 1.3 : 0.9 + Math.random() * 0.3 });
    this.floaters.spawn(d.c ? d.a + '!' : '' + d.a, t.x, (t.rig?.height ?? 1) + 0.4, t.z, { cls: d.c ? 'crit' : d.kind === 'impact' ? 'impact' : mine ? '' : 'ally', scale: Math.min(2, 0.8 + d.a / 40) });
    if (d.src === this.localId) {
      // The blender cannot refuel itself, and throws/pinballs fill it fastest: rage rewards the core mechanic.
      const p = this.player, rate = d.kind === 'whirl' ? 0 : d.kind === 'impact' || d.kind === 'wall' ? 0.5 : 0.2;
      p.rage = Math.min(100, p.rage + d.a * rate * p.stats.rageGain);
      if (p.stats.lifesteal && !p.ghost) p.hp = Math.min(p.stats.maxHp, p.hp + p.stats.lifesteal);
    }
  }
  hurtFx(info) {
    const p = this.player;
    this.hud.hurt();
    this.view.shake(0.45);
    this.loop.freeze(0.07);
    this.sfx.play('hurt');
    this.gore.hit(p, info);
    this.floaters.spawn('-' + info.amount, p.x, 1.6, p.z, { cls: 'hurt' });
  }
  // The host says a monster hit our knight.
  localHurt(d) {
    const p = this.player;
    if (p.ghost || p.dead) return;
    const info = { amount: d.a, dirX: d.dx, dirZ: d.dz, knock: d.k };
    if (!p.takeDamage(info)) return;
    this.telemetry.hit(p, info);
    this.hurtFx(info);
    if (p.hp <= 0) this.playerDie(info);
  }
  kill(t, info) {
    t.dead = true;
    if (t.carried) { t.carried.holding = null; t.carried = null; }
    const overkill = -t.hp > t.maxHp * 0.3 || ['heavy', 'finisher', 'impact', 'wall', 'trample', 'scythe', 'boom', 'land'].includes(info.kind) || t.speed > 9 || t.boss;
    this.fx('kill', { id: t.nid, dx: r2(info.dirX ?? 0), dz: r2(info.dirZ ?? 0), k: info.knock ?? 4, o: overkill ? 1 : 0, tm: info.team === 'player' ? 1 : 0, ch: t.chain || 0 });
    this.streak++; this.streakT = 2.6;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (STREAKS[this.streak]) { this.fx('st', { n: this.streak, t: STREAKS[this.streak] }); this.fx('sx', { n: 'streak', o: { pitch: 1 + this.streak * 0.04 } }); }
    else if (this.streak > 1) this.fx('st', { n: this.streak });
    this.telemetry.kill(t, info, overkill);
    this.events.emit('kill', { target: t, info, overkill });
    const xp = (t.def?.xp ?? 1) * (t.elite ? 3 : 1);
    for (let i = 0; i < xp; i += i < 4 ? 1 : 5) this.world.add(new Gem(this, t.x, t.z, xp - i >= 5 && i >= 4 ? 5 : 1));
    if (Math.random() < (t.elite ? 0.5 : 0.08)) this.world.add(new Potion(this, t.x + fx.f(-0.5, 0.5), t.z + fx.f(-0.5, 0.5)));
    const splitRoom = this.level.rooms[t.room];
    if (t.def?.split && splitRoom?.active) {
      for (const s of [-1, 1]) {
        const g = this.spawnEnemy(t.def.split, t.x + s * 0.3, t.z, splitRoom, 0);
        g.active = true; g.vx = s * 5 + (info.dirX ?? 0) * 4; g.vz = (info.dirZ ?? 0) * 4 + fx.f(-2, 2); g.vy = 6; g.y = 0.3; g.stun = 0.5;
        splitRoom.enemies.push(g);
      }
    }
    const boom = (info.source?.stats ?? this.player.stats).explodeOnKill;
    if (boom && info.kind !== 'boom') this.pending.push(() => this.explode(t.x, t.z, 1.8, boom));
    if (t.boss) this.bossDead(t);
    if (this.slowmo <= 0 && t.room != null && this.level.rooms[t.room]?.enemies.every(e => e.dead) && !this.level.rooms[t.room]?.waves.length) this.slowmo = 0.9;
  }
  killFx(d) {
    const t = this.world.byId.get(d.id);
    if (!t || !t.rig) return;
    t.dead = true;
    if (t.carried === this.player) this.player.holding = null;
    t.carried = null;
    // Corpses are only projectiles on the host, where damage is decided.
    this.gore.kill(t, { dirX: d.dx, dirZ: d.dz, knock: d.k, team: d.tm && !this.guest ? 'player' : null }, !!d.o);
    this.sfx.play('squish');
    this.sfx.play('squeak', { pitch: 0.8 + Math.random() * 0.6 });
  }
  explode(x, z, r, dmg) {
    this.fx('boom', { x, z });
    for (const e of this.world.query(x, z, r, e => e.team === 'enemy' && e.hittable && !(e instanceof Pollen))) {
      const a = Math.atan2(e.x - x, e.z - z);
      this.damage(e, { amount: dmg, dirX: Math.sin(a), dirZ: Math.cos(a), knock: 9, lift: 4, team: 'player', kind: 'boom' });
    }
  }
  say(t, x, y, z, o) { this.fx('fl', { t, x: r2(x), y, z: r2(z), o }); }
  // Launched bodies are projectiles. This is the game's core rule.
  impact(mover, other, rel) {
    if (this.guest || mover.thrownBy !== 'player' || other instanceof Player || other.carried || !other.hittable || other instanceof Pollen) return;
    if (mover.impacted.has(other.id ?? other)) return;
    mover.impacted.add(other.id ?? other);
    const l = mover.speed || 1, dirX = mover.vx / l, dirZ = mover.vz / l;
    const chain = (mover.chain || 0) + 1;
    const dmg = rel * 2.4 * Math.sqrt(mover.mass) * (1 + 0.3 * (chain - 1));
    if (other.team === 'enemy') { other.chain = chain; other.thrownBy = 'player'; }
    const source = mover.lastHitBy;
    this.damage(other, { amount: dmg, dirX, dirZ, knock: rel * 0.8 * mover.mass, lift: 3, stun: 0.7, team: 'player', kind: 'impact', chain, source });
    if (!mover.dead) this.damage(mover, { amount: dmg * 0.5, dirX: -dirX, dirZ: -dirZ, knock: 0, team: 'player', kind: 'impact', source });
    mover.vx *= 0.55; mover.vz *= 0.55;
    this.telemetry.impact(chain);
    this.fx('sx', { n: 'bonk', o: { pitch: 0.8 + chain * 0.15 } });
    if (chain >= 2) { this.say(`PINBALL x${chain}!`, other.x, 2.2, other.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 }); this.loop.freeze(0.08 + chain * 0.02); }
    else this.say('BONK!', other.x, 2, other.z, { cls: 'bonk' });
  }
  corpseImpact(it, e, sp) {
    if (this.guest) return;
    const { mass, chain } = it.proj, dirX = it.v.x / sp, dirZ = it.v.z / sp;
    const dmg = sp * 1.9 * Math.sqrt(mass) * (1 + 0.3 * (chain - 1));
    e.chain = chain; e.thrownBy = 'player';
    this.damage(e, { amount: dmg, dirX, dirZ, knock: sp * 0.7 * Math.max(0.5, mass), lift: 2.5, stun: 0.6, team: 'player', kind: 'impact', chain });
    it.v.multiplyScalar(0.6);
    this.telemetry.impact(chain);
    this.fx('sx', { n: 'bonk', o: { pitch: 0.7 + chain * 0.15 } });
    if (chain >= 2) { this.say(`PINBALL x${chain}!`, e.x, 2.2, e.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 }); this.loop.freeze(0.06 + chain * 0.02); }
    else this.say(mass < 0.5 ? 'SHRAPNEL!' : 'CORPSE BOWLING!', e.x, 2, e.z, { cls: 'bonk' });
  }
  wallSlam(e, hit) {
    if (this.guest || (e.lastSlam != null && e.age - e.lastSlam < 0.3)) return;
    e.lastSlam = e.age;
    const dmg = Math.max(4, (hit.speed - 5) * 3.4 * (e.lastHitBy ?? this.player).stats.wallDamage);
    this.fx('ws', { x: r2(e.x), z: r2(e.z), nx: r2(hit.nx), nz: r2(hit.nz), r: e.radius, a: Math.round(dmg), c: e.def?.blood ?? [0xd4002e] });
    this.say('SPLAT!', e.x, 1.8, e.z, { cls: 'splat', scale: 1.3 });
    this.fx('sx', { n: 'bonk', o: { pitch: 0.5 } });
    this.fx('sx', { n: 'splat' });
    this.fx('sh', { a: 0.3 });
    this.telemetry.wallSlam();
    this.damage(e, { amount: dmg, dirX: hit.nx, dirZ: hit.nz, knock: 0, stun: 0.8, team: 'player', kind: 'wall', source: e.lastHitBy });
  }
  onLand(e, impact) {
    if (e instanceof Player || this.guest) return;
    this.fx('dc', { x: r2(e.x), z: r2(e.z), r: 0.3, c: '#c8002c' });
    this.sfx.play('thud', { gap: 0.05 });
    if (impact > 11 && e.thrownBy === 'player') this.damage(e, { amount: (impact - 11) * 2, team: 'player', kind: 'land', knock: 0, stun: 0.4, source: e.lastHitBy });
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
  telegraphCircle(x, z, r, d) { this.fx('tc', { x: r2(x), z: r2(z), r, d }); }
  telegraphLine(x, z, dx, dz, l, w, d) { this.fx('tl', { x: r2(x), z: r2(z), dx: r2(dx), dz: r2(dz), l, w, d }); }
  telegraphArc(src, r, a, d) { this.fx('ta', { id: src.nid, r, a, d }); }
  telegraphCircle_(x, z, r, dur) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.92, r, 40), this.teleMaterial(0.8));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), this.teleMaterial(0.3));
    for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    g.position.set(x, 0, z);
    return this.telegraph(g, dur, p => fill.scale.setScalar(Math.max(0.01, p)));
  }
  telegraphLine_(x, z, dx, dz, len, w, dur) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, len); geo.translate(0, len / 2, 0);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45));
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    g.rotation.set(0, Math.atan2(dx, dz), 0);
    back.rotation.z = fill.rotation.z = Math.PI;
    g.position.set(x, 0, z);
    return this.telegraph(g, dur, p => fill.scale.set(1, Math.max(0.01, p), 1));
  }
  telegraphArc_(src, r, arc, dur) {
    const g = new THREE.Group();
    const geo = new THREE.CircleGeometry(r, 32, Math.PI / 2 - arc / 2, arc);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45));
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    return this.telegraph(g, dur, p => {
      g.position.set(src.x, 0.04, src.z);
      g.rotation.y = src.facing;
      fill.scale.setScalar(Math.max(0.01, p));
    });
  }
  slam(x, z, r) { this.fx('slam', { x: r2(x), z: r2(z), r }); if (!this.guest) this.loop.freeze(0.05); }
  slam_(x, z, r) {
    this.view.shake(0.45);
    this.sfx.play('slam');
    this.gore.confettiBurst(x, 0.2, z, 24, 6, [0xfff3e0, 0xe2d4ff, 0xc6f5d2]);
    this.gore.decals.paint(c => { c.strokeStyle = 'rgba(90,58,106,0.35)'; c.lineWidth = 0.05; for (let i = 0; i < 7; i++) { const a = Math.random() * 6.28; c.beginPath(); c.moveTo(x, z); c.lineTo(x + Math.cos(a) * r, z + Math.sin(a) * r); c.stroke(); } });
  }
  spawnPollen(src, tx, tz, dmg) {
    const dx = tx - src.x, dz = tz - src.z, l = Math.hypot(dx, dz) || 1;
    this.world.add(new Pollen(this, src.x + dx / l * 0.5, src.z + dz / l * 0.5, dx / l * 7.5, dz / l * 7.5, dmg));
    this.fx('sx', { n: 'spit' });
  }
  pollenNova(src, rings) {
    for (let r = 0; r < rings; r++) {
      const n = 14, off = r * Math.PI / n, sp = 6 - r * 1.5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + off;
        this.world.add(new Pollen(this, src.x + Math.sin(a) * 1.2, src.z + Math.cos(a) * 1.2, Math.sin(a) * sp, Math.cos(a) * sp, 12, { heart: true }));
      }
    }
    this.fx('sx', { n: 'screech', o: { pitch: 1.5 } });
    this.fx('sh', { a: 0.2 });
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
      this.fx('sp', { x: r2(x), y: 1.5, z: r2(z), dx: r2(Math.sin(a)), dz: r2(Math.cos(a)), n: 12, p: 4, c: [0x7dffc0, 0xd4002e] });
    }
    this.fx('bn', { t: '', s: 'MY BABIES! (throw them at her)', d: 1.6 });
    this.fx('sx', { n: 'summon' });
  }
  onBossPhase(b) { this.fx('bn', { t: 'SHE IS FURIOUS', s: 'phase two', d: 1.6 }); this.fx('sx', { n: 'roar' }); this.fx('sh', { a: 0.6 }); this.fx('cf', { x: r2(b.x), y: 2, z: r2(b.z), n: 40, p: 8 }); }
  onBossWall(b, hit) {
    this.fx('sh', { a: 0.8, k: 0.06 }); this.loop.freeze(0.14);
    this.fx('sx', { n: 'bonk', o: { pitch: 0.35 } }); this.fx('sx', { n: 'slam' });
    this.fx('ws', { x: r2(b.x), z: r2(b.z), nx: r2(hit.nx), nz: r2(hit.nz), r: b.radius, a: 30, c: b.def.blood });
    this.say('STUNNED!', b.x, 3.5, b.z, { cls: 'pinball', scale: 1.6, life: 1.4 });
    this.damage(b, { amount: 35, team: 'player', kind: 'wall', knock: 0 });
  }
  bossDead(b) {
    this.loop.freeze(0.35);
    this.slowmo = 2.5;
    this.fx('sh', { a: 1 });
    const room = this.level.rooms[b.room];
    for (const e of room.enemies) if (!e.dead && e !== b) this.pending.push(() => this.damage(e, { amount: 999, team: 'player', kind: 'boom', dirX: fx.f(-1, 1), dirZ: fx.f(-1, 1), knock: 10, lift: 8 }));
    this.boss = null;
  }

  // ------------------------------------------------------------------ player feedback hooks (local)
  // A blocked blow. Projectiles go back at the parrier's lock-on target; a melee attacker
  // is knocked flying, which makes it a projectile too.
  parry(p, src) {
    p.parryHit = true;
    p.parryCd = 0;
    const tgt = (p === this.player ? this.lock : null) ?? this.world.nearest(p.x, p.z, e => e.team === 'enemy' && e.hittable && !(e instanceof Pollen) && !e.carried, 12);
    if (src instanceof Pollen) {
      const dx = tgt ? tgt.x - src.x : src.x - p.x, dz = tgt ? tgt.z - src.z : src.z - p.z;
      src.reflect(dx, dz);
      src.dmg *= 1.4; // reflect() already x2.5: a parry is worth more than a swat
    } else if (src.team === 'enemy' && !src.boss) {
      const a = Math.atan2(src.x - p.x, src.z - p.z), dx = tgt && tgt !== src ? tgt.x - src.x : Math.sin(a), dz = tgt && tgt !== src ? tgt.z - src.z : Math.cos(a), l = Math.hypot(dx, dz) || 1;
      src.lastHitBy = p;
      this.damage(src, { amount: 10, dirX: dx / l, dirZ: dz / l, knock: 16, lift: 3, stun: 1.4, team: 'player', kind: 'parry', source: p });
    }
    this.telemetry.parry?.();
    this.fx('parried', { pid: p.pid, x: r2(p.x), z: r2(p.z) });
  }
  parriedFx(d) {
    const p = this.ent(d) ?? this.player, mine = this.isLocal(d.pid) || !this.net;
    this.sfx.play('parry');
    this.floaters.spawn('PARRY!', d.x, 2.4, d.z, { cls: 'parry', scale: 1.5, life: 1 });
    this.gore.confettiBurst(d.x, 1.2, d.z, 24, 6, [0xffffff, 0xfff1a1, 0xa6dcff]);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 40), new THREE.MeshBasicMaterial({ color: 0xfff1a1, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.5, d.z);
    this.scene.add(ring);
    this.slashes.push({ g: ring, t: 0, dur: 0.3, ring: true });
    if (mine) { this.loop.freeze(0.12); this.view.kick(0.04); this.view.shake(0.2); this.hud.parried(); }
  }
  // Sticky lock-on: keep the target until it dies or drifts off; prefer what you face.
  updateLock(it) {
    const p = this.player, valid = e => e && !e.dead && e.team === 'enemy' && e.hittable && !(e instanceof Pollen) && !e.carried && Math.hypot(e.x - p.x, e.z - p.z) < 9;
    const cands = () => this.world.entities.filter(valid);
    if (this.input.mouse.inside && !this.touch.active && !this.bot) {
      // Mouse players aim exactly; the lock just follows the bug nearest the cursor.
      const g = this.view.screenToGround(this.input.mouse.x, this.input.mouse.y, 0.6);
      this.lock = g ? this.world.nearest(g.x, g.z, valid, 2.5) : null;
      return;
    }
    if (it.lockNext) {
      const list = cands().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      this.lock = list[(list.indexOf(this.lock) + 1) % Math.max(1, list.length)] ?? null;
      this.sfx.play('pickup', { pitch: 1.6 });
      return;
    }
    if (valid(this.lock)) return;
    const fx_ = it.moveX || it.moveZ ? [it.moveX, it.moveZ] : [p.aimX, p.aimZ];
    let best = null, bs = Infinity;
    for (const e of cands()) {
      const dx = e.x - p.x, dz = e.z - p.z, d = Math.hypot(dx, dz), facing = (dx * fx_[0] + dz * fx_[1]) / (d * (Math.hypot(...fx_) || 1));
      const score = d * (1.6 - facing);
      if (score < bs) { bs = score; best = e; }
    }
    this.lock = best;
  }
  // How soon will something hit this knight? Drives the parry cue.
  incoming(p) {
    let t = Infinity;
    for (const e of this.world.entities) {
      if (e.dead) continue;
      if (e instanceof Pollen && e.team === 'enemy') {
        const rx = p.x - e.x, rz = p.z - e.z, sp = Math.hypot(e.vx, e.vz);
        if (sp < 0.5) continue;
        const closing = (rx * e.vx + rz * e.vz) / sp, miss = Math.abs(rx * e.vz - rz * e.vx) / sp;
        if (closing > 0 && miss < p.radius + 0.4) t = Math.min(t, Math.max(0, closing - p.radius - e.radius) / sp);
      } else if (e instanceof Enemy && e.state === 'windup' && e.active) {
        const d = Math.hypot(p.x - e.x, p.z - e.z);
        if (d < (e.def.ai === 'brute' ? 3.2 : e.def.ai === 'ranged' ? 0 : 2.2)) t = Math.min(t, Math.max(0, (e.windup ?? e.def.windup) - e.stateT) + 0.06);
      } else if (e instanceof Mantis && e.state === 'telegraph' && e.next === 'sweep' && Math.hypot(p.x - e.x, p.z - e.z) < 4.6) {
        t = Math.min(t, Math.max(0, (e.phase2 ? 0.52 : 0.7) - e.stateT) + 0.18);
      }
    }
    return t;
  }
  onSwing(p, kind) { p.swingCount = (p.swingCount ?? 0) + 1; this.slash(p, kind); this.telemetry.swing(); }
  slash(p, kind) {
    const arc = kind === 'finisher' ? 2.6 : 2.2, r = (kind === 'finisher' ? 2.1 : 1.9) * p.stats.reach;
    const geo = new THREE.RingGeometry(r * 0.45, r, 24, 1, -arc / 2, arc);
    const cols = [], pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) { const a = Math.atan2(pos.getY(i), pos.getX(i)); const c = new THREE.Color(RAINBOW[Math.floor(((a + arc / 2) / arc) * 5.99)]); cols.push(c.r, c.g, c.b); }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }));
    m.rotation.set(-Math.PI / 2, 0, 0);
    const g = new THREE.Group(); g.add(m);
    g.position.set(p.x, 0.7, p.z);
    g.rotation.y = Math.atan2(p.aimX, p.aimZ) - Math.PI / 2;
    this.scene.add(g);
    this.slashes.push({ g, t: 0, dur: 0.16 });
  }
  onWhirl(p) { this.hud.banner('', 'RAINBOW BLENDER', 1); this.sfx.play('whirl'); this.telemetry.special(); }
  onGrab(p, e) { this.sfx.play('grab'); if (p === this.player) this.floaters.spawn('GOTCHA', e.x, 2.2, e.z, { cls: 'bonk' }); this.telemetry.grab(); }
  onThrow(p, e) { this.sfx.play('throw'); this.telemetry.throw_(); if (p === this.player) this.view.shake(0.1); }
  onReflect(b) { this.fx('sx', { n: 'bonk', o: { pitch: 1.8 } }); this.say('RETURN TO SENDER', b.x, 1.8, b.z, { cls: 'bonk' }); this.telemetry.reflect(); }
  onPotion(p) { this.sfx.play('potion'); this.gore.confettiBurst(p.x, 1, p.z, 16, 3, [0xff5fa2, 0xffffff]); this.floaters.spawn('+HP', p.x, 2, p.z, { cls: 'heal' }); this.telemetry.potion(); }
  onPickupPotion(pt, by) {
    if (by && by.remote) { this.fx('potion', { to: by.pid }); return; }
    this.player.potions++; this.sfx.play('pickup', { pitch: 0.7 });
  }
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
    this.telemetry.levelUp();
    this.offerBoon();
  }
  // Solo pauses for the pick; co-op cannot pause the world, so the cards wait while you fight.
  offerBoon() {
    if (this.offers) { this.queuedBoons = (this.queuedBoons ?? 0) + 1; return; }
    this.offers = rollBoons(this.rng, 3);
    if (!this.net) this.state = 'boon';
    this.hud.showBoons(this.offers, !!this.net);
    this.sfx.play('levelup');
  }
  chooseBoon(i) {
    const b = this.offers?.[i];
    if (!b) return;
    b.apply(this.player);
    this.player.boons = [...(this.player.boons ?? []), b.id];
    this.telemetry.boon(b);
    this.hud.hideBoons();
    this.offers = null;
    if (this.state === 'boon') this.state = 'play';
    this.gore.confettiBurst(this.player.x, 1.5, this.player.z, 30, 5);
    if (this.queuedBoons) { this.queuedBoons--; this.offerBoon(); }
    else if (!this.guest && this.xp >= this.xpNeed()) this.levelUp();
  }
  onBreakableHit(b) { this.fx('cf', { x: r2(b.x), y: 0.8, z: r2(b.z), n: 6, p: 3 }); this.fx('sx', { n: 'thud' }); }
  onBreak(b) {
    this.fx('brk', { x: r2(b.x), z: r2(b.z), k: b.kind });
    const gems = b.kind === 'jar' ? 3 : 14;
    for (let i = 0; i < gems; i++) this.world.add(new Gem(this, b.x, b.z, i < 2 && b.kind === 'cocoon' ? 5 : 1));
    if (b.kind === 'cocoon' || Math.random() < 0.15) this.world.add(new Potion(this, b.x + 0.6, b.z + 0.3));
    this.telemetry.breakable(b.kind);
  }
  breakFx(d) {
    const jar = d.k === 'jar';
    this.sfx.play(jar ? 'glass' : 'pop');
    for (let i = 0; i < (jar ? 6 : 10); i++) {
      const c = (jar ? ['glass', 'glass', 'candy'] : ['gut', 'heart', 'eye', 'candy', 'meat'])[i % (jar ? 3 : 5)];
      const o = goreChunk(c); o.position.set(d.x, 0.8, d.z); this.scene.add(o);
      this.gore.fling(o, d.x, d.z, fx.f(-5, 5), fx.f(4, 9), fx.f(-5, 5), jar ? [0xffc94d] : [0xd4002e, 0xff7eb6], 0.08);
    }
    if (jar) this.gore.decals.splat(d.x, d.z, 0.45, '#ffc94d');
    else { this.gore.spray(d.x, 1.2, d.z, 0, 0, 60, 6, [0xd4002e, 0xff7eb6]); this.gore.confettiBurst(d.x, 1.5, d.z, 60, 8); this.loop.freeze(0.1); this.view.shake(0.4); }
  }
  playerDie(info) {
    const p = this.player;
    this.gore.kill(p, { ...info, knock: 10 }, true);
    this.sfx.play('death');
    this.telemetry.death(info);
    if (this.net) {
      // Co-op: a ghost until the room is won, unless everyone is a ghost.
      p.ghost = true; p.holding = null;
      this.hud.banner('YOU POPPED', 'your friends can still win the room', 3);
      return;
    }
    p.dead = true;
    this.state = 'dead';
    this.slowmo = 3;
    setTimeout(() => this.hud.showEnd(false), 1400);
  }
  revive(x, z) {
    const p = this.player;
    if (!p.ghost) return;
    p.rebuild();
    p.ghost = false; p.x = x; p.z = z; p.vx = p.vz = 0;
    p.hp = Math.round(p.stats.maxHp * 0.5);
    p.inv = 1.5;
    this.gore.confettiBurst(x, 1, z, 40, 5);
    this.hud.banner('', 'BACK FROM THE COMPOST', 1.6);
  }
  win() {
    if (this.state === 'win') return;
    this.state = 'win';
    this.telemetry.win();
    this.hud.banner('EXTERMINATED', 'the garden is quiet now', 3);
    setTimeout(() => this.hud.showEnd(true), 2200);
  }
  lose() {
    if (this.state === 'dead') return;
    this.state = 'dead';
    this.slowmo = 3;
    setTimeout(() => this.hud.showEnd(false), 1400);
  }
  restart(nextSeed = true, seed) {
    const q = new URLSearchParams(location.search);
    if (seed != null) q.set('seed', seed);
    else if (nextSeed) q.set('seed', (this.seed + 1) >>> 0);
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
    it.dodge = i.tapped('Space');
    it.special = i.tapped('KeyQ', 'KeyL');
    it.grab = i.tapped('KeyE', 'KeyF', 'Mouse1');
    it.potion = i.tapped('KeyR');
    it.parry = i.tapped('ShiftLeft', 'ShiftRight', 'KeyC', 'Mouse3');
    it.lockNext = i.tapped('Tab');
    for (let k = 0; k < 3; k++) if (i.tapped('Digit' + (k + 1))) it.choose = k;
    this.gamepad(it);
    this.touchIntent(it);
    return it;
  }
  // Touch and gamepad-without-right-stick aim at the lock; the bot aims for itself.
  aimAtLock(it) {
    if (this.bot || !this.lock || this.player.holding) return;
    if (this.touch.active ? !this.touch.aim : !this.input.mouse.inside && !this._gpAiming) {
      it.aimX = this.lock.x - this.player.x; it.aimZ = this.lock.z - this.player.z;
    }
  }
  touchIntent(it) {
    const t = this.touch, p = this.player;
    if (!t.active) return;
    if (t.move.x || t.move.y) { const d = this.view.screenToWorldDir(t.move.x, t.move.y); it.moveX = d.x; it.moveZ = d.z; }
    if (t.aim) { const d = this.view.screenToWorldDir(t.aim.x, t.aim.y); it.aimX = d.x; it.aimZ = d.z; }
    else {
      // Thumbs cannot aim and move at once, so aim for them: the nearest bug, else where you walk.
      const e = this.world.nearest(p.x, p.z, e => e instanceof Breakable, 3);
      if (e && !p.holding) { it.aimX = e.x - p.x; it.aimZ = e.z - p.z; }
      else if (it.moveX || it.moveZ) { it.aimX = it.moveX; it.aimZ = it.moveZ; }
      else { it.aimX = p.aimX; it.aimZ = p.aimZ; }
    }
    it.attack ||= t.held.has('attack');
    it.heavy ||= t.tapped.has('heavy');
    it.dodge ||= t.tapped.has('dodge');
    it.grab ||= t.tapped.has('grab');
    it.special ||= t.tapped.has('special');
    it.potion ||= t.tapped.has('potion');
    it.parry ||= t.tapped.has('parry');
    it.lockNext ||= t.tapped.has('lock');
    if (t.tapped.has('attack') && p.holding) it.attack = true;
  }
  gamepad(it) {
    const gp = navigator.getGamepads?.()[0];
    if (!gp) return;
    const dz = v => (Math.abs(v) < 0.2 ? 0 : v);
    const lx = dz(gp.axes[0]), ly = dz(gp.axes[1]), rx = dz(gp.axes[2]), ry = dz(gp.axes[3]);
    if (lx || ly) { const d = this.view.screenToWorldDir(lx, -ly); it.moveX = d.x; it.moveZ = d.z; it.aimX = d.x; it.aimZ = d.z; }
    this._gpAiming = !!(rx || ry);
    if (rx || ry) { const d = this.view.screenToWorldDir(rx, -ry); it.aimX = d.x; it.aimZ = d.z; }
    const prev = this._gpPrev ?? [], b = gp.buttons.map(b => b.pressed), tap = k => b[k] && !prev[k];
    it.attack ||= b[0]; it.heavy ||= tap(2); it.dodge ||= tap(1); it.grab ||= tap(3); it.special ||= tap(5); it.potion ||= tap(4);
    it.parry ||= tap(6); it.lockNext ||= tap(11) || tap(7);
    if (this.offers) { if (tap(14)) it.choose = 0; if (tap(12) || tap(13)) it.choose = 1; if (tap(15)) it.choose = 2; }
    this._gpPrev = b;
  }
  update(dt, frozen) {
    if (frozen || !this.started) { if (this.coop && this.started) this.coop.update(dt); this.input.endStep(); this.touch.endStep(); return; }
    this.time += dt;
    this.intent = this.bot ? this.bot.think(dt) : this.humanIntent();
    this.updateLock(this.intent);
    this.aimAtLock(this.intent);
    this.player.intent = this.intent;
    this.threat = this.incoming(this.player);
    if (this.pendingLevels) { this.pendingLevels--; this.levelUp(); }
    if (this.offers && this.intent.choose >= 0) this.chooseBoon(this.intent.choose);
    if (this.state === 'boon') { this.input.endStep(); this.touch.endStep(); return; }
    if (this.state === 'play') {
      this.flow.compute(this.player.x, this.player.z);
      this.world.update(dt);
      for (const f of this.pending.splice(0)) f();
      this.updateRooms(dt);
      if (this.net && !this.guest && this.players.length && this.players.every(k => k.ghost)) this.fx('lose', {});
    } else {
      // Dead or won: bodies keep settling but nothing thinks.
      for (const e of this.world.entities) if (!(e instanceof Player)) { e.desiredX = e.desiredZ = 0; e.springs?.(dt); }
      if ((this.input.tapped('Enter', 'Space') || this.againTapped) && !this.guest) {
        this.againTapped = false;
        if (this.net) this.fx('restart', { seed: (this.seed + 1) >>> 0 });
        else this.restart(this.state === 'dead');
      }
    }
    this.coop?.update(dt);
    this.gore.update(dt);
    this.streakT -= dt;
    if (this.streakT <= 0 && this.streak) { this.streak = 0; this.fx('st', { n: 0 }); }
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
      if (s.ring) { s.g.material.opacity = 0.9 * (1 - s.t / s.dur); s.g.scale.setScalar(1 + (s.t / s.dur) * 3); }
      else { s.g.children[0].material.opacity = 0.85 * (1 - s.t / s.dur); s.g.scale.setScalar(0.8 + (s.t / s.dur) * 0.3); }
      if (s.t >= s.dur) { this.scene.remove(s.g); this.slashes.splice(i, 1); }
    }
    this.telemetry.update(dt);
    this.input.endStep();
    this.touch.endStep();
  }
  updateReticle(dt) {
    if (!this.reticle) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.88, 4, 1), new THREE.MeshBasicMaterial({ color: 0xff5fa2, transparent: true, opacity: 0.85, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      const pip = this.goreKit.part('heart', 0xff5fa2, { s: 0.3, outline: 0.02, shadow: false });
      pip.rotation.x = Math.PI;
      g.add(ring, pip);
      this.scene.add(g);
      this.reticle = { g, ring, pip };
    }
    const r = this.reticle, e = this.lock;
    r.g.visible = !!e && !e.dead && this.state === 'play';
    if (!r.g.visible) return;
    const s = (e.radius ?? 0.4) * 1.6 + 0.2;
    r.g.position.set(e.x, 0.05, e.z);
    r.ring.scale.setScalar(s); r.ring.rotation.z += dt * 2;
    r.pip.position.set(0, (e.rig?.height ?? 1) + 0.6 + Math.sin(this.time * 6) * 0.1, 0);
    r.pip.rotation.y += dt * 3;
  }
  // Tall props standing between the camera and the player go see-through.
  fadeOccluders(dt, p) {
    const off = this.view.offset, l = Math.hypot(off.x, off.z), cx = off.x / l, cz = off.z / l;
    for (const m of this.levelMeshes.occluders) {
      const dx = m.position.x - p.x, dz = m.position.z - p.z;
      const along = dx * cx + dz * cz, side = Math.abs(dx * cz - dz * cx);
      const hide = along > 0 && along < 3.2 && side < 1.3;
      m.userData.fade = Math.max(0.3, Math.min(1, (m.userData.fade ?? 1) + (hide ? -dt * 5 : dt * 3)));
      m.traverse(o => {
        if (o.name === 'outline') { o.visible = m.userData.fade > 0.95; return; }
        if (o.material) { o.material.transparent = m.userData.fade < 1; o.material.opacity = m.userData.fade; }
      });
    }
  }
  render(dt) {
    const frozen = this.loop.hitstop > 0;
    const sdt = frozen ? 0 : dt * this.loop.timeScale;
    for (const e of this.world.entities) e.sync?.(sdt);
    if (this.slowmo > 0) { this.slowmo -= dt / this.loop.speed; this.loop.timeScale = this.net ? 1 : 0.3; }
    else this.loop.timeScale += (1 - this.loop.timeScale) * Math.min(1, dt * 4);
    // A ghost watches a living friend.
    const p = this.player.ghost ? (this.players.find(k => !k.ghost) ?? this.player) : this.player;
    this.fadeOccluders(dt, p);
    this.view.follow(p.x + p.aimX * 1.2, p.z + p.aimZ * 1.2, dt, 5);
    this.lights.follow(this.view.focus.x, this.view.focus.z);
    this.view.update(dt);
    this.floaters.update(dt);
    this.updateReticle(dt);
    this.hud.update(dt);
    if (this.touch.active) {
      const pl = this.player;
      this.touch.setLabel('special', pl.rage >= 100 ? '🌈' : `<small>${Math.floor(pl.rage)}%</small>`, pl.rage >= 100);
      this.touch.setLabel('potion', `♥<small>${pl.potions}</small>`, pl.potions > 0 && pl.hp < pl.stats.maxHp * 0.5);
      this.touch.setLabel('grab', pl.holding ? 'THROW' : 'GRAB', !!pl.holding);
      this.touch.setLabel('parry', 'PARRY', this.threat < 0.45);
    }
    this.view.render();
  }
}
const r2 = v => Math.round(v * 100) / 100;
