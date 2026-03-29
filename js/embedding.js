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

// Computes a set of low-level spectral features from the raw frequency data.
// These are the building blocks used by deriveState to produce higher-level descriptors.
function extractEmbeddingFeatures(raw) {
  const { left, right } = decodeStereoSpectrum(raw);
  const mono = new Float32Array(BINS_PER_CHANNEL);

  let amplitudeSum = 0;
  let energySum = 0;   // Accumulates squared mono amplitudes → used for RMS energy.
  let leftEnergy = 0;  // Squared left-channel amplitudes → used for stereo balance.
  let rightEnergy = 0; // Squared right-channel amplitudes → used for stereo balance.
  let centroidNum = 0; // Weighted frequency sum → numerator for spectral centroid.
  let diffSum = 0;     // Sum of absolute L/R differences per bin → stereo width.
  let fluxSum = 0;     // Sum of positive amplitude increases vs. last frame → onset/transient detection.
  let geoSum = 0;      // Sum of log amplitudes → used for geometric mean in flatness.

  let low = 0;   // Accumulated amplitude in the bass band (0–22% of spectrum).
  let mid = 0;   // Accumulated amplitude in the midrange band (22–60%).
  let high = 0;  // Accumulated amplitude in the treble band (60–100%).

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

  // RMS of the mono spectrum — overall loudness/power of the signal. Range: [0, 1].
  const energy = Math.sqrt(energySum / BINS_PER_CHANNEL);

  // Spectral centroid — amplitude-weighted average frequency position.
  // Low = bass-heavy (dark/warm), high = treble-heavy (bright/sharp). Range: [0, 1].
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

    // Spectral rolloff — the frequency below which 85% of total energy falls.
    // High rolloff = most energy is in the upper frequencies; low = mostly bass. Range: [0, 1].
    if (amplitudeSum > EPS && rolloff === 0.5 && cumulative >= rolloffThreshold) {
      rolloff = freq;
    }
  }

  // Spectral spread — amplitude-weighted standard deviation of frequency around the centroid.
  // Narrow = focused/tonal (sine wave), wide = scattered (noise or dense mix). Range: [0, ~0.5].
  const spread = amplitudeSum > EPS ? Math.sqrt(spreadNum / amplitudeSum) : 0;

  const arithmeticMean = amplitudeSum / BINS_PER_CHANNEL;

  // Spectral flatness — ratio of geometric mean to arithmetic mean.
  // Near 1 = noise-like (flat spectrum), near 0 = tonal (clear peaks). Range: [0, 1].
  const flatness = arithmeticMean > EPS ? Math.exp(geoSum / BINS_PER_CHANNEL) / arithmeticMean : 0;

  // Stereo balance — normalized energy difference between right and left channels.
  // Negative = left-heavy, positive = right-heavy, 0 = balanced. Range: [-1, 1].
  const balance = (rightEnergy - leftEnergy) / (rightEnergy + leftEnergy + EPS);

  // Stereo width — how different L and R channels are from each other.
  // 0 = mono signal, 1 = maximally wide stereo. Range: [0, 1].
  const width = clamp01(diffSum / (amplitudeSum * 2 + EPS));

  // Spectral flux — rate of change in the spectrum compared to the previous frame.
  // Spikes on onsets/attacks (drum hits, note starts), low during sustained/quiet sounds. Range: [0, 1].
  const flux = clamp01((fluxSum / BINS_PER_CHANNEL) * 6);

  // Band energy ratios — fraction of total amplitude in each frequency band.
  // All three sum to approximately 1 and describe the tonal "shape" of the sound.
  const lowRatio = low / (amplitudeSum + EPS);   // Bass / sub-bass share.
  const midRatio = mid / (amplitudeSum + EPS);   // Midrange / vocals share.
  const highRatio = high / (amplitudeSum + EPS); // Treble / air share.

  // Spectral tilt — high-band energy minus low-band energy, normalized.
  // Positive = bright/airy, negative = dark/bassy. Range: roughly [-1, 1].
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

// Combines low-level features from extractEmbeddingFeatures into higher-level perceptual
// descriptors, and re-centers all values to [-1, 1] so they're ready to drive 3D coordinates.
function deriveState(raw) {
  const features = extractEmbeddingFeatures(raw);

  // Brightness — perceptual "darkness vs. brightness" of the sound.
  // Blends three frequency-distribution measures (lowHighTilt, centroid, rolloff) for a
  // robust, stable signal. Positive = bright/airy (treble-heavy), negative = dark/bassy. Range: [-1, 1].
  const brightness = clampSigned(
    features.lowHighTilt * 1.35 +
    (features.centroid - 0.5) * 1.1 +
    (features.rolloff - 0.5) * 0.7
  );

  // Texture — perceptual roughness/complexity of the sound.
  // High = noisy, wide, spectrally scattered (distorted guitars, dense pads, white noise).
  // Low = clean, tonal, narrow (pure sine, flute, simple melody). Range: [-1, 1].
  const texture = clampSigned(
    (features.flatness - 0.28) * 1.8 +
    (features.spread - 0.18) * 2.6 +
    features.width * 0.55 -
    features.midRatio * 0.25
  );

  // Transient — detects sudden events: drum hits, note attacks, impacts.
  // Combines positive energy delta (did the signal get louder since last frame?) and spectral
  // flux (did the spectrum change?). Spikes briefly on onsets, decays quickly. Range: [0, 1].
  const transient = clamp01(
    Math.max(0, features.energy - prevPoint.energy) * 3.2 +
    features.flux * 0.9
  );

  // Presence — how strongly the sound is asserting itself right now.
  // A mix of raw loudness (energy, scaled by user sensitivity) and impact (transient).
  // Think of it as "how much is the sound filling the space at this moment". Range: [0, 1].
  // Capped at 1.0 so high energySensitivity doesn't push coordinates beyond the spatial bounds.
  const presence = clamp01(
    features.energy * Math.min(cfg.energySensitivity, 2.5) * 1.25 +
    transient * 0.35
  );

  return {
    ...features,
    brightness,
    texture,
    transient,
    presence,
    // Signed variants: each raw feature has a natural baseline that isn't at zero
    // (e.g. centroid averages ~0.5, spread ~0.18, band ratios are unequal). These
    // subtract those baselines and stretch the range so typical silence/noise sits near
    // 0 and deviations in either direction are meaningful for use as 3D axis inputs.
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
  // Classic mode: simple, direct mapping using three independent spectral features.
  // X = timbral brightness (centroid re-centered around 0: bass-heavy left, treble-heavy right).
  // Y = perceived loudness/intensity (presence, always positive so the point floats upward with volume).
  // Z = spectral spread (how scattered the frequencies are; wide/complex sounds push further back).
  if (cfg.mappingMode === 'classic') {
    return {
      x: (state.centroid - 0.5) * 2 * cfg.spaceScale,
      y: state.presence * cfg.spaceScale * 1.5,
      z: (state.spread - 0.15) * 4 * cfg.spaceScale,
    };
  }

  // Custom mode: each axis is fully user-configured — any feature can be assigned to any axis,
  // with independent per-axis emphasis multipliers to tune how strongly each feature drives movement.
  if (cfg.mappingMode === 'custom') {
    return {
      x: resolveCustomFeatureValue(cfg.xFeature, state) * cfg.spaceScale * cfg.xEmphasis,
      y: resolveCustomFeatureValue(cfg.yFeature, state) * cfg.spaceScale * cfg.yEmphasis,
      z: resolveCustomFeatureValue(cfg.zFeature, state) * cfg.spaceScale * cfg.zEmphasis,
    };
  }

  // Default (expressive) mode: each axis blends multiple features for a richer, more
  // organic feel. Features are weighted and mixed rather than mapped one-to-one.
  // X = timbral color axis: primarily brightness (treble vs. bass tilt), nudged by stereo balance.
  // Y = intensity/energy axis: biased downward at rest (-0.45 offset), pushed up by presence and
  //     transients so the point rises sharply on loud hits and falls back during quiet passages.
  // Z = spatial/complexity axis: driven by texture (noise/roughness), stereo width, and a touch
  //     of balance — complex, wide sounds move furthest along this axis.
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
