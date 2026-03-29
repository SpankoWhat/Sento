import { cfg } from './config.js';

// ─── Embedding ──────────────────────────────────────────────────────────────
// Converts raw FFT data for a single frequency band into a 3D coordinate
// plus live-color metadata.  Each band gets its own independent history so
// points are plotted in parallel.

const EPS = 1e-6;

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
function clamp01(v) { return clamp(v, 0, 1); }
function clampSigned(v) { return clamp(v, -1, 1); }

// ─── Per-band state ─────────────────────────────────────────────────────────
// We create one state object per band so each band has its own smoothing
// history and previous-frame data.
const bandStates = [];

function getBandState(bandIndex) {
    if (!bandStates[bandIndex]) {
        bandStates[bandIndex] = {
            prevMono: null,   // will be set to a Float32Array on first call
            prevX: 0,
            prevY: 0,
            prevZ: 0,
            prevEnergy: 0,
        };
    }
    return bandStates[bandIndex];
}

// ─── Feature extraction (per-band sub-spectrum) ─────────────────────────────
function extractBandFeatures(bins, bandState) {
    const N = bins.length;
    if (!bandState.prevMono || bandState.prevMono.length !== N) {
        bandState.prevMono = new Float32Array(N);
  }

    let ampSum = 0, energySum = 0, centroidNum = 0;
    let fluxSum = 0, geoSum = 0, spreadNum = 0;

    for (let i = 0; i < N; i++) {
        const m = bins[i];
        const freq = i / (N - 1 || 1);
        ampSum += m;
      energySum += m * m;
    centroidNum += freq * m;
      fluxSum += Math.max(0, m - bandState.prevMono[i]);
      geoSum += Math.log(Math.max(m, EPS));
  }

    const energy = Math.sqrt(energySum / N);
    const centroid = ampSum > EPS ? centroidNum / ampSum : 0.5;

    let cumulative = 0, rolloff = 0.5;
    const rollThresh = ampSum * 0.85;

    for (let i = 0; i < N; i++) {
        const freq = i / (N - 1 || 1);
    const diff = freq - centroid;
      spreadNum += diff * diff * bins[i];
      cumulative += bins[i];
      if (ampSum > EPS && rolloff === 0.5 && cumulative >= rollThresh) rolloff = freq;
  }

    const spread = ampSum > EPS ? Math.sqrt(spreadNum / ampSum) : 0;
    const arithMean = ampSum / N;
    const flatness = arithMean > EPS ? Math.exp(geoSum / N) / arithMean : 0;
    const flux = clamp01((fluxSum / N) * 6);

    // Save for next frame
    for (let i = 0; i < N; i++) bandState.prevMono[i] = bins[i];

    return { energy, centroid, spread, rolloff, flatness, flux, ampSum, N };
}

// ─── Higher-level descriptors ───────────────────────────────────────────────
function deriveDescriptors(feat, bandState) {
  const brightness = clampSigned(
      (feat.centroid - 0.5) * 2.2 +
      (feat.rolloff - 0.5) * 1.0
  );

  const texture = clampSigned(
      (feat.flatness - 0.28) * 2.0 +
      (feat.spread - 0.18) * 2.6
  );

  const transient = clamp01(
      Math.max(0, feat.energy - bandState.prevEnergy) * 3.5 +
      feat.flux * 0.9
  );

  const presence = clamp01(
      feat.energy * Math.min(cfg.energySensitivity, 2.5) * 1.25 +
    transient * 0.35
  );

    bandState.prevEnergy = feat.energy;

    return { brightness, texture, transient, presence, energy: feat.energy };
}

// ─── Coordinate mapping (per-band) ─────────────────────────────────────────
function computeCoords(desc) {
    const S = cfg.spaceScale;
    return {
        x: clampSigned(desc.brightness * 0.85) * S,
        y: clampSigned(-0.4 + desc.presence * 1.6 + desc.transient * 0.2) * S * 1.3,
        z: clampSigned(desc.texture * 0.75) * S,
    };
}

// ─── Public: create one embedding point for a given band ────────────────────
// `bins` is a Float32Array of the FFT bins that belong to this band.
// `bandIndex` determines horizontal offset so bands are plotted side-by-side.
export function createBandPoint(bins, bandIndex) {
    const bs = getBandState(bandIndex);
    const feat = extractBandFeatures(bins, bs);
    const desc = deriveDescriptors(feat, bs);
    const target = computeCoords(desc);

    // Smooth toward target
    const x = bs.prevX + (target.x - bs.prevX) * 0.32;
    const y = bs.prevY + (target.y - bs.prevY) * 0.28;
    const z = bs.prevZ + (target.z - bs.prevZ) * 0.32;

    // Offset each band along X so they sit side-by-side
    const bandOffset = (bandIndex - (cfg.bandCount - 1) / 2) * cfg.bandSpacing;

    bs.prevX = x;
    bs.prevY = y;
    bs.prevZ = z;

    // ── Live color from amplitude ─────────────────────────────────────────
    const amplitude = desc.presence;  // 0 = silent, 1 = loud
    const hue = cfg.colorHueLow + (cfg.colorHueHigh - cfg.colorHueLow) * amplitude + cfg.colorHueShift;
    const sat = clamp01(cfg.colorSaturation * (0.5 + amplitude * 0.5));
    const lit = clamp01(0.15 + amplitude * 0.55 + desc.transient * 0.2);

  return {
      x: x + bandOffset,
    y,
    z,
      amplitude,
      hue: ((hue % 1) + 1) % 1,
      saturation: sat,
      lightness: lit,
      transient: desc.transient,
      energy: desc.energy,
      bandIndex,
  };
}
