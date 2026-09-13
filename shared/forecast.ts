import type { PlayerData } from "./model.ts";
export function calibratedForecast(
  players: PlayerData[],
  scored: {
    sampleSize: number;
    mae: number | null;
    bias: number | null;
    points: { error: number }[];
  },
) {
  if (scored.sampleSize < 30 || scored.bias === null || scored.mae === null)
    return {
      available: false,
      reason:
        "At least 30 prospectively scored forecasts are required before estimating a calibrated range.",
      sampleSize: scored.sampleSize,
      players: [],
    };
  const sorted = scored.points.map((p) => p.error).sort((a, b) => a - b);
  const quantile = (q: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))];
  return {
    available: true,
    reason:
      "Exploratory calibration using observed errors from stored Yahoo forecasts. Pooled across positions; ranges are not guaranteed.",
    sampleSize: scored.sampleSize,
    players: players
      .filter((p) => !p.locked && p.projected !== null)
      .map((p) => ({
        id: p.id,
        name: p.name,
        providerProjection: p.projected,
        calibratedProjection:
          Math.round((p.projected! + scored.bias!) * 100) / 100,
        lower: Math.round((p.projected! + quantile(0.1)) * 100) / 100,
        upper: Math.round((p.projected! + quantile(0.9)) * 100) / 100,
      })),
  };
}
