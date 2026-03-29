import { cfg } from './config.js';

const BINS_PER_CHANNEL = 64;
const EPS = 1e-6;
const prevMono = new Float32Array(BINS_PER_CHANNEL);
const prevPoint = { x: 0, y: 0, z: 0, energy: 0 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clampSigned(value) {
  return clamp(value, -1, 1);
}

function wrap01(value) {
  return ((value % 1) + 1) % 1;
}

function decodeStereoSpectrum(raw) {
  const left = new Float32Array(BINS_PER_CHANNEL);
  const right = new Float32Array(BINS_PER_CHANNEL);

  if (!raw || raw.length === 0) {
    return { left, right };
  }

  if (raw.length >= BINS_PER_CHANNEL * 2) {
    for (let i = 0; i < BINS_PER_CHANNEL; i++) {
      left[i] = clamp01(Number(raw[i]) || 0);
      right[i] = clamp01(Number(raw[i + BINS_PER_CHANNEL]) || 0);
    }
    return { left, right };
  }

  const monoBins = Math.min(BINS_PER_CHANNEL, raw.length);
  for (let i = 0; i < monoBins; i++) {
    const value = clamp01(Number(raw[i]) || 0);
    left[i] = value;
    right[i] = value;
  }

  return { left, right };
}

function extractEmbeddingFeatures(raw) {
  const { left, right } = decodeStereoSpectrum(raw);
  const mono = new Float32Array(BINS_PER_CHANNEL);

  let amplitudeSum = 0;
  let energySum = 0;
  let leftEnergy = 0;
  let rightEnergy = 0;
  let centroidNum = 0;
  let diffSum = 0;
  let fluxSum = 0;
  let geoSum = 0;

  let low = 0;
  let mid = 0;
  let high = 0;

  for (let i = 0; i < BINS_PER_CHANNEL; i++) {
    const l = left[i];
    const r = right[i];
    const m = (l + r) * 0.5;
    const freq = i / (BINS_PER_CHANNEL - 1);

    mono[i] = m;
    amplitudeSum += m;
    energySum += m * m;
    leftEnergy += l * l;
    rightEnergy += r * r;
    centroidNum += freq * m;
    diffSum += Math.abs(l - r);
    fluxSum += Math.max(0, m - prevMono[i]);
    geoSum += Math.log(Math.max(m, EPS));

    if (freq < 0.22) {
      low += m;
    } else if (freq < 0.6) {
      mid += m;
    } else {
      high += m;
    }
  }

  const energy = Math.sqrt(energySum / BINS_PER_CHANNEL);
  const centroid = amplitudeSum > EPS ? centroidNum / amplitudeSum : 0.5;

  let spreadNum = 0;
  let cumulative = 0;
  let rolloff = 0.5;
  const rolloffThreshold = amplitudeSum * 0.85;

  for (let i = 0; i < BINS_PER_CHANNEL; i++) {
    const freq = i / (BINS_PER_CHANNEL - 1);
    const diff = freq - centroid;
    const value = mono[i];

    spreadNum += diff * diff * value;
    cumulative += value;

    if (amplitudeSum > EPS && rolloff === 0.5 && cumulative >= rolloffThreshold) {
      rolloff = freq;
    }
  }

  const spread = amplitudeSum > EPS ? Math.sqrt(spreadNum / amplitudeSum) : 0;
  const arithmeticMean = amplitudeSum / BINS_PER_CHANNEL;
  const flatness = arithmeticMean > EPS ? Math.exp(geoSum / BINS_PER_CHANNEL) / arithmeticMean : 0;
  const balance = (rightEnergy - leftEnergy) / (rightEnergy + leftEnergy + EPS);
  const width = clamp01(diffSum / (amplitudeSum * 2 + EPS));
  const flux = clamp01((fluxSum / BINS_PER_CHANNEL) * 6);

  const lowRatio = low / (amplitudeSum + EPS);
  const midRatio = mid / (amplitudeSum + EPS);
  const highRatio = high / (amplitudeSum + EPS);
  const lowHighTilt = (high - low) / (amplitudeSum + EPS);

  for (let i = 0; i < BINS_PER_CHANNEL; i++) {
    prevMono[i] = mono[i];
  }

  return {
    energy,
    centroid,
    spread,
    rolloff,
    flatness,
    balance,
    width,
    flux,
    lowRatio,
    midRatio,
    highRatio,
    lowHighTilt,
  };
}

function toCentered(value) {
  return clampSigned(value * 2 - 1);
}

function deriveState(raw) {
  const features = extractEmbeddingFeatures(raw);

  const brightness = clampSigned(
    features.lowHighTilt * 1.35 +
    (features.centroid - 0.5) * 1.1 +
    (features.rolloff - 0.5) * 0.7
  );

  const texture = clampSigned(
    (features.flatness - 0.28) * 1.8 +
    (features.spread - 0.18) * 2.6 +
    features.width * 0.55 -
    features.midRatio * 0.25
  );

  const transient = clamp01(
    Math.max(0, features.energy - prevPoint.energy) * 3.2 +
    features.flux * 0.9
  );

  const presence = clamp01(
    features.energy * cfg.energySensitivity * 1.25 +
    transient * 0.35
  );

  return {
    ...features,
    brightness,
    texture,
    transient,
    presence,
    centroidSigned: clampSigned((features.centroid - 0.5) * 2),
    spreadSigned: clampSigned((features.spread - 0.18) * 5),
    rolloffSigned: clampSigned((features.rolloff - 0.5) * 2),
    flatnessSigned: clampSigned((features.flatness - 0.28) * 3),
    widthSigned: toCentered(features.width),
    presenceSigned: toCentered(presence),
    transientSigned: toCentered(transient),
    lowSigned: clampSigned((features.lowRatio - 0.34) * 3.2),
    midSigned: clampSigned((features.midRatio - 0.38) * 3.2),
    highSigned: clampSigned((features.highRatio - 0.28) * 3.2),
  };
}

function resolveCustomFeatureValue(feature, state) {
  switch (feature) {
    case 'presence':
      return state.presenceSigned;
    case 'texture':
      return state.texture;
    case 'balance':
      return state.balance;
    case 'width':
      return state.widthSigned;
    case 'transient':
      return state.transientSigned;
    case 'centroid':
      return state.centroidSigned;
    case 'spread':
      return state.spreadSigned;
    case 'flatness':
      return state.flatnessSigned;
    case 'low':
      return state.lowSigned;
    case 'mid':
      return state.midSigned;
    case 'high':
      return state.highSigned;
    case 'rolloff':
      return state.rolloffSigned;
    case 'brightness':
    default:
      return state.brightness;
  }
}

function computeTargets(state) {
  if (cfg.mappingMode === 'classic') {
    return {
      x: (state.centroid - 0.5) * 2 * cfg.spaceScale,
      y: state.presence * cfg.spaceScale * 1.5,
      z: (state.spread - 0.15) * 4 * cfg.spaceScale,
    };
  }

  if (cfg.mappingMode === 'custom') {
    return {
      x: resolveCustomFeatureValue(cfg.xFeature, state) * cfg.spaceScale * cfg.xEmphasis,
      y: resolveCustomFeatureValue(cfg.yFeature, state) * cfg.spaceScale * 1.3 * cfg.yEmphasis,
      z: resolveCustomFeatureValue(cfg.zFeature, state) * cfg.spaceScale * cfg.zEmphasis,
    };
  }

  return {
    x: clampSigned(state.brightness * 0.82 + state.balance * 0.35) * cfg.spaceScale,
    y: clampSigned(-0.45 + state.presence * 1.5 + state.transient * 0.2) * cfg.spaceScale * 1.3,
    z: clampSigned(state.texture * 0.75 + state.width * 0.4 + state.balance * 0.15) * cfg.spaceScale,
  };
}

// This is an artistic 3D latent space, not physical source localization.
// Axes represent timbre, intensity, and texture/spatial spread.
export function createEmbeddingPoint(raw) {
  const state = deriveState(raw);
  const targets = computeTargets(state);

  const x = prevPoint.x + (targets.x - prevPoint.x) * 0.32;
  const y = prevPoint.y + (targets.y - prevPoint.y) * 0.28;
  const z = prevPoint.z + (targets.z - prevPoint.z) * 0.32;

  const size = 0.07 + state.presence * 0.42 + state.transient * 0.18 + state.width * 0.08;
  const hue = wrap01(0.03 + ((state.brightness + 1) * 0.5) * 0.62 + state.width * 0.05);
  const saturation = clamp01(0.5 + state.width * 0.25 + state.transient * 0.2 + state.flatness * 0.15);
  const lightness = clamp01(0.22 + state.presence * 0.38 + state.transient * 0.15);

  prevPoint.x = x;
  prevPoint.y = y;
  prevPoint.z = z;
  prevPoint.energy = state.energy;

  return {
    x,
    y,
    z,
    size,
    hue,
    saturation,
    lightness,
    energy: state.presence,
    transient: state.transient,
    brightness: state.brightness,
    texture: state.texture,
    width: state.width,
    balance: state.balance,
    centroid: state.centroid,
  };
}
