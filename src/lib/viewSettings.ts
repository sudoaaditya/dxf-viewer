import type { Rgb } from "../types/dxf";
import { IMPERIAL_UNITS, METRIC_UNITS, type UnitPrefs } from "./units";

export type ViewSettings = UnitPrefs & {
  /** Viewer background as #rrggbb, or null to follow the light/dark theme. */
  background: string | null;
};

export const BACKGROUND_PRESETS = [
  { name: "Black", value: "#000000" },
  { name: "Graphite", value: "#262a31" },
  { name: "Blueprint", value: "#0e2a4d" },
  { name: "White", value: "#ffffff" },
  { name: "Paper", value: "#f4efe1" },
];

const STORAGE_KEY = "dxf-viewer:view-settings";

const DEFAULTS: ViewSettings = { system: "drawing", metric: "mm", imperial: "ft-in", background: null };

const HEX = /^#[0-9a-f]{6}$/i;

export function loadViewSettings(): ViewSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Partial<ViewSettings>;
    return {
      system: raw.system === "metric" || raw.system === "imperial" ? raw.system : DEFAULTS.system,
      metric: METRIC_UNITS.includes(raw.metric as never) ? raw.metric! : DEFAULTS.metric,
      imperial: IMPERIAL_UNITS.includes(raw.imperial as never) ? raw.imperial! : DEFAULTS.imperial,
      background: typeof raw.background === "string" && HEX.test(raw.background) ? raw.background : null,
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveViewSettings(settings: ViewSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private windows and blocked storage: settings just will not persist.
  }
}

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** True when light linework reads better than dark on this color (relative luminance < 0.4). */
export function isDarkColor([r, g, b]: Rgb): boolean {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b) < 0.4;
}
