// ─── Config (mutable for WE properties) ─────────────────────────────────────
export const cfg = {
  // ── Frequency range ──────────────────────────────────────────────────────
  // Cut the useless high end — humans barely hear above ~16 kHz and most
  // musical content lives below that.  With a 44.1 kHz sample rate the 64
  // FFT bins cover 0–22 050 Hz.  maxBin = 48 keeps bins 0-47 (~0–16.5 kHz).
  maxBin: 48,

  // ── Band system ──────────────────────────────────────────────────────────
  // How many parallel bands to split the kept spectrum into.
  // 3 = Low / Mid / High.  Any integer 2–12 works (evenly divided).
  bandCount: 3,

  // Per-band trail length (how many points each band keeps)
  trailLength: 600,

  // ── Spatial ──────────────────────────────────────────────────────────────
  spaceScale: 18,         // overall data spread
  bandSpacing: 14,        // horizontal gap between parallel band columns
  camRadius: 32,
  camHeight: 10,

  // ── Point appearance ─────────────────────────────────────────────────────
  pointSize: 3.5,         // base size of each dot (in pixels)
  pointOpacity: 0.88,
  glowIntensity: 0.7,

  // ── Live color ───────────────────────────────────────────────────────────
  // Each point is colored at birth by its live amplitude (loudness).
  // hueRange maps amplitude 0→1 to hue low→high (0–1 wrapping).
  colorHueLow: 0.58,      // quiet = blue
  colorHueHigh: 0.0,      // loud  = red
  colorSaturation: 0.85,
  colorHueShift: 0.0,

  // ── Energy ───────────────────────────────────────────────────────────────
  energySensitivity: 1.0,

  // ── Camera rotation (user-controlled via slider) ────────────────────
  camTheta: 0,            // azimuthal angle in radians (0 = front, π = back)
};

// Maximum number of points across ALL bands (sized for worst-case runtime config)
export const MAX_POINTS = 12 * 1200;  // max bandCount(12) * max trailLength(1200)
