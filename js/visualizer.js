import { cfg } from './config.js';
import { history } from './audio.js';
import { 
  THREE, 
  scene, 
  renderer, 
  instancedMesh, 
  instanceColors, 
  trailLineMat,
  trailLineGeo, 
  trailLinePositions 
} from './scene.js';
import { updateViewportCameras, renderAllViewports } from './viewport-manager.js';

// ─── Coordinate HUD ─────────────────────────────────────────────────────────
// Shows the most recent N data-point coordinates as a trailing readout on the
// main viewport. Newest row is reddish, older rows fade to soft grey.
const HUD_ROWS = 64;
const hudEl = document.getElementById('coord-hud');
const hudRows = [];

function initHud() {
  if (!hudEl) return;
  for (let i = 0; i < HUD_ROWS; i++) {
    const span = document.createElement('span');
    span.className = 'coord-row';
    hudEl.appendChild(span);
    hudRows.push(span);
  }
}
initHud();

// Pre-compute row colours: index 0 = newest (reddish), last = faded grey
function hudRowColor(age) {
  // age: 0 = newest, 1 = oldest visible
  const r = Math.round(180 - age * 110);   // 180 → 70
  const g = Math.round(70 - age * 30);    // 70  → 40
  const b = Math.round(70 - age * 30);    // 70  → 40
  const a = (1 - age * 0.7).toFixed(2);    // 1.0 → 0.3
  return `rgba(${r},${g},${b},${a})`;
}

function updateHud() {
  if (!hudEl || history.length === 0) return;

  const n = Math.min(HUD_ROWS, history.length);
  for (let i = 0; i < HUD_ROWS; i++) {
    const row = hudRows[i];
    if (i >= n) {
      row.textContent = '';
      continue;
    }
    // Read from newest (end of history) backwards
    const p = history[history.length - 1 - i];
    const age = i / (HUD_ROWS - 1);
    row.style.color = hudRowColor(age);
    row.textContent = `${p.x.toFixed(2).padStart(7)}  ${p.y.toFixed(2).padStart(7)}  ${p.z.toFixed(2).padStart(7)}`;
  }
}

// ─── Update instanced mesh ──────────────────────────────────────────────────
const dummy = new THREE.Object3D();
const _col = new THREE.Color();
const _accent = new THREE.Color();
const _mix = new THREE.Color();
export const graphCenter = new THREE.Vector3(0, 0, 0);
const accentHsl = { h: 0, s: 0, l: 0 };

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function applyPointColor(point, age) {
  const litBase = clamp01((point.lightness ?? 0.3) * (0.35 + age * 0.65));
  const lit = clamp01(
    litBase +
    cfg.glowIntensity * 0.08 +
    cfg.pulseAmount * (point.transient ?? 0) * 0.06
  );
  const sat = clamp01((point.saturation ?? 0.75) * cfg.colorSaturation);

  if (cfg.colorMode === 'accent') {
    _col.setHSL(
      wrap01(accentHsl.h + cfg.colorHueShift),
      clamp01(accentHsl.s * (0.55 + cfg.colorSaturation * 0.45) + (point.transient ?? 0) * 0.08),
      clamp01(lit * 0.82 + accentHsl.l * 0.18)
    );
    return;
  }

  if (cfg.colorMode === 'hybrid') {
    _col.setHSL(wrap01((point.hue ?? 0) + cfg.colorHueShift), sat, lit);
    _mix.setHSL(
      wrap01(accentHsl.h + cfg.colorHueShift),
      clamp01(accentHsl.s * cfg.colorSaturation),
      clamp01(lit * 0.72 + accentHsl.l * 0.28)
    );
    _col.lerp(_mix, cfg.colorMix);
    return;
  }

  if (cfg.colorMode === 'stereo') {
    const stereoHue = wrap01(0.58 + (point.balance ?? 0) * 0.18 + (point.width ?? 0) * 0.12 + cfg.colorHueShift);
    _col.setHSL(stereoHue, clamp01(cfg.colorSaturation * (0.45 + (point.width ?? 0) * 0.5)), lit);
    return;
  }

  _col.setHSL(wrap01((point.hue ?? 0) + cfg.colorHueShift), sat, lit);
}

function updateMesh() {
  const n = history.length;
  instancedMesh.count = n;
  _accent.setRGB(cfg.accentColor[0], cfg.accentColor[1], cfg.accentColor[2]);
  _accent.getHSL(accentHsl);

  let cx = 0, cy = 0, cz = 0, totalWeight = 0;
  let lastR = 1, lastG = 1, lastB = 1;
  const time = performance.now() * 0.001;

  for (let i = 0; i < n; i++) {
    const p = history[i];
    const age = i / cfg.trailLength;
    const weight = 0.2 + age * 0.8;

    cx += p.x * weight;
    cy += p.y * weight;
    cz += p.z * weight;
    totalWeight += weight;

    const breath = 1 + cfg.breathingAmount * 0.18 * Math.sin(time * 1.35 + age * 6 + (p.hue ?? 0) * Math.PI * 2);
    const pulseWave = 0.5 + 0.5 * Math.sin(time * 10.5 + i * 0.35);
    const pulse = 1 + cfg.pulseAmount * pulseWave * ((p.transient ?? 0) * 0.9 + (p.energy ?? 0) * 0.12);
    const glowScale = 1 + cfg.glowIntensity * (0.1 + (p.energy ?? 0) * 0.16);

    dummy.position.set(p.x, p.y, p.z);
    const s = p.size * cfg.sphereSize * (0.3 + age * 0.7) * breath * pulse * glowScale;
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    applyPointColor(p, age);
    instanceColors[i * 3 + 0] = _col.r;
    instanceColors[i * 3 + 1] = _col.g;
    instanceColors[i * 3 + 2] = _col.b;
    lastR = _col.r;
    lastG = _col.g;
    lastB = _col.b;

    trailLinePositions[i * 3 + 0] = p.x;
    trailLinePositions[i * 3 + 1] = p.y;
    trailLinePositions[i * 3 + 2] = p.z;
  }

  if (totalWeight > 0) {
    const targetCx = cx / totalWeight;
    const targetCy = cy / totalWeight;
    const targetCz = cz / totalWeight;

    // Adaptive smoothing: track fast when graphCenter lags far behind the
    // data centroid (prevents frustum clipping after abrupt audio changes),
    // but stay smooth when close (avoids jitter during steady playback).
    const dx = targetCx - graphCenter.x;
    const dy = targetCy - graphCenter.y;
    const dz = targetCz - graphCenter.z;
    const lag = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const alpha = Math.min(0.25, 0.05 + lag * 0.015);

    graphCenter.x += dx * alpha;
    graphCenter.y += dy * alpha;
    graphCenter.z += dz * alpha;
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor.needsUpdate = true;
  trailLineGeo.attributes.position.needsUpdate = true;
  trailLineGeo.setDrawRange(0, n);

  trailLineMat.color.lerp(_mix.setRGB(lastR, lastG, lastB), n > 0 ? 0.18 : 0.06);
}

// ─── Render loop ────────────────────────────────────────────────────────────
// ─── Render loop ────────────────────────────────────────────────────────────
let hudTick = 0;

export function animate() {
  requestAnimationFrame(animate);
  const time = performance.now() * 0.001;
  updateMesh();
  updateViewportCameras(graphCenter, time);
  renderAllViewports(renderer, scene);

  // Update the coordinate HUD every 3 frames to avoid layout thrashing
  if (++hudTick % 3 === 0) updateHud();
}
