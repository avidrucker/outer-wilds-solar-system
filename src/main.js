import * as THREE from "three";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

// ensure body has no margin (CSS already sets this but keep in JS too)
document.body.style.margin = "0";

// Append the canvas to the body and make it fixed so it doesn't add to document flow.
// This prevents other page elements (like #app with padding) from increasing
// the page height and producing scrollbars.
document.body.appendChild(renderer.domElement);
renderer.domElement.style.display = 'block';
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.top = '0';
renderer.domElement.style.left = '0';
renderer.domElement.style.right = '0';
renderer.domElement.style.bottom = '0';
// keep canvas behind UI but avoid negative z-index which can put it behind the page background
renderer.domElement.style.zIndex = '0';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05010a); // dark space color

const camera = new THREE.PerspectiveCamera(
  60,                                // field of view (degrees)
  window.innerWidth / window.innerHeight,
  0.1,                               // near clip
  5000                               // far clip
);

camera.position.set(0, 120, 260);

// orbit controls: allow click-drag to rotate and wheel to zoom
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.enableZoom = true;
controls.enablePan = true;

// add a simple sphere to the scene
const geometry = new THREE.SphereGeometry(70, 64, 64);
const material = new THREE.MeshStandardMaterial({
  color: 0xff8844
});

const sphere = new THREE.Mesh(geometry, material);
scene.add(sphere);

// add some basic lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.3));

const light = new THREE.PointLight(0xffddaa, 2.0, 0, 2);
light.position.set(0, 0, 0);
scene.add(light);

// vertex shader for sun-like glowing sphere
const sunVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;

  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// fragment shader for sun-like glowing sphere
const sunFragment = `
  precision highp float;

  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uHotColor;

  varying vec2 vUv;
  varying vec3 vNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  void main() {
    vec2 uv = vUv * 4.0 + uTime * 0.05;
    float n = noise(uv);

    float rim = pow(1.0 - abs(vNormal.z), 2.0);

    vec3 color = mix(uBaseColor, uHotColor, n);
    color += uHotColor * rim * 1.4;

    gl_FragColor = vec4(color, 1.0);
  }
`;

// clock to track elapsed time
const clock = new THREE.Clock();

// shader material for sun-like glowing sphere
const sunMaterial = new THREE.ShaderMaterial({
  vertexShader: sunVertex,
  fragmentShader: sunFragment,
  uniforms: {
    uTime: { value: 0 },
    uBaseColor: { value: new THREE.Color(0xff7a1a) },
    uHotColor: { value: new THREE.Color(0xffe08a) },
  }
});

sphere.material = sunMaterial;

// update time each frame
sunMaterial.uniforms.uTime.value = clock.elapsedTime;

// add the sun glow
const haloGeo = new THREE.SphereGeometry(82, 64, 64);
const haloMat = new THREE.MeshBasicMaterial({
  color: 0xffb15a,
  transparent: true,
  opacity: 0.18,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});

const halo = new THREE.Mesh(haloGeo, haloMat);
scene.add(halo);

renderer.render(scene, camera);

// handle window resizes so the renderer and camera keep correct aspect and size
window.addEventListener('resize', () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// animation / render loop — ensures the scene is redrawn continuously (and after resize)
function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  // rotate the sun slowly
  sphere.rotation.y += dt * 0.3;

  // update controls (damping) and any other animations
  controls.update();
  // TODO: update any other animations, objects, or physics here
  renderer.render(scene, camera);
}
animate();