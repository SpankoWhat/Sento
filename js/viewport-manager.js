// ─── Viewport Manager ───────────────────────────────────────────────────────
// Manages a multi-viewport layout with independent cameras.
// Each viewport owns a camera, a normalized screen rect, and a mode that
// controls how the camera moves (orbiting, fixed-angle, or custom).

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js';
import { cfg } from './config.js';

// ─── Viewport class ─────────────────────────────────────────────────────────

class Viewport {
  /**
   * @param {object} opts
   * @param {string}  opts.id          Unique name ('main', 'top', 'front', 'side')
   * @param {object}  opts.rect        Normalised rect {x, y, w, h} (0-1, bottom-left origin)
   * @param {string}  opts.mode        'orbiting' | 'fixed-angle' | 'custom'
   * @param {object} [opts.cameraConfig] Spherical params for fixed-angle: {theta, phi, radius, heightOffset}
   * @param {boolean}[opts.enabled]    Whether this viewport is rendered (default true)
   * @param {string} [opts.label]      Optional HUD label
   */
  constructor(opts) {
    this.id      = opts.id;
    this.rect    = { x: 0, y: 0, w: 1, h: 1, ...opts.rect };
    this.mode    = opts.mode ?? 'custom';
    this.cameraConfig = opts.cameraConfig ?? { theta: 0, phi: 0.4, radius: null, heightOffset: 0 };
    this.enabled = opts.enabled ?? true;
    this.label   = opts.label ?? null;

    this.camera  = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  }
}

// ─── Gap between viewports (normalised) ─────────────────────────────────────
const GAP = 0.005;

// ─── Pre-configured viewports ───────────────────────────────────────────────
// Layout (normalised coords, origin bottom-left):
//
//  +-----------------------------+-----------+
//  |                             |  Top-down |  y: 0.67 – 1.0
//  |        Main (orbiting)      +-----------+
//  |                             |   Front   |  y: 0.335 – 0.665
//  |                             +-----------+
//  |                             |    Side   |  y: 0.0 – 0.33
//  +-----------------------------+-----------+
//  x: 0.0 – 0.695                x: 0.7 – 1.0

export const viewports = [
  // ── Main (orbiting) ──────────────────────────────────────────────────────
  new Viewport({
    id:   'main',
    rect: { x: 0.0, y: 0.0, w: 0.695, h: 1.0 },
    mode: 'orbiting',
    label: 'Main',
  }),

  // ── Top-down (fixed, looking straight down -Y) ───────────────────────────
  new Viewport({
    id:   'top',
    rect: { x: 0.7, y: 0.67 + GAP, w: 0.3, h: 0.33 - GAP },
    mode: 'fixed-angle',
    cameraConfig: { theta: 0, phi: Math.PI / 2, radius: null, heightOffset: 0 },
    label: 'Top',
  }),

  // ── Front view (fixed, looking along -Z) ─────────────────────────────────
  new Viewport({
    id:   'front',
    rect: { x: 0.7, y: 0.335 + GAP, w: 0.3, h: 0.33 - GAP * 2 },
    mode: 'fixed-angle',
    cameraConfig: { theta: 0, phi: 0.15, radius: null, heightOffset: 0 },
    label: 'Front',
  }),

  // ── Side view (fixed, looking along -X) ──────────────────────────────────
  new Viewport({
    id:   'side',
    rect: { x: 0.7, y: 0.0, w: 0.3, h: 0.33 - GAP },
    mode: 'fixed-angle',
    cameraConfig: { theta: Math.PI / 2, phi: 0.15, radius: null, heightOffset: 0 },
    label: 'Side',
  }),
];

// ─── Update camera positions ────────────────────────────────────────────────

/**
 * Converts spherical coordinates to a world-space camera position offset
 * from a given centre point.
 *
 * @param {number} theta  Azimuthal angle (around Y axis, 0 = +Z direction)
 * @param {number} phi    Polar angle from horizontal (0 = level, π/2 = straight above)
 * @param {number} radius Distance from centre
 * @param {THREE.Vector3} centre   World centre to orbit around
 * @param {number} heightOffset    Extra Y offset
 * @returns {THREE.Vector3}
 */
const _pos = new THREE.Vector3();

function sphericalToPosition(theta, phi, radius, centre, heightOffset) {
  const cosPhi = Math.cos(phi);
  _pos.set(
    centre.x + Math.sin(theta) * cosPhi * radius,
    centre.y + Math.sin(phi) * radius + heightOffset,
    centre.z + Math.cos(theta) * cosPhi * radius,
  );
  return _pos;
}

/**
 * Update every viewport's camera so it is correctly positioned for the
 * current frame.
 *
 * @param {THREE.Vector3} graphCenter  World-space centre of the data graph
 * @param {number}        time         Elapsed time in seconds (e.g. performance.now() * 0.001)
 */
export function updateViewportCameras(graphCenter, time) {
  // Scale camera radius to cover all bands.  With multiple bands spread
  // along X, the total width is roughly spaceScale*2 + bandSpacing*(bandCount-1).
  // FOV 50° → tan(25°) ≈ 0.466 → half-width at d = 0.466d.
  const totalWidth = cfg.spaceScale * 2 + cfg.bandSpacing * Math.max(0, (cfg.bandCount ?? 3) - 1);
  const minRadius = (totalWidth / 0.466) * 0.55;
  const radius = Math.max(cfg.camRadius, minRadius);

  for (const vp of viewports) {
    if (!vp.enabled) continue;

    if (vp.mode === 'orbiting') {
      // User-controlled rotation via slider (cfg.camTheta)
      const theta = cfg.camTheta;
      const phi = 0.35;
      sphericalToPosition(theta, phi, radius, graphCenter, cfg.camHeight * (radius / cfg.camRadius));
      vp.camera.position.copy(_pos);
      vp.camera.lookAt(graphCenter);

    } else if (vp.mode === 'fixed-angle') {
      const cc = vp.cameraConfig;
      const r  = cc.radius ?? radius;

      // When phi approaches ±π/2 the camera looks straight down (or up) and
      // the default up vector (0,1,0) is parallel to the view direction.
      // This makes lookAt() produce a degenerate (NaN) view matrix because
      // cross(up, forward) is the zero vector.  Fix: use (0,0,-1) as up
      // for near-vertical views so the cross product is always valid.
      if (Math.abs(cc.phi) > Math.PI / 4) {
        vp.camera.up.set(0, 0, -1);
      } else {
        vp.camera.up.set(0, 1, 0);
      }

      sphericalToPosition(cc.theta, cc.phi, r, graphCenter, cc.heightOffset);
      vp.camera.position.copy(_pos);
      vp.camera.lookAt(graphCenter);
    }
    // 'custom' mode: the caller is responsible for positioning the camera.
  }
}

// ─── Render all viewports ───────────────────────────────────────────────────

/**
 * Render every enabled viewport into the given renderer.
 * Sets viewport/scissor for each, corrects camera aspect, then restores state.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}         scene
 */
export function renderAllViewports(renderer, scene) {
  const width  = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;

  renderer.autoClear = false;

  // Clear the full framebuffer before drawing sub-viewports
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, width, height);
  renderer.clear();
  renderer.setScissorTest(true);

  for (const vp of viewports) {
    if (!vp.enabled) continue;

    // Convert normalised rect → pixel rect
    const px = Math.round(vp.rect.x * width);
    const py = Math.round(vp.rect.y * height);
    const pw = Math.round(vp.rect.w * width);
    const ph = Math.round(vp.rect.h * height);

    // Skip degenerate (zero-size) viewports — prevents Infinity aspect ratio
    if (pw < 1 || ph < 1) continue;

    // Correct aspect ratio for this sub-region
    vp.camera.aspect = pw / ph;
    vp.camera.updateProjectionMatrix();

    renderer.setViewport(px, py, pw, ph);
    renderer.setScissor(px, py, pw, ph);
    renderer.render(scene, vp.camera);
  }

  renderer.setScissorTest(false);
}

// ─── Hit-testing ────────────────────────────────────────────────────────────

/**
 * Given a pixel coordinate (origin top-left, as from pointer events),
 * return the viewport that contains that point, or null.
 *
 * @param {number} px  Pixel X (left = 0)
 * @param {number} py  Pixel Y (top  = 0)
 * @returns {Viewport|null}
 */
export function getViewportAtPixel(px, py) {
  // The canvas might not fill the whole window if CSS differs, so use
  // the renderer element dimensions directly.
  const canvas = document.querySelector('canvas');
  if (!canvas) return null;

  const width  = canvas.clientWidth;
  const height = canvas.clientHeight;

  // Normalise — note that our rects use bottom-left origin, so flip Y.
  const nx = px / width;
  const ny = 1 - (py / height);

  for (const vp of viewports) {
    if (!vp.enabled) continue;
    const r = vp.rect;
    if (nx >= r.x && nx <= r.x + r.w && ny >= r.y && ny <= r.y + r.h) {
      return vp;
    }
  }
  return null;
}

// ─── Runtime extensibility ──────────────────────────────────────────────────

/**
 * Add a new viewport at runtime.
 *
 * @param {object} config  Same shape as the Viewport constructor options
 * @returns {Viewport}     The newly created viewport
 */
export function addViewport(config) {
  const vp = new Viewport(config);
  viewports.push(vp);
  return vp;
}

// ─── Resize handler ─────────────────────────────────────────────────────────
// On window resize we recompute every camera's aspect ratio so the next
// renderAllViewports() call produces correct projections.

function onResize() {
  const canvas = document.querySelector('canvas');
  if (!canvas) return;

  const width  = canvas.clientWidth;
  const height = canvas.clientHeight;

  for (const vp of viewports) {
    const pw = vp.rect.w * width;
    const ph = vp.rect.h * height;
    if (ph > 0) {
      vp.camera.aspect = pw / ph;
      vp.camera.updateProjectionMatrix();
    }
  }
}

window.addEventListener('resize', onResize);
