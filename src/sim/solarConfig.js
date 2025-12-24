// src/sim/solarConfig.js
// Pure configuration: sizes and orbit params.
// These values are “look-right” guesses, not canonical.

export const solarConfig = {
  timeScale: 1, // increase later if orbits feel too slow
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
      radius: 70,
    },

    // Hourglass Twins: barycenter orbits the sun
    TwinsBarycenter: {
      type: "barycenter",
      orbit: {
        radius: 220,
        period: 50,       // seconds per orbit (tweak)
        phase: 0.2,
        inclination: 0.05 // slight tilt
      },
    },
    AshTwin: {
      type: "binaryChild",
      parent: "TwinsBarycenter",
      orbit: {
        radius: 28,
        period: 8,        // twins orbit each other quickly
        phase: 0.0,
        inclination: 0.02
      },
      radius: 18,
    },
    EmberTwin: {
      type: "binaryChild",
      parent: "TwinsBarycenter",
      orbit: {
        radius: 28,
        period: 8,
        phase: Math.PI,   // opposite side of barycenter
        inclination: 0.02
      },
      radius: 16,
    },

    TimberHearth: {
      type: "primary",
      orbit: { radius: 320, period: 75, phase: 1.3, inclination: 0.03 },
      radius: 26,
    },
    Attlerock: {
      type: "moon",
      parent: "TimberHearth",
      orbit: { radius: 55, period: 16, phase: 0.0, inclination: 0.15 },
      radius: 9,
    },

    BrittleHollow: {
      type: "primary",
      orbit: { radius: 430, period: 100, phase: 2.4, inclination: 0.02 },
      radius: 36,
    },
    HollowsLantern: {
      type: "moon",
      parent: "BrittleHollow",
      orbit: { radius: 70, period: 12, phase: 0.8, inclination: 0.1 },
      radius: 10,
    },

    GiantsDeep: {
      type: "primary",
      orbit: { radius: 560, period: 140, phase: 0.5, inclination: 0.01 },
      radius: 50,
    },

    DarkBramble: {
      type: "primary",
      orbit: { radius: 720, period: 190, phase: 3.2, inclination: 0.04 },
      radius: 40,
    },
  },
};
