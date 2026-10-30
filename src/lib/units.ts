const UNIT_LABELS: Record<number, string> = {
  0: "unitless",
  1: "in",
  2: "ft",
  3: "mi",
  4: "mm",
  5: "cm",
  6: "m",
  7: "km",
  8: "µin",
  9: "mil",
  10: "yd",
  11: "Å",
  12: "nm",
  13: "µm",
  14: "dm",
  15: "dam",
  16: "hm",
  17: "giga-m",
  18: "AU",
  19: "ly",
  20: "pc",
};

export function unitLabel(code: number): string {
  return UNIT_LABELS[code] ?? "units";
}

export function formatLength(value: number, units: number): string {
  const abs = Math.abs(value);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 3 : 4;
  return `${value.toFixed(digits)} ${unitLabel(units)}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatCount(n: number): string {
  return n.toLocaleString();
}

/** Meters per INSUNITS code; missing codes (0 = unitless) cannot be converted. */
const METERS_PER_UNIT: Record<number, number> = {
  1: 0.0254,
  2: 0.3048,
  3: 1609.344,
  4: 0.001,
  5: 0.01,
  6: 1,
  7: 1000,
  8: 2.54e-8,
  9: 2.54e-5,
  10: 0.9144,
  11: 1e-10,
  12: 1e-9,
  13: 1e-6,
  14: 0.1,
  15: 10,
  16: 100,
  17: 1e9,
  18: 1.495978707e11,
  19: 9.4607304725808e15,
  20: 3.0856775814913673e16,
};

export const UNIT_CODES = Object.keys(UNIT_LABELS).map(Number);

export function isConvertible(code: number): boolean {
  return code in METERS_PER_UNIT;
}

export type UnitSystem = "drawing" | "metric" | "imperial";
export const METRIC_UNITS = ["mm", "cm", "m", "km"] as const;
export const IMPERIAL_UNITS = ["in", "ft", "ft-in", "yd", "mi"] as const;
export type MetricUnit = (typeof METRIC_UNITS)[number];
export type ImperialUnit = (typeof IMPERIAL_UNITS)[number];

const METERS_PER_DISPLAY: Record<MetricUnit | ImperialUnit, number> = {
  mm: 0.001,
  cm: 0.01,
  m: 1,
  km: 1000,
  in: 0.0254,
  ft: 0.3048,
  "ft-in": 0.3048,
  yd: 0.9144,
  mi: 1609.344,
};

export type UnitPrefs = { system: UnitSystem; metric: MetricUnit; imperial: ImperialUnit };

/** Formats drawing-space lengths and coordinates in the user's chosen units. */
export type UnitFormat = {
  label: string;
  /** False when the user picked metric/imperial but the drawing unit is unknown. */
  converted: boolean;
  length: (value: number) => string;
  coord: (value: number) => string;
};

function feetInches(feet: number): string {
  const sign = feet < 0 ? "-" : "";
  const totalInches = Math.round(Math.abs(feet) * 12 * 100) / 100;
  const ft = Math.floor(totalInches / 12);
  const inches = totalInches - ft * 12;
  return `${sign}${ft}' ${inches.toFixed(2)}"`;
}

export function unitFormat(prefs: UnitPrefs, drawingUnits: number): UnitFormat {
  const target = prefs.system === "metric" ? prefs.metric : prefs.system === "imperial" ? prefs.imperial : null;
  if (!target || !isConvertible(drawingUnits)) {
    return {
      label: unitLabel(drawingUnits),
      converted: !target,
      length: (value) => formatLength(value, drawingUnits),
      coord: (value) => value.toFixed(3),
    };
  }
  const factor = METERS_PER_UNIT[drawingUnits] / METERS_PER_DISPLAY[target];
  if (target === "ft-in") {
    return { label: "ft-in", converted: true, length: (value) => feetInches(value * factor), coord: (value) => feetInches(value * factor) };
  }
  return {
    label: target,
    converted: true,
    length: (value) => {
      const v = value * factor;
      const abs = Math.abs(v);
      return `${v.toFixed(abs >= 1000 ? 2 : abs >= 1 ? 3 : 4)} ${target}`;
    },
    coord: (value) => (value * factor).toFixed(3),
  };
}
