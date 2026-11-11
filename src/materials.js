import * as THREE from 'three';
import { V2 } from './scene.js';
import { planar, texFor, tvTex } from './textures.js';

/* ================= materials ================= */
export const emissives = [];
export function P(o) { const ni = o.nightIntensity; delete o.nightIntensity;
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ roughness: .8, metalness: 0 }, o));
  if (o.emissive !== undefined) { m.userData.night = ni ?? 3; m.userData.day = o.emissiveIntensity ?? 0; emissives.push(m); }
  return m; }
export function T(set, tile, o = {}) { const t = texFor(set, tile); const ns = o.normalScale ?? 1; delete o.normalScale;
  return P(Object.assign({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, normalScale: new V2(ns, ns) }, o)); }
export const M = {};
export function buildMaterials() {
  Object.assign(M, {
    wall: T('plaster', 2, { normalScale: .35 }),
    ceiling: T('plaster', 2, { normalScale: .2 }),
    skirting: P({ color: 0xefe8df, roughness: .45 }),
    oakFloor: T('oak', 1.6, { normalScale: .6 }),
    chevron: T('chevron', 2.4, { normalScale: .5, clearcoat: .25, clearcoatRoughness: .5 }),
    plasterArt: T('plaster', .6, { color: 0xf1e8db, normalScale: 4 }),
    blush: P({ color: 0xf2b8bf, roughness: .7, sheen: .5, sheenColor: 0xffe0e4 }),
    trav: T('trav', 1.2, { normalScale: .5 }),
    travSmall: T('trav', .8, { normalScale: .5 }),
    marble: T('marble', 1.4, { clearcoat: .7, clearcoatRoughness: .06 }),
    micro: T('micro', 2.4, { normalScale: .4 }),
    concrete: T('micro', 3, { color: 0xd8d2c8, normalScale: .6 }),
    deck: T('deck', 2.0, { normalScale: .8 }),
    boucle: T('boucle', .16, { color: 0xf0e9de, sheen: 1, sheenColor: 0xffffff, sheenRoughness: .7, normalScale: 1.4 }),
    boucleOat: T('boucle', .16, { color: 0xd9ccb8, sheen: 1, sheenColor: 0xfff4e4, sheenRoughness: .7, normalScale: 1.4 }),
    linenWhite: T('linen', .1, { color: 0xf5f2ec, sheen: .6, sheenColor: 0xffffff, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenSand: T('linen', .1, { color: 0xdcc3a0, sheen: .6, sheenColor: 0xfff1dc, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenSage: T('linen', .1, { color: 0x9da88c, sheen: .6, sheenColor: 0xe6f0d6, sheenRoughness: .5, side: THREE.DoubleSide }),
    linenOut: T('linen', .14, { color: 0xe6ddcf, sheen: .4, sheenRoughness: .6 }),
    velvetTerra: T('velvet', .25, { color: 0xae4f2c, sheen: 1, sheenColor: 0xff9e74, sheenRoughness: .32, normalScale: .5 }),
    velvetSage: T('velvet', .25, { color: 0x75845f, sheen: 1, sheenColor: 0xcfe0b4, sheenRoughness: .32, normalScale: .5 }),
    velvetToffee: T('velvet', .25, { color: 0x94562f, sheen: 1, sheenColor: 0xffc08a, sheenRoughness: .32, normalScale: .5 }),
    velvetChoco: T('velvet', .25, { color: 0x4b2d22, sheen: 1, sheenColor: 0xb07a5c, sheenRoughness: .35, normalScale: .5 }),
    walnut: T('wood', .7, { color: 0x7a5236 }),
    oakFurn: T('wood', .7, { color: 0xd2a676 }),
    lacquerCream: P({ color: 0xe8dfd2, roughness: .32, clearcoat: 1, clearcoatRoughness: .1 }),
    lacquerChoco: P({ color: 0x4a2f24, roughness: .38, clearcoat: 1, clearcoatRoughness: .08 }),
    carcass: P({ color: 0x1d1916, roughness: .8 }),
    brass: P({ color: 0xd8b273, metalness: 1, roughness: .26 }),
    steel: P({ color: 0xcfcfcf, metalness: 1, roughness: .3 }),
    steelDark: P({ color: 0x8c8c8c, metalness: 1, roughness: .38 }),
    blackMetal: P({ color: 0x1a1918, metalness: .7, roughness: .45 }),
    frame: P({ color: 0x302c28, metalness: .6, roughness: .42 }),
    glass: P({ color: 0xffffff, roughness: 0, transmission: 1, thickness: .008, ior: 1.5, specularIntensity: 1 }),
    glassRail: P({ color: 0xe2ecea, roughness: .02, transmission: 1, thickness: .012, ior: 1.5 }),
    glassTint: P({ color: 0xdfe6df, roughness: .03, transmission: 1, thickness: .012, ior: 1.5 }),
    opal: P({ color: 0xfff8ef, roughness: .45, transmission: .55, thickness: .02, emissive: 0xffd6a2, emissiveIntensity: 0, nightIntensity: 2.2 }),
    ceramic: P({ color: 0xf6f3ee, roughness: .14, clearcoat: .6, clearcoatRoughness: .05 }),
    stoneware: T('micro', .4, { color: 0xd7cbbd, normalScale: .8 }),
    stonewareDark: T('micro', .4, { color: 0x6b5a4d, normalScale: .8 }),
    resin: P({ color: 0xf4f2ee, roughness: .28, clearcoat: .4, clearcoatRoughness: .2 }),
    water: P({ color: 0xd8eef0, roughness: .02, transmission: 1, thickness: .2, ior: 1.33 }),
    mirror: P({ color: 0xf2f2f2, metalness: 1, roughness: .015 }),
    blackGlass: P({ color: 0x08080a, roughness: .06, clearcoat: 1, clearcoatRoughness: .02 }),
    screen: P({ color: 0x050506, roughness: .08, clearcoat: 1, emissive: 0xffffff, emissiveMap: planar(tvTex, 7.51, 1.01, 1.38, .76), emissiveIntensity: 0, nightIntensity: 1.6 }),
    led: P({ color: 0xfff1db, emissive: 0xffc98a, emissiveIntensity: 0, nightIntensity: 2.5 }),
    leaf: P({ color: 0x3f5e33, roughness: .5, side: THREE.DoubleSide, sheen: .3, sheenColor: 0x9fcf80 }),
    leafOlive: P({ color: 0x7a8a68, roughness: .6, side: THREE.DoubleSide, sheen: .4, sheenColor: 0xd8e6c8 }),
    leafSnake: P({ color: 0x2f4b2c, roughness: .35, side: THREE.DoubleSide, clearcoat: .3 }),
    bark: T('wood', .25, { color: 0x6c5b4b, normalScale: 2 }),
    soil: P({ color: 0x33271f, roughness: 1 }),
    pebble: P({ color: 0xbdb3a6, roughness: .7 }),
    rug: T('wool', .25, { color: 0xd5c2a6, normalScale: 1.2 }),
    rugDark: T('wool', .25, { color: 0x8f6a4c, normalScale: 1.2 }),
    sheer: P({ color: 0xf6f2ea, roughness: .95, transparent: true, opacity: .72, side: THREE.DoubleSide, sheen: .6, sheenColor: 0xffffff, depthWrite: false }),
    paper: P({ color: 0xf1ebe0, roughness: .9 }),
    book1: P({ color: 0x8c3b2a, roughness: .7 }), book2: P({ color: 0x2d3b36, roughness: .7 }), book3: P({ color: 0xd8c9a8, roughness: .7 }),
    fruit: P({ color: 0xe0761f, roughness: .45, clearcoat: .3 }),
    towel: T('boucle', .08, { color: 0xeee6da, sheen: .6, sheenRoughness: .8, normalScale: 1.6 }),
    rubber: P({ color: 0x151515, roughness: .9 }),
    plastic: P({ color: 0x1c1c1d, roughness: .55 }),
    display: P({ color: 0x050506, roughness: .05, clearcoat: 1, emissive: 0x7fb0ff, emissiveIntensity: .06, nightIntensity: .6 }),
    rattan: T('linen', .045, { color: 0xb88d5c, roughness: 1, normalScale: 3, side: THREE.DoubleSide }),
    rattanDark: T('wood', .3, { color: 0x8a6440 }),
    laptop: P({ color: 0x0c0f16, roughness: .1, emissive: 0x9db8e8, emissiveIntensity: .12, nightIntensity: .5 })
  });
}
