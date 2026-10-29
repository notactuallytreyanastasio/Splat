// Character grid. Tile (tx, tz) covers world [tx, tx+1) x [tz, tz+1). Which characters are
// solid is the game's business; dynamic blockers (closed doors) layer on top.
export class TileMap {
// Water is neither floor nor wall: walkers treat it as a wall, but a body knocked or thrown
// across it flies over it (and sinks if it stops there), and sight and shots cross it.
  constructor(rows, { solid = '#', void: voidChars = ' ', water = '' } = {}) {
    this.h = rows.length;
    this.w = Math.max(...rows.map(r => r.length));
    this.rows = rows.map(r => r.padEnd(this.w, ' '));
    this.solidChars = new Set(solid + voidChars);
    this.blocked = new Uint8Array(this.w * this.h);
    this.waterChars = new Set(water);
    this.hasWater = this.rows.some(r => [...r].some(c => this.waterChars.has(c)));
  }
  isWater(tx, tz) { return this.inside(tx, tz) && this.waterChars.has(this.rows[tz][tx]); }
  waterAt(x, z) { return this.isWater(Math.floor(x), Math.floor(z)); }
  // Can something on foot stand here?
  walkable(tx, tz) { return !this.isSolid(tx, tz) && !this.isWater(tx, tz); }
  // A walker's line: water blocks it too.
  walkLos(x0, z0, x1, z1, step = 0.25) {
    if (!this.hasWater) return this.los(x0, z0, x1, z1, step);
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / step);
    for (let i = 1; i < n; i++) { const x = x0 + (dx * i) / n, z = z0 + (dz * i) / n; if (this.solidAt(x, z) || this.waterAt(x, z)) return false; }
    return true;
  }
  inside(tx, tz) { return tx >= 0 && tz >= 0 && tx < this.w && tz < this.h; }
  at(tx, tz) { return this.inside(tx, tz) ? this.rows[tz][tx] : ' '; }
  set(tx, tz, ch) { const r = this.rows[tz]; this.rows[tz] = r.slice(0, tx) + ch + r.slice(tx + 1); }
  isSolid(tx, tz) {
    if (!this.inside(tx, tz)) return true;
    return this.solidChars.has(this.rows[tz][tx]) || this.blocked[tz * this.w + tx] === 1;
  }
  solidAt(x, z) { return this.isSolid(Math.floor(x), Math.floor(z)); }
  setBlocked(tx, tz, on) { this.blocked[tz * this.w + tx] = on ? 1 : 0; }
  // Line of sight by sampling; cheap and plenty for room-sized distances.
  los(x0, z0, x1, z1, step = 0.25) {
    const dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.hypot(dx, dz) / step);
    for (let i = 1; i < n; i++) if (this.solidAt(x0 + (dx * i) / n, z0 + (dz * i) / n)) return false;
    return true;
  }
  // Connected regions of tiles where isFloor(ch) holds, stopping at tiles where isWall(ch).
  regions(isFloor) {
    const id = new Int32Array(this.w * this.h).fill(-1), out = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      if (id[z * this.w + x] !== -1 || !isFloor(this.rows[z][x])) continue;
      const tiles = [], stack = [[x, z]], rid = out.length;
      id[z * this.w + x] = rid;
      while (stack.length) {
        const [cx, cz] = stack.pop();
        tiles.push([cx, cz]);
        for (const [nx, nz] of [[cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]]) {
          if (!this.inside(nx, nz) || id[nz * this.w + nx] !== -1 || !isFloor(this.rows[nz][nx])) continue;
          id[nz * this.w + nx] = rid;
          stack.push([nx, nz]);
        }
      }
      out.push({ id: rid, tiles });
    }
    return { regions: out, regionAt: (tx, tz) => (this.inside(tx, tz) ? id[tz * this.w + tx] : -1) };
  }
}
