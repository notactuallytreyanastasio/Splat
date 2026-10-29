// Builds one merged, vertex-colored mesh for a whole tile grid. Each tile is a chunky
// beveled block; style(tx, tz) decides its height and colors. Merging keeps a big
// dungeon at a handful of draw calls.
import * as THREE from 'three';
import { toonMaterial } from './toon.js';

export function buildTileMesh(w, h, style) {
  const pos = [], nor = [], col = [], idx = [];
  const quad = (a, b, c, d, n, color) => {
    const i = pos.length / 3;
    for (const v of [a, b, c, d]) { pos.push(...v); nor.push(...n); col.push(...color); }
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
  };
  const heights = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) heights[z * w + x] = style(x, z)?.height ?? -Infinity;
  const hAt = (x, z) => (x < 0 || z < 0 || x >= w || z >= h ? -Infinity : heights[z * w + x]);

  for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
    const s = style(x, z);
    if (!s) continue;
    const i = s.inset ?? 0.03, y1 = s.height, y0 = s.base ?? -0.3;
    const x0 = x + i, x1 = x + 1 - i, z0 = z + i, z1 = z + 1 - i;
    quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0], s.top);
    const side = s.side ?? s.top.map(c => c * 0.8);
    // Only emit sides that can be seen over the neighbour.
    if (hAt(x + 1, z) < y1 || i > 0) quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0], side);
    if (hAt(x - 1, z) < y1 || i > 0) quad([x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0], side);
    if (hAt(x, z + 1) < y1 || i > 0) quad([x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1], [0, 0, 1], side);
    if (hAt(x, z - 1) < y1 || i > 0) quad([x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [0, 0, -1], side);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  const mesh = new THREE.Mesh(g, toonMaterial(0xffffff, { vertexColors: true }));
  mesh.receiveShadow = true;
  mesh.castShadow = true;
  return mesh;
}

// Linear-space color triple from a hex, for vertex colors (three expects linear there).
export function vcol(hex, mul = 1) {
  const c = new THREE.Color(hex);
  return [c.r * mul, c.g * mul, c.b * mul];
}
