// Three-quarter "isometric" camera: fixed yaw, steep pitch, narrow FOV so it reads as iso
// while keeping real perspective depth. Owns screen shake and screen<->ground mapping.
import * as THREE from 'three';
import { Grade } from './grade.js';

export class IsoView {
  constructor(container, { fov = 30, distance = 23, pitch = 54, yaw = 45, background = 0xffe9f6 } = {}) {
    this.coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ antialias: !this.coarse, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    // Phones and tablets have tiny pixels and small GPUs: cap the work, then adapt.
    this.maxRatio = Math.min(devicePixelRatio, this.coarse ? 1.5 : 2);
    this.ratio = this.maxRatio;
    this.renderer.setPixelRatio(this.ratio);
    this.container = container;
    this.frameMs = 16; this.slowT = 0; this.fastT = 0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    Object.assign(this.renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
    this.grade = new Grade(this.renderer, { samples: this.coarse ? 0 : 4 });
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 200);
    this.distance = distance;
    this.setAngles(pitch, yaw);
    this.focus = new THREE.Vector3();
    // Where the camera actually looks: focus, unless a temporary override is pulling it away.
    this.center = new THREE.Vector3();
    this.override = null;
    this.trauma = 0;
    this.zoomKick = 0;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
    // Size from the element, not window events: mobile Safari changes the viewport
    // (zoom, toolbars, rotation) without a resize the canvas can trust.
    new ResizeObserver(() => this.resize()).observe(container);
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 200));
  }
  setAngles(pitchDeg, yawDeg) {
    const p = THREE.MathUtils.degToRad(pitchDeg), y = THREE.MathUtils.degToRad(yawDeg);
    this.yaw = y;
    const h = Math.cos(p) * this.distance;
    this.offset = new THREE.Vector3(Math.sin(y) * h, Math.sin(p) * this.distance, Math.cos(y) * h);
    // Ground-plane directions of the screen axes, for camera-relative movement.
    this.right = new THREE.Vector3(Math.cos(y), 0, -Math.sin(y));
    this.up = new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y));
  }
  resize() {
    const w = this.container?.clientWidth || innerWidth, h = this.container?.clientHeight || innerHeight;
    this.renderer.setSize(w, h, false);
    this.grade?.setSize();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    // A fixed vertical FOV leaves a portrait screen seeing a sliver; pull back to keep the sides.
    this.fit = w / h < 1.3 ? Math.pow(1.3 / (w / h), 0.75) : 1;
  }
  snap(x, z) { this.focus.set(x, 0, z); }
  follow(x, z, dt, rate = 6) {
    const k = 1 - Math.exp(-rate * dt);
    this.focus.x += (x - this.focus.x) * k;
    this.focus.z += (z - this.focus.z) * k;
  }
  // Temporarily look somewhere else (a boss reveal, a death) and come back on its own.
  // target is {x, z} and is read every frame, so a moving entity can be passed. Times are
  // seconds of render time: ease in, hold, ease out. zoom pulls the camera in by that
  // fraction; lift frames a tall subject by looking that far up-screen of its feet.
  // Following continues underneath, so the return lands on the live focus. Calling it
  // again mid-shot glides from wherever the camera is to the new target.
  focusOn(target, { ease = 0.45, hold = 1, out = 0.5, zoom = 0, lift = 0 } = {}) {
    const prev = this.override;
    this.override = { target, x: target.x, z: target.z, ease: Math.max(0.01, ease), hold, out: Math.max(0.01, out), zoom, lift, t: 0,
      w0: prev?.w ?? 0, z0: prev?.zoomNow ?? 0, fx: prev?.px ?? 0, fz: prev?.pz ?? 0, w: 0, px: 0, pz: 0, zoomNow: 0 };
    return this.override;
  }
  releaseFocus() { const o = this.override; if (o && o.t < o.ease + o.hold) o.t = o.ease + o.hold; }
  get overriding() { return !!this.override; }
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(amount) { this.zoomKick = Math.min(0.12, this.zoomKick + amount); }
  update(dt) {
    this.time += dt;
    let w = 0, zoom = 0;
    const o = this.override, ss = k => k * k * (3 - 2 * k);
    if (o) {
      o.t += dt;
      if (o.target && !o.target.dead) { o.x = o.target.x; o.z = o.target.z; }
      let px = o.x + this.up.x * o.lift, pz = o.z + this.up.z * o.lift;
      if (o.t < o.ease) {
        const s = ss(o.t / o.ease);
        w = o.w0 + (1 - o.w0) * s;
        zoom = o.z0 + (o.zoom - o.z0) * s;
        if (o.w0 > 0) { px = o.fx + (px - o.fx) * s; pz = o.fz + (pz - o.fz) * s; }
      } else {
        w = o.t < o.ease + o.hold ? 1 : ss(Math.max(0, 1 - (o.t - o.ease - o.hold) / o.out));
        zoom = o.zoom * w;
      }
      Object.assign(o, { w, px, pz, zoomNow: zoom });
      if (o.t >= o.ease + o.hold + o.out) this.override = null;
    }
    this.center.set(this.focus.x + ((o?.px ?? 0) - this.focus.x) * w, 0, this.focus.z + ((o?.pz ?? 0) - this.focus.z) * w);
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.zoomKick *= Math.exp(-dt * 8);
    const s = this.trauma * this.trauma * 0.6, t = this.time * 40;
    const sx = s * (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5);
    const sy = s * (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5);
    const off = this.offset.clone().multiplyScalar((this.fit ?? 1) * (1 - this.zoomKick) * (1 - zoom));
    this.camera.position.copy(this.center).add(off).addScaledVector(this.right, sx);
    this.camera.position.y += sy;
    this.camera.lookAt(this.center.x + this.right.x * sx, sy * 0.5, this.center.z + this.right.z * sx);
  }
  screenToGround(clientX, clientY, y = 0) {
    const ndc = new THREE.Vector2((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.ground.constant = -y;
    const hit = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.ground, hit) ? hit : null;
  }
  worldToScreen(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight, visible: v.z < 1 };
  }
  // Turn a screen-space stick (x right, y up) into a ground direction.
  screenToWorldDir(sx, sy) {
    return { x: this.right.x * sx + this.up.x * sy, z: this.right.z * sx + this.up.z * sy };
  }
  // Adaptive resolution: drop render scale when frames run long, creep back when there
  // is headroom. Fill rate is what a phone runs out of first.
  adapt(dtMs) {
    this.frameMs += (dtMs - this.frameMs) * 0.05;
    if (this.frameMs > 21) { this.slowT += dtMs; this.fastT = 0; } else if (this.frameMs < 15) { this.fastT += dtMs; this.slowT = 0; }
    if (this.slowT > 1500 && this.ratio > 0.6) { this.ratio = Math.max(0.6, this.ratio * 0.85); this.renderer.setPixelRatio(this.ratio); this.resize(); this.slowT = 0; }
    if (this.fastT > 6000 && this.ratio < this.maxRatio) { this.ratio = Math.min(this.maxRatio, this.ratio * 1.1); this.renderer.setPixelRatio(this.ratio); this.resize(); this.fastT = 0; }
  }
  render() { this.grade.render(this.scene, this.camera); }
}
