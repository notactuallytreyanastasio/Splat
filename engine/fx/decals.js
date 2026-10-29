// A canvas stretched over the floor. Anything painted here stays for the whole run, so
// the dungeon keeps a record of every fight that happened in it.
import * as THREE from 'three';

export class DecalLayer {
  constructor(scene, w, h, { ppu = 24, y = 0.015 } = {}) {
    this.w = w; this.h = h; this.ppu = ppu;
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * ppu; this.canvas.height = h * ppu;
    this.ctx = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ map: this.tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(w / 2, y, h / 2);
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.dirty = false;
    this.throttle = 0;
  }
  // Paint with ctx in world units: (0,0) is world x=0,z=0.
  paint(fn) {
    const c = this.ctx;
    c.save();
    c.scale(this.ppu, this.ppu);
    fn(c);
    c.restore();
    this.dirty = true;
  }
  // skip(x, z): true where nothing may stain (water).
  splat(x, z, r, color = '#d1002c', { dx = 0, dz = 0, speed = 0, gloss = true } = {}) {
    if (this.skip?.(x, z)) return;
    this.paint(c => {
      c.fillStyle = color;
      const blobs = 3 + ((r * 20) | 0);
      for (let i = 0; i < blobs; i++) {
        const a = Math.random() * 6.28, d = Math.random() * r * 0.8;
        c.beginPath();
        c.arc(x + Math.cos(a) * d, z + Math.sin(a) * d, r * (0.35 + Math.random() * 0.5), 0, 6.28);
        c.fill();
      }
      // Fast drops smear into a tail along their direction of travel.
      if (speed > 3) {
        const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l, len = Math.min(1.6, speed * 0.06);
        for (let i = 0; i < 4; i++) {
          const t = (i + 1) / 4;
          c.beginPath();
          c.arc(x + ux * len * t, z + uz * len * t, r * 0.5 * (1 - t * 0.7), 0, 6.28);
          c.fill();
        }
      }
      if (gloss && r > 0.12) {
        c.fillStyle = 'rgba(255,190,210,0.45)';
        c.beginPath();
        c.ellipse(x - r * 0.25, z - r * 0.25, r * 0.25, r * 0.12, -0.6, 0, 6.28);
        c.fill();
      }
    });
  }
  update(dt) {
    this.throttle -= dt;
    if (this.dirty && this.throttle <= 0) {
      this.tex.needsUpdate = true;
      this.dirty = false;
      this.throttle = 1 / 20; // full-texture uploads are not free; 20Hz is invisible
    }
  }
}
