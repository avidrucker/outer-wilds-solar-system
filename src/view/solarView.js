// src/view/solarView.js
import * as THREE from "three";

/**
 * Creates simple sphere meshes for each body and returns:
 * - group: THREE.Group containing all bodies
 * - meshes: map name -> mesh
 * - applyPositions(positions): updates mesh positions
 *
 * NOTE: For now, all planets are basic materials.
 * Later you can replace each planet’s material with custom shaders/textures
 * without touching the sim.
 */
export function createSolarView(scene, config, overrides = {}) {
  const group = new THREE.Group();
  scene.add(group);

  const meshes = {};

  // Helper: build a sphere
  function makeSphere(radius, color, segments = 32) {
    const geo = new THREE.SphereGeometry(radius, segments, segments);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 1.0,
      metalness: 0.0,
    });
    return new THREE.Mesh(geo, mat);
  }

  for (const name of config.order) {
    const b = config.bodies[name];

    // Skip barycenter (it’s not a visible body)
    if (b.type === "barycenter") continue;

    // Sun mesh will be provided by your existing sun shader code.
    // So the view can “attach” to it instead of creating a basic sphere.
    if (name === "Sun" && overrides.sunMesh) {
      meshes.Sun = overrides.sunMesh;
      group.add(overrides.sunMesh);
      continue;
    }

    // fallback visuals
    const radius = b.radius ?? 10;
    const color =
      name === "AshTwin" ? 0xd8b08c :
      name === "EmberTwin" ? 0xff6f3b :
      name === "TimberHearth" ? 0x4ea35a :
      name === "Attlerock" ? 0xbdbdbd :
      name === "BrittleHollow" ? 0x8f6b4b :
      name === "HollowsLantern" ? 0xd75a2b :
      name === "GiantsDeep" ? 0x2d6dd2 :
      name === "DarkBramble" ? 0x2c6b4f :
      0xffffff;

    const seg = name === "DarkBramble" ? 24 : 32;
    const mesh = makeSphere(radius, color, seg);

    meshes[name] = mesh;
    group.add(mesh);
  }

  // --- New: create cylinder "tube" that will connect the Hourglass Twins ---
  // Cylinder geometry is created with height=1 so we can scale Y to the desired length.
  // Default radius is 1 -> we then scale X/Z to set actual visual radius.
  const tubeGeo = new THREE.CylinderGeometry(3, 3, 1, 16);
  const tubeMat = new THREE.MeshBasicMaterial({
    color: 0xffcc77,
    transparent: true,
    opacity: 0.95,
    depthWrite: false, // keep it visually blended with soft edges if desired
  });
  const twinsTube = new THREE.Mesh(tubeGeo, tubeMat);
  twinsTube.name = "TwinsTube";
  // start hidden until positions are available
  twinsTube.visible = false;
  group.add(twinsTube);
  meshes.TwinsTube = twinsTube;

  function applyPositions(positions) {
    for (const [name, pos] of Object.entries(positions)) {
      const mesh = meshes[name];
      if (!mesh) continue;
      mesh.position.set(pos.x, pos.y, pos.z);
    }

    // Update the connecting cylinder between AshTwin and EmberTwin
    const aPos = positions.AshTwin;
    const bPos = positions.EmberTwin;
    const tube = meshes.TwinsTube;

    if (tube && aPos && bPos) {
      // compute vectors
      const p1 = new THREE.Vector3(aPos.x, aPos.y, aPos.z);
      const p2 = new THREE.Vector3(bPos.x, bPos.y, bPos.z);
      const dir = new THREE.Vector3().subVectors(p2, p1);
      const len = dir.length();

      if (len > 0.0001) {
        // midpoint
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        tube.position.copy(mid);

        // align Y axis of cylinder to the direction vector
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, dir.clone().normalize());
        tube.quaternion.copy(q);

        // set scale: geometry height is 1 -> scale.y = length
        // adjust radius via scale.x/scale.z (tweak 0.18 -> desired visual thickness)
        const radius = Math.max(0.12, Math.min(0.6, len * 0.02)); // hint: radius proportional to distance, clamped
        tube.scale.set(radius, len, radius);

        tube.visible = true;
      } else {
        tube.visible = false;
      }
    } else if (tube) {
      tube.visible = false;
    }
  }

  return { group, meshes, applyPositions };
}
