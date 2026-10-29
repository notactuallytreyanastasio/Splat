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
import { Music } from '../engine/audio/music.js';
import { defineMusic } from './music.js';
import { Floaters } from '../engine/ui/floaters.js';
import { TouchControls } from '../engine/ui/touch.js';
import { disposeTree } from '../engine/render/dispose.js';
import { parseLevel, buildLevelMeshes, bumpMushroom, updateMushrooms } from './level.js';
import { Player, Enemy, Mantis, Pollen, Gem, Potion, Breakable, ENEMIES } from './actors.js';
import { Gore } from './gore.js';
import { Juice, BUD_HATCH } from './juice.js';
import { Hud } from './hud.js';
import { defineSounds } from './sounds.js';
import { rollBoons, boonById } from './boons.js';
import { icon } from './icons.js';
import { Bot } from './bot.js';
import { Telemetry } from './telemetry.js';
import { RAINBOW, goreChunk } from './models.js';
import { Coop, TINTS } from './coop.js';
import { Tutorial } from './tutorial.js';

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
    this.music = new Music(this.sfx);
    defineMusic(this.music);
    this.audioMode = (() => { try { return localStorage.getItem('audio') || 'all'; } catch { return 'all'; } })();
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
    this.world.onTile = (e, hit) => this.tileHit(e, hit);
    this.levelMeshes = buildLevelMeshes(this.scene, this.level, new RNG(this.seed ^ 0x5eed));
    this.flow = new FlowField(this.map);
    this.gore = new Gore(this);
    this.juice = new Juice(this);
    this.floaters = new Floaters(this.view, document.getElementById('floaters'));
    this.telegraphs = [];
    this.slashes = [];
    this.pending = [];
    this.hatches = [];
    this.timers = [];   // render-time delays for cinematic beats; paused during hitstop
    this.trophies = [];
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
      { id: 'special', label: icon('rainbow'), style: '--x:0;--y:2.3' },
      { id: 'potion', label: icon('heart'), style: '--x:2.3;--y:1' },
      { id: 'lock', label: 'LOCK', cls: 'small', style: '--x:1.25;--y:2' },
    ]);
    this.coop = this.net ? new Coop(this, this.net) : null;
    this.bot = opts.bot ? new Bot(this, opts.botskill ?? 1) : null;
    this.tutorial = opts.tutorial && !this.net ? new Tutorial(this, levelJson) : null;
    this.intent = emptyIntent();
    if (opts.start != null && !this.guest) this.skipToRoom(+opts.start);
    // ?boons=sticky,ricochet starts the run with those boons (testing and screenshots).
    for (const id of (opts.boons ?? '').split(',')) { const b = boonById(id); if (b) { b.apply(this.player); this.player.boons = [...(this.player.boons ?? []), b.id]; this.telemetry.boon(b); } }
    this.view.snap(this.player.x, this.player.z);
    this.loop = new Loop({ update: (dt, frozen) => this.update(dt, frozen), render: dt => this.render(dt) });
    this.loop.speed = opts.speed ?? 1;
    this.loop.start();
    this.started = !!opts.bot;
    if (this.started) this.begin();
    else if (this.tutorial) this.tutorial.intro(() => { this.sfx.unlock(); this.started = true; this.begin(); });
    else this.hud.title(() => { this.sfx.unlock(); this.started = true; this.begin(); }, this.net);
  }
  begin() {
    document.body.classList.add('playing');
    this.applyAudioMode();
    if (!this.guest && !this.tutorial) this.fx('bn', { t: 'THE PASTEL GARDEN', s: this.net ? 'squish every pretty thing, together' : 'squish every pretty thing' }); }
  // all -> sfx only -> silent. Remembered per browser.
  cycleAudio() {
    this.audioMode = { all: 'sfx', sfx: 'off', off: 'all' }[this.audioMode];
    try { localStorage.setItem('audio', this.audioMode); } catch {}
    this.applyAudioMode();
    this.hud.banner('', { all: 'music + sound', sfx: 'sound only', off: 'silent' }[this.audioMode], 1.2);
  }
  applyAudioMode() {
    this.sfx.unlock();
    if (this.sfx.master) this.sfx.master.gain.value = this.audioMode === 'off' ? 0 : this.sfx.volume;
    if (this.audioMode === 'all') this.music.play('garden'); else this.music.stop();
    this.hud.audioIcon?.(this.audioMode);
  }
  // Music follows the fight: calm while exploring, full band in a locked room, her own
  // tune for the Empress, a little fanfare at the end.
  updateMusic(dt) {
    if (this.audioMode !== 'all' || !this.music.song) return;
    const room = this.level.rooms[this.currentRoom];
    const fighting = this.level.rooms.some(r => r.active);
    // Her tune holds through her death scene (the crown is out) until the fanfare.
    const boss = (this.boss && !this.boss.dead) || this.trophies.length > 0;
    this.music.play(this.state === 'win' ? 'victory' : boss ? 'empress' : 'garden');
    const target = this.state === 'dead' ? 0 : fighting ? 1 : 0.15;
    this.music.intensity += (target - this.music.intensity) * Math.min(1, dt * 1.5);
    // Combat heat (or the noir peak, which the blender reaches without heat) drives the machine.
    this.music.heat = this.state === 'play' ? Math.max(this.heat ?? 0, this.view.grade.noir * 1.1) : 0;
    this.music.setVolume(this.state === 'dead' ? 0.12 : this.player.hp < this.player.stats.maxHp * 0.25 ? 0.22 : 0.32);
  }
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
      case 'ws': this.addHeat(0.06); return this.gore.wallSplat(d.x, d.z, d.nx, d.nz, d.r, d.a, d.c);
      case 'pf': return this.gore.puff(d.x, d.y, d.z, d.c);
      case 'bud': return this.juice.bud(d.x, d.z, d.c);
      case 'tc': return this.telegraphCircle_(d.x, d.z, d.r, d.d, d.h);
      case 'tl': return this.telegraphLine_(d.x, d.z, d.dx, d.dz, d.l, d.w, d.d, d.h);
      case 'ta': { const src = this.world.byId.get(d.id); if (src) this.telegraphArc_(src, d.r, d.a, d.d, d.h); return; }
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
      case 'win': return this.win(d);
      case 'lose': return this.lose(d);
      case 'restart': return this.restart(false, d.seed);
      case 'parried': return this.parriedFx(d);
      case 'bmp': return this.bumpFx(d);
      case 'bi': return this.bossIntroFx(d);
      case 'bph': return this.bossPhaseFx(d);
      case 'arm': { const e = this.world.byId.get(d.id); if (e) e.armed = true; return; }
      case 'sb': return this.stickyFx(d);
      case 'rc': return this.ricochetFx(d);
      case 'yank': return this.yankFx(d);
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
  // The nearest point to (x, z) with r of open floor around it. Pickups do not move, so one
  // dropped by a bug dying against a hedge or a mushroom would otherwise sit inside it, out
  // of reach of a knight (and the bot, which walked into the hedge after it forever).
  openSpot(x, z, r = 0.35) {
    const clear = (px, pz) => !this.map.solidAt(px, pz) && [[r, 0], [-r, 0], [0, r], [0, -r]].every(([ox, oz]) => !this.map.solidAt(px + ox, pz + oz));
    if (clear(x, z)) return { x, z };
    for (let ring = 1; ring <= 8; ring++) for (let k = 0; k < ring * 8; k++) {
      const a = (k / (ring * 8)) * Math.PI * 2, px = x + Math.cos(a) * ring * 0.25, pz = z + Math.sin(a) * ring * 0.25;
      if (clear(px, pz)) return { x: px, z: pz };
    }
    return { x, z };
  }
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
        // Late joiners (and anyone who slipped out) are pulled into the fight: the gates are shut.
        const inside = this.players.find(k => !k.ghost && this.roomOf(k) === r.id);
        if (inside) for (const k of this.players) if (!k.ghost && this.roomOf(k) !== r.id && (k.pullT = (k.pullT ?? 0) + dt) > 1) {
          k.pullT = 0;
          const x = inside.x + fx.f(-0.6, 0.6), z = inside.z + fx.f(-0.6, 0.6);
          if (k.remote) this.fx('tp', { to: k.pid, x, z }); else { k.x = x; k.z = z; }
        }
        r.enemies = r.enemies.filter(e => !e.dead);
        if (r.enemies.length === 0 && !r.hatching) {
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
      if (this.boss) { this.boss.set('intro'); this.boss.cooldown = 0.6; this.fx('bi', { id: this.boss.nid }); }
    } else this.fx('bn', { t: room.name?.toUpperCase() ?? 'AMBUSH', s: `${room.enemies.length} pretty little lives` });
    this.events.emit('roomStart', room);
  }
  // Reinforcements hatch: a bud sprouts where each bug will be, shivers, and bursts open
  // with the bug hopping out. The room stays locked while any bud is still closed.
  spawnWave(room, types) {
    const tiles = room.tiles.filter(([x, z]) => !this.map.isSolid(x, z) && this.players.every(k => Math.hypot(x + 0.5 - k.x, z + 0.5 - k.z) > 5));
    const pool = tiles.length ? tiles : room.tiles.slice();
    for (const t of types) {
      const i = this.rng.int(0, pool.length - 1), [x, z] = pool[i];
      if (pool.length > 1) pool.splice(i, 1);
      const c = this.rng.pick(RAINBOW);
      this.fx('bud', { x: x + 0.5, z: z + 0.5, c });
      room.hatching = (room.hatching ?? 0) + 1;
      this.hatches.push({ t: BUD_HATCH, room, type: t, x: x + 0.5, z: z + 0.5 });
    }
    this.fx('bn', { t: 'MORE BUGS!', s: 'the flowers are hatching. good.' });
    this.fx('sx', { n: 'wave' });
  }
  updateHatches(dt) {
    for (let i = this.hatches.length - 1; i >= 0; i--) {
      const h = this.hatches[i];
      if ((h.t -= dt) > 0) continue;
      this.hatches.splice(i, 1);
      h.room.hatching--;
      const e = this.spawnEnemy(h.type, h.x, h.z, h.room, h.room.index);
      e.active = true; e.y = 0.3; e.vy = 8; e.stun = 0.3;
      h.room.enemies.push(e);
      this.fx('sx', { n: 'bloom', o: { pitch: 0.9 + Math.random() * 0.3 } });
    }
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
    // The Empress gets her death scene before the curtain.
    if (room.boss) { this.later(3.6, () => { if (this.state !== 'dead') this.fx('win', this.squadStats()); }); return; }
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
    if (d.kind !== 'whirl') this.addHeat(0.005 + d.a * 0.0003 + (d.kind === 'impact' ? 0.03 : 0));
    this.gore.hit(t, info);
    const big = BIG[d.kind];
    // Hitstop freezes the whole simulation, so in co-op only your own blows stop time.
    if (mine) this.loop.freeze(d.kind === 'whirl' ? 0.012 : big ? 0.1 : d.c ? 0.085 : d.kind === 'impact' ? 0.06 : 0.045);
    this.view.shake((big ? 0.35 : d.c ? 0.28 : d.kind === 'whirl' ? 0.05 : 0.14) * (mine ? 1 : 0.35));
    if ((big || d.c) && mine) this.view.kick(0.03);
    if (d.c && mine) this.hud.crit();
    this.sfx.play('hit', { pitch: d.kind === 'heavy' ? 0.6 : d.c ? 1.3 : 0.9 + Math.random() * 0.3 });
    this.floaters.spawn(d.c ? d.a + '!' : '' + d.a, t.x, (t.rig?.height ?? 1) + 0.4, t.z, { cls: d.c ? 'crit' : d.kind === 'impact' ? 'impact' : mine ? '' : 'ally', scale: Math.min(2, 0.8 + d.a / 40) });
    if (d.src === this.localId && this.guest) { this.telemetry.c.hits++; this.telemetry.c.dealt += d.a; }
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
    this.fx('kill', { id: t.nid, dx: r2(info.dirX ?? 0), dz: r2(info.dirZ ?? 0), k: info.knock ?? 4, o: overkill ? 1 : 0, tm: info.team === 'player' ? 1 : 0, ch: t.chain || 0, bw: (info.team === 'player' && (t.lastHitBy ?? this.player).stats.bowling) || undefined });
    if (t.sticky) this.stickyBoom(t); // a bomb killed before it lands still goes off: chain reactions
    this.streak++; this.streakT = 2.6;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (STREAKS[this.streak]) { this.fx('st', { n: this.streak, t: STREAKS[this.streak] }); this.fx('sx', { n: 'streak', o: { pitch: 1 + this.streak * 0.04 } }); }
    else if (this.streak > 1) this.fx('st', { n: this.streak });
    this.telemetry.kill(t, info, overkill);
    this.events.emit('kill', { target: t, info, overkill });
    const xp = (t.def?.xp ?? 1) * (t.elite ? 3 : 1);
    for (let i = 0; i < xp; i += i < 4 ? 1 : 5) this.world.add(new Gem(this, t.x, t.z, xp - i >= 5 && i >= 4 ? 5 : 1));
    if (Math.random() < (t.elite ? 0.5 : 0.08)) { const o = this.openSpot(t.x + fx.f(-0.5, 0.5), t.z + fx.f(-0.5, 0.5)); this.world.add(new Potion(this, o.x, o.z)); }
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
    this.bodyCount = (this.bodyCount ?? 0) + 1;
    this.addHeat(d.o ? 0.13 : 0.09);
    t.dead = true;
    if (t.carried === this.player) this.player.holding = null;
    t.carried = null;
    if (t.boss) return this.bossDeathFx(t, d);
    // Corpses are only projectiles on the host, where damage is decided.
    t.armed = false;
    this.gore.kill(t, { dirX: d.dx, dirZ: d.dz, knock: d.k, team: d.tm && !this.guest ? 'player' : null, bowling: d.bw ?? 0 }, !!d.o);
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
    if (mover.sticky) this.stickyBoom(mover);
    this.telemetry.impact(chain);
    this.fx('sx', { n: 'bonk', o: { pitch: 0.8 + chain * 0.15 } });
    if (chain >= 2) { this.say(`PINBALL x${chain}!`, other.x, 2.2, other.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 }); this.loop.freeze(0.08 + chain * 0.02); }
    else this.say('BONK!', other.x, 2, other.z, { cls: 'bonk' });
  }
  corpseImpact(it, e, sp) {
    if (this.guest) return;
    const { chain, bw } = it.proj, dirX = it.v.x / sp, dirZ = it.v.z / sp;
    // Bowling Ball: every piece counts as 2.5x heavier (4x with two), so a gib hits like a
    // corpse and a corpse like a beetle, and it keeps 88% of its speed through each bug.
    const mass = it.proj.mass * (1 + 1.5 * bw), pins = ++it.proj.pins;
    const dmg = sp * 1.9 * Math.sqrt(mass) * (1 + 0.3 * (chain - 1)) * (bw ? 1.25 : 1);
    e.chain = chain; e.thrownBy = 'player';
    this.damage(e, { amount: dmg, dirX, dirZ, knock: Math.min(24, sp * 0.7 * Math.max(0.5, mass)), lift: bw ? 4 : 2.5, stun: bw ? 1 : 0.6, team: 'player', kind: 'impact', chain });
    it.v.multiplyScalar(bw ? 0.88 : 0.6);
    this.telemetry.impact(chain);
    this.fx('sx', { n: 'bonk', o: { pitch: (bw ? 0.45 : 0.7) + chain * 0.15 } });
    if (bw) {
      this.fx('sx', { n: 'thud' });
      this.fx('sh', { a: 0.12 + 0.05 * pins });
      this.fx('cf', { x: r2(e.x), y: 0.4, z: r2(e.z), n: 10, p: 4, c: [0xc8b2ff, 0xffffff, 0xfff1a1] });
    }
    if (bw && pins >= 3) { if (pins === 3) this.telemetry.c.strikes++; this.say(pins >= 4 ? 'TURKEY!' : 'STRIKE!', e.x, 2.4, e.z, { cls: 'pinball', scale: 1.4 + pins * 0.1, life: 1.3 }); this.loop.freeze(0.1); }
    else if (bw && pins === 2 && chain < 2) this.say('SPARE!', e.x, 2.2, e.z, { cls: 'bonk', scale: 1.2 });
    else if (chain >= 2) { this.say(`PINBALL x${chain}!`, e.x, 2.2, e.z, { cls: 'pinball', scale: 1 + chain * 0.15, life: 1.2 }); this.loop.freeze(0.06 + chain * 0.02); }
    else this.say(it.proj.mass < 0.5 ? 'SHRAPNEL!' : 'CORPSE BOWLING!', e.x, 2, e.z, { cls: 'bonk' });
  }
  // Mushrooms are pinball bumpers. A launched body (or reflected pollen) comes off one
  // faster than it went in, reflected about the line from the stalk's centre, so the
  // round cap decides the bank angle rather than the square tile behind it. The chain
  // goes up, so whatever it hits next is a PINBALL. Walkers just collide.
  tileHit(e, hit) {
    if (this.guest || this.map.at(hit.tx, hit.tz) !== 'o' || e.carried) return false;
    // collideTiles already bounced the body with its own restitution; undo that to get
    // the speed it arrived with.
    const r = 1 + e.restitution, ix = e.vx - r * hit.speed * hit.nx, iz = e.vz - r * hit.speed * hit.nz;
    const inSp = Math.hypot(ix, iz);
    const pollen = e instanceof Pollen;
    if (pollen ? e.team !== 'player' : !(e.thrownBy === 'player' && inSp > e.launchSpeed)) return false;
    if (e.bumpAt != null && e.age - e.bumpAt < 0.15) return false;
    e.flightBumps = e.bumpAt != null && e.age - e.bumpAt < 1.2 ? e.flightBumps + 1 : 1;
    e.bumpAt = e.age;
    const out = this.bounceOff(hit.tx, hit.tz, e.x, e.z, ix, iz, inSp, e.flightBumps);
    e.vx = out.vx; e.vz = out.vz;
    if (!pollen) {
      e.chain = (e.chain || 0) + 1;
      e.impacted.clear();            // the rebound may come back for the one it just hit
      if (!e.airborne) e.vy = Math.max(e.vy, 2.5);
      e.squashV -= 6;
      this.fx('sp', { x: r2(e.x), y: 0.6, z: r2(e.z), dx: out.nx, dz: out.nz, n: 10, p: 4, c: e.def?.blood ?? [0xd4002e] });
    }
    this.boing(hit.tx, hit.tz, out, pollen ? 1 : e.chain);
    return true;
  }
  // Debris (corpses, gibs) bounces the same way on every peer; only a host projectile
  // scores the chain and makes the noise.
  bumpDebris(it, tx, tz) {
    if (this.map.at(tx, tz) !== 'o') return false;
    const p = it.obj.position, sp = Math.hypot(it.v.x, it.v.z);
    if (sp < 5 || (it.bumpAt != null && this.time - it.bumpAt < 0.15)) return false;
    it.flightBumps = it.bumpAt != null && this.time - it.bumpAt < 1.2 ? it.flightBumps + 1 : 1;
    it.bumpAt = this.time;
    const out = this.bounceOff(tx, tz, p.x, p.z, it.v.x, it.v.z, sp, it.flightBumps);
    it.v.x = out.vx; it.v.z = out.vz; it.v.y = Math.max(it.v.y, 3);
    if (it.proj && !this.guest) { it.proj.chain++; it.proj.hit.clear(); this.boing(tx, tz, out, it.proj.chain); }
    return true;
  }
  bounceOff(tx, tz, x, z, vx, vz, sp, k) {
    let nx = x - (tx + 0.5), nz = z - (tz + 0.5);
    const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    const vn = vx * nx + vz * nz;
    let rx = vx - 2 * Math.min(0, vn) * nx, rz = vz - 2 * Math.min(0, vn) * nz;
    const rl = Math.hypot(rx, rz) || 1;
    // A boost, not a loss: +25% and a kick on the first bump of a flight. Later bumps in
    // the same flight give less and then take, or a body lined up between two caps
    // would ping-pong at the cap speed forever; head-on that ends after four.
    const outSp = Math.min(17, k === 1 ? sp * 1.25 + 2 : k === 2 ? sp * 1.1 + 2 : sp * 0.85);
    return { vx: rx / rl * outSp, vz: rz / rl * outSp, nx: r2(nx), nz: r2(nz), sp: outSp };
  }
  boing(tx, tz, out, chain) {
    // A dismembered body hits a cap as five pieces at once: one BOING, not five.
    const key = tz * this.map.w + tx, last = (this.bumpedAt ??= new Map()).get(key);
    if (last != null && this.time - last < 0.25) return;
    this.bumpedAt.set(key, this.time);
    this.telemetry.bump();
    this.fx('bmp', { tx, tz, nx: out.nx, nz: out.nz, p: Math.round(out.sp), c: chain });
    this.say(chain >= 2 ? `BOING x${chain}!` : 'BOING!', tx + 0.5, 2.6, tz + 0.5, { cls: 'boing', scale: Math.min(1.8, 1 + (chain - 1) * 0.15), life: 1 });
    this.loop.freeze(0.035);
  }
  bumpFx(d) {
    bumpMushroom(this.levelMeshes, d.tx, d.tz, d.nx, d.nz, d.p);
    this.sfx.play('boing', { pitch: Math.min(1.8, 0.9 + d.c * 0.12), gap: 0.05 });
    this.gore.confettiBurst(d.tx + 0.5 + d.nx * 0.6, 1.9, d.tz + 0.5 + d.nz * 0.6, 8, 4, [0xffffff, 0xfff1a1, 0x9ff0d4]);
    this.view.shake(0.12);
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
    if (e.sticky) this.stickyBoom(e);
    else if (!e.dead) this.ricochet(e, hit);
  }
  // Ricochet: the wall gives the speed back (elastic instead of 25% restitution) and the
  // rebound bends up to 70% toward a bug in front, so a bank shot usually finds someone.
  ricochet(e, hit) {
    const st = (e.lastHitBy ?? this.player).stats;
    if (!st.ricochet || e.boss || (e.ricochets ?? 0) >= st.ricochet) return;
    e.ricochets = (e.ricochets ?? 0) + 1; this.telemetry.c.ricochets++;
    e.vx += hit.nx * hit.speed * (1 - e.restitution); e.vz += hit.nz * hit.speed * (1 - e.restitution);
    const l0 = Math.hypot(e.vx, e.vz) || 1, sp = l0 * 0.95;
    let dx = e.vx / l0, dz = e.vz / l0;
    const tgt = this.world.nearest(e.x, e.z, o => {
      if (o === e || o.team !== 'enemy' || !o.hittable || o instanceof Pollen || o.carried) return false;
      const ox = o.x - e.x, oz = o.z - e.z, l = Math.hypot(ox, oz) || 1;
      return (ox * dx + oz * dz) / l > 0.5;
    }, 9);
    if (tgt) {
      const ox = tgt.x - e.x, oz = tgt.z - e.z, l = Math.hypot(ox, oz) || 1;
      dx = dx * 0.3 + ox / l * 0.7; dz = dz * 0.3 + oz / l * 0.7;
      const m = Math.hypot(dx, dz) || 1; dx /= m; dz /= m;
    }
    e.vx = dx * sp; e.vz = dz * sp; e.vy = Math.max(e.vy, 2);
    e.thrownBy = 'player'; e.stun = Math.max(e.stun, 1); e.impacted.clear();
    e.lastSlam = e.age - 0.15; // the next wall may splat after 0.15s instead of 0.3s
    this.fx('rc', { x: r2(e.x - hit.nx * e.radius), z: r2(e.z - hit.nz * e.radius), nx: r2(hit.nx), nz: r2(hit.nz), n: e.ricochets });
  }
  ricochetFx(d) {
    this.gore.confettiBurst(d.x, 0.8, d.z, 22, 7, [0xfff1a1, 0xffffff, 0xa6dcff]);
    this.sfx.play('bonk', { pitch: 2.2 + d.n * 0.3 });
    this.sfx.play('parry');
    this.floaters.spawn(d.n > 1 ? `RICOCHET x${d.n}!` : 'RICOCHET!', d.x + d.nx * 0.6, 2.2, d.z + d.nz * 0.6, { cls: 'pinball', scale: 1.15, life: 1 });
    // A spark diamond flat against the wall face.
    const star = new THREE.Mesh(new THREE.RingGeometry(0.15, 0.5, 4), new THREE.MeshBasicMaterial({ color: 0xfff1a1, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    star.position.set(d.x + d.nx * 0.05, 0.8, d.z + d.nz * 0.05);
    star.lookAt(d.x + d.nx, 0.8, d.z + d.nz);
    this.scene.add(star);
    this.slashes.push({ g: star, t: 0, dur: 0.25, ring: true });
    this.view.shake(0.18);
  }
  // Sticky Bomb: the thrown bug is the warhead. Damage falls off to half at the rim.
  stickyBoom(e) {
    if (!e.sticky || this.guest) return;
    const dmg = e.sticky, x = e.x, z = e.z, r = 2.4, by = e.lastHitBy;
    e.sticky = 0; this.telemetry.c.bombs++;
    this.pending.push(() => {
      this.fx('sb', { id: e.nid, x: r2(x), z: r2(z), r, c: e.def?.blood });
      for (const o of this.world.query(x, z, r, o => o.team === 'enemy' && o.hittable && !(o instanceof Pollen))) {
        const ox = o.x - x, oz = o.z - z, l = Math.hypot(ox, oz), a = l > 0.05 ? Math.atan2(ox, oz) : Math.atan2(e.vx, e.vz);
        this.damage(o, { amount: dmg * (o === e ? 1.5 : 1 - 0.5 * Math.min(1, l / r)), dirX: Math.sin(a), dirZ: Math.cos(a), knock: 13, lift: 5, stun: 0.9, team: 'player', kind: 'boom', source: by });
      }
    });
  }
  stickyFx(d) {
    const e = this.world.byId.get(d.id);
    if (e) e.armed = false;
    this.gore.confettiBurst(d.x, 0.7, d.z, 50, 10, [0xff5fa2, 0xff9ecb, 0xffffff, 0xfff1a1]);
    this.gore.spray(d.x, 0.8, d.z, 0, 0, 50, 7, d.c ?? [0xd4002e, 0xff7eb6]);
    this.gore.decals.splat(d.x, d.z, d.r * 0.55, '#ff5fa2');
    this.gore.decals.splat(d.x, d.z, d.r * 0.3, '#c4002a');
    for (const [r0, col, dur] of [[0.5, 0xff5fa2, 0.32], [0.3, 0xffffff, 0.2]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.22, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(d.x, 0.3, d.z);
      this.scene.add(ring);
      this.slashes.push({ g: ring, t: 0, dur, ring: true });
    }
    this.floaters.spawn('KABLOOEY!', d.x, 2.6, d.z, { cls: 'pinball', scale: 1.4, life: 1.1 });
    this.sfx.play('pop'); this.sfx.play('slam');
    this.view.shake(0.45); this.view.kick(0.04);
    this.loop.freeze(0.07);
  }
  // Long Arms: a grab from past the normal reach draws a quick mint arm out to the bug.
  yankFx(d) {
    const dx = d.x2 - d.x1, dz = d.z2 - d.z1, l = Math.hypot(dx, dz) || 1;
    const g = new THREE.Group();
    for (const [w, col, y] of [[0.36, 0x3a2346, 0], [0.2, 0x9ff0d4, 0.02]]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.position.y = y;
      g.add(m);
    }
    g.position.set((d.x1 + d.x2) / 2, 0.9, (d.z1 + d.z2) / 2);
    g.rotation.y = Math.atan2(dx, dz);
    this.scene.add(g);
    this.slashes.push({ g, t: 0, dur: 0.2, yank: true });
    this.sfx.play('dodge');
    this.gore.confettiBurst(d.x2, 1, d.z2, 8, 3, [0x9ff0d4, 0xffffff]);
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
    // Drawn after the blood layer (renderOrder 1): a warning under a puddle is no warning.
    mesh.traverse(m => { m.renderOrder = 2; });
    this.scene.add(mesh);
    const t = { mesh, dur, t: 0, update };
    this.telegraphs.push(t);
    return t;
  }
  // heat: 0 plain, 1 boss (the fill snaps bright the instant it lands), 2 enraged boss
  // (deeper red, and the floor throbs faster as the hit gets closer).
  teleMaterial(opacity, heat = 0) { return new THREE.MeshBasicMaterial({ color: heat === 2 ? 0xff0a3c : 0xff2d6f, transparent: true, opacity, depthWrite: false }); }
  teleHeat(back, fill, p, heat, t) {
    if (!heat) return;
    if (heat === 2) back.material.opacity = back.userData.o * (0.7 + 0.6 * Math.max(0, Math.sin(t * (14 + p * 30))));
    fill.material.opacity = p > 0.9 ? 0.8 : fill.userData.o;
  }
  telegraphCircle(x, z, r, d, h = 0) { this.fx('tc', { x: r2(x), z: r2(z), r, d, ...(h ? { h } : {}) }); }
  telegraphLine(x, z, dx, dz, l, w, d, h = 0) { this.fx('tl', { x: r2(x), z: r2(z), dx: r2(dx), dz: r2(dz), l, w, d, ...(h ? { h } : {}) }); }
  telegraphArc(src, r, a, d, h = 0) { this.fx('ta', { id: src.nid, r, a, d, ...(h ? { h } : {}) }); }
  telegraphCircle_(x, z, r, dur, heat = 0) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * (heat ? 0.86 : 0.92), r, 40), this.teleMaterial(0.8, heat));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(r, 40), this.teleMaterial(0.3, heat));
    ring.userData.o = 0.8; fill.userData.o = 0.3;
    for (const m of [ring, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    g.position.set(x, 0, z);
    let t = 0;
    return this.telegraph(g, dur, p => { t = p * dur; fill.scale.setScalar(Math.max(0.01, p)); this.teleHeat(ring, fill, p, heat, t); });
  }
  telegraphLine_(x, z, dx, dz, len, w, dur, heat = 0) {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(w, len); geo.translate(0, len / 2, 0);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25, heat)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45, heat));
    back.userData.o = 0.25; fill.userData.o = 0.45;
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    if (heat) for (const sx of [-1, 1]) {
      // Hard edges so the lane she will run down reads at a glance.
      const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.08, len).translate(sx * w / 2, len / 2, 0), this.teleMaterial(0.9, heat));
      edge.rotation.x = -Math.PI / 2; edge.rotation.z = Math.PI; edge.position.y = 0.005; g.add(edge);
    }
    g.rotation.set(0, Math.atan2(dx, dz), 0);
    back.rotation.z = fill.rotation.z = Math.PI;
    g.position.set(x, 0, z);
    return this.telegraph(g, dur, p => { fill.scale.set(1, Math.max(0.01, p), 1); this.teleHeat(back, fill, p, heat, p * dur); });
  }
  telegraphArc_(src, r, arc, dur, heat = 0) {
    const g = new THREE.Group();
    const geo = new THREE.CircleGeometry(r, 32, Math.PI / 2 - arc / 2, arc);
    const back = new THREE.Mesh(geo, this.teleMaterial(0.25, heat)), fill = new THREE.Mesh(geo, this.teleMaterial(0.45, heat));
    back.userData.o = 0.25; fill.userData.o = 0.45;
    for (const m of [back, fill]) { m.rotation.x = -Math.PI / 2; g.add(m); }
    if (heat) {
      const rim = new THREE.Mesh(new THREE.RingGeometry(r - 0.1, r, 32, 1, Math.PI / 2 - arc / 2, arc), this.teleMaterial(0.9, heat));
      rim.rotation.x = -Math.PI / 2; rim.position.y = 0.005; g.add(rim);
    }
    return this.telegraph(g, dur, p => {
      g.position.set(src.x, 0.04, src.z);
      g.rotation.y = src.facing;
      fill.scale.setScalar(Math.max(0.01, p));
      this.teleHeat(back, fill, p, heat, p * dur);
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
    this.fx('sx', { n: 'nova' });
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
  onBossPhase(b) { this.fx('bph', { id: b.nid, x: r2(b.x), z: r2(b.z) }); }
  onBossWall(b, hit) {
    this.fx('sh', { a: 0.8, k: 0.06 }); this.loop.freeze(0.14);
    this.fx('sx', { n: 'bonk', o: { pitch: 0.35 } }); this.fx('sx', { n: 'slam' });
    this.fx('ws', { x: r2(b.x), z: r2(b.z), nx: r2(hit.nx), nz: r2(hit.nz), r: b.radius, a: 30, c: b.def.blood });
    this.say('STUNNED!', b.x, 3.5, b.z, { cls: 'pinball', scale: 1.6, life: 1.4 });
    this.damage(b, { amount: 35, team: 'player', kind: 'wall', knock: 0 });
  }
  bossDead(b) {
    // Freeze, zoom and the explosion itself are in bossDeathFx so every peer sees them.
    this.slowmo = 2.4;
    const room = this.level.rooms[b.room];
    for (const e of room.enemies) if (!e.dead && e !== b) this.pending.push(() => this.damage(e, { amount: 999, team: 'player', kind: 'boom', dirX: fx.f(-1, 1), dirZ: fx.f(-1, 1), knock: 10, lift: 8 }));
    // Nothing she left in the air gets to land a cheap shot during her death scene.
    for (const e of this.world.entities) if (e instanceof Pollen && e.team === 'enemy' && !e.dead) e.pop();
    this.boss = null;
  }

  // ------------------------------------------------------------------ the Empress, cinematics (every peer)
  later(s, fn) { this.timers.push({ t: s, fn }); }
  // Her room locks: the camera goes to her, she rears and screeches, her name card lands,
  // the camera comes home. About two seconds; the knight can still move the whole time.
  bossIntroFx(d) {
    const b = this.world.byId.get(d.id);
    if (!b) return;
    this.view.focusOn(b, { ease: 0.5, hold: 1.25, out: 0.55, zoom: 0.3, lift: 1.1 });
    this.hud.cinema(2.1);
    this.sfx.play('roar');
    this.later(0.45, () => {
      this.sfx.play('shriek');
      this.view.shake(0.35);
      this.gore.confettiBurst(b.x, 2.6, b.z, 26, 5, [0xff9ecb, 0xfff1a1, 0xc6f5d2]);
      this.hud.bossCard('EMPRESS MANTIS', 'she wants her babies back', 2.1);
    });
  }
  // Half health: eyes go red, wings flare, she roars. Her attacks get the hot telegraphs.
  bossPhaseFx(d) {
    const b = this.world.byId.get(d.id);
    if (b) b.phase2 = true;
    const x = b?.x ?? d.x, z = b?.z ?? d.z;
    if (b) this.view.focusOn(b, { ease: 0.2, hold: 0.55, out: 0.45, zoom: 0.16, lift: 0.8 });
    this.hud.flash('rgba(255,40,90,.45)');
    this.hud.banner('SHE IS FURIOUS', 'her eyes went red. so will you.', 1.8);
    this.sfx.play('enrage');
    this.view.shake(0.6);
    this.gore.confettiBurst(x, 2.2, z, 70, 9, [0xff2d6f, 0xff5fa2, 0xff9ecb, 0xfff1a1]);
    this.gore.spray(x, 2.4, z, 0, 0, 40, 6, [0xd4002e, 0x7dffc0]);
    for (const [r0, dur] of [[1.2, 0.45], [0.8, 0.6]]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r0 + 0.25, 48), new THREE.MeshBasicMaterial({ color: 0xff2d6f, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(x, 0.12, z); ring.renderOrder = 2;
      this.scene.add(ring);
      this.slashes.push({ g: ring, t: 0, dur, ring: true });
    }
  }
  // The kill blow: everything stops, the camera closes in, she flashes, then she comes apart
  // in a shower of gibs and confetti and her crown goes bouncing off across the floor.
  bossDeathFx(t, d) {
    const r = t.rig;
    t.onRemove = () => {}; // the cinematic owns the rig now; it leaves the scene when it bursts
    this.ending = true;
    this.loop.freeze(0.7);
    this.view.focusOn({ x: t.x, z: t.z }, { ease: 0.3, hold: 2, out: 0.7, zoom: 0.38, lift: 0.8 });
    this.hud.cinema(4.4);
    // Her attack is cancelled by dying; its warning goes with it.
    for (const tg of this.telegraphs.splice(0)) { this.scene.remove(tg.mesh); disposeTree(tg.mesh); }
    this.threat = Infinity; // and so is the parry cue it was driving
    this.hud.flash('rgba(255,255,255,.85)');
    this.sfx.play('bossdie');
    this.view.shake(0.3);
    r.kit.flash(1, 0xffffff);
    const snap = { x: t.x, y: t.y, z: t.z, radius: t.radius, mass: t.mass, chain: 0, def: t.def, rig: { ...r, gibs: r.gibs.filter(g => g !== r.parts.crown) } };
    this.later(0, () => {
      r.kit.flash(0);
      const crown = r.parts.crown;
      // Out of the rig before it bursts, so the gore never takes it.
      crown.updateWorldMatrix(true, false);
      this.scene.attach(crown);
      crown.scale.multiplyScalar(2);
      this.gore.kill(snap, { dirX: d.dx, dirZ: d.dz, knock: 14 }, true);
      r.root.parent?.remove(r.root);
      const blood = t.def.blood;
      this.gore.spray(t.x, 2, t.z, 0, 0, 160, 11, blood);
      for (let i = 0; i < 36; i++) {
        const c = goreChunk(fx.pick(['gut', 'heart', 'eye', 'meat', 'bone', 'candy']));
        c.position.set(t.x + fx.f(-0.6, 0.6), fx.f(1, 2.6), t.z + fx.f(-0.6, 0.6));
        c.scale.multiplyScalar(fx.f(1, 1.8));
        this.scene.add(c);
        const a = fx.f(0, 6.28), sp = fx.f(3, 12);
        this.gore.fling(c, t.x, t.z, Math.cos(a) * sp, fx.f(6, 15), Math.sin(a) * sp, blood, 0.14);
      }
      this.gore.decals.splat(t.x, t.z, 1.5, '#c4002a');
      for (const [delay, n, p, y] of [[0, 160, 11, 2.2], [0.25, 110, 8, 3], [0.6, 90, 6, 3.6]]) this.later(delay, () => this.gore.confettiBurst(t.x, y, t.z, n, p));
      this.view.shake(1); this.view.kick(0.08);
      this.sfx.play('pop'); this.sfx.play('slam'); this.sfx.play('squish');
      // The crown flies the way the killing blow went, the same on every peer.
      const l = Math.hypot(d.dx, d.dz) || 1, dx = d.dx / l || 0.7, dz = d.dz / l || 0.7;
      this.trophies.push({ obj: crown, v: new THREE.Vector3(dx * 4, 10, dz * 4), spin: 9, tumble: 14, glint: 0 });
      // Then the camera follows the crown until it comes to rest.
      this.later(0.9, () => this.view.focusOn(crown.position, { ease: 0.8, hold: 2.4, out: 0.8, zoom: 0.3 }));
    });
  }
  updateTrophies(dt) {
    for (const c of this.trophies) {
      const o = c.obj, p = o.position, v = c.v;
      if (c.rest) {
        // A trophy: it sits where it fell and glints now and then.
        o.rotation.y += dt * 0.6;
        if ((c.glint -= dt) <= 0) { c.glint = 1.4; this.gore.confettiBurst(p.x, 0.5, p.z, 4, 1.2, [0xfff1a1, 0xffffff, 0xffd66b]); }
        continue;
      }
      v.y -= 26 * dt;
      const nx = p.x + v.x * dt, nz = p.z + v.z * dt;
      if (this.map.solidAt(nx, p.z)) v.x *= -0.6; else p.x = nx;
      if (this.map.solidAt(p.x, nz)) v.z *= -0.6; else p.z = nz;
      p.y += v.y * dt;
      o.rotation.y += c.spin * dt;
      o.rotation.x += c.tumble * dt;
      const floor = 0.1;
      if (p.y < floor) {
        p.y = floor;
        if (v.y < -2.5) {
          this.sfx.play('clink', { pitch: 0.8 + Math.min(1, -v.y / 14) * 0.6, gap: 0.04 });
          this.gore.confettiBurst(p.x, 0.2, p.z, 6, 2, [0xfff1a1, 0xffd66b]);
          v.y *= -0.55; v.x *= 0.78; v.z *= 0.78; c.spin *= 0.7; c.tumble *= 0.45;
        } else { const f = Math.exp(-dt * 6.3); v.y = 0; v.x *= f; v.z *= f; } // 0.9 per frame at 60fps, at any fps
      }
      // Land upright: the tumble settles to the nearest full turn as it slows.
      if (p.y <= floor + 0.02 && Math.abs(v.y) < 1) { const up = Math.round(o.rotation.x / (Math.PI * 2)) * Math.PI * 2; o.rotation.x += (up - o.rotation.x) * Math.min(1, dt * 10); c.tumble *= Math.exp(-dt * 6); }
      if (p.y <= floor + 0.01 && Math.hypot(v.x, v.z) < 0.25 && Math.abs(v.y) < 0.5) { c.rest = true; o.position.y = floor; o.rotation.x = 0; o.rotation.z = 0; this.sfx.play('clink', { pitch: 1.6 }); }
    }
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
  onGrab(p, e, dist = 0) {
    this.sfx.play('grab');
    if (p === this.player) this.floaters.spawn(dist > 1.9 ? 'YOINK!' : 'GOTCHA', e.x, 2.2, e.z, { cls: 'bonk' });
    this.telemetry.grab();
    if (this.guest) return;
    if (dist > 1.9) this.telemetry.c.yanks++;
    if (dist > 1.9) this.fx('yank', { x1: r2(p.x), z1: r2(p.z), x2: r2(e.x), z2: r2(e.z) });
    if (p.stats.sticky) this.fx('arm', { id: e.nid });
  }
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
    if (this.tutorial) return; // no boon pause in the middle of a lesson
    this.level_++;
    this.telemetry.levelUp();
    this.offerBoon();
  }
  // Solo pauses for the pick; co-op cannot pause the world, so the cards wait while you fight.
  offerBoon() {
    // No boon picker over the Empress's death scene: it would pause the crown mid-air and
    // the end screen would land on top of it.
    if (this.ending) return;
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
    this.hud.hideBoons(i);
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
    if (b.kind === 'cocoon' || Math.random() < 0.15) { const o = this.openSpot(b.x + 0.6, b.z + 0.3); this.world.add(new Potion(this, o.x, o.z)); }
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
    if (p.holding) { const h = p.holding; p.holding = null; h.carried = null; h.stun = 1; h.vy = 4; }
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
  // Kills and chains are counted where damage is decided, on the host. A guest's end
  // screen grades the squad's numbers, not the zeros its own telemetry would show.
  squadStats() { return { k: this.telemetry.c.kills, ch: this.telemetry.c.maxChain }; }
  win(d) {
    if (this.state === 'win') return;
    this.squad = d;
    this.state = 'win';
    this.telemetry.win();
    this.hud.banner('EXTERMINATED', 'the garden is quiet now', 3);
    setTimeout(() => this.hud.showEnd(true), 2200);
  }
  lose(d) {
    if (this.state === 'dead') return;
    this.squad = d;
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
    if (i.tapped('KeyM')) this.cycleAudio();
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
      if (!this.guest) this.updateHatches(dt);
      this.updateRooms(dt);
      this.tutorial?.update(dt);
      if (this.net && !this.guest && this.players.length && this.players.every(k => k.ghost)) this.fx('lose', this.squadStats());
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
    this.updateMusic(dt);
    this.gore.update(dt);
    this.juice.update(dt);
    this.streakT -= dt;
    if (this.streakT <= 0 && this.streak) { this.streak = 0; this.fx('st', { n: 0 }); }
    this.gemComboT -= dt;
    if (this.gemComboT <= 0) this.gemCombo = 0;
    if (this.trophies.length) this.updateTrophies(dt);
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      const t = this.telegraphs[i];
      t.t += dt;
      t.update?.(Math.min(1, t.t / t.dur));
      if (t.t >= t.dur) { this.scene.remove(t.mesh); disposeTree(t.mesh); this.telegraphs.splice(i, 1); }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      const s = this.slashes[i];
      s.t += dt;
      if (s.ring) { s.g.material.opacity = 0.9 * (1 - s.t / s.dur); s.g.scale.setScalar(1 + (s.t / s.dur) * 3); }
      else if (s.yank) s.g.scale.set(Math.max(0.01, 1 - s.t / s.dur), 1, 1);
      else { s.g.children[0].material.opacity = 0.85 * (1 - s.t / s.dur); s.g.scale.setScalar(0.8 + (s.t / s.dur) * 0.3); }
      if (s.t >= s.dur) { this.scene.remove(s.g); disposeTree(s.g); this.slashes.splice(i, 1); }
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
  // Every kill drains a little color from the world you see. Full rage (and the blender)
  // is noir: black and white, blood still red, the band muffled like an old record.
  // Combat heat: kills, hits, chains and splats pile it on; a second of calm and it drains
  // fast. The world is colorful by default, loses color as a fight heats up, and goes noir
  // at the peak (and through the blender). Dead bugs stay grey either way.
  addHeat(v) { this.heat = Math.min(1.3, (this.heat ?? 0) + v); this.heatT = 0; }
  updateGrade(dt) {
    const g = this.view.grade, p = this.player;
    this.heatT = (this.heatT ?? 0) + dt;
    this.heat = Math.max(0, (this.heat ?? 0) - dt * (this.heatT > 0.7 ? 0.6 : 0.2));
    const sat = 1 - Math.min(1, this.heat) * 0.8;
    if (this.heat >= 1.1) this.noirOn = true; else if (this.heat < 0.7) this.noirOn = false;
    const noir = this.state === 'play' && !p.ghost && (this.noirOn || p.state === 'whirl') ? 1 : 0;
    g.sat += (sat - g.sat) * Math.min(1, dt * (sat > g.sat ? 3 : 2));
    g.noir += (noir - g.noir) * Math.min(1, dt * (noir ? 6 : 2.5));
    if (this.state === 'play') { this.telemetry.c.noirTime = (this.telemetry.c.noirTime ?? 0) + (g.noir > 0.5 ? dt : 0); this.telemetry.c.satSum = (this.telemetry.c.satSum ?? 0) + g.sat * dt; }
    if (noir && !this.wasNoir) { this.sfx.play('noir'); this.view.kick(0.03); }
    this.wasNoir = noir;
    // The band follows the color: a drained world sounds muffled and warped, noir like an old record.
    this.music.color = g.sat;
    this.music.setTone(Math.min(800 + (1 - g.noir) * 19200, 2600 + g.sat * g.sat * 17400));
    document.body.classList.toggle('noir', g.noir > 0.5);
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
    const now = performance.now();
    if (this.lastRender) this.view.adapt(now - this.lastRender);
    this.lastRender = now;
    const frozen = this.loop.hitstop > 0;
    const sdt = frozen ? 0 : dt * this.loop.timeScale;
    // A body killed outside world.update (a guest's killFx, a pending explosion) is still
    // listed until the next update; posing it would drag its flung limbs back to the rig.
    for (const e of this.world.entities) if (!e.dead) e.sync?.(sdt);
    updateMushrooms(this.levelMeshes, sdt);
    if (this.slowmo > 0) { this.slowmo -= dt / this.loop.speed; this.loop.timeScale = this.net ? 1 : 0.3; }
    else this.loop.timeScale += (1 - this.loop.timeScale) * Math.min(1, dt * 4);
    // A ghost watches a living friend.
    const p = this.player.ghost ? (this.players.find(k => !k.ghost) ?? this.player) : this.player;
    this.updateGrade(dt);
    this.fadeOccluders(dt, p);
    this.view.follow(p.x + p.aimX * 1.2, p.z + p.aimZ * 1.2, dt, 5);
    if (!frozen && this.timers.length) for (const t of this.timers.splice(0)) if ((t.t -= dt) <= 0) t.fn(); else this.timers.push(t);
    this.view.update(dt);
    this.lights.follow(this.view.center.x, this.view.center.z);
    this.floaters.update(dt);
    this.updateReticle(dt);
    this.hud.update(dt);
    this.tutorial?.render(dt);
    if (this.touch.active) {
      const pl = this.player;
      this.touch.setLabel('special', pl.rage >= 100 ? icon('rainbow') : `${icon('rainbow')}<small>${Math.floor(pl.rage)}%</small>`, pl.rage >= 100);
      this.touch.setLabel('potion', `${icon('heart')}<small>${pl.potions}</small>`, pl.potions > 0 && pl.hp < pl.stats.maxHp * 0.5);
      this.touch.setLabel('grab', pl.holding ? 'THROW' : 'GRAB', !!pl.holding);
      this.touch.setLabel('parry', 'PARRY', this.threat < 0.45);
    }
    this.view.render();
    if (this.opts.perf) this.hud.perf(this.view);
  }
}
const r2 = v => Math.round(v * 100) / 100;
