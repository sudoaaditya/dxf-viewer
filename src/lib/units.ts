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
