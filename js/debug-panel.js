import { cfg } from './config.js';
import { bandHistories } from './audio.js';
import { applySceneStyles, scene } from './scene.js';

// ─── Debug Panel ────────────────────────────────────────────────────────────
// Mirrors every Wallpaper Engine property from project.json as an in-browser
// control panel.  Only instantiated outside WE (see main.js).

// Map from WE property key → cfg key  (only where they differ)
const keyMap = {
  maxbin: 'maxBin',
  bandcount: 'bandCount',
  traillength:      'trailLength',
  pointsize: 'pointSize',
  pointopacity: 'pointOpacity',
  colorsaturation:  'colorSaturation',
  colorhuelow: 'colorHueLow',
  colorhuehigh: 'colorHueHigh',
  colorhueshift: 'colorHueShift',
  spacescale:       'spaceScale',
  bandspacing: 'bandSpacing',
  energysensitivity: 'energySensitivity',
  glowintensity: 'glowIntensity',
  cameradistance:   'camRadius',
  cameraheight:     'camHeight',
  camtheta: 'camTheta',
};

// Side-effects that mirror controls.js wallpaperPropertyListener logic
function applySideEffects(weKey) {
  switch (weKey) {
    case 'traillength':
      for (const hist of bandHistories) {
        while (hist.length > cfg.trailLength) hist.shift();
      }
      break;
    case 'glowintensity':
      applySceneStyles();
      break;
    case 'backgroundcolor': {
      const rgb = cfg._bgColor ?? [0.02, 0.02, 0.03];
      scene.background.setRGB(rgb[0], rgb[1], rgb[2]);
      break;
    }
  }
}

// ─── Condition evaluator ────────────────────────────────────────────────────
// Evaluates simple WE condition strings like "colormode.value == 'hybrid'"
// against current cfg values.
function evaluateCondition(cond, properties) {
  if (!cond) return true;
  try {
    // Replace property.value references with actual current values
    const expr = cond.replace(/(\w+)\.value/g, (_, key) => {
      const cfgKey = keyMap[key] || key;
      const val = cfg[cfgKey];
      if (typeof val === 'string') return `'${val}'`;
      return String(val);
    });
    return new Function(`return (${expr})`)();
  } catch {
    return true;
  }
}

// ─── RGB helpers ────────────────────────────────────────────────────────────
function tripletToHex(triplet) {
  const [r, g, b] = triplet.split(' ').map(Number);
  const to8 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
  return '#' + [to8(r), to8(g), to8(b)].map(c => c.toString(16).padStart(2, '0')).join('');
}

function hexToTriplet(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b];
}

// ─── Panel builder ──────────────────────────────────────────────────────────
export async function createDebugPanel() {
  // Fetch the property definitions from project.json
  let properties;
  try {
    const res = await fetch('project.json');
    const json = await res.json();
    properties = json.general.properties;
  } catch (e) {
    console.warn('[debug-panel] Could not load project.json:', e);
    return;
  }

  // Container
  const panel = document.createElement('div');
  panel.id = 'debug-panel';

  // Header with collapse toggle
  const header = document.createElement('div');
  header.className = 'dp-header';
  header.innerHTML = `<span>⚙ Debug Panel</span><button id="dp-toggle">−</button>`;
  panel.appendChild(header);

  const body = document.createElement('div');
  body.className = 'dp-body';
  panel.appendChild(body);

  header.querySelector('#dp-toggle').addEventListener('click', () => {
    const collapsed = body.style.display === 'none';
    body.style.display = collapsed ? '' : 'none';
    header.querySelector('#dp-toggle').textContent = collapsed ? '−' : '+';
  });

  // Track rows for condition-based visibility updates
  const rows = [];

  // Build controls for each property
  for (const [weKey, prop] of Object.entries(properties)) {
    const cfgKey = keyMap[weKey] || weKey;
    const row = document.createElement('div');
    row.className = 'dp-row';
    row.dataset.condition = prop.condition || '';
    row.dataset.weKey = weKey;

    const label = document.createElement('label');
    label.textContent = prop.text;
    row.appendChild(label);

    if (prop.type === 'slider') {
      const wrap = document.createElement('div');
      wrap.className = 'dp-slider-wrap';

      const range = document.createElement('input');
      range.type = 'range';
      range.min = prop.min;
      range.max = prop.max;
      range.step = prop.step;
      range.value = cfg[cfgKey] ?? prop.value;

      const val = document.createElement('span');
      val.className = 'dp-value';
      val.textContent = range.value;

      range.addEventListener('input', () => {
        const v = Number(range.value);
        cfg[cfgKey] = v;
        val.textContent = v % 1 === 0 ? v : v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
        applySideEffects(weKey);
        updateConditions();
      });

      wrap.appendChild(range);
      wrap.appendChild(val);
      row.appendChild(wrap);

    } else if (prop.type === 'combo') {
      const select = document.createElement('select');
      for (const opt of prop.options) {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if ((cfg[cfgKey] ?? prop.value) === opt.value) o.selected = true;
        select.appendChild(o);
      }
      select.addEventListener('change', () => {
        cfg[cfgKey] = select.value;
        applySideEffects(weKey);
        updateConditions();
      });
      row.appendChild(select);

    } else if (prop.type === 'bool') {
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = cfg[cfgKey] ?? prop.value;
      cb.addEventListener('change', () => {
        cfg[cfgKey] = cb.checked;
        applySideEffects(weKey);
        updateConditions();
      });
      row.appendChild(cb);

    } else if (prop.type === 'color') {
      const color = document.createElement('input');
      color.type = 'color';
      const defaultTriplet = prop.value; // e.g. "0.20 0.72 1.0"
      color.value = tripletToHex(defaultTriplet);

      color.addEventListener('input', () => {
        const rgb = hexToTriplet(color.value);
        if (weKey === 'accentcolor') {
          cfg.accentColor = rgb;
        } else if (weKey === 'backgroundcolor') {
          cfg._bgColor = rgb;
        }
        applySideEffects(weKey);
      });
      row.appendChild(color);
    }

    body.appendChild(row);
    rows.push(row);
  }

  function updateConditions() {
    for (const row of rows) {
      const cond = row.dataset.condition;
      if (cond) {
        row.style.display = evaluateCondition(cond, properties) ? '' : 'none';
      }
    }
  }

  // Initial visibility pass
  updateConditions();

  document.body.appendChild(panel);

  // Make panel draggable by header
  let dragging = false, dx = 0, dy = 0;
  header.addEventListener('pointerdown', (e) => {
    if (e.target.tagName === 'BUTTON') return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    dx = e.clientX - rect.left;
    dy = e.clientY - rect.top;
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    panel.style.left = (e.clientX - dx) + 'px';
    panel.style.top = (e.clientY - dy) + 'px';
    panel.style.right = 'auto';
  });
  header.addEventListener('pointerup', () => { dragging = false; });

  console.log('[debug-panel] Initialized with', Object.keys(properties).length, 'properties');
}
