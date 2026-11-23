import * as THREE from 'three';

/* Photo render denoiser. The path-traced HDR image is divided by a flat-lit raster guide (surface colour and texture),
   so only the lighting is filtered and texture detail is untouched. The filter is an edge-avoiding a-trous (normals,
   depth, guide) on linear light, so brightness is kept (filtering after tone mapping came out up to a third too dark).
   A lighting difference is kept when it is larger than the noise measured there (neighbourhood spread, bounded by the
   difference of two halves of the samples), so the filter eases off by itself where the image has converged and as
   samples rise. Tone mapping (ACES + sRGB) runs last. */

// tunables. clamp: firefly cap in standard deviations above the neighbourhood mean. steps / tol: per pass the tap spacing
// and how many standard deviations of noise a lighting difference may be before it counts as detail. tgain: head room on
// the half-difference noise estimate (it reads low, up to 3x measured, because a pixel's samples are correlated). vgain: how much less the
// noise shrinks per pass than independent pixels would (heavy-tailed noise; 1 leaves blotches at 32 samples).
// sigmaG2: guide (surface colour) stop, wider with depth of field.
export const TUNE = { clamp: 4, steps: [1, 2, 4, 8, 16], tol: [5, 3, 2.5, 2, 2], tgain: 8, vgain: 4, sigmaG2: 0.1, sigmaG2Dof: 0.12 };

const FULL_VERT = /* glsl */`
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const ND_VERT = /* glsl */`
varying vec3 vNorm;
varying vec4 vViewPos;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewPos = mv;
  vNorm = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;

const ND_FRAG = /* glsl */`
varying vec3 vNorm;
varying vec4 vViewPos;
void main() {
  vec3 n = normalize(vNorm) * (gl_FrontFacing ? 1.0 : -1.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, max(-vViewPos.z, 0.002));
}`;

const COMMON = /* glsl */`
const vec3 LUM = vec3(0.2126, 0.7152, 0.0722);
uniform bool uFlat;
// surface colour to divide out: the flat-lit guide, floored so dark and metallic surfaces stay finite; 1 for sky, and
// everywhere with depth of field (uFlat: the image is defocused, the guide is not)
vec3 albedoAt(sampler2D guide, ivec2 p, float depth) {
  return depth > 0.001 && !uFlat ? max(texelFetch(guide, p, 0).rgb, vec3(0.03)) : vec3(1.0);
}
// same surface: depth and normals agree. A 2 % floor on the normal test lets slivers with no like-facing neighbour
// (bevels, edges one pixel wide) borrow from the surfaces around them instead of staying noisy
float surfW(vec4 nd0, vec4 ndq) {
  vec3 dn = nd0.rgb - ndq.rgb;
  float dd = nd0.a - ndq.a;
  return exp(-(dd * dd) / (0.0009 * nd0.a * nd0.a + 1e-4)) * (exp(-dot(dn, dn) / 0.02) + 0.02);
}`;

// luminance of the accumulated image, kept at two sample counts: the difference of the halves gives the noise level
const SNAP_FRAG = /* glsl */`
uniform sampler2D tSrc;
void main() {
  vec3 c = max(texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0).rgb, vec3(0.0));
  gl_FragColor = vec4(min(dot(c, vec3(0.2126, 0.7152, 0.0722)), 6.0e4), 0.0, 0.0, 1.0);
}`;

// resolved multisampled guide -> surface colour: divided by coverage so sky (cleared, alpha 0) does not darken silhouettes
const GUIDE_FRAG = /* glsl */`
uniform sampler2D tSrc;
void main() {
  vec4 c = texelFetch(tSrc, ivec2(gl_FragCoord.xy), 0);
  gl_FragColor = vec4(c.a > 0.01 ? c.rgb / min(c.a, 1.0) : c.rgb, 1.0);
}`;

// rgb = lighting (HDR x exposure / surface colour), fireflies capped; a = variance of its luminance
const PREP_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform sampler2D tND;
uniform sampler2D tGuide;
uniform sampler2D tHalf;
uniform float uGain;
uniform float uHalf;
uniform float uSpatial;
uniform float uTGain;
uniform float uClamp;
${COMMON}
void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(tSrc, 0);
  vec3 hdr = min(max(texelFetch(tSrc, p, 0).rgb, vec3(0.0)) * uGain, vec3(6.0e4));
  vec4 nd0 = texelFetch(tND, p, 0);
  if (nd0.a <= 0.001) {
    gl_FragColor = vec4(hdr, 0.0);
    return;
  }
  float L[25];
  float D[25];
  float W[25];
  float sw = 0.0, s1 = 0.0;
  for (int i = 0; i < 25; i++) {
    ivec2 q = p + ivec2(i % 5 - 2, i / 5 - 2);
    W[i] = 0.0; L[i] = 0.0; D[i] = 0.0;
    if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
    vec4 ndq = texelFetch(tND, q, 0);
    if (ndq.a <= 0.001) continue;
    vec3 hq = max(texelFetch(tSrc, q, 0).rgb, vec3(0.0)) * uGain;
    float raw = dot(hq, LUM);
    float k = 1.0 / dot(albedoAt(tGuide, q, ndq.a), LUM);
    W[i] = surfW(nd0, ndq);
    L[i] = min(raw * k, 3.0e4);
    D[i] = (texelFetch(tHalf, q, 0).r * uGain - raw) * k;
    if (i != 12) { sw += W[i]; s1 += W[i] * L[i]; }
  }
  float mean = sw > 1e-3 ? s1 / sw : L[12];
  // firefly cap: the neighbours' mean plus uClamp of their standard deviations (the pixel itself has no say)
  float ov = 0.0;
  for (int i = 0; i < 25; i++) if (i != 12) ov += W[i] * max(D[i] * D[i] * uHalf, (L[i] - mean) * (L[i] - mean));
  float cap = sw > 1e-3 ? mean + uClamp * sqrt(ov / sw) + 0.05 * mean + 0.02 : 3.0e4;
  float tw = 0.0, tv = 0.0, t1 = 0.0, t2 = 0.0;
  for (int i = 0; i < 25; i++) {
    float l = min(L[i], cap);
    float d = clamp(D[i], -cap, cap);
    tw += W[i]; tv += W[i] * d * d; t1 += W[i] * l; t2 += W[i] * l * l;
  }
  float temporal = uHalf * tv / tw;
  float spatial = max(t2 / tw - (t1 / tw) * (t1 / tw), 0.0);
  // noise level: the spread of the neighbourhood is right on evenly lit surfaces but also counts lighting detail as noise;
  // the two halves see only noise, though less of it than there is (a pixel's samples are not independent), so they bound it
  float vr = uHalf > 0.0 ? min(spatial, uTGain * temporal + uSpatial * spatial) : spatial;
  vec3 e = min(hdr / albedoAt(tGuide, p, nd0.a), vec3(3.0e4)); // half floats end at 65504
  float l0 = dot(e, LUM);
  if (l0 > cap) e *= cap / l0;
  gl_FragColor = vec4(e, min(vr, 1.0e4));
}`;

const ATROUS_FRAG = /* glsl */`
uniform sampler2D tIn;
uniform sampler2D tND;
uniform sampler2D tGuide;
uniform int uStep;
uniform float uTol;
uniform float uVGain;
uniform float uSigmaG2;
uniform bool uFinal;
${COMMON}
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

// ACES filmic as in three.js; the exposure is already in the colour
vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327),
    vec3(-0.53108,  1.10813, -0.07276),
    vec3(-0.07367, -0.00605,  1.07602)
  );
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}

float b3(int i) {
  int a = i < 0 ? -i : i;
  return a == 0 ? 0.375 : (a == 1 ? 0.25 : 0.0625);
}

vec3 guideSRGB(ivec2 p) {
  return pow(max(texelFetch(tGuide, p, 0).rgb, vec3(0.0)), vec3(1.0 / 2.2));
}

vec4 finish(vec4 c, ivec2 p, float depth) {
  return uFinal ? vec4(linearToSRGB(ACESFilmic(c.rgb * albedoAt(tGuide, p, depth))), 1.0) : c;
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(tIn, 0);
  vec4 c0 = texelFetch(tIn, p, 0);
  vec4 nd0 = texelFetch(tND, p, 0);
  if (nd0.a <= 0.001) {
    gl_FragColor = finish(c0, p, 0.0);
    return;
  }
  vec3 g0 = guideSRGB(p);
  float l0 = dot(c0.rgb, LUM);
  // noise level here: smoothed variance (3x3) so one lucky pixel does not switch the filter off
  float v0 = 0.0, vw = 0.0;
  for (int dy = -1; dy <= 1; dy++) {
    for (int dx = -1; dx <= 1; dx++) {
      ivec2 q = clamp(p + ivec2(dx, dy), ivec2(0), sz - 1);
      vec4 ndq = texelFetch(tND, q, 0);
      if (ndq.a <= 0.001) continue;
      float w = b3(dx) * b3(dy) * surfW(nd0, ndq);
      v0 += w * texelFetch(tIn, q, 0).a; vw += w;
    }
  }
  float var0 = max(v0 / vw, 0.0) + 1.6e-5 * l0 * l0 + 1e-8;

  vec3 acc = vec3(0.0);
  float vacc = 0.0, vlin = 0.0, wsum = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    float ky = b3(dy);
    for (int dx = -2; dx <= 2; dx++) {
      ivec2 q = p + ivec2(dx, dy) * uStep;
      if (q.x < 0 || q.y < 0 || q.x >= sz.x || q.y >= sz.y) continue;
      vec4 ndq = texelFetch(tND, q, 0);
      if (ndq.a <= 0.001) continue;
      vec4 cq = texelFetch(tIn, q, 0);
      vec3 dg = g0 - guideSRGB(q);
      float wg = exp(-dot(dg, dg) / uSigmaG2);
      float dl = l0 - dot(cq.rgb, LUM);
      float wl = exp(-max(dl * dl / (var0 + cq.a) - uTol * uTol, 0.0));
      float w = ky * b3(dx) * surfW(nd0, ndq) * wg * wl;
      acc += cq.rgb * w;
      vacc += cq.a * w * w;
      vlin += cq.a * w;
      wsum += w;
    }
  }
  gl_FragColor = finish(wsum > 0.0 ? vec4(acc / wsum, min(uVGain * vacc / (wsum * wsum), vlin / wsum)) : c0, p, nd0.a);
}`;

const makeRT = (type, depthBuffer, format = THREE.RGBAFormat) => new THREE.WebGLRenderTarget(1, 1, {
  type,
  format,
  depthBuffer,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
});
const quadMat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ vertexShader: FULL_VERT, fragmentShader, uniforms, depthTest: false, depthWrite: false });

export function createDenoiser(renderer) {
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const ndMat = new THREE.ShaderMaterial({ vertexShader: ND_VERT, fragmentShader: ND_FRAG, side: THREE.DoubleSide });
  const snapMat = quadMat(SNAP_FRAG, { tSrc: { value: null } });
  const copyMat = quadMat(GUIDE_FRAG, { tSrc: { value: null } });
  const prepMat = quadMat(PREP_FRAG, {
    tSrc: { value: null }, tND: { value: null }, tGuide: { value: null }, tHalf: { value: null },
    uGain: { value: 1 }, uHalf: { value: 0 }, uSpatial: { value: 1 }, uTGain: { value: 8 }, uClamp: { value: 4 }, uFlat: { value: false },
  });
  const atrousMat = quadMat(ATROUS_FRAG, {
    tIn: { value: null }, tND: { value: null }, tGuide: { value: null },
    uStep: { value: 1 }, uTol: { value: 2 }, uVGain: { value: 1 }, uSigmaG2: { value: 0.1 }, uFinal: { value: false }, uFlat: { value: false },
  });

  const rtND = makeRT(THREE.HalfFloatType, true);
  const rtGuide = makeRT(THREE.HalfFloatType, false); // linear surface colour: 8 bits band in dark colours once the image is divided by it
  const rtA = makeRT(THREE.HalfFloatType, false);
  const rtB = makeRT(THREE.HalfFloatType, false);
  const rtHalf = [makeRT(THREE.HalfFloatType, false, THREE.RedFormat), makeRT(THREE.HalfFloatType, false, THREE.RedFormat)];
  const halfN = [0, 0];
  const hemi = new THREE.HemisphereLight(0xffffff, 0xeae6e0, 2.2);
  let width = 1, height = 1;

  function ensureSize(w, h) {
    width = w; height = h;
    if (rtND.width === w && rtND.height === h) return;
    for (const rt of [rtND, rtGuide, rtA, rtB, ...rtHalf]) rt.setSize(w, h);
    passes(() => { for (const rt of [rtA, rtB, ...rtHalf]) renderer.setRenderTarget(rt); }); // allocate now: running out of GPU memory must show before the render, not at the end
    reset();
  }

  function capture(scene, camera, w, h, skipMats = []) {
    ensureSize(w, h);
    const skip = new Set(skipMats.filter(Boolean));
    const hiddenMeshes = [], hiddenLights = [];
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.isMesh) {
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        if (ms.some(m => skip.has(m))) { o.visible = false; hiddenMeshes.push(o); }
      } else if (o.isLight) {
        o.visible = false; hiddenLights.push(o);
      }
    });

    const prevRT = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    const prevAutoClear = renderer.autoClear;
    const prevOverride = scene.overrideMaterial;
    const prevBg = scene.background;
    const prevEnv = scene.environment;
    const prevShadow = renderer.shadowMap.enabled;
    const prevTM = renderer.toneMapping;
    const prevExp = renderer.toneMappingExposure;
    let aa = null;

    try {
      renderer.autoClear = true;
      renderer.setClearColor(0x000000, 0);
      scene.background = null;

      scene.overrideMaterial = ndMat;
      renderer.setRenderTarget(rtND);
      renderer.clear();
      renderer.render(scene, camera);

      scene.overrideMaterial = null;
      scene.environment = null;
      renderer.shadowMap.enabled = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.toneMappingExposure = 1;
      scene.add(hemi);
      // the guide is rendered 4x multisampled: an edge pixel then holds the mix of both surface colours, like the path-traced
      // pixel it divides, so edges stay smooth and dark-next-to-bright edges do not turn into outliers
      const gl = renderer.getContext(), counts = gl.getInternalformatParameter?.(gl.RENDERBUFFER, gl.RGBA16F, gl.SAMPLES); // largest first; empty where half-float buffers cannot be multisampled
      aa = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: Math.min(4, counts?.[0] || 0) });
      renderer.setRenderTarget(aa);
      renderer.clear();
      renderer.render(scene, camera);
      scene.remove(hemi);
      copyMat.uniforms.tSrc.value = aa.texture;
      quadMesh.material = copyMat;
      renderer.setRenderTarget(rtGuide);
      renderer.render(quadScene, quadCam);
    } finally {
      aa?.dispose();
      if (hemi.parent === scene) scene.remove(hemi);
      for (const m of hiddenMeshes) m.visible = true;
      for (const l of hiddenLights) l.visible = true;
      scene.overrideMaterial = prevOverride;
      scene.background = prevBg;
      scene.environment = prevEnv;
      renderer.shadowMap.enabled = prevShadow;
      renderer.toneMapping = prevTM;
      renderer.toneMappingExposure = prevExp;
      renderer.setClearColor(prevClear, prevAlpha);
      renderer.autoClear = prevAutoClear;
      renderer.setRenderTarget(prevRT);
    }
  }

  // full-screen passes share the renderer with the path tracer: save and restore what they touch
  function passes(fn) {
    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevTM = renderer.toneMapping;
    const prevScissor = renderer.getScissorTest();
    const prevViewport = renderer.getViewport(new THREE.Vector4());
    try {
      renderer.autoClear = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setScissorTest(false);
      fn();
    } finally {
      renderer.setViewport(prevViewport);
      renderer.setScissorTest(prevScissor);
      renderer.autoClear = prevAutoClear;
      renderer.toneMapping = prevTM;
      renderer.setRenderTarget(prevRT);
    }
  }

  // forget the kept halves (the accumulation restarted)
  function reset() { halfN[0] = halfN[1] = 0; }

  // keep the image at `samples` (call at 1, 2, 4, 8… samples): the older of the two slots is replaced
  function snapshot(srcTex, samples) {
    if (halfN.includes(samples)) return;
    const i = halfN[0] <= halfN[1] ? 0 : 1;
    passes(() => {
      snapMat.uniforms.tSrc.value = srcTex;
      quadMesh.material = snapMat;
      renderer.setRenderTarget(rtHalf[i]);
      renderer.render(quadScene, quadCam);
    });
    halfN[i] = samples;
  }

  // srcTex = accumulated HDR image after `samples` samples; draws the finished image to the canvas
  function run(srcTex, exposure, { samples = 1, dof = false } = {}) {
    // the larger kept half that still leaves a quarter of the samples in the other half
    let hi = -1;
    for (let i = 0; i < 2; i++) if (halfN[i] > 0 && halfN[i] <= samples * 0.75 && (hi < 0 || halfN[i] > halfN[hi])) hi = i;
    const nA = hi < 0 ? 0 : halfN[hi];
    passes(() => {
      const u = prepMat.uniforms;
      u.tSrc.value = srcTex; u.tND.value = rtND.texture; u.tGuide.value = rtGuide.texture; u.tHalf.value = rtHalf[Math.max(hi, 0)].texture;
      u.uGain.value = exposure / 0.6;
      u.uHalf.value = nA ? nA / (samples - nA) : 0;
      u.uSpatial.value = THREE.MathUtils.clamp((32 - samples) / 24, 0, 1);
      u.uClamp.value = TUNE.clamp; u.uTGain.value = TUNE.tgain; u.uFlat.value = dof;
      quadMesh.material = prepMat;
      renderer.setRenderTarget(rtA);
      renderer.render(quadScene, quadCam);

      const a = atrousMat.uniforms, steps = TUNE.steps;
      a.tND.value = rtND.texture; a.tGuide.value = rtGuide.texture;
      a.uSigmaG2.value = dof ? TUNE.sigmaG2Dof : TUNE.sigmaG2; a.uFlat.value = dof;
      quadMesh.material = atrousMat;
      let readRT = rtA, writeRT = rtB;
      for (let i = 0; i < steps.length; i++) {
        const last = i === steps.length - 1;
        a.tIn.value = readRT.texture; a.uStep.value = steps[i]; a.uTol.value = TUNE.tol[i]; a.uVGain.value = TUNE.vgain; a.uFinal.value = last;
        renderer.setRenderTarget(last ? null : writeRT);
        if (last) renderer.setViewport(0, 0, width, height);
        renderer.render(quadScene, quadCam);
        const tmp = readRT; readRT = writeRT; writeRT = tmp;
      }
    });
  }

  function dispose() {
    for (const rt of [rtND, rtGuide, rtA, rtB, ...rtHalf]) rt.dispose();
    quadGeo.dispose(); ndMat.dispose(); snapMat.dispose(); copyMat.dispose(); prepMat.dispose(); atrousMat.dispose();
  }

  return { capture, snapshot, reset, run, dispose };
}
