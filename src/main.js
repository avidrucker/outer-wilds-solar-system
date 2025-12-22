import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from 'lil-gui';
import './style.css';

/**
 * Outer Wilds Sun
 * --------------------------------
 * Problem: UV seam on SphereGeometry causes a visible vertical line when the shader uses vUv.x.
 * Fix 1: Stop using UVs for the procedural surface. Instead, drive the noise using a continuous
 * coordinate over the sphere: the *object-space normal* (or position). Normals have no seam.
 */

// ----------------------
// 1) Renderer + canvas
// ----------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// renderer.outputColorSpace = THREE.SRGBColorSpace;
// renderer.toneMapping = THREE.ACESFilmicToneMapping;
// renderer.toneMappingExposure = 1.15;

// ensure body has no margin (CSS already sets this but keep in JS too)
document.body.style.margin = "0";
// ensure the page background matches the space backdrop when CSS isn't loaded
document.body.style.background = '#05010a';

// Append the canvas to the body and make it fixed so it doesn't add to document flow.
// This prevents other page elements (like #app with padding) from increasing
// the page height and producing scrollbars.
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = "block";
renderer.domElement.style.position = "fixed";
renderer.domElement.style.top = "0";
renderer.domElement.style.left = "0";
renderer.domElement.style.right = "0";
renderer.domElement.style.bottom = "0";
// keep canvas behind UI but avoid negative z-index which can put it behind the page background
renderer.domElement.style.zIndex = "0";

// ----------------------
// 2) Scene + camera
// ----------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010a); // dark space color

const camera = new THREE.PerspectiveCamera(
  60, // field of view (degrees)
  window.innerWidth / window.innerHeight,
  0.1, // near clip
  5000 // far clip
);

camera.position.set(0, 120, 260);

// Orbit controls: allow click-drag to rotate and wheel to zoom
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = true;

// ----------------------
// 3) Geometry: the sun sphere
// ----------------------
const geometry = new THREE.SphereGeometry(70, 16, 16);

// ----------------------
// 4) Lighting (optional for the sun shader, useful later)
// ----------------------
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const light = new THREE.PointLight(0xffddaa, 2.0, 0, 2);
light.position.set(0, 0, 0);
scene.add(light);

// ----------------------
// 5) Sun shader (Fix 1: seam-free domain)
// ----------------------

// CHANGED: vertex shader now passes object-space normal (no seam) instead of vUv.
// NOTE: using `normal` directly gives us object-space normals. Because we rotate the mesh,
// the normal rotates with it, which looks like a moving surface when combined with time.
const sunVertex = /* glsl */ `
  varying vec3 vObjNormal;
  varying vec3 vViewNormal;

  void main() {
    vObjNormal = normalize(normal);               // seam-free domain
    vViewNormal = normalize(normalMatrix * normal); // correct rim relative to camera

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// CHANGED: fragment shader uses 3D noise driven by vObjNormal (no seam).
// NOTE: This is a simple value-noise + fbm stack. Not physically accurate, but it looks sun-like.
const sunFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec3 uBaseColor;  // orange
  uniform vec3 uHotColor;   // yellow-white
  // noise / fbm parameters (tunable from GUI)
  uniform float uLargeScale;
  uniform float uSmallScale;
  uniform float uSmallFlowFactor;
  uniform float uFbmAmp;
  uniform float uFbmGain;
  uniform float uFbmLacunarity;
  uniform float uVibrance;
  uniform float uSaturation;
  // spot / loop parameters
  uniform float uSpotScale;
  uniform float uSpotIntensity;
  uniform float uSpotThresholdLow;
  uniform float uSpotThresholdHigh;
  uniform float uSpotFlowRadius;
  uniform float uLoopPeriod;
  uniform float uSpotPulse;
  uniform float uSpotPhaseScale;

  varying vec3 vObjNormal;
  varying vec3 vViewNormal;

  // --- 3D hash/noise/fbm (same idea, but we'll use it more carefully) ---
  float hash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);

    float n000 = hash(i + vec3(0,0,0));
    float n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0));
    float n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1));
    float n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1));
    float n111 = hash(i + vec3(1,1,1));

    float nx00 = mix(n000, n100, u.x);
    float nx10 = mix(n010, n110, u.x);
    float nx01 = mix(n001, n101, u.x);
    float nx11 = mix(n011, n111, u.x);

    float nxy0 = mix(nx00, nx10, u.y);
    float nxy1 = mix(nx01, nx11, u.y);

    return mix(nxy0, nxy1, u.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = uFbmAmp;
    for (int i = 0; i < 5; i++) {
      v += a * noise3(p);
      p *= uFbmLacunarity;
      a *= uFbmGain;
    }
    return v;
  }

  // soft clip so we don't blast to pure white
  vec3 softClamp(vec3 c) {
    // simple filmic-ish rolloff
    return c / (vec3(1.0) + c);
  }

  void main() {
    vec3 nrm = normalize(vObjNormal);

    // Two layers:
    // - large convection blobs (low frequency)
    // - small turbulent detail (high frequency)
    // base flow for large/small layers
    vec3 flow = vec3(uTime * 0.08, uTime * 0.05, -uTime * 0.06);

    float large = fbm3(nrm * uLargeScale + flow);              // big shapes
    float small = fbm3(nrm * uSmallScale - flow * uSmallFlowFactor);       // fine detail

    // --- looped spot mask: sample fbm while rotating an offset in 2D to create a loopable variation
  // Compute per-position static spot base from FBM
  float spotBase = fbm3(nrm * uSpotScale);

  // Per-position phase derived from spotBase so each location pulses independently.
  // This keeps spots roughly stationary but allows them to fade in/out at different times.
  float phase = fract(spotBase * uSpotPhaseScale);

  // normalized time in [0,1]
  float tnorm = mod(uTime, uLoopPeriod) / uLoopPeriod;
  float pulse = 0.5 + 0.5 * sin(6.28318530718 * (tnorm + phase));

  // modulation mixes spotBase and pulse, controlled by uSpotPulse
  float spotMod = spotBase + uSpotPulse * (pulse - 0.5);
  float spotMask = smoothstep(uSpotThresholdLow, uSpotThresholdHigh, spotMod);
    

    // Combine them in a way that avoids huge uniform bands
    float surface = 0.65 * large + 0.35 * small;

    // Make hot regions tighter: push heat toward 0 most of the time
  float heat = smoothstep(0.15, 0.95, surface);
    heat = pow(heat, 1.6); // compress mid-tones -> more orange overall
  // blend in spot mask as additional local heat
  heat = max(heat, mix(heat, uSpotIntensity, spotMask));

  vec3 color = mix(uBaseColor, uHotColor, heat);

    // Rim glow: use view-space normal so it hugs silhouette, not latitudinal rings
    // Make it tighter and weaker than before to avoid white blowout.
    float rim = pow(1.0 - clamp(abs(vViewNormal.z), 0.0, 1.0), 5.0);
    color += uHotColor * rim * 0.55;

    // Subtle flicker (small)
    color *= 0.96 + 0.04 * sin(uTime * 2.2);

    // Keep it from blowing out
    // apply vibrance (brightness) then boost saturation
    // convert to luminance then push chroma
    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    // uSaturation > 1 increases colorfulness, 1.0 = unchanged
    color = vec3(lum) + (color - vec3(lum)) * uSaturation;
    color = softClamp(color * uVibrance);

    gl_FragColor = vec4(color, 1.0);
  }
`;


// ----------------------
// 5b) RIM IMPROVEMENT (recommended small correction)
// ----------------------
// The "best" rim uses a view-space normal, so the rim is always correct relative to the camera.
// This doesn't affect seams; it's just for nicer visuals.
//
// If you want correct rim, use the two-shader versions below instead of the ones above.
// I've left your current approach working, but the rim will look a bit "attached" to rotation.
// Uncomment the block below and swap into ShaderMaterial to enable.
//
// --- START OPTIONAL RIM-IMPROVED SHADERS ---
//
// const sunVertex = /* glsl */ `
//   varying vec3 vObjNormal;
//   varying vec3 vViewNormal;
//
//   void main() {
//     vObjNormal = normalize(normal);
//     vViewNormal = normalize(normalMatrix * normal); // view-space normal
//     gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
//   }
// `;
//
// const sunFragment = /* glsl */ `
//   precision highp float;
//   uniform float uTime;
//   uniform vec3 uBaseColor;
//   uniform vec3 uHotColor;
//   varying vec3 vObjNormal;
//   varying vec3 vViewNormal;
//
//   float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
//   float noise3(vec3 p) {
//     vec3 i = floor(p);
//     vec3 f = fract(p);
//     vec3 u = f * f * (3.0 - 2.0 * f);
//     float n000 = hash(i + vec3(0,0,0));
//     float n100 = hash(i + vec3(1,0,0));
//     float n010 = hash(i + vec3(0,1,0));
//     float n110 = hash(i + vec3(1,1,0));
//     float n001 = hash(i + vec3(0,0,1));
//     float n101 = hash(i + vec3(1,0,1));
//     float n011 = hash(i + vec3(0,1,1));
//     float n111 = hash(i + vec3(1,1,1));
//     float nx00 = mix(n000, n100, u.x);
//     float nx10 = mix(n010, n110, u.x);
//     float nx01 = mix(n001, n101, u.x);
//     float nx11 = mix(n011, n111, u.x);
//     float nxy0 = mix(nx00, nx10, u.y);
//     float nxy1 = mix(nx01, nx11, u.y);
//     return mix(nxy0, nxy1, u.z);
//   }
//   float fbm3(vec3 p) {
//     float v = 0.0;
//     float a = 0.55;
//     for (int i = 0; i < 5; i++) {
//       v += a * noise3(p);
//       p *= 2.0;
//       a *= 0.5;
//     }
//     return v;
//   }
//
//   void main() {
//     vec3 p = normalize(vObjNormal) * 4.0;
//     p += vec3(uTime * 0.10, uTime * 0.05, -uTime * 0.08);
//     float n = fbm3(p);
//     float blotch = smoothstep(0.35, 0.80, n);
//
//     // Correct rim relative to camera
//     float rim = pow(1.0 - abs(vViewNormal.z), 2.0);
//
//     vec3 color = mix(uBaseColor, uHotColor, blotch);
//     color += uHotColor * (rim * 1.4);
//     color *= 0.92 + 0.08 * sin(uTime * 2.0);
//     gl_FragColor = vec4(color, 1.0);
//   }
// `;
//
// --- END OPTIONAL RIM-IMPROVED SHADERS ---

// ----------------------
// 6) Shader material + mesh
// ----------------------
/**
 * Large scale: 1.5–3.0 controls convection blob size (bigger = larger patches).
 * Small scale: 8–16 controls fine noise detail.
 * Small flow factor: 1.0–2.5 affects how the small noise animates relative to the large flow.
 * FBM amp: 0.3–0.9 controls overall contrast of the noise.
 * FBM gain: 0.4–0.7 controls how quickly amplitude decays across octaves (lower = softer detail).
Lacunarity: ~1.8–2.2 typical; larger makes higher octaves sample more densely (finer details).
 */
const sunMaterial = new THREE.ShaderMaterial({
  vertexShader: sunVertex,
  fragmentShader: sunFragment,
  uniforms: {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(0xff5b14) }, // deeper orange-red
    uHotColor: { value: new THREE.Color(0xffc24a) }, // hot yellow-orange (not near-white)
    // vibrance multiplier (brightness-like), and saturation boost
    uVibrance: { value: 4.0 },
    uSaturation: { value: 1.35 },
    // noise tuning defaults
    uLargeScale: { value: 3.87 },
    uSmallScale: { value: 14.2 },
    uSmallFlowFactor: { value: 1.96 },
    uFbmAmp: { value: 0.42 },
    uFbmGain: { value: 0.48 },
    uFbmLacunarity: { value: 2.0 },
    // spot / loop defaults
    uSpotScale: { value: 6.0 },
    uSpotIntensity: { value: 0.6 },
    uSpotThresholdLow: { value: 0.45 },
    uSpotThresholdHigh: { value: 0.68 },
    uSpotFlowRadius: { value: 1.5 },
    uLoopPeriod: { value: 12.0 },
    uSpotPulse: { value: 0.5 },
    uSpotPhaseScale: { value: 1.2 },
  },
});

const sphere = new THREE.Mesh(geometry, sunMaterial);
scene.add(sphere);

// ----------------------
// 7) Sun halo / glow shell (radial gradient via shader)
// ----------------------

// NOTE: More segments makes the halo smoother (your 16,16 looks polygonal).
// This is a cheap mesh; 48 is still fine.
const haloGeo = new THREE.SphereGeometry(90, 60, 60);

// Halo shader: uses view-space normal to compute a rim factor.
// Rim is strongest at the silhouette and fades toward center.
// Additive blending makes it feel like light scattering.
const haloVertex = /* glsl */ `
  varying vec3 vViewNormal;

  void main() {
    vViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const haloFragment = /* glsl */ `
  precision highp float;

  uniform vec3 uGlowColor;
  uniform float uIntensity; // brightness multiplier
  uniform float uPower;     // rim tightness
  uniform float uAlpha;     // max opacity

  varying vec3 vViewNormal;

  void main() {
    // vViewNormal.z ~ 1 at the center facing camera, ~0 at the edge.
    float facing = clamp(abs(vViewNormal.z), 0.0, 1.0);

    // We want the glow strongest at the center (facing==1) and fade to 0 at the rim.
    // Use a smooth falloff: raise facing to a power to control tightness, then apply alpha.
    // Higher uPower => tighter, more concentrated center glow.
    float inner = pow(facing, uPower);
    float a = inner * uAlpha;

    // Slightly soften the edges with an additional smoothstep to avoid hard falloff
    a *= smoothstep(0.0, 1.0, facing);

    // Additive glow color (center-filled)
    vec3 col = uGlowColor * (uIntensity * a);

    gl_FragColor = vec4(col, a);
  }
`;

const haloMat = new THREE.ShaderMaterial({
  vertexShader: haloVertex,
  fragmentShader: haloFragment,
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  depthTest: false, // ensure glow always draws over the sphere silhouette
  // IMPORTANT: Render the *outside* surface so it looks like a glow around the sun
  side: THREE.FrontSide,
  uniforms: {
    // More yellow-ish glow like the reference image
    uGlowColor: { value: new THREE.Color(0xffd07a) },
    // Tune these three values to match the reference:
    uIntensity: { value: 8.0 }, // brightness
    uPower: { value: 2.2 },     // softness (2.2–3.2 is a good range)
    uAlpha: { value: 0.28 },    // overall transparency ceiling (raised so glow is more visible)
  },
});

const halo = new THREE.Mesh(haloGeo, haloMat);
halo.renderOrder = 2; // render after the sun to ensure it's visible
scene.add(halo);

// Keep halo centered on sun (no need to copy rotation for a symmetric sphere)
halo.position.copy(sphere.position);

// NOTE (correction): Rendering once here is not necessary because animate() will render.
// Leaving it out avoids confusion.
// renderer.render(scene, camera);

// ----------------------
// 8) Resize handling
// ----------------------
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// ----------------------
// 9) Animation loop
// ----------------------
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();

  // NOTE: we intentionally do NOT update uTime so the shader (surface + spots)
  // remains static. The only animation retained is the slow rotation of the sphere.
  // rotate the sun slowly (purely aesthetic)
  sphere.rotation.y += dt * 0.3;

  // Keep halo aligned to sun rotation
  halo.rotation.copy(sphere.rotation);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ----------------------
// 10) GUI for live tuning + copy-to-clipboard
// ----------------------
// Attempt to load defaults from repo-mounted sun-config.json and provide a Reset button.
// If the file isn't present (e.g. running locally before committing), this quietly fails.
// Replace async external config loading with a simple embedded defaults object.
const bundledDefaults = {
  uVibrance: 4,
  uSaturation: 1.35,
  uBaseColor: '#ff5b14',
  uHotColor: '#ffc24a',
  noise: {
    largeScale: 3.87,
    smallScale: 14.2,
    smallFlowFactor: 1.96,
    fbmAmp: 0.42,
    fbmGain: 0.48,
    fbmLacunarity: 2
  },
  spots: {
    spotScale: 1,
    spotIntensity: 0,
    spotThresholdLow: 0,
    spotThresholdHigh: 0,
    spotFlowRadius: 0,
    loopPeriod: 60,
    spotPulse: 0,
    spotPhaseScale: 0.1
  },
  halo: {
    intensity: 8,
    alpha: 0.4,
    power: 2.2,
    size: 0.9
  },
  toneMappingExposure: 1
};

// Apply the bundled defaults immediately so uniforms are initialized.
applyConfigFromObject(bundledDefaults);

function applyConfigFromObject(j) {
  try {
    if (j.uVibrance !== undefined) sunMaterial.uniforms.uVibrance.value = j.uVibrance;
    if (j.uSaturation !== undefined) sunMaterial.uniforms.uSaturation.value = j.uSaturation;
    if (j.uBaseColor) sunMaterial.uniforms.uBaseColor.value.set(j.uBaseColor);
    if (j.uHotColor) sunMaterial.uniforms.uHotColor.value.set(j.uHotColor);
    if (j.noise) {
      const n = j.noise;
      if (n.largeScale !== undefined) sunMaterial.uniforms.uLargeScale.value = n.largeScale;
      if (n.smallScale !== undefined) sunMaterial.uniforms.uSmallScale.value = n.smallScale;
      if (n.smallFlowFactor !== undefined) sunMaterial.uniforms.uSmallFlowFactor.value = n.smallFlowFactor;
      if (n.fbmAmp !== undefined) sunMaterial.uniforms.uFbmAmp.value = n.fbmAmp;
      if (n.fbmGain !== undefined) sunMaterial.uniforms.uFbmGain.value = n.fbmGain;
      if (n.fbmLacunarity !== undefined) sunMaterial.uniforms.uFbmLacunarity.value = n.fbmLacunarity;
    }
    if (j.spots) {
      const s = j.spots;
      if (s.spotScale !== undefined) sunMaterial.uniforms.uSpotScale.value = s.spotScale;
      if (s.spotIntensity !== undefined) sunMaterial.uniforms.uSpotIntensity.value = s.spotIntensity;
      if (s.spotThresholdLow !== undefined) sunMaterial.uniforms.uSpotThresholdLow.value = s.spotThresholdLow;
      if (s.spotThresholdHigh !== undefined) sunMaterial.uniforms.uSpotThresholdHigh.value = s.spotThresholdHigh;
      if (s.spotFlowRadius !== undefined) sunMaterial.uniforms.uSpotFlowRadius.value = s.spotFlowRadius;
      if (s.loopPeriod !== undefined) sunMaterial.uniforms.uLoopPeriod.value = s.loopPeriod;
      if (s.spotPulse !== undefined) sunMaterial.uniforms.uSpotPulse.value = s.spotPulse;
      if (s.spotPhaseScale !== undefined) sunMaterial.uniforms.uSpotPhaseScale.value = s.spotPhaseScale;
    }
    if (j.halo) {
      const h = j.halo;
      if (h.intensity !== undefined) halo.material.uniforms.uIntensity.value = h.intensity;
      if (h.alpha !== undefined) halo.material.uniforms.uAlpha.value = h.alpha;
      if (h.power !== undefined) halo.material.uniforms.uPower.value = h.power;
      if (h.size !== undefined) halo.scale.setScalar(h.size);
    }
    if (j.toneMappingExposure !== undefined) renderer.toneMappingExposure = j.toneMappingExposure;
  } catch (err) {
    console.warn('Failed to apply config object', err);
  }
}

// No external config fetch: using embedded defaults to keep startup deterministic.

try {
  const gui = new GUI({ width: 320 });

  const params = {
    uVibrance: sunMaterial.uniforms.uVibrance.value,
    uSaturation: sunMaterial.uniforms.uSaturation.value,
    uBaseColor: '#' + sunMaterial.uniforms.uBaseColor.value.getHexString(),
    uHotColor: '#' + sunMaterial.uniforms.uHotColor.value.getHexString(),
    haloIntensity: halo.material.uniforms.uIntensity.value,
    haloAlpha: halo.material.uniforms.uAlpha.value,
    haloPower: halo.material.uniforms.uPower.value,
    haloScale: halo.scale.x,
    // renderer tone mapping/exposure (optional)
    toneMappingExposure: renderer.toneMappingExposure || 1.0,
  // noise params (expose defaults here so GUI shows current values)
  uLargeScale: sunMaterial.uniforms.uLargeScale.value,
  uSmallScale: sunMaterial.uniforms.uSmallScale.value,
  uFbmAmp: sunMaterial.uniforms.uFbmAmp.value,
  uFbmGain: sunMaterial.uniforms.uFbmGain.value,
  uFbmLacunarity: sunMaterial.uniforms.uFbmLacunarity.value,
  };

  const sunFolder = gui.addFolder('Sun');
  sunFolder.add(params, 'uVibrance', 0.5, 10.0, 0.01).name('Vibrance').onChange(v => {
    sunMaterial.uniforms.uVibrance.value = v;
  });
  sunFolder.add(params, 'uSaturation', 0.5, 2.5, 0.01).name('Saturation').onChange(v => {
    sunMaterial.uniforms.uSaturation.value = v;
  });
  sunFolder.addColor(params, 'uBaseColor').name('Base color').onChange(c => {
    sunMaterial.uniforms.uBaseColor.value.set(c);
  });
  sunFolder.addColor(params, 'uHotColor').name('Hot color').onChange(c => {
    sunMaterial.uniforms.uHotColor.value.set(c);
  });

  // Noise / FBM tuning
  const noiseFolder = sunFolder.addFolder('Noise (FBM)');
  noiseFolder.add(params, 'uLargeScale', 0.5, 6.0, 0.01).name('Large scale').onChange(v => {
    sunMaterial.uniforms.uLargeScale.value = v;
  });
  noiseFolder.add(params, 'uSmallScale', 2.0, 30.0, 0.1).name('Small scale').onChange(v => {
    sunMaterial.uniforms.uSmallScale.value = v;
  });
  // smallFlowFactor (temporal flow) removed — surface is static
  noiseFolder.add(params, 'uFbmAmp', 0.1, 1.2, 0.01).name('FBM amp').onChange(v => {
    sunMaterial.uniforms.uFbmAmp.value = v;
  });
  noiseFolder.add(params, 'uFbmGain', 0.2, 0.9, 0.01).name('FBM gain').onChange(v => {
    sunMaterial.uniforms.uFbmGain.value = v;
  });
  noiseFolder.add(params, 'uFbmLacunarity', 1.2, 3.0, 0.01).name('FBM lacunarity').onChange(v => {
    sunMaterial.uniforms.uFbmLacunarity.value = v;
  });
  noiseFolder.open();

  // Spots and temporal flow removed — static surface only. (Spot params are still
  // readable/appliable via applyConfigFromObject if present, but the GUI no
  // longer exposes controls for them.)
  sunFolder.open();

  const haloFolder = gui.addFolder('Halo');
  haloFolder.add(params, 'haloIntensity', 0, 20, 0.1).name('Intensity').onChange(v => {
    halo.material.uniforms.uIntensity.value = v;
  });
  haloFolder.add(params, 'haloAlpha', 0, 1, 0.01).name('Alpha').onChange(v => {
    halo.material.uniforms.uAlpha.value = v;
  });
  haloFolder.add(params, 'haloPower', 0.5, 6, 0.01).name('Power').onChange(v => {
    halo.material.uniforms.uPower.value = v;
  });
  // New control: overall halo size (scales the halo mesh)
  haloFolder.add(params, 'haloScale', 0.6, 1.6, 0.01).name('Size').onChange(v => {
    halo.scale.setScalar(v);
  });
  haloFolder.open();

  gui.add(params, 'toneMappingExposure', 0.1, 3, 0.01).name('Exposure').onChange(v => {
    renderer.toneMappingExposure = v;
  });

  gui.add({ copyConfig: () => {
    const out = {
      uVibrance: params.uVibrance,
      uSaturation: params.uSaturation,
      uBaseColor: params.uBaseColor,
      uHotColor: params.uHotColor,
      noise: {
        largeScale: params.uLargeScale,
        smallScale: params.uSmallScale,
        fbmAmp: params.uFbmAmp,
        fbmGain: params.uFbmGain,
        fbmLacunarity: params.uFbmLacunarity,
      },
      halo: {
        intensity: params.haloIntensity,
        alpha: params.haloAlpha,
        power: params.haloPower,
      },
      toneMappingExposure: params.toneMappingExposure,
    };
    const text = JSON.stringify(out, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        console.log('Config copied to clipboard:', out);
        // small UI hint
        const el = document.createElement('div');
        el.textContent = 'Config copied to clipboard';
        el.style.position = 'fixed';
        el.style.right = '12px';
        el.style.bottom = '12px';
        el.style.padding = '8px 12px';
        el.style.background = 'rgba(0,0,0,0.6)';
        el.style.color = 'white';
        el.style.borderRadius = '6px';
        document.body.appendChild(el);
        setTimeout(() => document.body.removeChild(el), 1200);
      }).catch(() => {
        console.log(text);
        alert('Could not copy to clipboard — config printed to console');
      });
    } else {
      console.log(text);
      alert('Clipboard API not available — config printed to console');
    }
  } }, 'copyConfig').name('Copy config JSON');

  gui.add({ saveConfig: () => {
    const out = JSON.stringify({
      uVibrance: params.uVibrance,
      uSaturation: params.uSaturation,
      uBaseColor: params.uBaseColor,
      uHotColor: params.uHotColor,
      noise: {
        largeScale: params.uLargeScale,
        smallScale: params.uSmallScale,
        fbmAmp: params.uFbmAmp,
        fbmGain: params.uFbmGain,
        fbmLacunarity: params.uFbmLacunarity,
      },
      halo: {
        intensity: params.haloIntensity,
        alpha: params.haloAlpha,
        power: params.haloPower,
        size: params.haloScale,
      },
      toneMappingExposure: params.toneMappingExposure,
    }, null, 2);
    const blob = new Blob([out], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sun-config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } }, 'saveConfig').name('Save config JSON');

  gui.add({ loadConfig: () => {
    const txt = prompt('Paste config JSON here:');
    if (!txt) return;
    try {
      const j = JSON.parse(txt);
      // apply top-level
      if (j.uVibrance !== undefined) sunMaterial.uniforms.uVibrance.value = j.uVibrance;
      if (j.uSaturation !== undefined) sunMaterial.uniforms.uSaturation.value = j.uSaturation;
      if (j.uBaseColor) sunMaterial.uniforms.uBaseColor.value.set(j.uBaseColor);
      if (j.uHotColor) sunMaterial.uniforms.uHotColor.value.set(j.uHotColor);
      if (j.noise) {
        const n = j.noise;
        if (n.largeScale !== undefined) sunMaterial.uniforms.uLargeScale.value = n.largeScale;
        if (n.smallScale !== undefined) sunMaterial.uniforms.uSmallScale.value = n.smallScale;
        if (n.smallFlowFactor !== undefined) sunMaterial.uniforms.uSmallFlowFactor.value = n.smallFlowFactor;
        if (n.fbmAmp !== undefined) sunMaterial.uniforms.uFbmAmp.value = n.fbmAmp;
        if (n.fbmGain !== undefined) sunMaterial.uniforms.uFbmGain.value = n.fbmGain;
        if (n.fbmLacunarity !== undefined) sunMaterial.uniforms.uFbmLacunarity.value = n.fbmLacunarity;
      }
      if (j.spots) {
        const s = j.spots;
        if (s.spotScale !== undefined) sunMaterial.uniforms.uSpotScale.value = s.spotScale;
        if (s.spotIntensity !== undefined) sunMaterial.uniforms.uSpotIntensity.value = s.spotIntensity;
        if (s.spotThresholdLow !== undefined) sunMaterial.uniforms.uSpotThresholdLow.value = s.spotThresholdLow;
        if (s.spotThresholdHigh !== undefined) sunMaterial.uniforms.uSpotThresholdHigh.value = s.spotThresholdHigh;
        if (s.spotFlowRadius !== undefined) sunMaterial.uniforms.uSpotFlowRadius.value = s.spotFlowRadius;
        if (s.loopPeriod !== undefined) sunMaterial.uniforms.uLoopPeriod.value = s.loopPeriod;
        if (s.spotPulse !== undefined) sunMaterial.uniforms.uSpotPulse.value = s.spotPulse;
        if (s.spotPhaseScale !== undefined) sunMaterial.uniforms.uSpotPhaseScale.value = s.spotPhaseScale;
      }
      if (j.halo) {
        const h = j.halo;
        if (h.intensity !== undefined) halo.material.uniforms.uIntensity.value = h.intensity;
        if (h.alpha !== undefined) halo.material.uniforms.uAlpha.value = h.alpha;
        if (h.power !== undefined) halo.material.uniforms.uPower.value = h.power;
      }
      if (j.toneMappingExposure !== undefined) renderer.toneMappingExposure = j.toneMappingExposure;
      alert('Config applied');
      // Update the GUI controls to reflect the newly applied values
      if (typeof syncGuiFromMaterial === 'function') syncGuiFromMaterial();
    } catch (err) {
      alert('Invalid JSON: ' + err.message);
    }
  } }, 'loadConfig').name('Load config (paste)');

  // Reset to the embedded bundled defaults
  gui.add({ resetDefaults: () => {
    applyConfigFromObject(bundledDefaults);
    if (typeof syncGuiFromMaterial === 'function') syncGuiFromMaterial();
    alert('Defaults applied');
  } }, 'resetDefaults').name('Reset to defaults');

  // Keep the GUI in sync with current shader uniforms and renderer state.
  // This will read the current uniforms, update the `params` object, and call
  // updateDisplay() on every controller so the GUI visually matches live values.
  function syncGuiFromMaterial() {
    try {
      // top-level
      params.uVibrance = sunMaterial.uniforms.uVibrance.value;
      params.uSaturation = sunMaterial.uniforms.uSaturation.value;
      params.uBaseColor = '#' + sunMaterial.uniforms.uBaseColor.value.getHexString();
      params.uHotColor = '#' + sunMaterial.uniforms.uHotColor.value.getHexString();
      params.haloIntensity = halo.material.uniforms.uIntensity.value;
      params.haloAlpha = halo.material.uniforms.uAlpha.value;
      params.haloPower = halo.material.uniforms.uPower.value;
      params.toneMappingExposure = renderer.toneMappingExposure || 1.0;
      params.haloScale = halo.scale.x;

      // noise
      params.uLargeScale = sunMaterial.uniforms.uLargeScale.value;
      params.uSmallScale = sunMaterial.uniforms.uSmallScale.value;
      params.uFbmAmp = sunMaterial.uniforms.uFbmAmp.value;
      params.uFbmGain = sunMaterial.uniforms.uFbmGain.value;
      params.uFbmLacunarity = sunMaterial.uniforms.uFbmLacunarity.value;

      // spots: not exposed in GUI (static)

      // update top-level controllers
      if (gui && gui.__controllers) {
        gui.__controllers.forEach(c => {
          if (c && typeof c.updateDisplay === 'function') c.updateDisplay();
        });
      }

      // update controllers inside folders
      if (gui && gui.__folders) {
        Object.values(gui.__folders).forEach(folder => {
          if (folder && folder.__controllers) {
            folder.__controllers.forEach(c => {
              if (c && typeof c.updateDisplay === 'function') c.updateDisplay();
            });
          }
        });
      }
      // ensure haloScale display updates too (some gui implementations keep it in a folder)
      try {
        const haloCtrl = gui.__controllers && gui.__controllers.find(c => c.property === 'haloScale');
        if (haloCtrl && typeof haloCtrl.updateDisplay === 'function') haloCtrl.updateDisplay();
      } catch (e) { /* ignore */ }
    } catch (err) {
      console.warn('Failed to sync GUI from material:', err);
    }
  }

  // Ensure GUI shows current values at creation time (handles the case where
  // a startup fetch already applied sun-config.json before the GUI was created).
  syncGuiFromMaterial();
  

} catch (e) {
  // GUI import might fail if the package hasn't been installed yet — handle gracefully
  console.warn('GUI not available. Run `npm install` to enable live controls.', e);
}
