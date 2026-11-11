import { V3, camera, controls, state } from '../scene.js';

/* ================= camera views ================= */
const VIEWS = {
  overview: [[3.0, 12.5, 14.5], [7.0, 0, 3.6]], livingArea: [[10.3, 10.5, 5.6], [10.3, 0, 2.0]], top: [[7.0, 27, 3.801], [7.0, 0, 3.8]],
  living: [[8.2, 1.65, 2.35], [12.8, .8, 1.3]], kitchen: [[10.4, 1.6, 3.4], [7.6, 1.0, .6]], office: [[9.3, 1.6, 4.75], [12.8, .85, 6.4]],
  bed1: [[3.05, 1.6, 3.55], [.3, .9, 2.4]], closet: [[3.66, 1.6, 3.55], [3.66, 1.05, .2]], bed2: [[4.6, 1.55, 4.5], [1.5, .8, 6.8]], closet2: [[3.92, 1.6, 6.05], [4.95, 1.0, 7.05]],
  bath: [[6.25, 1.65, 2.6], [5.0, .8, .6]], wc: [[8.75, 1.6, 7.5], [7.3, .8, 8.8]], corridor: [[5.4, 1.55, 4.3], [7.0, 1.1, 3.2]],
  hall: [[6.25, 1.5, 6.95], [8.6, 1.2, 1.4]], entrance: [[6.25, 1.5, 6.95], [8.6, 1.2, 1.4]], console: [[6.0, 1.55, 4.9], [8.86, 1.3, 6.0]],
  loggiaW: [[-1.0, 1.6, 6.9], [-1.0, .6, 1.2]], loggiaE: [[14.85, 1.65, 7.0], [14.6, .6, .6]]
};

export function setView(name, instant) {
  const [p, t] = VIEWS[name]; document.getElementById('view').value = name;
  const to = { p: new V3(...p), t: new V3(...t) };
  if (instant) { camera.position.copy(to.p); controls.target.copy(to.t); controls.update(); return; }
  state.anim = { from: { p: camera.position.clone(), t: controls.target.clone() }, to, t0: performance.now() };
}
document.getElementById('view').onchange = e => setView(e.target.value);
