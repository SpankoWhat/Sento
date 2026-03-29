import { cfg } from './config.js';
import { bandHistories } from './audio.js';
import {
    THREE,
    scene,
    renderer,
    geometry,
    positions,
    colors,
    sizes,
    alphas,
} from './scene.js';
import { updateViewportCameras, renderAllViewports } from './viewport-manager.js';

// ─── Coordinate HUD ─────────────────────────────────────────────────────────
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

function hudRowColor(age) {
    const r = Math.round(180 - age * 110);
    const g = Math.round(70 - age * 30);
    const b = Math.round(70 - age * 30);
    const a = (1 - age * 0.7).toFixed(2);
  return `rgba(${r},${g},${b},${a})`;
}

function updateHud() {
    if (!hudEl) return;
    // Show the newest points from band 0 (or whichever is most recent)
    const band0 = bandHistories[0];
    if (!band0 || band0.length === 0) return;

    const n = Math.min(HUD_ROWS, band0.length);
  for (let i = 0; i < HUD_ROWS; i++) {
    const row = hudRows[i];
      if (i >= n) { row.textContent = ''; continue; }
      const p = band0[band0.length - 1 - i];
    const age = i / (HUD_ROWS - 1);
    row.style.color = hudRowColor(age);
    row.textContent = `${p.x.toFixed(2).padStart(7)}  ${p.y.toFixed(2).padStart(7)}  ${p.z.toFixed(2).padStart(7)}`;
  }
}

// ─── Graph centre (for camera tracking) ─────────────────────────────────────
export const graphCenter = new THREE.Vector3(0, 0, 0);
const _col = new THREE.Color();

function updatePoints() {
    const bandCount = cfg.bandCount;
    let writeIdx = 0;
    let cx = 0, cy = 0, cz = 0, totalWeight = 0;

    for (let b = 0; b < bandCount; b++) {
        const hist = bandHistories[b];
        if (!hist) continue;
        const n = hist.length;

      for (let i = 0; i < n; i++) {
          const p = hist[i];
          const age = i / cfg.trailLength;  // 0 = oldest, ~1 = newest
          const weight = 0.2 + age * 0.8;

        // Position
        positions[writeIdx * 3 + 0] = p.x;
        positions[writeIdx * 3 + 1] = p.y;
        positions[writeIdx * 3 + 2] = p.z;

        // Size: newer + louder = bigger
        const sz = cfg.pointSize * (0.3 + age * 0.7) * (0.5 + p.amplitude * 1.2 + p.transient * 0.3);
        sizes[writeIdx] = sz * (1 + cfg.glowIntensity * 0.3);

        // Alpha: fade oldest points
        alphas[writeIdx] = cfg.pointOpacity * (0.15 + age * 0.85);

        // Color: already baked at birth from live amplitude
        _col.setHSL(p.hue, p.saturation, p.lightness);
        colors[writeIdx * 3 + 0] = _col.r;
        colors[writeIdx * 3 + 1] = _col.g;
        colors[writeIdx * 3 + 2] = _col.b;

        cx += p.x * weight;
        cy += p.y * weight;
        cz += p.z * weight;
        totalWeight += weight;

        writeIdx++;
    }
  }

    // Update draw range
    geometry.setDrawRange(0, writeIdx);
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.customColor.needsUpdate = true;
    geometry.attributes.size.needsUpdate = true;
    geometry.attributes.alpha.needsUpdate = true;

    // Smooth graph centre for camera tracking
  if (totalWeight > 0) {
      const tx = cx / totalWeight;
      const ty = cy / totalWeight;
      const tz = cz / totalWeight;
      const dx = tx - graphCenter.x;
      const dy = ty - graphCenter.y;
      const dz = tz - graphCenter.z;
    const lag = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const alpha = Math.min(0.25, 0.05 + lag * 0.015);
    graphCenter.x += dx * alpha;
    graphCenter.y += dy * alpha;
    graphCenter.z += dz * alpha;
  }
}

// ─── Render loop ────────────────────────────────────────────────────────────
let hudTick = 0;

export function animate() {
  requestAnimationFrame(animate);
  const time = performance.now() * 0.001;
    updatePoints();
  updateViewportCameras(graphCenter, time);
  renderAllViewports(renderer, scene);

  if (++hudTick % 3 === 0) updateHud();
}
