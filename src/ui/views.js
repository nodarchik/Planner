import { V3, camera, controls, state } from '../scene.js';
import { plan } from '../plan/plan.js';

/* ================= camera views ================= */
// camera presets live in the plan: views.<name> = { cam: [x, height, y], target: [x, height, y] }

export function setView(name, instant) {
  if (!plan.views[name]) name = Object.keys(plan.views)[0]; // a missing name falls back to the first view
  const { cam: p, target: t } = plan.views[name]; document.getElementById('view').value = name;
  const to = { p: new V3(...p), t: new V3(...t) };
  if (instant) { camera.position.copy(to.p); controls.target.copy(to.t); controls.update(); return; }
  state.anim = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, t0: performance.now() };
}
document.getElementById('view').onchange = e => setView(e.target.value);
