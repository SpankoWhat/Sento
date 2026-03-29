import { cfg } from './config.js';
import { history } from './audio.js';
import { 
  THREE, 
  scene, 
  camera, 
  renderer, 
  instancedMesh, 
  instanceColors, 
  trailLineGeo, 
  trailLinePositions 
} from './scene.js';
import { mouseState, updateMouse } from './controls.js';

// ─── Update instanced mesh ──────────────────────────────────────────────────
const dummy = new THREE.Object3D();
const _col = new THREE.Color();
const graphCenter = new THREE.Vector3(0, 0, 0);

function updateMesh() {
  const n = history.length;
  instancedMesh.count = n;

  let cx = 0, cy = 0, cz = 0, totalWeight = 0;

  for (let i = 0; i < n; i++) {
    const p = history[i];
    const age = i / cfg.trailLength;
    const weight = 0.2 + age * 0.8;

    cx += p.x * weight;
    cy += p.y * weight;
    cz += p.z * weight;
    totalWeight += weight;

    dummy.position.set(p.x, p.y, p.z);
    const s = p.size * cfg.sphereSize * (0.3 + age * 0.7);
    dummy.scale.set(s, s, s);
    dummy.updateMatrix();
    instancedMesh.setMatrixAt(i, dummy.matrix);

    const lit = 0.25 + p.energy * 0.5 + age * 0.25;
    const hue = (p.hue + cfg.colorHueShift) % 1.0;
    _col.setHSL(hue, cfg.colorSaturation, lit * age);
    instanceColors[i * 3 + 0] = _col.r;
    instanceColors[i * 3 + 1] = _col.g;
    instanceColors[i * 3 + 2] = _col.b;

    trailLinePositions[i * 3 + 0] = p.x;
    trailLinePositions[i * 3 + 1] = p.y;
    trailLinePositions[i * 3 + 2] = p.z;
  }

  if (totalWeight > 0) {
    const targetCx = cx / totalWeight;
    const targetCy = cy / totalWeight;
    const targetCz = cz / totalWeight;
    graphCenter.x += (targetCx - graphCenter.x) * 0.05;
    graphCenter.y += (targetCy - graphCenter.y) * 0.05;
    graphCenter.z += (targetCz - graphCenter.z) * 0.05;
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  instancedMesh.instanceColor.needsUpdate = true;
  trailLineGeo.attributes.position.needsUpdate = true;
  trailLineGeo.setDrawRange(0, n);
}

// ─── Render loop ────────────────────────────────────────────────────────────
export function animate() {
  requestAnimationFrame(animate);

  const idleTime = Date.now() - mouseState.lastMove;
  if (cfg.autoRotate && idleTime > 3000) {
    mouseState.autoAngle += cfg.autoRotateSpeed * 0.01;
    mouseState.targetX = Math.sin(mouseState.autoAngle) * 0.8;
    mouseState.targetY = 0.2 + Math.sin(mouseState.autoAngle * 0.3) * 0.3;
  }

  updateMouse();

  const angle = mouseState.x * Math.PI;
  camera.position.x = graphCenter.x + Math.sin(angle) * cfg.camRadius;
  camera.position.z = graphCenter.z + Math.cos(angle) * cfg.camRadius;
  camera.position.y = graphCenter.y + cfg.camHeight - mouseState.y * 6;
  camera.lookAt(graphCenter);

  updateMesh();
  renderer.render(scene, camera);
}
