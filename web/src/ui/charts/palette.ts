export const SERIES = { entry: "#bf841c", bounty: "#2f93b8", treasury: "#bf841c" } as const;
export const HEAT_RAMP = ["#6a5520", "#8f6f1f", "#b5891f", "#dba52c", "#ffcf5a"] as const;
export const HEAT_EMPTY = "#163847";
export const CHART_SURFACE = "#0f2a38";
export const GRID = "rgb(255 255 255 / 0.08)";

export function heatColor(share: number): string {
  if (share <= 0) return HEAT_EMPTY;
  const i = Math.min(HEAT_RAMP.length - 1, Math.floor(share * HEAT_RAMP.length));
  return HEAT_RAMP[i] as string;
}
