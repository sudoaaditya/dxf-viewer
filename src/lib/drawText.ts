import type { CameraState, TextEntity, TextRun } from "../types/dxf";
import { worldToScreen } from "./camera";

/** AutoCAD text height is cap height. Arial's cap height is 0.716 em; other fonts are measured. */
const ARIAL_CAP_RATIO = 0.716;
const DESCENT_RATIO = 0.21;
const MIN_CAP_PX = 4;
/** Layout units: the entity's cap height is REF, so a layout is reused at every zoom. */
const REF = 100;

type FontFace = { family: string; bold: boolean; italic: boolean };

type Piece = {
  text: string;
  run: TextRun;
  face: FontFace;
  /** Font size and start x in layout units. */
  fontSize: number;
  x: number;
  width: number;
  scale: number;
  widthFactor: number;
  oblique: number;
};

type Line = { pieces: Piece[]; width: number; scale: number };

type Layout = {
  lines: Line[];
  /** Baseline of each line, downward from the anchor, in layout units. */
  baselines: number[];
  maxWidth: number;
  maxScale: number;
  extent: number;
};

let measureCtx: CanvasRenderingContext2D | null = null;
const layoutCache = new WeakMap<TextEntity, Layout>();
const capCache = new Map<string, number>();

function measurer(): CanvasRenderingContext2D | null {
  measureCtx ??= document.createElement("canvas").getContext("2d");
  return measureCtx;
}

function cssFont(face: FontFace, px: number): string {
  return `${face.italic ? "italic " : ""}${face.bold ? "bold " : ""}${px}px ${face.family}`;
}

/** Cap height / em for a face, so `height` maps to capital-letter height in any font. */
function capRatio(face: FontFace): number {
  const key = cssFont(face, REF);
  let ratio = capCache.get(key);
  if (ratio === undefined) {
    const m = measurer();
    if (m) m.font = key;
    const ascent = m?.measureText("H").actualBoundingBoxAscent ?? 0;
    ratio = ascent > 0 ? ascent / REF : ARIAL_CAP_RATIO;
    capCache.set(key, ratio);
  }
  return ratio;
}

/**
 * Positions every run of the entity in layout units: word wrap to the MTEXT width across
 * runs, each line as tall as its tallest run, baselines placed for the attachment point.
 */
function buildLayout(text: TextEntity, m: CanvasRenderingContext2D): Layout {
  const paragraphs: TextRun[][] = text.runs ?? text.lines.map((line) => [{ text: line }]);
  const limit = text.width > 0 && text.height > 0 ? (text.width / text.height) * REF : Infinity;
  const lines: Line[] = [];

  for (const runs of paragraphs) {
    let line: Line = { pieces: [], width: 0, scale: 0 };
    const finish = () => {
      // Trailing spaces do not count toward alignment.
      const last = line.pieces[line.pieces.length - 1];
      if (last && /\s$/.test(last.text)) {
        last.text = last.text.replace(/\s+$/, "");
        m.font = cssFont(last.face, last.fontSize);
        const trimmed = m.measureText(last.text).width * last.widthFactor;
        line.width -= last.width - trimmed;
        last.width = trimmed;
      }
      if (!line.scale) line.scale = 1;
      lines.push(line);
      line = { pieces: [], width: 0, scale: 0 };
    };

    for (const run of runs) {
      const face: FontFace = {
        family: run.fontFamily ?? text.fontFamily,
        bold: run.bold ?? text.bold,
        italic: run.italic ?? text.italic,
      };
      const scale = run.scale ?? 1;
      const widthFactor = run.widthFactor ?? text.widthFactor;
      const oblique = run.oblique ?? text.oblique;
      const fontSize = (REF * scale) / capRatio(face);
      m.font = cssFont(face, fontSize);
      // Split after spaces so wrapping happens between words; one token when not wrapping.
      const tokens = Number.isFinite(limit) ? run.text.split(/(?<= )/) : [run.text];
      for (let token of tokens) {
        let width = m.measureText(token).width * widthFactor;
        if (line.width > 0 && line.width + width > limit && token.trim()) {
          finish();
          token = token.replace(/^\s+/, "");
          width = m.measureText(token).width * widthFactor;
        }
        const prev = line.pieces[line.pieces.length - 1];
        if (prev && prev.run === run) {
          prev.text += token;
          prev.width += width;
        } else {
          line.pieces.push({ text: token, run, face, fontSize, x: line.width, width, scale, widthFactor, oblique });
        }
        line.width += width;
        line.scale = Math.max(line.scale, scale);
      }
    }
    finish();
  }

  // AutoCAD keeps "at least" line spacing: a line with taller text pushes the next baseline down.
  const spacing = text.height > 0 ? (text.lineSpacing / text.height) * REF : REF * (5 / 3);
  const baselines: number[] = [];
  let y = 0;
  lines.forEach((line, i) => {
    y = i === 0 ? REF * line.scale : y + spacing * Math.max(1, line.scale);
    baselines.push(y);
  });
  const first = baselines[0] ?? REF;
  const last = baselines[baselines.length - 1] ?? REF;
  const lastScale = lines[lines.length - 1]?.scale ?? 1;
  const shift =
    text.valign === "top"
      ? 0
      : text.valign === "middle"
        ? -last / 2
        : text.valign === "bottom"
          ? -last - (DESCENT_RATIO * REF * lastScale) / ARIAL_CAP_RATIO
          : -first;
  for (let i = 0; i < baselines.length; i += 1) baselines[i] += shift;

  let maxWidth = 0;
  let maxScale = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, line.width);
    maxScale = Math.max(maxScale, line.scale);
  }
  return { lines, baselines, maxWidth, maxScale, extent: last + REF };
}

function layoutOf(text: TextEntity): Layout | null {
  let layout = layoutCache.get(text);
  if (!layout) {
    const m = measurer();
    if (!m) return null;
    layout = buildLayout(text, m);
    layoutCache.set(text, layout);
  }
  return layout;
}

/**
 * Draws a TEXT/MTEXT entity on the overlay. `colorOf` resolves a run's color, falling back
 * to the entity's own color for runs without \C or \c.
 */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: TextEntity,
  cam: CameraState,
  w: number,
  h: number,
  colorOf: (run: TextRun) => string,
) {
  const capPx = text.height * cam.zoom;
  if (capPx * 2 < MIN_CAP_PX) return;
  const layout = layoutOf(text);
  if (!layout || capPx * layout.maxScale < MIN_CAP_PX) return;
  const k = capPx / REF;
  const p = worldToScreen(text.x, text.y, cam, w, h);
  const reach = (Math.max(layout.maxWidth, layout.extent) + REF) * k;
  if (p.x < -reach || p.y < -reach || p.x > w + reach || p.y > h + reach) return;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate((-text.rotation * Math.PI) / 180);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  layout.lines.forEach((line, i) => {
    const startX = text.align === "left" ? 0 : text.align === "center" ? -line.width / 2 : -line.width;
    const baseline = layout.baselines[i] * k;
    for (const piece of line.pieces) {
      if (!piece.text) continue;
      ctx.save();
      ctx.translate((startX + piece.x) * k, baseline);
      // Width factor stretches glyphs horizontally; oblique slants their tops right (screen y points down).
      ctx.transform(piece.widthFactor, 0, -Math.tan((piece.oblique * Math.PI) / 180), 1, 0, 0);
      ctx.font = cssFont(piece.face, piece.fontSize * k);
      const color = colorOf(piece.run);
      ctx.fillStyle = color;
      ctx.fillText(piece.text, 0, 0);
      const { underline, overline, strike } = piece.run;
      if (underline || overline || strike) {
        const cap = REF * piece.scale * k;
        const thick = Math.max(1, cap * 0.08);
        const length = (piece.width * k) / piece.widthFactor;
        if (underline) ctx.fillRect(0, cap * 0.18, length, thick);
        if (overline) ctx.fillRect(0, -cap * 1.25, length, thick);
        if (strike) ctx.fillRect(0, -cap * 0.5, length, thick);
      }
      ctx.restore();
    }
  });
  ctx.restore();
}
