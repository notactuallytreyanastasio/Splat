// Cel-shading kit: a 3-band toon ramp, a hard rim-light band, and inverted-hull ink
// outlines. Everything in a scene is built from these so the look stays consistent.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

let ramp;
export function toonRamp() {
  if (ramp) return ramp;
  // Bright shadow bands keep pastels pastel; a dark ramp turns them muddy.
  const tones = new Uint8Array([150, 205, 255]);
  ramp = new THREE.DataTexture(tones, tones.length, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  return ramp;
}

const RIM = `
  float rimF = 1.0 - max(dot(normalize(vViewPosition), normal), 0.0);
  outgoingLight += vec3(1.0, 0.96, 1.0) * smoothstep(0.62, 0.68, rimF) * 0.28;
  #include <opaque_fragment>`;

function addRim(mat) {
  mat.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', RIM);
  };
  return mat;
}

export function toonMaterial(color, opts = {}) {
  return addRim(new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...opts }));
}

const outlineVert = `
  uniform float uThick;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 n = normalize(normalMatrix * normal);
    // Grow with distance so the line holds a steady screen width.
    mv.xyz += n * uThick * (-mv.z / 20.0);
    gl_Position = projectionMatrix * mv;
  }`;
const outlineFrag = `uniform vec3 uColor; uniform float uAlpha; void main() { gl_FragColor = vec4(uColor, uAlpha); }`;

export const INK = 0x3a2346;
const outlineCache = new Map();
export function outlineMaterial(thick = 0.035, color = INK) {
  const key = thick + ':' + color;
  if (!outlineCache.has(key)) {
    outlineCache.set(key, new THREE.ShaderMaterial({
      uniforms: { uThick: { value: thick }, uColor: { value: new THREE.Color(color) }, uAlpha: { value: 1 } },
      vertexShader: outlineVert, fragmentShader: outlineFrag, side: THREE.BackSide,
    }));
  }
  return outlineCache.get(key);
}

export function withOutline(mesh, thick = 0.035) {
  const o = new THREE.Mesh(mesh.geometry, outlineMaterial(thick));
  o.name = 'outline';
  o.raycast = () => {};
  mesh.add(o);
  return mesh;
}

// Shared unit geometries. Parts are scaled instances of these.
const G = {};
export const geo = {
  sphere: () => (G.sphere ??= new THREE.SphereGeometry(0.5, 20, 14)),
  lowSphere: () => (G.lowSphere ??= new THREE.IcosahedronGeometry(0.5, 1)),
  capsule: () => (G.capsule ??= new THREE.CapsuleGeometry(0.5, 1, 6, 14)),
  cylinder: () => (G.cylinder ??= new THREE.CylinderGeometry(0.5, 0.5, 1, 16)),
  cone: () => (G.cone ??= new THREE.ConeGeometry(0.5, 1, 16)),
  box: () => (G.box ??= new RoundedBoxGeometry(1, 1, 1, 3, 0.12)),
  sharpBox: () => (G.sharpBox ??= new THREE.BoxGeometry(1, 1, 1)),
  torus: () => (G.torus ??= new THREE.TorusGeometry(0.5, 0.18, 10, 24)),
  heart: () => (G.heart ??= heartGeometry()),
  star: () => (G.star ??= starGeometry()),
};

function heartGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(-0.6, 0, -0.55, 0.45, -0.25, 0.45);
  s.bezierCurveTo(-0.08, 0.45, 0, 0.3, 0, 0.22);
  s.bezierCurveTo(0, 0.3, 0.08, 0.45, 0.25, 0.45);
  s.bezierCurveTo(0.55, 0.45, 0.6, 0, 0, -0.5);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.25, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3, curveSegments: 10 });
  g.center();
  return g;
}
function starGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.22 : 0.5, a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    i ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.2, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 2 });
  g.center();
  return g;
}

// A ToonKit owns the materials of one model so the model can flash on hit without
// flashing every other model that shares its colors.
export class ToonKit {
  constructor() { this.mats = new Map(); this.list = []; }
  mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!this.mats.has(key)) {
      const m = toonMaterial(color, opts);
      this.mats.set(key, m);
      this.list.push(m);
    }
    return this.mats.get(key);
  }
  // part('sphere', 0xffaacc, { s:[x,y,z], p:[x,y,z], r:[x,y,z], parent, outline })
  part(kind, color, o = {}) {
    const mesh = new THREE.Mesh(geo[kind](), this.mat(color, o.mat));
    if (o.s) Array.isArray(o.s) ? mesh.scale.set(...o.s) : mesh.scale.setScalar(o.s);
    if (o.p) mesh.position.set(...o.p);
    if (o.r) mesh.rotation.set(...o.r);
    mesh.castShadow = o.shadow !== false;
    if (o.outline !== false) withOutline(mesh, o.outline ?? 0.035);
    if (o.name) mesh.name = o.name;
    if (o.parent) o.parent.add(mesh);
    return mesh;
  }
  flash(v, color = 0xffffff) {
    for (const m of this.list) { m.emissive.setHex(color); m.emissiveIntensity = v; }
  }
  dispose() { for (const m of this.list) m.dispose(); }
}

export function makeLights(scene, { sky = 0xfff4fb, ground = 0xd9c8ff } = {}) {
  scene.add(new THREE.HemisphereLight(sky, ground, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const c = sun.shadow.camera;
  c.left = c.bottom = -16; c.right = c.top = 16; c.near = 1; c.far = 80;
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  const dir = new THREE.Vector3(-0.45, 1, 0.25).normalize();
  return {
    sun,
    follow(x, z) {
      sun.target.position.set(x, 0, z);
      sun.position.set(x + dir.x * 40, dir.y * 40, z + dir.z * 40);
    },
  };
}
