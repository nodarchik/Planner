import * as THREE from 'three';

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

const PREP_FRAG = /* glsl */`
uniform sampler2D tSrc;
uniform sampler2D tND;
uniform float uExposure;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 ACESFilmic(vec3 color, float exposure) {
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
  color *= exposure / 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 linearToSRGB(vec3 c) {
  return mix(c * 12.92, pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) * 1.055 - 0.055, step(0.0031308, c));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(tSrc, 0);
  vec3 hdr = max(texelFetch(tSrc, p, 0).rgb, vec3(0.0));
  float d0 = texelFetch(tND, p, 0).a;
  if (d0 > 0.001) {
    float sum = 0.0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue;
        ivec2 q = clamp(p + ivec2(dx, dy), ivec2(0), sz - 1);
        vec3 nb = max(texelFetch(tSrc, q, 0).rgb, vec3(0.0));
        sum += min(dot(nb, vec3(0.2126, 0.7152, 0.0722)), 25.0);
      }
    }
    float avg8 = sum * 0.125;
    float l0 = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
    float cap = max(avg8 * 2.5, 0.25);
    if (l0 > cap) hdr *= cap / l0;
  }
  gl_FragColor = vec4(linearToSRGB(ACESFilmic(hdr, uExposure)), 1.0);
}`;

const ATROUS_FRAG = /* glsl */`
uniform sampler2D tIn;
uniform sampler2D tND;
uniform sampler2D tGuide;
uniform int uStep;
uniform float uSigmaC2;
uniform float uSigmaG2;

float b3(int i) {
  int a = i < 0 ? -i : i;
  return a == 0 ? 0.375 : (a == 1 ? 0.25 : 0.0625);
}

vec3 guideSRGB(ivec2 p) {
  vec3 g = max(texelFetch(tGuide, p, 0).rgb, vec3(0.0));
  return pow(g, vec3(1.0 / 2.2));
}

void main() {
  ivec2 p = ivec2(gl_FragCoord.xy);
  ivec2 sz = textureSize(tIn, 0);
  vec3 c0 = texelFetch(tIn, p, 0).rgb;
  vec4 nd0 = texelFetch(tND, p, 0);
  if (nd0.a <= 0.001) {
    gl_FragColor = vec4(c0, 1.0);
    return;
  }
  vec3 n0 = nd0.rgb * 2.0 - 1.0;
  float d0 = nd0.a;
  vec3 g0 = guideSRGB(p);

  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int dy = -2; dy <= 2; dy++) {
    float ky = b3(dy);
    for (int dx = -2; dx <= 2; dx++) {
      ivec2 q = clamp(p + ivec2(dx, dy) * uStep, ivec2(0), sz - 1);
      vec4 ndq = texelFetch(tND, q, 0);
      if (ndq.a <= 0.001) continue;
      vec3 nq = ndq.rgb * 2.0 - 1.0;
      vec3 dn = n0 - nq;
      float dd = d0 - ndq.a;
      vec3 dq = texelFetch(tIn, q, 0).rgb;
      vec3 dc = c0 - dq;
      vec3 dg = g0 - guideSRGB(q);

      float wn = exp(-dot(dn, dn) / 0.08);
      float wz = exp(-(dd * dd) / (0.0009 * d0 * d0 + 1e-4));
      float wg = exp(-dot(dg, dg) / uSigmaG2);
      float wc = exp(-dot(dc, dc) / uSigmaC2);
      float w = ky * b3(dx) * wn * wz * wg * wc;
      acc += dq * w;
      wsum += w;
    }
  }
  gl_FragColor = vec4(wsum > 0.0 ? acc / wsum : c0, 1.0);
}`;

const makeRT = (type, depthBuffer) => new THREE.WebGLRenderTarget(1, 1, {
  type,
  depthBuffer,
  magFilter: THREE.NearestFilter,
  minFilter: THREE.NearestFilter,
});

export function createDenoiser(renderer) {
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, null);
  quadMesh.frustumCulled = false;
  quadScene.add(quadMesh);

  const ndMat = new THREE.ShaderMaterial({ vertexShader: ND_VERT, fragmentShader: ND_FRAG, side: THREE.DoubleSide });
  const prepMat = new THREE.ShaderMaterial({
    vertexShader: FULL_VERT,
    fragmentShader: PREP_FRAG,
    uniforms: { tSrc: { value: null }, tND: { value: null }, uExposure: { value: 1 } },
    depthTest: false,
    depthWrite: false,
  });
  const atrousMat = new THREE.ShaderMaterial({
    vertexShader: FULL_VERT,
    fragmentShader: ATROUS_FRAG,
    uniforms: {
      tIn: { value: null }, tND: { value: null }, tGuide: { value: null },
      uStep: { value: 1 }, uSigmaC2: { value: 0.55 }, uSigmaG2: { value: 0.025 },
    },
    depthTest: false,
    depthWrite: false,
  });

  const rtND = makeRT(THREE.HalfFloatType, true);
  const rtGuide = makeRT(THREE.UnsignedByteType, true);
  const rtA = makeRT(THREE.HalfFloatType, false);
  const rtB = makeRT(THREE.HalfFloatType, false);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xeae6e0, 2.2);
  let width = 1, height = 1;

  function ensureSize(w, h) {
    width = w; height = h;
    if (rtND.width === w && rtND.height === h) return;
    rtND.setSize(w, h); rtGuide.setSize(w, h); rtA.setSize(w, h); rtB.setSize(w, h);
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
      renderer.setRenderTarget(rtGuide);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
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

  function run(srcTex, exposure, dof = false) {
    const prevRT = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    const prevTM = renderer.toneMapping;
    const prevScissor = renderer.getScissorTest();
    const prevViewport = renderer.getViewport(new THREE.Vector4());
    try {
      renderer.autoClear = false;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setScissorTest(false);

      prepMat.uniforms.tSrc.value = srcTex;
      prepMat.uniforms.tND.value = rtND.texture;
      prepMat.uniforms.uExposure.value = exposure;
      quadMesh.material = prepMat;
      renderer.setRenderTarget(rtA);
      renderer.render(quadScene, quadCam);

      const steps = [1, 2, 4, 8, 16];
      const sigmas = [1e6, 2.0, 0.75, 0.30, 0.14];
      atrousMat.uniforms.tND.value = rtND.texture;
      atrousMat.uniforms.tGuide.value = rtGuide.texture;
      atrousMat.uniforms.uSigmaG2.value = dof ? 0.12 : 0.025;
      quadMesh.material = atrousMat;

      let readRT = rtA, writeRT = rtB;
      for (let i = 0; i < steps.length; i++) {
        const last = i === steps.length - 1;
        atrousMat.uniforms.tIn.value = readRT.texture;
        atrousMat.uniforms.uStep.value = steps[i];
        atrousMat.uniforms.uSigmaC2.value = sigmas[i];
        if (last) {
          renderer.setRenderTarget(null);
          renderer.setViewport(0, 0, width, height);
        } else {
          renderer.setRenderTarget(writeRT);
        }
        renderer.render(quadScene, quadCam);
        const tmp = readRT; readRT = writeRT; writeRT = tmp;
      }
    } finally {
      renderer.setViewport(prevViewport);
      renderer.setScissorTest(prevScissor);
      renderer.autoClear = prevAutoClear;
      renderer.toneMapping = prevTM;
      renderer.setRenderTarget(prevRT);
    }
  }

  function dispose() {
    rtND.dispose(); rtGuide.dispose(); rtA.dispose(); rtB.dispose();
    quadGeo.dispose(); ndMat.dispose(); prepMat.dispose(); atrousMat.dispose();
  }

  return { capture, run, dispose };
}
