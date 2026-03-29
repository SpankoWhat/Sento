import { cfg } from './config.js';
import { bandHistories } from './audio.js';
import { applySceneStyles, scene } from './scene.js';

// ─── Mouse-controlled camera state ──────────────────────────────────────────
export const mouseState = {
  x: 0,
  y: 0.3,
  targetX: 0,
  targetY: 0.3,
  lastMove: Date.now(),
  autoAngle: 0,
};

export function updateMouse() {
  mouseState.x += (mouseState.targetX - mouseState.x) * 0.05;
  mouseState.y += (mouseState.targetY - mouseState.y) * 0.05;
}

document.addEventListener('mousemove', (e) => {
  mouseState.targetX = (e.clientX / innerWidth - 0.5) * 2;
  mouseState.targetY = (e.clientY / innerHeight - 0.5) * 2;
  mouseState.lastMove = Date.now();
});

document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 0) {
    mouseState.targetX = (e.touches[0].clientX / innerWidth - 0.5) * 2;
    mouseState.targetY = (e.touches[0].clientY / innerHeight - 0.5) * 2;
    mouseState.lastMove = Date.now();
  }
});

function parseRgbTriplet(value) {
  return String(value).split(' ').map(Number).slice(0, 3);
}

// ─── Wallpaper Engine property listener ─────────────────────────────────────
window.wallpaperPropertyListener = {
  applyUserProperties: function(properties) {
    if (properties.traillength) {
      cfg.trailLength = properties.traillength.value;
        for (const hist of bandHistories) {
            while (hist.length > cfg.trailLength) hist.shift();
        }
    }
        if (properties.maxbin) {
            cfg.maxBin = properties.maxbin.value;
        }
        if (properties.bandcount) {
            cfg.bandCount = properties.bandcount.value;
        }
        if (properties.pointsize) {
            cfg.pointSize = properties.pointsize.value;
        }
        if (properties.pointopacity) {
            cfg.pointOpacity = properties.pointopacity.value;
    }
    if (properties.colorsaturation) {
      cfg.colorSaturation = properties.colorsaturation.value;
    }
    if (properties.colorhueshift) {
      cfg.colorHueShift = properties.colorhueshift.value;
    }
        if (properties.colorhuelow) {
            cfg.colorHueLow = properties.colorhuelow.value;
    }
        if (properties.colorhuehigh) {
            cfg.colorHueHigh = properties.colorhuehigh.value;
    }
    if (properties.backgroundcolor) {
      const rgb = parseRgbTriplet(properties.backgroundcolor.value);
      scene.background.setRGB(rgb[0], rgb[1], rgb[2]);
      scene.fog.color.setRGB(rgb[0], rgb[1], rgb[2]);
    }
    if (properties.fogdensity) {
      cfg.fogDensity = properties.fogdensity.value;
        applySceneStyles();
    }
    if (properties.spacescale) {
      cfg.spaceScale = properties.spacescale.value;
    }
        if (properties.bandspacing) {
            cfg.bandSpacing = properties.bandspacing.value;
        }
    if (properties.energysensitivity) {
      cfg.energySensitivity = properties.energysensitivity.value;
    }
    if (properties.glowintensity) {
        cfg.glowIntensity = properties.glowintensity.value;
    }
    if (properties.cameradistance) {
      cfg.camRadius = properties.cameradistance.value;
    }
    if (properties.cameraheight) {
      cfg.camHeight = properties.cameraheight.value;
    }
    if (properties.autorotate !== undefined) {
      cfg.autoRotate = properties.autorotate.value;
    }
    if (properties.autorotatespeed) {
      cfg.autoRotateSpeed = properties.autorotatespeed.value;
    }
  }
};
