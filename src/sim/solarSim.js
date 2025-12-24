// src/sim/solarSim.js
// “Option A”: simple circular + hierarchical orbits.
// No physics. Just a deterministic motion model that looks right.

const TAU = Math.PI * 2;

function rotateX(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
}

function rotateZ(v, angle) {
  const c = Math.cos(angle), s = Math.sin(angle);
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z };
}

function orbitPos({ radius, period, phase = 0, inclination = 0, node = 0 }, t) {
  // period <= 0 means “static”
  const theta = phase + (period > 0 ? (TAU * (t / period)) : 0);

  // base orbit in XZ plane
  let p = {
    x: radius * Math.cos(theta),
    y: 0,
    z: radius * Math.sin(theta),
  };

  // optional orbit plane orientation:
  // 1) rotate around X for inclination
  p = rotateX(p, inclination);
  // 2) rotate around Z for ascending node (optional)
  p = rotateZ(p, node);

  return p;
}

/**
 * Create a sim with named bodies and orbit params.
 * Returns an object with update(dt) and getState().
 */
export function createSolarSim(config) {
  const bodies = config.bodies;
  let t = 0;

  // mutable state map: name -> {x,y,z}
  const state = {};
  for (const name of Object.keys(bodies)) {
    state[name] = { x: 0, y: 0, z: 0 };
  }

  function update(dt) {
    t += dt * (config.timeScale ?? 1);

    // 1) Sun is origin
    state.Sun.x = 0; state.Sun.y = 0; state.Sun.z = 0;

    // 2) First pass: compute all “primary” sun-centered bodies and barycenters
    // We do this in a stable order so parents exist before children.
    for (const name of config.order) {
      const b = bodies[name];

      if (b.type === "sun") continue;

      if (b.type === "primary") {
        state[name] = orbitPos(b.orbit, t);
      }

      if (b.type === "barycenter") {
        state[name] = orbitPos(b.orbit, t);
      }
    }

    // 3) Second pass: moons + twins around barycenters
    for (const name of config.order) {
      const b = bodies[name];

      if (b.type === "moon") {
        const parentPos = state[b.parent];
        const rel = orbitPos(b.orbit, t);
        state[name] = {
          x: parentPos.x + rel.x,
          y: parentPos.y + rel.y,
          z: parentPos.z + rel.z,
        };
      }

      if (b.type === "binaryChild") {
        const centerPos = state[b.parent]; // barycenter
        const rel = orbitPos(b.orbit, t);
        state[name] = {
          x: centerPos.x + rel.x,
          y: centerPos.y + rel.y,
          z: centerPos.z + rel.z,
        };
      }
    }
  }

  function getState() {
    return { t, positions: state };
  }

  return { update, getState };
}
