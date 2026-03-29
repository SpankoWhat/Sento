import { cfg } from './config.js';
import { history } from './audio.js';
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
      while (history.length > cfg.trailLength) history.shift();
    }
    if (properties.spheresize) {
      cfg.sphereSize = properties.spheresize.value;
    }
    if (properties.lineopacity) {
      cfg.lineOpacity = properties.lineopacity.value;
      applySceneStyles();
    }
    if (properties.colorsaturation) {
      cfg.colorSaturation = properties.colorsaturation.value;
    }
    if (properties.colorhueshift) {
      cfg.colorHueShift = properties.colorhueshift.value;
    }
    if (properties.colormode) {
      cfg.colorMode = properties.colormode.value;
    }
    if (properties.colormix) {
      cfg.colorMix = properties.colormix.value;
    }
    if (properties.accentcolor) {
      cfg.accentColor = parseRgbTriplet(properties.accentcolor.value);
    }
    if (properties.backgroundcolor) {
      const rgb = parseRgbTriplet(properties.backgroundcolor.value);
      scene.background.setRGB(rgb[0], rgb[1], rgb[2]);
      scene.fog.color.setRGB(rgb[0], rgb[1], rgb[2]);
    }
    if (properties.fogdensity) {
      cfg.fogDensity = properties.fogdensity.value;
      scene.fog.density = cfg.fogDensity;
    }
    if (properties.spacescale) {
      cfg.spaceScale = properties.spacescale.value;
    }
    if (properties.energysensitivity) {
      cfg.energySensitivity = properties.energysensitivity.value;
    }
    if (properties.mappingmode) {
      cfg.mappingMode = properties.mappingmode.value;
    }
    if (properties.xfeature) {
      cfg.xFeature = properties.xfeature.value;
    }
    if (properties.yfeature) {
      cfg.yFeature = properties.yfeature.value;
    }
    if (properties.zfeature) {
      cfg.zFeature = properties.zfeature.value;
    }
    if (properties.xemphasis) {
      cfg.xEmphasis = properties.xemphasis.value;
    }
    if (properties.yemphasis) {
      cfg.yEmphasis = properties.yemphasis.value;
    }
    if (properties.zemphasis) {
      cfg.zEmphasis = properties.zemphasis.value;
    }
    if (properties.glowintensity) {
      cfg.glowIntensity = properties.glowintensity.value;
      applySceneStyles();
    }
    if (properties.breathingamount) {
      cfg.breathingAmount = properties.breathingamount.value;
    }
    if (properties.pulseamount) {
      cfg.pulseAmount = properties.pulseamount.value;
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
