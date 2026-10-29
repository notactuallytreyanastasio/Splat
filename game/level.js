// ASCII level -> tilemap, rooms, meshes. The legend is the whole level format, so the
// editor and the game agree by construction.
import * as THREE from 'three';
import { TileMap } from '../engine/world/tilemap.js';
import { buildTileMesh, vcol } from '../engine/render/tilemesh.js';
import { ToonKit } from '../engine/render/toon.js';
import { bakeStatic } from '../engine/render/bake.js';
import { RAINBOW } from './models.js';

export const LEGEND = {
  '#': { name: 'hedge wall', color: '#8fd4a4' },
  '.': { name: 'floor', color: '#fff4f8' },
  ',': { name: 'petal floor', color: '#ffd6e8' },
  '+': { name: 'bramble gate', color: '#ff5fa2' },
  '@': { name: 'player start', color: '#3a2346', spawn: 'player' },
  'l': { name: 'ladybug', color: '#ff8fb8', spawn: 'ladybug' },
  'c': { name: 'caterpillar', color: '#9ff0d4', spawn: 'caterpillar' },
  'g': { name: 'grub', color: '#c7f7e4', spawn: 'grub' },
  'f': { name: 'butterfly', color: '#c8b2ff', spawn: 'butterfly' },
  'B': { name: 'rhino beetle', color: '#a9b8ff', spawn: 'beetle' },
  'M': { name: 'empress mantis', color: '#7fd6a0', spawn: 'mantis' },
  'j': { name: 'nectar jar', color: '#ffc94d', spawn: 'jar' },
  'o': { name: 'mushroom pillar', color: '#ff9ecb' },
  '*': { name: 'flower', color: '#fff1a1' },
  ' ': { name: 'void', color: '#3a2346' },
};
const SOLID = '#o';
const FLOOR_PALETTES = [
  [0xffe3ee, 0xfff6fa], [0xd9f7e8, 0xf0fff7], [0xe9e0ff, 0xf7f3ff], [0xffe6d2, 0xfff5ec], [0xdff0ff, 0xf3faff],
];

export function parseLevel(json) {
  const map = new TileMap(json.rows, { solid: SOLID, void: ' ' });
  const spawns = [];
  let start = null;
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const ch = map.at(x, z), L = LEGEND[ch];
    if (!L?.spawn) continue;
    if (L.spawn === 'player') start = { x: x + 0.5, z: z + 0.5 };
    else spawns.push({ type: L.spawn, x: x + 0.5, z: z + 0.5, tx: x, tz: z });
    map.set(x, z, '.');
  }
  const { regions, regionAt } = map.regions(ch => ch !== '#' && ch !== ' ' && ch !== '+');
  const rooms = regions.map(r => {
    let sx = 0, sz = 0, x0 = 1e9, z0 = 1e9, x1 = -1, z1 = -1;
    for (const [x, z] of r.tiles) { sx += x; sz += z; x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    return { id: r.id, tiles: r.tiles, center: { x: sx / r.tiles.length + 0.5, z: sz / r.tiles.length + 0.5 }, bounds: { x0, z0, x1, z1 }, spawns: [], doors: [], cleared: false, active: false };
  });
  for (const s of spawns) { s.room = regionAt(s.tx, s.tz); rooms[s.room]?.spawns.push(s); }
  const doors = [];
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    if (map.at(x, z) !== '+') continue;
    const adj = new Set([[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => regionAt(x + dx, z + dz)).filter(i => i >= 0));
    const alongX = map.at(x - 1, z) === '#' || map.at(x + 1, z) === '#';
    const d = { tx: x, tz: z, rooms: [...adj], alongX, open: true, h: 0 };
    doors.push(d);
    for (const r of adj) rooms[r].doors.push(d);
  }
  for (const r of rooms) {
    r.boss = r.spawns.some(s => s.type === 'mantis');
    r.combat = r.spawns.some(s => !['jar'].includes(s.type));
  }
  return { map, rooms, doors, start, regionAt, name: json.name ?? 'level' };
}

export function buildLevelMeshes(scene, L, rng) {
  const { map, regionAt } = L;
  const floorish = (x, z) => { const c = map.at(x, z); return c !== '#' && c !== ' '; };
  const style = (x, z) => {
    const ch = map.at(x, z);
    if (ch === ' ') return null;
    if (ch === '#') {
      const low = floorish(x, z - 1) || floorish(x - 1, z) || floorish(x - 1, z - 1);
      const stripe = (x + z) % 2 ? 0x95dcae : 0x86cf9f;
      return { height: low ? 0.55 : 1.9, top: vcol(0xc6f5d2), side: vcol(stripe), inset: 0 };
    }
    const rid = regionAt(x, z);
    let pal = FLOOR_PALETTES[(rid < 0 ? 0 : rid) % FLOOR_PALETTES.length];
    if (L.rooms[rid]?.boss) { const c = new THREE.Color(RAINBOW[((x + z) >> 1) % 6]).lerp(new THREE.Color(0xffffff), 0.55); return { height: 0, top: [c.r, c.g, c.b], inset: 0.035 }; }
    let col = pal[(x + z) % 2];
    if (ch === ',') col = 0xffd0e4;
    if (ch === '+') col = 0xf2d0ff;
    const jitter = 0.97 + ((x * 7 + z * 13) % 5) * 0.012;
    return { height: 0, top: vcol(col, jitter), inset: 0.035 };
  };
  const mesh = buildTileMesh(map.w, map.h, style);
  scene.add(mesh);

  const kit = new ToonKit();
  const props = new THREE.Group();
  const occluders = [];
  const bumpers = new Map(); // tz * w + tx -> mushroom group
  scene.add(props);
  for (let z = 0; z < map.h; z++) for (let x = 0; x < map.w; x++) {
    const ch = map.at(x, z);
    if (ch === 'o') { const m = mushroom(new ToonKit(), x + 0.5, z + 0.5, rng); props.add(m); occluders.push(m); bumpers.set(z * map.w + x, m); }
    else if (ch === '*') props.add(flower(kit, x + 0.5, z + 0.5, rng, 0.7 + rng.next() * 0.5));
    else if (ch === '#') {
      const s = style(x, z);
      // Flowers sprout from hedge tops.
      if (s.height > 1 && rng.chance(0.18)) { const f = flower(kit, x + 0.5, z + 0.5, rng, 0.45); f.position.y = s.height; props.add(f); }
    } else if (ch === '.' && rng.chance(0.025)) props.add(tuft(kit, x + rng.next(), z + rng.next(), rng));
  }
  // Flowers and tufts never move: bake them into two draw calls. Mushrooms stay
  // separate because they fade when they hide the player.
  const decor = props.children.filter(c => !occluders.includes(c));
  if (decor.length) { scene.add(bakeStatic(decor)); for (const c of decor) props.remove(c); }
  for (const d of L.doors) { d.mesh = gate(kit, d); d.mesh.position.y = -2; scene.add(d.mesh); }
  return { mesh, props, occluders, bumpers, w: map.w, wobbling: new Set() };
}

// Mushrooms are pinball bumpers. A hit squashes the cap and leans the whole stalk away
// from the blow; a stiff, underdamped spring brings it back with a few wobbles.
export function bumpMushroom(L, tx, tz, nx, nz, power) {
  const m = L.bumpers.get(tz * L.w + tx);
  if (!m) return;
  const u = m.userData;
  u.sqV = (u.sqV ?? 0) - 6 - power * 0.5;
  u.lvx = (u.lvx ?? 0) - nx * (2.5 + power * 0.15);
  u.lvz = (u.lvz ?? 0) - nz * (2.5 + power * 0.15);
  u.flash = 1;
  L.wobbling.add(m);
}
export function updateMushrooms(L, dt) {
  for (const m of L.wobbling) {
    const u = m.userData;
    u.sq ??= 1; u.lx ??= 0; u.lz ??= 0;
    u.sqV += (-(u.sq - 1) * 420 - u.sqV * 9) * dt; u.sq = Math.max(0.55, Math.min(1.45, u.sq + u.sqV * dt));
    u.lvx += (-u.lx * 260 - u.lvx * 8) * dt; u.lx += u.lvx * dt;
    u.lvz += (-u.lz * 260 - u.lvz * 8) * dt; u.lz += u.lvz * dt;
    u.flash = Math.max(0, u.flash - dt * 5);
    // The cap takes the squash; the stalk only gives a little.
    u.head.scale.set(1 / Math.sqrt(u.sq), u.sq, 1 / Math.sqrt(u.sq));
    m.scale.set(1, 0.85 + 0.15 * u.sq, 1);
    m.rotation.set(Math.max(-0.35, Math.min(0.35, u.lz)), 0, -Math.max(-0.35, Math.min(0.35, u.lx)));
    u.kit.flash(u.flash * 0.6, 0xffffff);
    if (Math.abs(u.sq - 1) + Math.abs(u.sqV) + Math.abs(u.lx) + Math.abs(u.lz) + Math.abs(u.lvx) + Math.abs(u.lvz) < 0.004 && u.flash <= 0) {
      u.sq = 1; u.sqV = u.lx = u.lz = u.lvx = u.lvz = 0;
      u.head.scale.set(1, 1, 1); m.scale.set(1, 1, 1); m.rotation.set(0, 0, 0);
      L.wobbling.delete(m);
    }
  }
}

function mushroom(kit, x, z, rng) {
  const g = new THREE.Group();
  const cap = RAINBOW[rng.int(0, 5)];
  kit.part('cylinder', 0xfff3e0, { s: [0.45, 1.6, 0.45], p: [0, 0.8, 0], parent: g });
  // Cap and spots hang off one head group so a bump can squash them together.
  const head = new THREE.Group();
  head.position.y = 1.6;
  g.add(head);
  kit.part('sphere', cap, { s: [1.3, 0.8, 1.3], p: [0, 0.15, 0], parent: head });
  for (let i = 0; i < 5; i++) {
    const a = i * 1.3 + rng.next();
    kit.part('sphere', 0xffffff, { s: [0.2, 0.08, 0.2], p: [Math.cos(a) * 0.4, 0.38 + (i % 2) * 0.05, Math.sin(a) * 0.4], r: [Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5], parent: head, outline: 0.01 });
  }
  g.position.set(x, 0, z);
  g.userData.head = head; g.userData.kit = kit;
  return g;
}
function flower(kit, x, z, rng, s = 1) {
  const g = new THREE.Group(), petal = RAINBOW[rng.int(0, 5)];
  kit.part('cylinder', 0x7bc47f, { s: [0.05, 0.8, 0.05], p: [0, 0.4, 0], parent: g, outline: 0.015 });
  kit.part('lowSphere', 0x7bc47f, { s: [0.25, 0.04, 0.12], p: [0.12, 0.3, 0], r: [0, 0, 0.4], parent: g, outline: false, shadow: false });
  // Low-poly, ink only on the small ones you see up close: there are a hundred of these.
  const ink = s >= 0.7 ? 0.012 : false;
  for (let i = 0; i < 6; i++) kit.part('lowSphere', petal, { s: [0.22, 0.06, 0.22], p: [Math.cos(i * 1.047) * 0.14, 0.82, Math.sin(i * 1.047) * 0.14], parent: g, outline: ink, shadow: false });
  kit.part('lowSphere', 0xffd66b, { s: 0.14, p: [0, 0.84, 0], parent: g, outline: ink, shadow: false });
  g.scale.setScalar(s);
  g.position.set(x, 0, z);
  g.rotation.y = rng.next() * 6;
  return g;
}
function tuft(kit, x, z, rng) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) kit.part('cone', 0xa8e6b8, { s: [0.06, 0.25, 0.06], p: [(i - 1) * 0.06, 0.1, 0], r: [0, 0, (i - 1) * 0.35], parent: g, outline: 0.01, shadow: false });
  g.position.set(x, 0, z);
  return g;
}
function gate(kit, d) {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 0.3;
    const bar = kit.part('cylinder', 0xff5fa2, { s: [0.13, 1.7, 0.13], p: [d.alongX ? off : 0, 0.85, d.alongX ? 0 : off], parent: g });
    for (let j = 0; j < 4; j++) kit.part('cone', 0xfff3e0, { s: [0.06, 0.14, 0.06], p: [0.07 * (j % 2 ? 1 : -1), -0.3 + j * 0.2, 0], r: [0, 0, (j % 2 ? -1 : 1) * 1.4], parent: bar, outline: 0.008 });
  }
  const rose = kit.part('sphere', 0xff2d6f, { s: 0.3, p: [0, 1.75, 0], parent: g });
  g.position.set(d.tx + 0.5, 0, d.tz + 0.5);
  return g;
}
