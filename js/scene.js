import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';
import { cfg, MAX_POINTS } from './config.js';

// ─── Scene ──────────────────────────────────────────────────────────────────
export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050508);
scene.fog = new THREE.FogExp2(0x050508, cfg.fogDensity);

export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
document.getElementById('viewport-container').appendChild(renderer.domElement);

// ─── GPU Points (replaces instanced spheres + trail line) ───────────────────
// Each point is a single vertex drawn as a GL_POINT. The GPU sizes and colors
// them via custom shader attributes — no geometry duplication, no lines.

const positions = new Float32Array(MAX_POINTS * 3);
const colors = new Float32Array(MAX_POINTS * 3);  // RGB per point
const sizes = new Float32Array(MAX_POINTS);       // size per point
const alphas = new Float32Array(MAX_POINTS);       // alpha per point

const geometry = new THREE.BufferGeometry();
geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute('customColor', new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
geometry.setDrawRange(0, 0);

// ── Custom ShaderMaterial ───────────────────────────────────────────────────
// Vertex shader: reads per-point size attribute and passes color/alpha to frag.
// Fragment shader: draws a soft radial dot (circle with glow falloff).
const material = new THREE.ShaderMaterial({
    uniforms: {
        uPixelRatio: { value: Math.min(devicePixelRatio, 2) },
    },
    vertexShader: /* glsl */ `
    attribute float size;
    attribute float alpha;
    attribute vec3 customColor;

    varying vec3 vColor;
    varying float vAlpha;

    uniform float uPixelRatio;

    void main() {
      vColor = customColor;
      vAlpha = alpha;

      vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
      // Attenuate size by distance (perspective) so points feel spatial
      gl_PointSize = size * uPixelRatio * (300.0 / -mvPosition.z);
      gl_PointSize = clamp(gl_PointSize, 1.0, 128.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `,
    fragmentShader: /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;

    void main() {
      // Radial distance from centre of the point sprite
      float d = length(gl_PointCoord - vec2(0.5));
      if (d > 0.5) discard;

      // Soft glow: bright core, smooth falloff
      float intensity = 1.0 - smoothstep(0.0, 0.5, d);
      intensity = pow(intensity, 1.5);

      gl_FragColor = vec4(vColor * intensity, vAlpha * intensity);
    }
  `,
    transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const points = new THREE.Points(geometry, material);
scene.add(points);

// ─── Exports for the visualizer ─────────────────────────────────────────────
export { THREE, geometry, positions, colors, sizes, alphas };

// ─── Scene style helpers ────────────────────────────────────────────────────
export function applySceneStyles() {
    // Called after config changes that affect fog or material
    scene.fog.density = cfg.fogDensity;
    material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, 2);
}

applySceneStyles();

// ─── Resize handler ─────────────────────────────────────────────────────────
window.addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
    material.uniforms.uPixelRatio.value = Math.min(devicePixelRatio, 2);
});

