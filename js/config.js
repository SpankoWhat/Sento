// ─── Config (mutable for WE properties) ─────────────────────────────────────
export const cfg = {
  trailLength: 600,
  spaceScale: 12,
  camRadius: 22,
  camHeight: 8,
  sphereSize: 1.0,
  lineOpacity: 0.25,
  colorSaturation: 0.9,
  colorHueShift: 0.0,
  fogDensity: 0.018,
  energySensitivity: 1.0,
  autoRotate: true,
  autoRotateSpeed: 0.3,
};

// ─── Property definitions (mirrors project.json) ────────────────────────────
export const propertyDefs = {
  trailLength:       { min: 100,  max: 1200, step: 50 },
  sphereSize:        { min: 0.2,  max: 3.0,  step: 0.2 },
  lineOpacity:       { min: 0.0,  max: 1.0,  step: 0.1 },
  colorSaturation:   { min: 0.0,  max: 1.0,  step: 0.1 },
  colorHueShift:     { min: 0.0,  max: 1.0,  step: 0.1 },
  fogDensity:        { min: 0.0,  max: 0.06, step: 0.001 },
  spaceScale:        { min: 4,    max: 30,   step: 1 },
  energySensitivity: { min: 0.3,  max: 3.0,  step: 0.1 },
  camRadius:         { min: 8,    max: 50,   step: 1 },
  camHeight:         { min: 0,    max: 20,   step: 1 },
  autoRotateSpeed:   { min: 0.05, max: 1.0,  step: 0.05 },
};

export const MAX_SPHERES = 1200; // max possible trail length
