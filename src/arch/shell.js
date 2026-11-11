import * as THREE from 'three';
import { H, V3, world } from '../scene.js';
import { M } from '../materials.js';
import { B, C, add } from '../primitives.js';
import { DOOR, TDOOR, WIN, door, skirt, wallX, wallY } from './walls.js';

export function buildArchitecture() {
  // plan coordinates in metres: x east from the bedrooms' west wall, y south from the north wall (scaled from the 1:100 plan, 71.4 px/m)
  const W0 = -2.0, W1 = 15.9;
  B(W0, -0.29, W1, 7.39, -.36, -.05, M.concrete, { clamp: false }); B(6.86, 7.39, 9.06, 9.30, -.36, -.05, M.concrete, { clamp: false });
  // floors
  B(0, 0, 4.59, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(4.59, 2.87, 7.07, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(7.07, 0, 13.62, 7.13, -.05, 0, M.oakFloor, { clamp: false });
  B(4.69, 0, 7.07, 2.77, -.05, .008, M.micro, { clamp: false });
  B(7.06, 7.39, 8.86, 9.06, -.05, .008, M.micro, { clamp: false });
  B(-1.85, 0, -0.25, 7.13, -.05, -.02, M.deck, { clamp: false }); B(13.87, 0, 15.75, 7.13, -.05, -.02, M.deck, { clamp: false });
  // exterior walls
  wallX(-0.29, 0, -0.25, 13.87);
  wallX(7.13, 7.39, -0.25, 6.86, [DOOR(5.23, 6.18)]);
  wallX(7.13, 7.39, 6.86, 9.06, [DOOR(7.96, 8.73)]);
  wallX(7.13, 7.39, 9.06, 13.87);
  B(6.86, 7.39, 7.06, 9.30, 0, H, M.wall); B(8.86, 7.39, 9.06, 9.30, 0, H, M.wall); B(6.86, 9.06, 9.06, 9.30, 0, H, M.wall);
  wallY(-0.25, 0, 0, 7.13, [WIN(1.63, 2.83), TDOOR(2.84, 3.61), TDOOR(4.74, 5.48), WIN(5.48, 6.71)], 1);
  wallY(13.62, 13.87, 0, 7.13, [WIN(.89, 1.69), TDOOR(1.69, 2.48), WIN(2.48, 3.28), TDOOR(4.71, 5.51), WIN(5.51, 6.55)], -1);
  // balconies: open, no walls — frameless glass balustrade (1.05 m) with a steel handrail on the three open sides
  [[-1.99, -0.25, -1], [15.89, 13.87, 1]].forEach(([xo, xi, sg]) => {
    const edge = [[xi, -0.27], [xo, -0.27], [xo, 7.37], [xi, 7.37]];
    for (let k = 0; k < 3; k++) { const [ax, ay] = edge[k], [bx, by] = edge[k + 1], len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
      add(new THREE.BoxGeometry(len, .98, .012), M.glassRail, (ax + bx) / 2, .05 + .49, (ay + by) / 2, { rotY: -ang, cast: false });
      add(new THREE.BoxGeometry(len + .02, .06, .05), M.frame, (ax + bx) / 2, .0, (ay + by) / 2, { rotY: -ang }); }
    const c = new THREE.CurvePath(); for (let k = 0; k < 3; k++) c.add(new THREE.LineCurve3(new V3(edge[k][0], 1.05, edge[k][1]), new V3(edge[k + 1][0], 1.05, edge[k + 1][1])));
    add(new THREE.TubeGeometry(c, 120, .022, 12, false), M.steel, 0, 0, 0); });
  // partitions
  wallX(3.98, 4.08, 0, 5.16);
  wallY(4.59, 4.69, 0, 3.98, [DOOR(3.05, 3.85)]);
  wallX(2.77, 2.87, 4.69, 7.07, [DOOR(5.47, 6.27)]);
  wallY(7.07, 7.17, 0, 2.87);
  wallY(5.06, 5.16, 4.08, 7.13, [DOOR(4.89, 5.79)]);
  // column at the kitchen bar, riser shafts (office, bathroom)
  B(8.86, 0, 9.35, .2, 0, H, M.wall);
  B(9.25, 6.64, 10.88, 7.13, 0, H, M.wall);
  B(4.98, 0, 6.29, .48, 0, H, M.wall);
  // door leaves
  door(4.59, 3.85, 0, -1, .8, 1.25, -1, M.skirting);
  door(5.06, 4.89, 0, 1, .9, 1.25, 1, M.skirting);
  door(5.47, 2.77, 1, 0, .8, 1.3, -1, M.skirting);
  door(8.73, 7.13, -1, 0, .77, 1.3, 1, M.skirting);
  door(6.18, 7.13, -1, 0, .95, 1.3, 1, M.walnut, { handle: 'brass' });
  // skirting
  skirt('x', 0, 1, 0, 4.59); skirt('y', 0, 1, 0, 3.98, [[2.84, 3.61]]); skirt('x', 3.98, -1, 0, 4.59); skirt('y', 4.59, -1, 0, 3.98, [[3.05, 3.85]]);
  skirt('x', 4.08, 1, 0, 5.06); skirt('y', 0, 1, 4.08, 7.13, [[4.74, 5.48]]); skirt('x', 7.13, -1, 0, 5.06); skirt('y', 5.06, -1, 4.08, 7.13, [[4.89, 5.79]]);
  skirt('x', 0, 1, 7.17, 13.62); skirt('y', 7.17, 1, 0, 2.87); skirt('y', 13.62, -1, 0, 7.13, [[1.69, 2.48], [4.71, 5.51]]);
  skirt('x', 7.13, -1, 9.06, 9.25); skirt('x', 7.13, -1, 10.88, 13.62); skirt('x', 6.64, -1, 9.25, 10.88);
  skirt('x', 7.13, -1, 5.16, 8.86, [[5.23, 6.18], [7.96, 8.73]]); skirt('y', 5.16, 1, 4.08, 7.13, [[4.89, 5.79]]);
  skirt('y', 4.69, 1, 2.87, 3.98, [[3.05, 3.85]]); skirt('x', 2.87, 1, 4.69, 7.07, [[5.47, 6.27]]);
  // bathroom + guest WC finishes
  B(4.69, 0, 4.98, .005, .008, H, M.travSmall); B(6.29, 0, 7.07, .005, .008, H, M.travSmall); B(4.98, .48, 6.29, .485, .008, H, M.marble);
  B(4.69, .005, 4.695, 2.77, .008, H, M.travSmall); B(7.065, .005, 7.07, 2.77, .008, H, M.travSmall);
  B(4.695, 2.765, 5.47, 2.77, .008, H, M.travSmall); B(6.27, 2.765, 7.065, 2.77, .008, H, M.travSmall);
  B(7.06, 7.39, 7.065, 9.06, .008, H, M.micro); B(8.855, 7.39, 8.86, 9.06, .008, H, M.micro); B(7.065, 9.055, 8.855, 9.06, .008, H, M.micro);
  // ceiling (shown from eye level)
  const ceil = new THREE.Group(); world.add(ceil); ceil.userData.ceiling = true;
  B(-0.25, -0.29, 13.87, 7.39, H, H + .06, M.ceiling, { parent: ceil, clamp: false, cast: false }); B(6.86, 7.39, 9.06, 9.30, H, H + .06, M.ceiling, { parent: ceil, clamp: false, cast: false });
  [[1.0, 1.0], [3.5, 1.0], [3.5, 3.4], [1.0, 5.5], [3.6, 5.5], [5.9, 1.4], [5.9, 3.5], [6.0, 5.6], [7.9, 5.6], [7.9, 8.2], [9.5, 4.3], [12.4, 4.6], [12.4, 6.2], [9.6, 5.5], [8.2, 1.6], [10.6, 1.6], [12.6, 1.6]].forEach(([x, y]) => {
    C(x, y, .048, H - .004, H, M.blackMetal, { parent: ceil, cast: false }); C(x, y, .036, H - .006, H - .004, M.led, { parent: ceil, cast: false }); });
  return ceil;
}
