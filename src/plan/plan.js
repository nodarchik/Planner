// The apartment as data. Everything specific to Palace 1 lives in palace1.json.
// `plan` is the working copy the editor mutates; PUBLISHED is the file as committed.
import published from './palace1.json';
import { planGeom } from './geom.js';

export const PUBLISHED = published;
export const plan = structuredClone(published);
export let H = plan.meta.ceiling, CUT = plan.meta.cut; // live bindings: refreshGeom re-reads them
let G = planGeom(plan);
export const refreshGeom = () => { G = planGeom(plan); H = plan.meta.ceiling; CUT = plan.meta.cut; }; // call after walls, blocks or rooms change
export function setPlan(next) { for (const k of Object.keys(plan)) delete plan[k]; Object.assign(plan, structuredClone(next)); refreshGeom(); }
export const rectOf = id => G.rectOf(id), roomById = id => G.roomById(id), faceCoord = (id, side) => G.faceCoord(id, side), frameSpec = it => G.frameSpec(it), alongRoom = (room, side) => G.alongRoom(room, side);
export { wallRect, wallAxis, bbox, area, fmt, openingsOf, KIND, PASSABLE } from './geom.js';
