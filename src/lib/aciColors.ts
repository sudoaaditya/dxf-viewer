import type { Rgb } from "../types/dxf";

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      return [v, t, p];
    case 1:
      return [q, v, p];
    case 2:
      return [p, v, t];
    case 3:
      return [p, q, v];
    case 4:
      return [t, p, v];
    default:
      return [v, p, q];
  }
}

const NAMED: Record<number, Rgb> = {
  0: [0, 0, 0],
  1: [255, 0, 0],
  2: [255, 255, 0],
  3: [0, 255, 0],
  4: [0, 255, 255],
  5: [0, 0, 255],
  6: [255, 0, 255],
  7: [255, 255, 255],
  8: [128, 128, 128],
  9: [192, 192, 192],
};

const GRAYS: Rgb[] = [
  [51, 51, 51],
  [102, 102, 102],
  [153, 153, 153],
  [204, 204, 204],
  [254, 254, 254],
  [128, 128, 128],
];

const palette: Rgb[] = new Array(256);

for (let i = 0; i < 256; i += 1) {
  if (NAMED[i]) {
    palette[i] = NAMED[i];
    continue;
  }
  if (i >= 250) {
    palette[i] = GRAYS[i - 250] ?? [128, 128, 128];
    continue;
  }
  const idx = i - 10;
  const hue = (idx % 24) / 24;
  const row = Math.floor(idx / 24);
  const sat = row < 5 ? 1 : 0.55;
  const val = [1, 0.8, 0.6, 0.45, 0.3][row % 5] ?? 0.7;
  const [r, g, b] = hsvToRgb(hue, sat, val);
  palette[i] = [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

export function aciRgb(index: number): Rgb {
  return palette[Math.abs(index) & 255] ?? [255, 255, 255];
}

export function displayRgb(aci: number, dark: boolean): Rgb {
  const [r, g, b] = aciRgb(aci);
  if (dark && r < 8 && g < 8 && b < 8) return [230, 230, 230];
  if (!dark && r > 248 && g > 248 && b > 248) return [20, 20, 20];
  return [r, g, b];
}

export function rgbCss(rgb: Rgb): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}
