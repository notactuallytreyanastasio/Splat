// Three-quarter "isometric" camera: fixed yaw, steep pitch, narrow FOV so it reads as iso
// while keeping real perspective depth. Owns screen shake and screen<->ground mapping.
import * as THREE from 'three';

export class IsoView {
  constructor(container, { fov = 30, distance = 23, pitch = 54, yaw = 45, background = 0xffe9f6 } = {}) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    // Phones and tablets have tiny pixels and small GPUs: cap the work.
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(background);
    this.camera = new THREE.PerspectiveCamera(fov, 1, 0.5, 200);
    this.distance = distance;
    this.setAngles(pitch, yaw);
    this.focus = new THREE.Vector3();
    this.trauma = 0;
    this.zoomKick = 0;
    this.time = 0;
    this.raycaster = new THREE.Raycaster();
    this.ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.resize();
    addEventListener('resize', () => this.resize());
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
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h);
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
  shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }
  kick(amount) { this.zoomKick = Math.min(0.12, this.zoomKick + amount); }
  update(dt) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.6);
    this.zoomKick *= Math.exp(-dt * 8);
    const s = this.trauma * this.trauma * 0.6, t = this.time * 40;
    const sx = s * (Math.sin(t * 1.3) + Math.sin(t * 2.7) * 0.5);
    const sy = s * (Math.sin(t * 1.7 + 1) + Math.sin(t * 3.1) * 0.5);
    const off = this.offset.clone().multiplyScalar((this.fit ?? 1) * (1 - this.zoomKick));
    this.camera.position.copy(this.focus).add(off).addScaledVector(this.right, sx);
    this.camera.position.y += sy;
    this.camera.lookAt(this.focus.x + this.right.x * sx, sy * 0.5, this.focus.z + this.right.z * sx);
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
  render() { this.renderer.render(this.scene, this.camera); }
}
