// src/sim/solarConfig.js
// Pure configuration: sizes and orbit params.
// These values are “look-right” guesses, not canonical.

// Helper: Kepler's third law for Outer Wilds
// T = tau * sqrt(r^3 / (4e8))
// where T is period in seconds, r is orbital radius in meters, tau = 2*pi
function keplerPeriod(radiusMeters) {
  const TAU = Math.PI * 2;
  const K = 4e8; // Outer Wilds constant
  return TAU * Math.sqrt((radiusMeters ** 3) / K);
}

// Scale factor to convert game meters to visualization units
// (adjust this to make orbits look right in your visualization)
const SCALE = 1 / 100; // 100 game meters = 1 visual unit

export const solarConfig = {
  timeScale: 0.25, // speed up time if needed (e.g., 60 = 60x faster)
  order: [
    "Sun",
    "TwinsBarycenter",
    "AshTwin",
    "EmberTwin",
    "TimberHearth",
    "Attlerock",
    "BrittleHollow",
    "HollowsLantern",
    "GiantsDeep",
    "DarkBramble",
  ],
  bodies: {
    Sun: {
      type: "sun",
      radius: 2001.75 * SCALE, // from spreadsheet: ~4000m at end of loop
    },

    // Hourglass Twins: barycenter orbits the sun
    TwinsBarycenter: {
      type: "barycenter",
      orbit: {
        radius: 5000 * SCALE,
        period: keplerPeriod(5000),
        phase: 0.2,
        inclination: 0.05,
      },
    },
    AshTwin: {
      type: "binaryChild",
      parent: "TwinsBarycenter",
      orbit: {
        radius: 250 * SCALE,        // each twin orbits 250m from barycenter
        period: keplerPeriod(250),
        phase: 0.0,
        inclination: 0.02,
      },
      radius: 169 * SCALE,          // from spreadsheet
    },
    EmberTwin: {
      type: "binaryChild",
      parent: "TwinsBarycenter",
      orbit: {
        radius: 250 * SCALE,
        period: keplerPeriod(250),
        phase: Math.PI,             // opposite side of barycenter
        inclination: 0.02,
      },
      radius: 170 * SCALE,
    },

    TimberHearth: {
      type: "primary",
      orbit: {
        radius: 8593.085981 * SCALE,
        period: keplerPeriod(8593.085981),
        phase: 1.3,
        inclination: 0.03,
      },
      radius: 254 * SCALE,
    },
    Attlerock: {
      type: "moon",
      parent: "TimberHearth",
      orbit: {
        radius: 900 * SCALE,
        period: keplerPeriod(900),
        phase: 0.0,
        inclination: 0.15,
      },
      radius: 80 * SCALE,
    },

    BrittleHollow: {
      type: "primary",
      orbit: {
        radius: 11690.89092 * SCALE,
        period: keplerPeriod(11690.89092),
        phase: 2.4,
        inclination: 0.02,
      },
      radius: 272 * SCALE,
    },
    HollowsLantern: {
      type: "moon",
      parent: "BrittleHollow",
      orbit: {
        radius: 1000 * SCALE,
        period: keplerPeriod(1000),
        phase: 0.8,
        inclination: 0.1,
      },
      radius: 97.3 * SCALE,
    },

    GiantsDeep: {
      type: "primary",
      orbit: {
        radius: 16457.58738 * SCALE,
        period: keplerPeriod(16457.58738),
        phase: 0.5,
        inclination: 0.01,
      },
      radius: 500 * SCALE,
    },

    DarkBramble: {
      type: "primary",
      orbit: {
        radius: 20000 * SCALE,
        period: keplerPeriod(20000),
        phase: 3.2,
        inclination: 0.04,
      },
      radius: 203.3 * SCALE,
    },
  },
};
