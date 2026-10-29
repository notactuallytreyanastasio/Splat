// Bake many small static meshes into one mesh (plus one ink-outline mesh). A flower is
// nine primitives and eighteen draw calls; a hedge full of them baked is two. Colors
// move from materials into vertex colors so one toon material can draw them all.
import * as THREE from 'three';
import { toonMaterial, outlineMaterial } from './toon.js';

const _c = new THREE.Color();

export function bakeStatic(roots, { outline = 0.03, shadow = true } = {}) {
  const pos = [], nor = [], col = [], opos = [], onor = [];
  for (const root of roots) {
    root.updateWorldMatrix(true, true);
    root.traverse(o => {
      if (!o.isMesh || o.name === 'outline' || o.isInstancedMesh) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      _c.copy(o.material.color ?? _c.set(0xffffff));
      for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(_c.r, _c.g, _c.b); }
      if (o.children.some(c => c.name === 'outline')) for (let i = 0; i < p.length; i++) { opos.push(p[i]); onor.push(n[i]); }
      g.dispose();
    });
  }
  const group = new THREE.Group();
  if (!pos.length) return group;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(geo, bakedMaterial());
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  group.add(mesh);
  if (opos.length && outline) {
    const og = new THREE.BufferGeometry();
    og.setAttribute('position', new THREE.Float32BufferAttribute(opos, 3));
    og.setAttribute('normal', new THREE.Float32BufferAttribute(onor, 3));
    const om = new THREE.Mesh(og, outlineMaterial(outline));
    om.name = 'outline';
    group.add(om);
  }
  return group;
}

let baked;
function bakedMaterial() { return (baked ??= toonMaterial(0xffffff, { vertexColors: true })); }
