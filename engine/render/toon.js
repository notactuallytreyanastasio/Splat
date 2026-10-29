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
  float lum = dot(outgoingLight, vec3(0.299, 0.587, 0.114));
  outgoingLight = mix(outgoingLight, vec3(lum) * vec3(0.92, 0.9, 0.95), uDesat);
  outgoingLight = mix(outgoingLight, uTint.rgb * (0.35 + lum * 0.8), uTint.a);
  #include <opaque_fragment>`;

// Every toon material carries its own uDesat (0 colorful, 1 grey) and uTint (rgb, amount)
// so one dead bug can drain to grey, or one live bug turn into a red silhouette, without
// touching every bug that shares its colors.
function addRim(mat) {
  mat.userData.desat = { value: 0 };
  mat.userData.tint = { value: new THREE.Vector4(1, 0, 0, 0) };
  mat.onBeforeCompile = shader => {
    shader.uniforms.uDesat = mat.userData.desat;
    shader.uniforms.uTint = mat.userData.tint;
    shader.fragmentShader = 'uniform float uDesat;\nuniform vec4 uTint;\n' + shader.fragmentShader.replace('#include <opaque_fragment>', RIM);
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
    outlineCache.get(key).userData.shared = true;
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
const shared = g => { g.userData.shared = true; return g; };
export const geo = {
  sphere: () => (G.sphere ??= shared(new THREE.SphereGeometry(0.5, 11, 8))),
  lowSphere: () => (G.lowSphere ??= shared(new THREE.IcosahedronGeometry(0.5, 1))),
  capsule: () => (G.capsule ??= shared(new THREE.CapsuleGeometry(0.5, 1, 4, 10))),
  cylinder: () => (G.cylinder ??= shared(new THREE.CylinderGeometry(0.5, 0.5, 1, 12))),
  cone: () => (G.cone ??= shared(new THREE.ConeGeometry(0.5, 1, 12))),
  box: () => (G.box ??= shared(new RoundedBoxGeometry(1, 1, 1, 2, 0.12))),
  sharpBox: () => (G.sharpBox ??= shared(new THREE.BoxGeometry(1, 1, 1))),
  torus: () => (G.torus ??= shared(new THREE.TorusGeometry(0.5, 0.18, 8, 16))),
  heart: () => (G.heart ??= shared(heartGeometry())),
  star: () => (G.star ??= shared(starGeometry())),
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

const _tint = new THREE.Color();
// A ToonKit owns the materials of one model so the model can flash on hit without
// flashing every other model that shares its colors.
export class ToonKit {
  constructor() { this.mats = new Map(); this.list = []; }
  mat(color, opts) {
    const key = color + (opts ? JSON.stringify(opts) : '');
    if (!this.mats.has(key)) {
      const m = toonMaterial(color, opts);
      if (this.shared) m.userData.shared = true;
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
    // Tiny parts (eyes, sprinkles, spots) cost a draw call each for ink and shadow that
    // nobody can see at this camera distance.
    const size = Math.max(mesh.scale.x, mesh.scale.y, mesh.scale.z);
    mesh.castShadow = o.shadow !== false && size > 0.16;
    if (o.outline !== false && size > 0.07) withOutline(mesh, o.outline ?? 0.035);
    if (o.name) mesh.name = o.name;
    if (o.parent) o.parent.add(mesh);
    return mesh;
  }
  tint(amount, color = 0xff0000) {
    const c = _tint.set(color);
    for (const m of this.list) m.userData.tint?.value.set(c.r, c.g, c.b, amount);
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
  const coarse = matchMedia('(pointer: coarse)').matches;
  sun.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
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
