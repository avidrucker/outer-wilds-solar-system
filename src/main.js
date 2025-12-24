// main.js
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import GUI from "lil-gui";
import "./style.css";

// ✅ NEW: simulation + view modules (planets/moons/orbits)
import { createSolarSim } from "./sim/solarSim.js";
import { solarConfig } from "./sim/solarConfig.js";
import { createSolarView } from "./view/solarView.js";

/**
 * Outer Wilds Sun
 * --------------------------------
 * Problem: UV seam on SphereGeometry causes a visible vertical line when the shader uses vUv.x.
 * Fix 1: Stop using UVs for the procedural surface. Instead, drive the noise using a continuous
 * coordinate over the sphere: the *object-space normal* (or position). Normals have no seam.
 *
 * ✅ NEW in this file:
 * - Plug in the orbit sim (Option A: circular/hierarchical orbits)
 * - Plug in the view module that creates simple planet spheres
 * - Keep your sun rendering/shader/GUI as-is
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
document.body.style.background = "#05010a";

// Append the canvas to the body and make it fixed so it doesn't add to document flow.
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
const sunVertex = /* glsl */ `
  varying vec3 vObjNormal;
  varying vec3 vViewNormal;

  void main() {
    vObjNormal = normalize(normal);               // seam-free domain
    vViewNormal = normalize(normalMatrix * normal); // correct rim relative to camera

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

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

  vec3 softClamp(vec3 c) {
    return c / (vec3(1.0) + c);
  }

  void main() {
    vec3 nrm = normalize(vObjNormal);

    vec3 flow = vec3(uTime * 0.08, uTime * 0.05, -uTime * 0.06);

    float large = fbm3(nrm * uLargeScale + flow);
    float small = fbm3(nrm * uSmallScale - flow * uSmallFlowFactor);

    float spotBase = fbm3(nrm * uSpotScale);
    float phase = fract(spotBase * uSpotPhaseScale);

    float tnorm = mod(uTime, uLoopPeriod) / uLoopPeriod;
    float pulse = 0.5 + 0.5 * sin(6.28318530718 * (tnorm + phase));

    float spotMod = spotBase + uSpotPulse * (pulse - 0.5);
    float spotMask = smoothstep(uSpotThresholdLow, uSpotThresholdHigh, spotMod);

    float surface = 0.65 * large + 0.35 * small;

    float heat = smoothstep(0.15, 0.95, surface);
    heat = pow(heat, 1.6);
    heat = max(heat, mix(heat, uSpotIntensity, spotMask));

    vec3 color = mix(uBaseColor, uHotColor, heat);

    float rim = pow(1.0 - clamp(abs(vViewNormal.z), 0.0, 1.0), 5.0);
    color += uHotColor * rim * 0.55;

    color *= 0.96 + 0.04 * sin(uTime * 2.2);

    float lum = dot(color, vec3(0.2126, 0.7152, 0.0722));
    color = vec3(lum) + (color - vec3(lum)) * uSaturation;
    color = softClamp(color * uVibrance);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// ----------------------
// 6) Shader material + mesh
// ----------------------
const sunMaterial = new THREE.ShaderMaterial({
  vertexShader: sunVertex,
  fragmentShader: sunFragment,
  uniforms: {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(0xff5b14) },
    uHotColor: { value: new THREE.Color(0xffc24a) },
    uVibrance: { value: 4.0 },
    uSaturation: { value: 1.35 },
    uLargeScale: { value: 3.87 },
    uSmallScale: { value: 14.2 },
    uSmallFlowFactor: { value: 1.96 },
    uFbmAmp: { value: 0.42 },
    uFbmGain: { value: 0.48 },
    uFbmLacunarity: { value: 2.0 },
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
const haloGeo = new THREE.SphereGeometry(90, 60, 60);

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
  uniform float uIntensity;
  uniform float uPower;
  uniform float uAlpha;

  varying vec3 vViewNormal;

  void main() {
    float facing = clamp(abs(vViewNormal.z), 0.0, 1.0);
    float inner = pow(facing, uPower);
    float a = inner * uAlpha;
    a *= smoothstep(0.0, 1.0, facing);

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
  depthTest: true,
  side: THREE.FrontSide,
  uniforms: {
    uGlowColor: { value: new THREE.Color(0xffd07a) },
    uIntensity: { value: 8.0 },
    uPower: { value: 2.2 },
    uAlpha: { value: 0.28 },
  },
});

const halo = new THREE.Mesh(haloGeo, haloMat);
halo.renderOrder = -1;
scene.add(halo);
halo.position.copy(sphere.position);

// ----------------------
// ✅ NEW (11): Solar system sim + basic planet meshes
// ----------------------
/**
 * We keep your sun exactly as-is.
 * The sim will compute positions for:
 * - Twins barycenter + Ash/Ember twins
 * - Timber Hearth + Attlerock
 * - Brittle Hollow + Hollow's Lantern
 * - Giant's Deep
 * - Dark Bramble
 *
 * The view module creates basic colored spheres for these bodies.
 * The "Sun" in the view is your existing `sphere`.
 */
const sim = createSolarSim(solarConfig);

// Build planet meshes and attach your existing sun mesh.
// NOTE: The view config also contains a "TwinsBarycenter" body which is NOT visible;
//       createSolarView automatically skips barycenters.
const solarView = createSolarView(scene, solarConfig, { sunMesh: sphere });

// Optional: simple helper axes for orientation (comment out if you don’t want it)
// scene.add(new THREE.AxesHelper(200));

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

  // ✅ NEW: advance the orbit sim (Option A)
  sim.update(dt);

  // ✅ NEW: apply sim positions to meshes
  const { positions } = sim.getState();
  solarView.applyPositions(positions);

  // ✅ Keep halo centered on the sun position (in case you ever move the sun)
  halo.position.set(positions.Sun.x, positions.Sun.y, positions.Sun.z);

  // Keep your existing sun rotation aesthetic
  sphere.rotation.y += dt * 0.3;
  halo.rotation.copy(sphere.rotation);

  controls.update();
  renderer.render(scene, camera);
}

animate();

// ----------------------
// 10) GUI for live tuning + copy-to-clipboard
// ----------------------
const bundledDefaults = {
  uVibrance: 4,
  uSaturation: 1.35,
  uBaseColor: "#ff5b14",
  uHotColor: "#ffc24a",
  noise: {
    largeScale: 3.87,
    smallScale: 14.2,
    smallFlowFactor: 1.96,
    fbmAmp: 0.42,
    fbmGain: 0.48,
    fbmLacunarity: 2,
  },
  spots: {
    spotScale: 1,
    spotIntensity: 0,
    spotThresholdLow: 0,
    spotThresholdHigh: 0,
    spotFlowRadius: 0,
    loopPeriod: 60,
    spotPulse: 0,
    spotPhaseScale: 0.1,
  },
  halo: {
    intensity: 8,
    alpha: 0.4,
    power: 2.2,
    size: 0.9,
  },
  toneMappingExposure: 1,
};

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
    console.warn("Failed to apply config object", err);
  }
}

try {
  const gui = new GUI({ width: 320 });

  const params = {
    uVibrance: sunMaterial.uniforms.uVibrance.value,
    uSaturation: sunMaterial.uniforms.uSaturation.value,
    uBaseColor: "#" + sunMaterial.uniforms.uBaseColor.value.getHexString(),
    uHotColor: "#" + sunMaterial.uniforms.uHotColor.value.getHexString(),
    haloIntensity: halo.material.uniforms.uIntensity.value,
    haloAlpha: halo.material.uniforms.uAlpha.value,
    haloPower: halo.material.uniforms.uPower.value,
    haloScale: halo.scale.x,
    toneMappingExposure: renderer.toneMappingExposure || 1.0,
    uLargeScale: sunMaterial.uniforms.uLargeScale.value,
    uSmallScale: sunMaterial.uniforms.uSmallScale.value,
    uFbmAmp: sunMaterial.uniforms.uFbmAmp.value,
    uFbmGain: sunMaterial.uniforms.uFbmGain.value,
    uFbmLacunarity: sunMaterial.uniforms.uFbmLacunarity.value,
  };

  const sunFolder = gui.addFolder("Sun");
  sunFolder.add(params, "uVibrance", 0.5, 10.0, 0.01).name("Vibrance").onChange((v) => {
    sunMaterial.uniforms.uVibrance.value = v;
  });
  sunFolder.add(params, "uSaturation", 0.5, 2.5, 0.01).name("Saturation").onChange((v) => {
    sunMaterial.uniforms.uSaturation.value = v;
  });
  sunFolder.addColor(params, "uBaseColor").name("Base color").onChange((c) => {
    sunMaterial.uniforms.uBaseColor.value.set(c);
  });
  sunFolder.addColor(params, "uHotColor").name("Hot color").onChange((c) => {
    sunMaterial.uniforms.uHotColor.value.set(c);
  });

  const noiseFolder = sunFolder.addFolder("Noise (FBM)");
  noiseFolder.add(params, "uLargeScale", 0.5, 6.0, 0.01).name("Large scale").onChange((v) => {
    sunMaterial.uniforms.uLargeScale.value = v;
  });
  noiseFolder.add(params, "uSmallScale", 2.0, 30.0, 0.1).name("Small scale").onChange((v) => {
    sunMaterial.uniforms.uSmallScale.value = v;
  });
  noiseFolder.add(params, "uFbmAmp", 0.1, 1.2, 0.01).name("FBM amp").onChange((v) => {
    sunMaterial.uniforms.uFbmAmp.value = v;
  });
  noiseFolder.add(params, "uFbmGain", 0.2, 0.9, 0.01).name("FBM gain").onChange((v) => {
    sunMaterial.uniforms.uFbmGain.value = v;
  });
  noiseFolder.add(params, "uFbmLacunarity", 1.2, 3.0, 0.01).name("FBM lacunarity").onChange((v) => {
    sunMaterial.uniforms.uFbmLacunarity.value = v;
  });
  noiseFolder.open();
  sunFolder.open();

  const haloFolder = gui.addFolder("Halo");
  haloFolder.add(params, "haloIntensity", 0, 20, 0.1).name("Intensity").onChange((v) => {
    halo.material.uniforms.uIntensity.value = v;
  });
  haloFolder.add(params, "haloAlpha", 0, 1, 0.01).name("Alpha").onChange((v) => {
    halo.material.uniforms.uAlpha.value = v;
  });
  haloFolder.add(params, "haloPower", 0.5, 6, 0.01).name("Power").onChange((v) => {
    halo.material.uniforms.uPower.value = v;
  });
  haloFolder.add(params, "haloScale", 0.6, 1.6, 0.01).name("Size").onChange((v) => {
    halo.scale.setScalar(v);
  });
  haloFolder.open();

  gui.add(params, "toneMappingExposure", 0.1, 3, 0.01).name("Exposure").onChange((v) => {
    renderer.toneMappingExposure = v;
  });

  gui.add(
    {
      copyConfig: () => {
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
            size: params.haloScale,
          },
          toneMappingExposure: params.toneMappingExposure,
        };

        const text = JSON.stringify(out, null, 2);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard
            .writeText(text)
            .then(() => {
              console.log("Config copied to clipboard:", out);
              const el = document.createElement("div");
              el.textContent = "Config copied to clipboard";
              el.style.position = "fixed";
              el.style.right = "12px";
              el.style.bottom = "12px";
              el.style.padding = "8px 12px";
              el.style.background = "rgba(0,0,0,0.6)";
              el.style.color = "white";
              el.style.borderRadius = "6px";
              document.body.appendChild(el);
              setTimeout(() => document.body.removeChild(el), 1200);
            })
            .catch(() => {
              console.log(text);
              alert("Could not copy to clipboard — config printed to console");
            });
        } else {
          console.log(text);
          alert("Clipboard API not available — config printed to console");
        }
      },
    },
    "copyConfig"
  ).name("Copy config JSON");

  gui.add(
    {
      saveConfig: () => {
        const out = JSON.stringify(
          {
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
          },
          null,
          2
        );

        const blob = new Blob([out], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "sun-config.json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    },
    "saveConfig"
  ).name("Save config JSON");

  gui.add(
    {
      loadConfig: () => {
        const txt = prompt("Paste config JSON here:");
        if (!txt) return;
        try {
          const j = JSON.parse(txt);
          applyConfigFromObject(j);
          alert("Config applied");
          if (typeof syncGuiFromMaterial === "function") syncGuiFromMaterial();
        } catch (err) {
          alert("Invalid JSON: " + err.message);
        }
      },
    },
    "loadConfig"
  ).name("Load config (paste)");

  gui.add(
    {
      resetDefaults: () => {
        applyConfigFromObject(bundledDefaults);
        if (typeof syncGuiFromMaterial === "function") syncGuiFromMaterial();
        alert("Defaults applied");
      },
    },
    "resetDefaults"
  ).name("Reset to defaults");

  function syncGuiFromMaterial() {
    try {
      params.uVibrance = sunMaterial.uniforms.uVibrance.value;
      params.uSaturation = sunMaterial.uniforms.uSaturation.value;
      params.uBaseColor = "#" + sunMaterial.uniforms.uBaseColor.value.getHexString();
      params.uHotColor = "#" + sunMaterial.uniforms.uHotColor.value.getHexString();
      params.haloIntensity = halo.material.uniforms.uIntensity.value;
      params.haloAlpha = halo.material.uniforms.uAlpha.value;
      params.haloPower = halo.material.uniforms.uPower.value;
      params.toneMappingExposure = renderer.toneMappingExposure || 1.0;
      params.haloScale = halo.scale.x;

      params.uLargeScale = sunMaterial.uniforms.uLargeScale.value;
      params.uSmallScale = sunMaterial.uniforms.uSmallScale.value;
      params.uFbmAmp = sunMaterial.uniforms.uFbmAmp.value;
      params.uFbmGain = sunMaterial.uniforms.uFbmGain.value;
      params.uFbmLacunarity = sunMaterial.uniforms.uFbmLacunarity.value;

      if (gui && gui.__controllers) {
        gui.__controllers.forEach((c) => c?.updateDisplay?.());
      }
      if (gui && gui.__folders) {
        Object.values(gui.__folders).forEach((folder) => {
          folder?.__controllers?.forEach((c) => c?.updateDisplay?.());
        });
      }
    } catch (err) {
      console.warn("Failed to sync GUI from material:", err);
    }
  }

  syncGuiFromMaterial();
} catch (e) {
  console.warn("GUI not available. Run `npm install` to enable live controls.", e);
}
