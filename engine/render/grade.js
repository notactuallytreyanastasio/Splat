// Full-screen color grade. Two knobs: saturation (the world losing its color) and noir
// (high-contrast black and white with grain and vignette). Strong reds survive both, so
// blood stays red when everything else has gone grey. When both knobs are neutral the
// pass is skipped entirely and the scene renders straight to the screen.
import * as THREE from 'three';

const frag = `
  uniform sampler2D tDiffuse;
  uniform float uSat, uNoir, uTime;
  varying vec2 vUv;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec3 c = texture2D(tDiffuse, vUv).rgb;
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // "Red" means red with almost no green or blue: blood passes, pastel pink does not.
    float red = smoothstep(0.25, 0.55, c.r - max(c.g, c.b) * 3.0);
    vec3 col = mix(vec3(l), c, uSat);
    col = mix(col, c, red);
    float nl = smoothstep(0.04, 0.8, l);
    vec3 noir = vec3(nl) * vec3(1.0, 0.985, 0.96);
    noir = mix(noir, c * vec3(1.35, 0.5, 0.55), red);
    col = mix(col, noir, uNoir);
    float v = smoothstep(0.35, 0.95, length(vUv - 0.5) * 1.35);
    col *= 1.0 - uNoir * 0.55 * v;
    col += uNoir * (hash(vUv * 731.0 + uTime) - 0.5) * 0.05;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

export class Grade {
  constructor(renderer, { samples = 0 } = {}) {
    this.renderer = renderer;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, uSat: { value: 1 }, uNoir: { value: 0 }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: frag,
      depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.sat = 1; this.noir = 0;
  }
  setSize() {
    const v = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.target.setSize(v.x, v.y);
  }
  get active() { return this.sat < 0.995 || this.noir > 0.005; }
  render(scene, camera) {
    const r = this.renderer;
    if (!this.active) { r.render(scene, camera); return; }
    const u = this.material.uniforms;
    u.uSat.value = this.sat; u.uNoir.value = this.noir; u.uTime.value = (u.uTime.value + 0.017) % 100;
    r.setRenderTarget(this.target);
    r.render(scene, camera);
    r.setRenderTarget(null);
    r.render(this.scene, this.camera);
  }
}
