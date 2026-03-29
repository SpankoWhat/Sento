# AGENT.md — Sento Project Guide

## Overview

Sento is a **Wallpaper Engine** web wallpaper that visualizes audio as a 3D point cloud. Each audio frame produces one sphere positioned in 3D space based on spectral features, forming a winding trail through time.

**Axes Mapping:**
- **X** — Spectral Centroid (perceived pitch center)
- **Y** — Energy/Amplitude (volume)
- **Z** — Spectral Spread (tonal vs diffuse)
- **Color** — Hue from centroid (red=low, blue=high)
- **Size** — Energy

---

## File Structure

```
Sento/
├── index.html          # Entry point - links CSS + scripts
├── styles.css          # Minimal body/canvas styles
├── project.json        # Wallpaper Engine config & user properties
├── preview.jpg         # Thumbnail for WE (optional)
├── AGENT.md            # This file
└── js/
    ├── main.js         # Entry - initializes app, WE audio bridge
    ├── config.js       # Mutable cfg object + property definitions
    ├── scene.js        # Three.js scene, camera, renderer, meshes
    ├── audio.js        # Feature extraction, history array, fallback
    ├── controls.js     # Mouse/touch input, WE property listener
    └── visualizer.js   # Mesh updates, render loop
```

---

## Module Responsibilities

### `config.js`
- Exports `cfg` object with all mutable settings
- Exports `MAX_SPHERES` constant

### `scene.js`
- Creates Three.js `scene`, `camera`, `renderer`
- Creates `instancedMesh` (spheres) and `trailLine`
- Handles window resize
- Re-exports `THREE` for other modules

### `audio.js`
- Exports `history` array (stores point data)
- Exports `onAudioData(rawArray)` — processes 128-float audio
- Exports `startBrowserFallback()` — mic or procedural demo
- Computes: energy, spectral centroid, spectral spread, flatness

### `controls.js`
- Exports `mouseState` object (x, y, targetX, targetY, lastMove, autoAngle)
- Exports `updateMouse()` — smooths mouse position
- Registers `window.wallpaperPropertyListener` for WE settings
- Handles mousemove/touchmove events

### `visualizer.js`
- Exports `animate()` — the render loop
- Updates instanced mesh positions, colors, sizes
- Computes weighted center of mass for camera orbit
- Handles auto-rotate when idle

### `main.js`
- Imports and initializes all modules
- Polls `window.audioData` (set by non-module script in index.html)
- Falls back to browser audio if not in WE
- Starts `animate()` loop

---

## Wallpaper Engine Integration

### Audio Listener
WE requires the audio listener registered in a **non-module script** (not deferred). This is done in `index.html`:

```html
<script>
  window.audioData = null;
  function wallpaperAudioListener(audioArray) {
    window.audioData = audioArray;
  }
  window.wallpaperRegisterAudioListener(wallpaperAudioListener);
</script>
```

The module (`main.js`) polls `window.audioData` each frame.

### User Properties
Defined in `project.json` under `general.properties`. Each property needs:
- `text` — Display name
- `type` — `slider`, `bool`, `color`, etc.
- `value` — Default value
- `min`, `max`, `step` — For sliders

Properties are received via `window.wallpaperPropertyListener.applyUserProperties(props)` in `controls.js`.

### Required project.json Fields
```json
{
  "file": "index.html",
  "type": "web",
  "supportsaudioprocessing": true
}
```

---

## Adding a New Property

1. **Add to `project.json`:**
```json
"myNewProp": {
  "text": "My New Property",
  "type": "slider",
  "value": 1.0,
  "min": 0,
  "max": 2,
  "step": 0.1
}
```

2. **Add to `config.js`:**
```js
export const cfg = {
  // ...existing
  myNewProp: 1.0,
};
```

3. **Handle in `controls.js`:**
```js
if (properties.mynewprop) {
  cfg.myNewProp = properties.mynewprop.value;
}
```

4. **Use in `visualizer.js` or wherever needed:**
```js
import { cfg } from './config.js';
// use cfg.myNewProp
```

---

## Audio Data Format

WE provides 128 floats per callback (~30 Hz):
- `[0-63]` — Left channel frequency bins (bass → treble)
- `[64-127]` — Right channel frequency bins

Values are typically `0.0` to `1.0`, but can spike above. Use `Math.min(val, 1)`.

---

## Browser Testing

Without WE, the app falls back to:
1. **Microphone** via Web Audio API (requires HTTPS or localhost)
2. **Procedural demo** — simulated birdsong-like audio

Run locally:
```bash
python -m http.server 5500
# Open http://localhost:5500
```

---

## Performance Notes

- Uses `InstancedMesh` for up to 1200 spheres (efficient)
- Trail line uses `BufferGeometry` with dynamic draw range
- Camera orbits around weighted center of mass (follows the action)
- Auto-rotate kicks in after 3s of no mouse movement

---

## Dependencies

- **Three.js r183** via CDN: `https://cdn.jsdelivr.net/npm/three@0.183.2/build/three.module.js`
- No build step required — pure ES modules

---

## Common Tasks

### Change the color palette
Edit `visualizer.js` in `updateMesh()`:
```js
const hue = (p.hue + cfg.colorHueShift) % 1.0;
_col.setHSL(hue, cfg.colorSaturation, lit * age);
```

### Change sphere geometry
Edit `scene.js`:
```js
const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
// Change segments or use different geometry
```

### Add new audio features
Edit `audio.js` in `extractFeatures()`:
```js
// Add new feature computation
return { energy, centroid, spread, flatness, myNewFeature };
```

### Adjust camera behavior
Edit `visualizer.js` in `animate()`:
```js
camera.position.x = graphCenter.x + Math.sin(angle) * cfg.camRadius;
// Modify orbit, add easing, etc.
```
