import { cfg } from './config.js';

// ─── Audio history ──────────────────────────────────────────────────────────
// Each point stores: { x: spectralCentroid, y: amplitude, z: spectralSpread, size, hue }
export const history = [];

// ─── Audio feature extraction ───────────────────────────────────────────────
function extractFeatures(raw) {
  // raw: 128 floats (64 left + 64 right), values 0..1
  const bins = 64;
  const spectrum = new Float32Array(bins);
  for (let i = 0; i < bins; i++) {
    spectrum[i] = (raw[i] + raw[i + bins]) * 0.5;
  }

  // Total energy (RMS-like)
  let energy = 0;
  for (let i = 0; i < bins; i++) energy += spectrum[i] * spectrum[i];
  energy = Math.sqrt(energy / bins);

  // Spectral centroid (weighted average frequency)
  let centroidNum = 0, centroidDen = 0;
  for (let i = 0; i < bins; i++) {
    centroidNum += i * spectrum[i];
    centroidDen += spectrum[i];
  }
  const centroid = centroidDen > 0.001 ? centroidNum / centroidDen / bins : 0.5;

  // Spectral spread (standard deviation around centroid)
  let spreadNum = 0;
  for (let i = 0; i < bins; i++) {
    const diff = (i / bins) - centroid;
    spreadNum += diff * diff * spectrum[i];
  }
  const spread = centroidDen > 0.001 ? Math.sqrt(spreadNum / centroidDen) : 0;

  // Spectral flatness (geometric mean / arithmetic mean) — indicates noisiness
  let geoSum = 0, ariSum = 0;
  for (let i = 0; i < bins; i++) {
    const v = Math.max(spectrum[i], 1e-10);
    geoSum += Math.log(v);
    ariSum += v;
  }
  const geoMean = Math.exp(geoSum / bins);
  const ariMean = ariSum / bins;
  const flatness = ariMean > 1e-10 ? geoMean / ariMean : 0;

  return { energy, centroid, spread, flatness };
}

// ─── Audio callback ─────────────────────────────────────────────────────────
export function onAudioData(raw) {
  const f = extractFeatures(raw);

  // Apply energy sensitivity
  const energy = f.energy * cfg.energySensitivity;

  // Map features to 3D position
  const x = (f.centroid - 0.5) * 2 * cfg.spaceScale;
  const y = energy * cfg.spaceScale * 1.5;
  const z = (f.spread - 0.15) * 4 * cfg.spaceScale;

  // Size based on energy
  const size = 0.08 + energy * 0.6;

  // Hue based on spectral centroid (low=red, high=blue)
  const hue = f.centroid * 0.75;

  history.push({ x, y, z, size, hue, energy });
  if (history.length > cfg.trailLength) history.shift();
}

// ─── Browser fallback ───────────────────────────────────────────────────────
export async function startBrowserFallback() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.6;
    src.connect(analyser);
    const buf = new Float32Array(128);

    function tick() {
      analyser.getFloatFrequencyData(buf);
      const normalized = new Float32Array(128);
      for (let i = 0; i < 128; i++) {
        normalized[i] = Math.max(0, (buf[i] + 80) / 80);
      }
      onAudioData(normalized);
      requestAnimationFrame(tick);
    }
    tick();
  } catch {
    // Procedural demo: simulate a wandering "birdsong" trajectory
    let t = 0;
    function demo() {
      t += 0.025;
      const fake = new Float32Array(128);
      
      // Create distinct "phrases" with varying pitch and energy
      const phrase = Math.floor(t / 3) % 5;
      const inPhrase = (t % 3) / 3;
      
      const basePitch = [0.3, 0.6, 0.45, 0.75, 0.5][phrase];
      const pitchWobble = Math.sin(t * 8) * 0.15 + Math.sin(t * 12) * 0.08;
      const targetPitch = basePitch + pitchWobble;
      
      const envelope = Math.sin(inPhrase * Math.PI) * (0.5 + 0.5 * Math.sin(t * 15));
      
      for (let i = 0; i < 128; i++) {
        const f = i / 128;
        const dist = Math.abs(f - targetPitch);
        const v = Math.exp(-dist * dist * 80) * envelope;
        fake[i] = Math.min(1, v + Math.random() * 0.02);
      }
      onAudioData(fake);
      requestAnimationFrame(demo);
    }
    demo();
  }
}
