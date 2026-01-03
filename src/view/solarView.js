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
  const orbitLines = {}; // map name -> orbit line mesh

  // Helper: build a sphere
  function makeSphere(radius, color, segments = 32) {
    const geo = new THREE.SphereGeometry(radius, segments, segments);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 1.0,
      metalness: 0.0,
    });
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  // Helper: create a thin orbit line (thin torusgeometry or circle line)
  // Using a thin flat torus to represent the orbital plane.
  function makeOrbitLine(radius, color = 0x888888, tubeRadius = 0.2) {
    const geo = new THREE.TorusGeometry(radius, tubeRadius, 8, 128);
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
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
    mesh.castShadow = true;
    group.add(mesh);

    // --- Create orbit line for this body (if it has an orbit) ---
    if (b.orbit) {
      const orbitColor = 0x666688; // subtle blue-gray for orbits
      const orbitLine = makeOrbitLine(b.orbit.radius, orbitColor);

      // Apply the same inclination + node rotations as the orbit math
      if (b.orbit.inclination) {
        orbitLine.rotateX(b.orbit.inclination);
      }
      if (b.orbit.node) {
        orbitLine.rotateZ(b.orbit.node);
      }

      // Determine parent: moons orbit their parent, others orbit sun (at origin)
      const parent = b.parent ? b.parent : null;

      if (parent && meshes[parent]) {
        // Moon orbit: attach to parent planet
        meshes[parent].add(orbitLine);
      } else {
        // Primary/barycenter orbit: fixed in sun's reference frame (at origin)
        group.add(orbitLine);
      }

      orbitLines[name] = {
        mesh: orbitLine,
        parent: parent,
        radius: b.orbit.radius,
      };
    }
  }

  // --- NEW: Add orbit line for TwinsBarycenter (the center point between the twins) ---
  const twinsBaryBody = config.bodies.TwinsBarycenter;
  if (twinsBaryBody && twinsBaryBody.orbit) {
    const baryOrbitColor = 0x666688; // same subtle blue-gray as other orbits
    const baryOrbitLine = makeOrbitLine(twinsBaryBody.orbit.radius, baryOrbitColor);

    // Apply inclination + node rotations (same as other orbits)
    if (twinsBaryBody.orbit.inclination) {
      baryOrbitLine.rotateX(twinsBaryBody.orbit.inclination);
    }
    if (twinsBaryBody.orbit.node) {
      baryOrbitLine.rotateZ(twinsBaryBody.orbit.node);
    }

    // Attach to the main group (sun's reference frame) so it orbits the sun
    group.add(baryOrbitLine);

    orbitLines.TwinsBarycenter = {
      mesh: baryOrbitLine,
      parent: null, // orbits the sun
      radius: twinsBaryBody.orbit.radius,
    };
  }

  // --- New: create cylinder "tube" that will connect the Hourglass Twins ---
  // Cylinder geometry is created with height=1 so we can scale Y to the desired length.
  // Default radius is 1 -> we then scale X/Z to set actual visual radius.
  const tubeGeo = new THREE.CylinderGeometry(3, 3, 1, 16);
  const tubeMat = new THREE.MeshStandardMaterial({
    color: 0xffcc77,
    roughness: 0.6,
    metalness: 0.0,
    transparent: true,
    opacity: 0.85,
    // NOTE: leave depthWrite ON so shadows and depth sorting behave normally.
    // If you *really* want soft additive “glow sand”, do that as a second mesh later.
    depthWrite: true,
  });
  const twinsTube = new THREE.Mesh(tubeGeo, tubeMat);
  twinsTube.name = "TwinsTube";
  // start hidden until positions are available
  twinsTube.visible = false;
  // Make it behave like the planets with respect to shadows.
  twinsTube.castShadow = true;
  twinsTube.receiveShadow = true;
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

  return { group, meshes, applyPositions, orbitLines };
}