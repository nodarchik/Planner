// Shared scene objects and mutable app state. Every other module imports from here; nothing is an implicit global.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// r160 scenes lack the rotation fields the path tracer reads
if (!('backgroundRotation' in THREE.Scene.prototype)) { THREE.Scene.prototype.backgroundRotation = new THREE.Euler(); THREE.Scene.prototype.environmentRotation = new THREE.Euler(); }
export { H, CUT } from './plan/plan.js';
export const V2 = THREE.Vector2, V3 = THREE.Vector3;
export const statusEl = document.getElementById('status');
export const loader = document.getElementById('loader');
export const frame = () => new Promise(r => requestAnimationFrame(() => r()));

/* ================= renderer ================= */
export const stage = document.getElementById('stage');
export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
export const MOBILE = matchMedia('(max-width: 700px), (pointer: coarse)').matches;
export const DPR = Math.min(devicePixelRatio, MOBILE ? 1.3 : 1.75);
renderer.setPixelRatio(DPR);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.appendChild(renderer.domElement);

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 200);
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;

// root group for everything in the apartment; movables = named furniture groups (drag, resize, restyle)
export const world = new THREE.Group(); scene.add(world);
export const clampables = [];
 export const movables = [];

// mutable state shared between modules
export const state = {
  CUR: world,
  ceiling: null,
  night: false,
  cutOn: false,
  showRooms: true,
  showDims: false,
  showFurn: false,
  anim: null,
  pt: null,
  photo: false,
  ptDirty: false,
  lastCeil: null,
  moveMode: false,
  sel: null,
  selBox: null,
  swapMode: false,
};
