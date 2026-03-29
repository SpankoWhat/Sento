// ─── Main Entry Point ───────────────────────────────────────────────────────
// Import all modules to initialize them
import './config.js';
import './scene.js';
import './controls.js';
import { onAudioData, startBrowserFallback } from './audio.js';
import { animate } from './visualizer.js';

// ─── Wallpaper Engine audio polling ─────────────────────────────────────────
// WE's audio listener is registered in index.html (non-module script)
// We poll window.audioData which is set by that listener
let lastAudioData = null;

function pollAudio() {
  if (window.audioData && window.audioData !== lastAudioData) {
    lastAudioData = window.audioData;
    onAudioData(window.audioData);
  }
  requestAnimationFrame(pollAudio);
}

// Check if we're in Wallpaper Engine (audio listener was registered)
if (typeof window.wallpaperRegisterAudioListener !== 'undefined') {
  pollAudio();
} else {
  // Browser fallback
  startBrowserFallback();
}

// ─── Start render loop ──────────────────────────────────────────────────────
animate();
