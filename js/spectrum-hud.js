import { cfg } from './config.js';
import { latestSpectrum } from './audio.js';

// ─── Spectrum Band HUD ──────────────────────────────────────────────────────
// Draws a live frequency-bar display across the top of the main viewport.
//
// Visual features:
//  • 64 frequency bins shown as vertical bars
//  • Bins beyond maxBin are dimmed (greyed out) to show the cutoff
//  • Active bins are colored by band — each band gets a distinct hue
//  • Thin vertical separator lines mark band boundaries
//  • A label per band ("Low", "Mid", "High" or "B1 … Bn")
//  • Frequency scale label at edges (0 Hz … ~22 kHz)

const canvas = document.getElementById('spectrum-hud');
const ctx = canvas ? canvas.getContext('2d') : null;

const TOTAL_BINS = 64;
const SAMPLE_RATE = 44100;
const BIN_HZ = SAMPLE_RATE / 2 / TOTAL_BINS;  // ~344 Hz per bin

// Band hue palette (up to 12 bands). Evenly spaced around the colour wheel.
function bandHue(bandIndex, bandCount) {
  return (bandIndex / bandCount) * 360;
}

// Named labels for 2-5 bands, fallback to "B1…Bn" for more
const BAND_NAMES = {
  2: ['Low', 'High'],
  3: ['Low', 'Mid', 'High'],
  4: ['Sub', 'Low', 'Mid', 'High'],
  5: ['Sub', 'Low', 'Mid', 'High', 'Air'],
};

function bandLabel(index, count) {
  const names = BAND_NAMES[count];
  if (names) return names[index];
  return `B${index + 1}`;
}

function formatHz(hz) {
  if (hz >= 1000) return `${(hz / 1000).toFixed(1)} kHz`;
  return `${Math.round(hz)} Hz`;
}

// ─── Draw ───────────────────────────────────────────────────────────────────
export function drawSpectrumHud() {
  if (!ctx || !canvas) return;

  const dpr = Math.min(devicePixelRatio, 2);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  const w = Math.round(cssW * dpr);
  const h = Math.round(cssH * dpr);

  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }

  ctx.clearRect(0, 0, w, h);

  const maxBin = cfg.maxBin;
  const bandCount = cfg.bandCount;
  const binsPerBand = Math.floor(maxBin / bandCount);

  const barW = w / TOTAL_BINS;
  const labelY = h - 6 * dpr;  // bottom area for labels
  const barAreaH = h - 18 * dpr; // leave room for labels at bottom

  // ── Draw bars ─────────────────────────────────────────────────────────
  for (let i = 0; i < TOTAL_BINS; i++) {
    const amp = Math.min(1, latestSpectrum[i]);
    const barH = amp * barAreaH;
    const x = i * barW;

    if (i >= maxBin) {
      // Beyond cutoff: dim grey
      ctx.fillStyle = `rgba(60, 60, 70, ${0.15 + amp * 0.25})`;
    } else {
      // Which band does this bin belong to?
      const band = Math.min(Math.floor(i / binsPerBand), bandCount - 1);
      const hue = bandHue(band, bandCount);
      const lit = 35 + amp * 40;
      ctx.fillStyle = `hsla(${hue}, 70%, ${lit}%, ${0.6 + amp * 0.4})`;
    }

    ctx.fillRect(x + 0.5, barAreaH - barH, barW - 1, barH);
  }

  // ── Max-bin cutoff line ───────────────────────────────────────────────
  const cutX = maxBin * barW;
  ctx.strokeStyle = 'rgba(255, 80, 80, 0.6)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.setLineDash([4 * dpr, 3 * dpr]);
  ctx.beginPath();
  ctx.moveTo(cutX, 0);
  ctx.lineTo(cutX, barAreaH);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cutoff label
  ctx.font = `${9 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255, 80, 80, 0.7)';
  ctx.textAlign = 'left';
  ctx.fillText(`${formatHz(maxBin * BIN_HZ)} max`, cutX + 3 * dpr, 10 * dpr);

  // ── Band separator lines + labels ─────────────────────────────────────
  ctx.font = `bold ${8 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = 'center';

  for (let b = 0; b < bandCount; b++) {
    const start = b * binsPerBand;
    const end = (b === bandCount - 1) ? maxBin : start + binsPerBand;

    // Separator line at start of each band (skip first)
    if (b > 0) {
      const sx = start * barW;
      ctx.strokeStyle = `hsla(${bandHue(b, bandCount)}, 50%, 60%, 0.35)`;
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, barAreaH);
      ctx.stroke();
    }

    // Band label centered in its region
    const midX = ((start + end) / 2) * barW;
    const hue = bandHue(b, bandCount);
    ctx.fillStyle = `hsla(${hue}, 60%, 70%, 0.85)`;
    ctx.fillText(bandLabel(b, bandCount), midX, labelY);
  }

  // ── Frequency axis labels ─────────────────────────────────────────────
  ctx.font = `${7 * dpr}px system-ui, sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'left';
  ctx.fillText('0 Hz', 2 * dpr, barAreaH + 10 * dpr);
  ctx.textAlign = 'right';
  ctx.fillText(formatHz(TOTAL_BINS * BIN_HZ), w - 2 * dpr, barAreaH + 10 * dpr);
}
