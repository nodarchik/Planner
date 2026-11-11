// The apartment as data. Everything specific to Palace 1 lives in palace1.json; this module only reads it.
import data from './palace1.json';
import { planGeom } from './geom.js';

export const plan = data;
export const H = plan.meta.ceiling, CUT = plan.meta.cut;
export const { rectOf, roomById, faceCoord, frameSpec, alongRoom } = planGeom(plan);
export { wallRect, wallAxis, bbox, area, fmt, openingsOf, KIND, PASSABLE } from './geom.js';
