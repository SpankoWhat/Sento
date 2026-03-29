import { cfg } from './config.js';
import { createEmbeddingPoint } from './embedding.js';

// ─── Audio history ──────────────────────────────────────────────────────────
// Each point stores a 3D latent embedding plus render metadata.
export const history = [];

// ─── Audio callback ─────────────────────────────────────────────────────────
export function onAudioData(raw) {
  const point = createEmbeddingPoint(raw);
  history.push(point);
  if (history.length > cfg.trailLength) history.shift();
}

// ─── Browser fallback ───────────────────────────────────────────────────────
export async function startBrowserFallback() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const splitter = ctx.createChannelSplitter(2);
    const leftAnalyser = ctx.createAnalyser();
    const rightAnalyser = ctx.createAnalyser();

    leftAnalyser.fftSize = 128;
    rightAnalyser.fftSize = 128;
    leftAnalyser.smoothingTimeConstant = 0.65;
    rightAnalyser.smoothingTimeConstant = 0.65;

    src.connect(splitter);
    splitter.connect(leftAnalyser, 0);
    splitter.connect(rightAnalyser, 1);

    const leftBuf = new Float32Array(leftAnalyser.frequencyBinCount);
    const rightBuf = new Float32Array(rightAnalyser.frequencyBinCount);

    function tick() {
      leftAnalyser.getFloatFrequencyData(leftBuf);
      rightAnalyser.getFloatFrequencyData(rightBuf);

      let rightLevel = 0;
      for (let i = 0; i < rightBuf.length; i++) {
        rightLevel += Math.max(0, (rightBuf[i] + 80) / 80);
      }

      const normalized = new Float32Array(128);
      const hasRightChannel = rightLevel > 0.01;

      for (let i = 0; i < 64; i++) {
        const left = Math.max(0, (leftBuf[i] + 80) / 80);
        const right = Math.max(0, (rightBuf[i] + 80) / 80);
        normalized[i] = left;
        normalized[i + 64] = hasRightChannel ? right : left;
      }

      onAudioData(normalized);
      requestAnimationFrame(tick);
    }

    tick();
  } catch {
    // Procedural demo: simulate motion across the embedding axes.
    let t = 0;

    function demo() {
      t += 0.025;
      const fake = new Float32Array(128);
      const phrase = Math.floor(t / 2.8) % 5;
      const phrasePos = (t % 2.8) / 2.8;

      const basePitch = [0.18, 0.48, 0.32, 0.74, 0.56][phrase];
      const pitchDrift = Math.sin(t * 4.5) * 0.05 + Math.sin(t * 10.5) * 0.03;
      const pan = Math.sin(t * 0.8) * 0.55 + Math.sin(t * 0.23) * 0.18;
      const width = 0.08 + (0.5 + 0.5 * Math.sin(t * 1.7 + phrase)) * 0.2;
      const brightness = 0.45 + 0.35 * Math.sin(t * 0.6 + phrase);
      const envelope = 0.16 + Math.pow(Math.sin(phrasePos * Math.PI), 1.5) * 0.9;

      for (let i = 0; i < 64; i++) {
        const f = i / 63;
        const leftCenter = basePitch + pitchDrift - pan * 0.05 - width * 0.03;
        const rightCenter = basePitch + pitchDrift + pan * 0.05 + width * 0.03;

        const leftBody = Math.exp(-Math.pow(f - leftCenter, 2) * (70 - brightness * 25));
        const rightBody = Math.exp(-Math.pow(f - rightCenter, 2) * (70 - brightness * 25));
        const leftHarmonic = Math.exp(-Math.pow(f - (leftCenter + 0.14), 2) * 150) * 0.45;
        const rightHarmonic = Math.exp(-Math.pow(f - (rightCenter + 0.14), 2) * 150) * 0.45;
        const noise = Math.random() * (0.02 + brightness * 0.08);

        fake[i] = Math.min(1, (leftBody + leftHarmonic) * envelope + noise);
        fake[i + 64] = Math.min(1, (rightBody + rightHarmonic) * envelope + noise * (0.7 + width));
      }

      onAudioData(fake);
      requestAnimationFrame(demo);
    }

    demo();
  }
}
