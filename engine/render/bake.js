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
      const p = g.attributes.position.array, n = g.attributes.normal.array, vc = g.attributes.color?.array;
      // Rig-baked meshes keep their colors per vertex; material.color only tints. A
      // greyed (dead) material bakes grey.
      _c.copy(o.material.color ?? _c.set(0xffffff));
      const desat = o.material.userData?.desat?.value ?? 0;
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]);
        let r = _c.r * (vc ? vc[i] : 1), gg = _c.g * (vc ? vc[i + 1] : 1), b = _c.b * (vc ? vc[i + 2] : 1);
        if (desat) { const l = r * 0.299 + gg * 0.587 + b * 0.114; r += (l * 0.92 - r) * desat; gg += (l * 0.9 - gg) * desat; b += (l * 0.95 - b) * desat; }
        col.push(r, gg, b);
      }
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

// Bake a rig per joint: every mesh that moves rigidly with a joint (its mesh children,
// and their mesh children) becomes one mesh plus one outline under that joint. Joints
// stay, so poses and dismemberment work as before; a 30-part bug drops from ~60 draw
// calls to ~2 per joint. Transparent and glowing parts are left alone.
export function bakeRig(root, kit) {
  const mat = toonMaterial(0xffffff, { vertexColors: true });
  kit.list.push(mat);
  const bakeable = m => m.isMesh && m.name !== 'outline' && !m.material.transparent && !(m.material.emissiveIntensity > 0 && m.material.emissive?.getHex());
  const visit = node => {
    const meshes = [];
    const collect = (o, matrix) => {
      for (const c of o.children) {
        if (!c.isMesh || c.name === 'outline') continue;
        c.updateMatrix(); // grandchildren (pupils in eyes) have never been rendered yet
        const m = new THREE.Matrix4().multiplyMatrices(matrix, c.matrix);
        if (bakeable(c) && !c.children.some(k => !k.isMesh)) { meshes.push({ c, m }); collect(c, m); }
      }
    };
    node.updateMatrix();
    for (const c of node.children) c.updateMatrix();
    collect(node, new THREE.Matrix4());
    if (meshes.length > 1) {
      const pos = [], nor = [], col = [], opos = [], onor = [];
      let thick = 0.035;
      for (const { c, m } of meshes) {
        const g = c.geometry.index ? c.geometry.toNonIndexed() : c.geometry.clone();
        g.applyMatrix4(m);
        const p = g.attributes.position.array, n = g.attributes.normal.array;
        _c.copy(c.material.color);
        for (let i = 0; i < p.length; i += 3) { pos.push(p[i], p[i + 1], p[i + 2]); nor.push(n[i], n[i + 1], n[i + 2]); col.push(_c.r, _c.g, _c.b); }
        const ol = c.children.find(k => k.name === 'outline');
        if (ol) { thick = ol.material.uniforms.uThick.value; for (let i = 0; i < p.length; i++) { opos.push(p[i]); onor.push(n[i]); } }
        g.dispose();
      }
      for (const { c } of meshes) c.parent?.remove(c);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeBoundingSphere();
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.name = 'baked';
      node.add(mesh);
      if (opos.length) {
        const og = new THREE.BufferGeometry();
        og.setAttribute('position', new THREE.Float32BufferAttribute(opos, 3));
        og.setAttribute('normal', new THREE.Float32BufferAttribute(onor, 3));
        const om = new THREE.Mesh(og, outlineMaterial(thick));
        om.name = 'outline';
        mesh.add(om);
      }
    }
    for (const c of node.children) if (!c.isMesh) visit(c);
  };
  visit(root);
}
