// ─── Main Entry Point ───────────────────────────────────────────────────────
// Import all modules to initialize them
import './config.js';
import './scene.js';
import './controls.js';
import { startWallpaperEngine, startMicCapture, startFilePlayback, startDemo } from './audio.js';
import { animate } from './visualizer.js';

// ─── Audio source selection ─────────────────────────────────────────────────
if (typeof window.wallpaperRegisterAudioListener !== 'undefined') {
  // Default: Wallpaper Engine is present
  startWallpaperEngine();
} else {
  // Outside WE — show a debug picker so you can load a test file
  const picker = document.createElement('div');
  picker.id = 'audio-debug-picker';
  picker.innerHTML = `
    <label id="file-label">
      <span>🎵 Load audio file</span>
      <input type="file" id="audio-file" accept="audio/*">
    </label>
    <button id="mic-btn" title="Use microphone">🎤</button>
    <button id="demo-btn" title="Run procedural demo">▶ Demo</button>
  `;
  document.body.appendChild(picker);

  // File input
  picker.querySelector('#audio-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      picker.remove();
      startFilePlayback(file);
    }
  });

  // Mic button
  picker.querySelector('#mic-btn').addEventListener('click', () => {
    picker.remove();
    startMicCapture().catch(() => {
      console.warn('[audio] Mic access denied, falling back to demo');
      startDemo();
    });
  });

  // Demo button
  picker.querySelector('#demo-btn').addEventListener('click', () => {
    picker.remove();
    startDemo();
  });

  // Auto-start demo after 8 s if nothing is chosen
  const autoStart = setTimeout(() => {
    if (document.getElementById('audio-debug-picker')) {
      picker.remove();
      startDemo();
    }
  }, 8000);

  // Cancel auto-start on any interaction
  picker.addEventListener('pointerdown', () => clearTimeout(autoStart));
}

// ─── Start render loop ──────────────────────────────────────────────────────
animate();
