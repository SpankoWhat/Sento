import { cfg } from './config.js';
import { createBandPoint } from './embedding.js';

// ─── Per-band histories ─────────────────────────────────────────────────────
// bandHistories[b] is an array of points for frequency band b.
// The visualizer reads these in parallel.
export const bandHistories = [];

// Latest full 64-bin mono spectrum (before maxBin trim) for the spectrum HUD.
export const latestSpectrum = new Float32Array(64);

function ensureBands() {
  while (bandHistories.length < cfg.bandCount) bandHistories.push([]);
  // Trim excess bands if bandCount decreased at runtime
  bandHistories.length = cfg.bandCount;
}

// ─── Audio callback ─────────────────────────────────────────────────────────
export function onAudioData(raw) {
  ensureBands();

  // Decode left+right → mono bins, then trim to maxBin
  const BINS = 64;
  const mono = new Float32Array(cfg.maxBin);
  const half = raw.length >= BINS * 2;
  for (let i = 0; i < cfg.maxBin; i++) {
    const l = Math.max(0, Number(raw[i]) || 0);
    const r = half ? Math.max(0, Number(raw[i + BINS]) || 0) : l;
    mono[i] = (l + r) * 0.5;
  }

  // Also store the full 64-bin spectrum for the spectrum HUD
  for (let i = 0; i < BINS; i++) {
    const l = Math.max(0, Number(raw[i]) || 0);
    const r = half ? Math.max(0, Number(raw[i + BINS]) || 0) : l;
    latestSpectrum[i] = (l + r) * 0.5;
  }

  // Split kept bins evenly across bands
  const binsPerBand = Math.floor(cfg.maxBin / cfg.bandCount);

  for (let b = 0; b < cfg.bandCount; b++) {
    const start = b * binsPerBand;
    const end = (b === cfg.bandCount - 1) ? cfg.maxBin : start + binsPerBand;
    const bandBins = mono.subarray(start, end);

    const point = createBandPoint(bandBins, b);
    bandHistories[b].push(point);
    if (bandHistories[b].length > cfg.trailLength) bandHistories[b].shift();
  }
}

// ─── Shared analyser setup ──────────────────────────────────────────────────
// Wires an AudioNode source through a stereo splitter → two analysers,
// then pumps normalized 128-float frames into onAudioData every frame.
function analyseSource(ctx, sourceNode) {
  const splitter = ctx.createChannelSplitter(2);
  const leftAnalyser = ctx.createAnalyser();
  const rightAnalyser = ctx.createAnalyser();

  leftAnalyser.fftSize = 128;
  rightAnalyser.fftSize = 128;
  leftAnalyser.smoothingTimeConstant = 0.65;
  rightAnalyser.smoothingTimeConstant = 0.65;

  sourceNode.connect(splitter);
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
}

// ─── Wallpaper Engine listener ──────────────────────────────────────────────
// Default audio path: polls window.audioData set by the WE callback in index.html.
export function startWallpaperEngine() {
  let lastAudioData = null;

  function poll() {
    if (window.audioData && window.audioData !== lastAudioData) {
      lastAudioData = window.audioData;
      onAudioData(window.audioData);
    }
    requestAnimationFrame(poll);
  }

  poll();
  console.log('[audio] Wallpaper Engine listener active');
}

// ─── Mic capture ────────────────────────────────────────────────────────────
// Captures live microphone input and analyses it.
export async function startMicCapture() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(stream);
  analyseSource(ctx, src);
  console.log('[audio] Mic capture active');
}

// ─── File playback (debug / testing) ────────────────────────────────────────
// Accepts a File object (from <input>), decodes it, and loops playback
// through the same analyser pipeline so you get real spectral data.
export async function startFilePlayback(file) {
  const ctx = new AudioContext();
  const arrayBuf = await file.arrayBuffer();
  const audioBuf = await ctx.decodeAudioData(arrayBuf);

  const src = ctx.createBufferSource();
  src.buffer = audioBuf;
  src.loop = true;

  // Also connect to destination so you can hear it while debugging
  src.connect(ctx.destination);

  analyseSource(ctx, src);
  src.start(0);
  console.log(`[audio] File playback active: ${file.name}`);
  return src; // caller can .stop() if needed
}

// ─── Procedural demo ────────────────────────────────────────────────────────
// Synthetic data — last-resort fallback when no audio source is available.
export function startDemo() {
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
  console.log('[audio] Procedural demo active');
}
