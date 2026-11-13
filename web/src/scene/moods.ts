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
    sky: ["#3d8fd0", "#9ad6ff", "#e9f6ff"],
    deep: "#0f5f86",
    shallow: "#3fb6c9",
    foam: "#f2fbff",
    fog: "#cfeeff",
    hemiSky: "#dff4ff",
    hemiGround: "#2b6b80",
    hemi: 1.35,
    sun: "#fff1d6",
    sunPower: 2.4,
    sunAt: [-14, 22, 12],
  },
  golden: {
    sky: ["#3c5a9c", "#f2a46c", "#ffe2b8"],
    deep: "#16486a",
    shallow: "#5aa9a6",
    foam: "#fff2df",
    fog: "#f4cfa6",
    hemiSky: "#ffdcb4",
    hemiGround: "#2a5a6c",
    hemi: 1.2,
    sun: "#ffb46e",
    sunPower: 2.7,
    sunAt: [-24, 10, 4],
  },
  dawn: {
    sky: ["#5a80c8", "#f2b8cc", "#fdeaf1"],
    deep: "#195c84",
    shallow: "#68b9cf",
    foam: "#fff6fa",
    fog: "#efd9e6",
    hemiSky: "#f4e4ff",
    hemiGround: "#2c6680",
    hemi: 1.3,
    sun: "#ffd8cf",
    sunPower: 2.3,
    sunAt: [20, 13, 10],
  },
  dusk: {
    sky: ["#1f2f5c", "#5c6ea8", "#c7b3d2"],
    deep: "#1a3358",
    shallow: "#3f74a0",
    foam: "#e6eeff",
    fog: "#9da3c6",
    hemiSky: "#bcc6ff",
    hemiGround: "#1b4256",
    hemi: 1.15,
    sun: "#d9c8ff",
    sunPower: 2,
    sunAt: [12, 16, -10],
  },
};
