export type MoodName = "day" | "golden" | "dawn" | "dusk";

export interface Mood {
  readonly sky: readonly [string, string, string];
  readonly deep: string;
  readonly shallow: string;
  readonly foam: string;
  readonly fog: string;
  readonly hemiSky: string;
  readonly hemiGround: string;
  readonly hemi: number;
  readonly sun: string;
  readonly sunPower: number;
  readonly sunAt: readonly [number, number, number];
}

export const MOODS: Readonly<Record<MoodName, Mood>> = {
  day: {
    sky: ["#1f7fd6", "#6cc4f7", "#bfe9ff"],
    deep: "#0a5c94",
    shallow: "#2ec3d6",
    foam: "#f4fcff",
    fog: "#bfe9ff",
    hemiSky: "#e6f6ff",
    hemiGround: "#2b7a90",
    hemi: 1.4,
    sun: "#fff3da",
    sunPower: 2.6,
    sunAt: [-14, 22, 12],
  },
  golden: {
    sky: ["#3558a8", "#f59a62", "#ffd9a0"],
    deep: "#135080",
    shallow: "#4fb3b0",
    foam: "#fff2df",
    fog: "#ffd9a0",
    hemiSky: "#ffe0b8",
    hemiGround: "#2a5f72",
    hemi: 1.25,
    sun: "#ffb066",
    sunPower: 2.9,
    sunAt: [-24, 10, 4],
  },
  dawn: {
    sky: ["#4a78d0", "#f5a8c6", "#ffd3e2"],
    deep: "#155f90",
    shallow: "#5cc0d8",
    foam: "#fff6fa",
    fog: "#ffd3e2",
    hemiSky: "#f4e4ff",
    hemiGround: "#2c6c88",
    hemi: 1.3,
    sun: "#ffd8cf",
    sunPower: 2.4,
    sunAt: [20, 13, 10],
  },
  dusk: {
    sky: ["#141c5a", "#6d4fb5", "#ff9c86"],
    deep: "#172a66",
    shallow: "#4672c6",
    foam: "#eef0ff",
    fog: "#f29a90",
    hemiSky: "#cdbcff",
    hemiGround: "#1d3a66",
    hemi: 1.25,
    sun: "#ffb59a",
    sunPower: 2.3,
    sunAt: [14, 6, -12],
  },
};
