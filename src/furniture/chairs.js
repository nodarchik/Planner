import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { M } from '../materials.js';
import { C, RB, S, add, lathe, sector, tube } from '../primitives.js';

export function shellChair(x, y, cx, cy, m = M.velvetTerra, base = M.brass) {
  const phi = Math.atan2(y - cy, x - cx);
  lathe([[0, 0], [.2, 0], [.2, .01], [.04, .03], [.022, .1], [.02, .41], [0, .41]], x, y, 0, base);
  lathe([[0, .40], [.22, .40], [.238, .415], [.24, .445], [.225, .475], [0, .48]], x, y, 0, m);
  sector(x, y, .195, .24, phi - 1.15, phi + 1.15, .44, .82, m, .018);
}
export function barStool(x, y) { // 0.65 m seat for a 0.90 m bar, with footrest
  C(x, y, .2, 0, .015, M.blackMetal); C(x, y, .022, .015, .62, M.blackMetal, { seg: 16 });
  add(new THREE.TorusGeometry(.17, .01, 8, 40).rotateX(Math.PI / 2), M.brass, x, .3, y, { uv: false });
  lathe([[0, .62], [.19, .62], [.2, .635], [.2, .66], [.18, .68], [0, .685]], x, y, 0, M.velvetTerra);
}
export function taskChair(x, y, face) { // swivel chair, face = plan angle the sitter looks toward
  for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, ex = x + Math.cos(a) * .3, ey = y + Math.sin(a) * .3;
    tube([[x, .09, y], [ex, .07, ey]], .014, M.blackMetal, { seg: 4, rs: 8 }); S(ex, ey, .03, .028, M.rubber); }
  C(x, y, .03, .09, .43, M.steel, { seg: 20 });
  RB(x - .23, y - .23, x + .23, y + .23, .43, .52, .05, M.boucleOat, { seg: 5 });
  const bx = x - Math.cos(face) * .24, by = y - Math.sin(face) * .24, g = new RoundedBoxGeometry(.44, .42, .07, 5, .03);
  g.rotateX(-.18); g.rotateY(-face - Math.PI / 2); add(g, M.boucleOat, bx, .8, by);
  tube([[x - Math.cos(face) * .2, .5, y - Math.sin(face) * .2], [bx - Math.cos(face) * .02, .62, by - Math.sin(face) * .02]], .012, M.blackMetal, { seg: 6 });
}
