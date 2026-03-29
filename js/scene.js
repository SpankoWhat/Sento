import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';
import { cfg, MAX_SPHERES } from './config.js';

// ─── Scene ──────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, cfg.fogDensity);

export const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
camera.position.set(cfg.camRadius, cfg.camHeight, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

// ─── Instanced spheres for performance ──────────────────────────────────────
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });

export const instancedMesh = new THREE.InstancedMesh(sphereGeo, sphereMat, MAX_SPHERES);
instancedMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
scene.add(instancedMesh);

// Per-instance color
export const instanceColors = new Float32Array(MAX_SPHERES * 3);
instancedMesh.instanceColor = new THREE.InstancedBufferAttribute(instanceColors, 3);

// ─── Trail line connecting all points ───────────────────────────────────────
export const trailLineGeo = new THREE.BufferGeometry();
export const trailLinePositions = new Float32Array(MAX_SPHERES * 3);
trailLineGeo.setAttribute('position', new THREE.BufferAttribute(trailLinePositions, 3));

export const trailLineMat = new THREE.LineBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: cfg.lineOpacity,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const trailLine = new THREE.Line(trailLineGeo, trailLineMat);
scene.add(trailLine);

// ─── Resize handler ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Re-export THREE for use in other modules
export { THREE };
