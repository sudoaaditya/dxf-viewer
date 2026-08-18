import { aciRgb } from "../lib/aciColors";
import type {
  DrawingBounds,
  LayerGeometry,
  ParseProgress,
  ParsedDrawing,
  TextEntity,
} from "../types/dxf";
import {
  FloatBag,
  composeXform,
  identityXform,
  makeXform,
  type Xform,
} from "./buffers";
import {
  tessellateArc,
  tessellateCircle,
  tessellateEllipse,
  tessellateLine,
  tessellatePoint,
  tessellatePolyline,
  tessellateSpline,
  type EmitSeg,
} from "./tessellate";

type ProgressCb = (p: ParseProgress) => void;

type LayerInfo = {
  name: string;
  color: number;
  frozen: boolean;
  off: boolean;
};

type Vert = { x: number; y: number; bulge: number };

type RawEntity =
  | { t: "LINE"; layer: string; color: number; x1: number; y1: number; x2: number; y2: number }
  | { t: "CIRCLE"; layer: string; color: number; cx: number; cy: number; r: number }
  | {
      t: "ARC";
      layer: string;
      color: number;
      cx: number;
      cy: number;
      r: number;
      a0: number;
      a1: number;
    }
  | {
      t: "ELLIPSE";
      layer: string;
      color: number;
      cx: number;
      cy: number;
      mjx: number;
      mjy: number;
      ratio: number;
      a0: number;
      a1: number;
    }
  | { t: "POLY"; layer: string; color: number; closed: boolean; verts: Vert[] }
  | { t: "POINT"; layer: string; color: number; x: number; y: number }
  | {
      t: "SOLID";
      layer: string;
      color: number;
      pts: [number, number][];
    }
  | { t: "SPLINE"; layer: string; color: number; controls: [number, number][]; fit: [number, number][] }
  | {
      t: "INSERT";
      layer: string;
      color: number;
      name: string;
      x: number;
      y: number;
      sx: number;
      sy: number;
      rot: number;
    }
  | {
      t: "TEXT";
      layer: string;
      color: number;
      x: number;
      y: number;
      height: number;
      rotation: number;
      value: string;
    };

type BlockDef = {
  name: string;
  baseX: number;
  baseY: number;
  entities: RawEntity[];
};

type GroupValue = string | number | number[];
type GroupMap = Map<number, GroupValue>;

function skipLineEnd(text: string, i: number): number {
  if (text.charCodeAt(i) === 13) i += 1;
  if (text.charCodeAt(i) === 10) i += 1;
  return i;
}

function lineEnd(text: string, i: number, n: number): number {
  while (i < n) {
    const c = text.charCodeAt(i);
    if (c === 10 || c === 13) return i;
    i += 1;
  }
  return n;
}

function parseIntFast(text: string, start: number, end: number): number {
  let i = start;
  while (i < end && text.charCodeAt(i) <= 32) i += 1;
  let sign = 1;
  if (text.charCodeAt(i) === 45) {
    sign = -1;
    i += 1;
  } else if (text.charCodeAt(i) === 43) {
    i += 1;
  }
  let n = 0;
  let any = false;
  while (i < end) {
    const c = text.charCodeAt(i);
    if (c < 48 || c > 57) break;
    n = n * 10 + (c - 48);
    any = true;
    i += 1;
  }
  return any ? n * sign : 0;
}

function trimSlice(text: string, start: number, end: number): string {
  while (start < end && text.charCodeAt(start) <= 32) start += 1;
  while (end > start && text.charCodeAt(end - 1) <= 32) end -= 1;
  return text.slice(start, end);
}

function num(groups: GroupMap, code: number, fallback = 0): number {
  const v = groups.get(code);
  if (typeof v === "number") return Number.isFinite(v) ? v : fallback;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  if (Array.isArray(v)) {
    const n = v[0];
    return Number.isFinite(n) ? n : fallback;
  }
  return fallback;
}

function str(groups: GroupMap, code: number, fallback = ""): string {
  const v = groups.get(code);
  if (v == null) return fallback;
  return String(v);
}

function resolveColor(entityColor: number, layerColor: number, blockColor: number): number {
  if (entityColor === 0) return blockColor || layerColor || 7;
  if (entityColor === 256 || entityColor === 257) return layerColor || 7;
  if (!entityColor) return layerColor || 7;
  return entityColor;
}

function cleanMtext(value: string): string {
  return value
    .replace(/\\P/g, "\n")
    .replace(/\\[A-Za-z][^;\\]*;?/g, "")
    .replace(/[{}]/g, "")
    .replace(/%%[cCdDoO]/g, "")
    .trim();
}

export function parseDxf(text: string, fileName: string, fileBytes: number, onProgress?: ProgressCb): ParsedDrawing {
  const started = performance.now();
  const n = text.length;
  let i = 0;
  if (text.charCodeAt(0) === 0xfeff) i = 1;

  if (text.startsWith("AutoCAD Binary DXF") || text.includes("AutoCAD Binary DXF")) {
    throw new Error("Binary DXF files are not supported. Re-save the drawing as ASCII DXF.");
  }

  const layers = new Map<string, LayerInfo>();
  layers.set("0", { name: "0", color: 7, frozen: false, off: false });

  const blocks = new Map<string, BlockDef>();
  const modelEntities: RawEntity[] = [];
  const typeCounts: Record<string, number> = {};
  let skipped = 0;
  let units = 0;
  let headerMinX = Infinity;
  let headerMinY = Infinity;
  let headerMaxX = -Infinity;
  let headerMaxY = -Infinity;

  let section = "";
  let table = "";
  const ctx = { currentBlock: null as BlockDef | null };
  let entityType = "";
  const groups: GroupMap = new Map();
  let inPolyline = false;
  let polyVerts: Vert[] = [];
  let polyLayer = "0";
  let polyColor = 256;
  let polyClosed = false;
  let lastHeaderVar = "";

  const report = (stage: ParseProgress["stage"], progress: number, message: string) => {
    onProgress?.({ stage, progress, message });
  };

  let lastReport = 0;
  const maybeReport = () => {
    if (i - lastReport < 2_000_000) return;
    lastReport = i;
    report("parse", Math.min(0.98, i / Math.max(n, 1)), `Scanning DXF… ${Math.round((i / n) * 100)}%`);
  };

  const target = (): RawEntity[] => (ctx.currentBlock ? ctx.currentBlock.entities : modelEntities);

  const bump = (t: string) => {
    typeCounts[t] = (typeCounts[t] ?? 0) + 1;
  };

  const flushPolyline = () => {
    if (!inPolyline) return;
    if (polyVerts.length >= 2) {
      target().push({
        t: "POLY",
        layer: polyLayer,
        color: polyColor,
        closed: polyClosed,
        verts: polyVerts,
      });
      bump("POLYLINE");
    } else {
      skipped += 1;
    }
    inPolyline = false;
    polyVerts = [];
  };

  const finishEntity = (type: string) => {
    if (type === "VERTEX" && inPolyline) {
      polyVerts.push({
        x: num(groups, 10),
        y: num(groups, 20),
        bulge: num(groups, 42),
      });
      return;
    }
    if (type === "SEQEND") {
      flushPolyline();
      return;
    }
    if (num(groups, 67) === 1) {
      skipped += 1;
      return;
    }

    const layer = str(groups, 8, "0") || "0";
    const color = Math.trunc(num(groups, 62, 256));

    switch (type) {
      case "LINE":
      case "3DLINE":
      case "XLINE":
      case "RAY":
        target().push({
          t: "LINE",
          layer,
          color,
          x1: num(groups, 10),
          y1: num(groups, 20),
          x2: num(groups, 11),
          y2: num(groups, 21),
        });
        bump(type === "3DLINE" ? "LINE" : type);
        break;
      case "CIRCLE":
        target().push({
          t: "CIRCLE",
          layer,
          color,
          cx: num(groups, 10),
          cy: num(groups, 20),
          r: num(groups, 40),
        });
        bump("CIRCLE");
        break;
      case "ARC":
        target().push({
          t: "ARC",
          layer,
          color,
          cx: num(groups, 10),
          cy: num(groups, 20),
          r: num(groups, 40),
          a0: num(groups, 50),
          a1: num(groups, 51),
        });
        bump("ARC");
        break;
      case "ELLIPSE":
        target().push({
          t: "ELLIPSE",
          layer,
          color,
          cx: num(groups, 10),
          cy: num(groups, 20),
          mjx: num(groups, 11),
          mjy: num(groups, 21),
          ratio: num(groups, 40, 1),
          a0: num(groups, 41, 0),
          a1: num(groups, 42, Math.PI * 2),
        });
        bump("ELLIPSE");
        break;
      case "POINT":
        target().push({
          t: "POINT",
          layer,
          color,
          x: num(groups, 10),
          y: num(groups, 20),
        });
        bump("POINT");
        break;
      case "LWPOLYLINE": {
        const verts: Vert[] = [];
        const xs = groups.get(10);
        const ys = groups.get(20);
        const bulges = groups.get(42);
        if (Array.isArray(xs) && Array.isArray(ys)) {
          const bx = xs as unknown as number[];
          const by = ys as unknown as number[];
          const bb = Array.isArray(bulges) ? (bulges as unknown as number[]) : [];
          for (let k = 0; k < bx.length; k += 1) {
            verts.push({ x: bx[k], y: by[k] ?? 0, bulge: bb[k] ?? 0 });
          }
        }
        const flags = Math.trunc(num(groups, 70));
        if (verts.length >= 2) {
          target().push({
            t: "POLY",
            layer,
            color,
            closed: (flags & 1) === 1,
            verts,
          });
          bump("LWPOLYLINE");
        } else {
          skipped += 1;
        }
        break;
      }
      case "POLYLINE": {
        flushPolyline();
        inPolyline = true;
        polyLayer = layer;
        polyColor = color;
        polyClosed = (Math.trunc(num(groups, 70)) & 1) === 1;
        polyVerts = [];
        break;
      }
      case "SOLID":
      case "TRACE":
      case "3DFACE": {
        const pts: [number, number][] = [
          [num(groups, 10), num(groups, 20)],
          [num(groups, 11), num(groups, 21)],
          [num(groups, 12), num(groups, 22)],
          [num(groups, 13), num(groups, 23)],
        ];
        target().push({ t: "SOLID", layer, color, pts });
        bump(type);
        break;
      }
      case "SPLINE": {
        const controls: [number, number][] = [];
        const fit: [number, number][] = [];
        const xs = groups.get(10);
        const ys = groups.get(20);
        const fxs = groups.get(11);
        const fys = groups.get(21);
        if (Array.isArray(xs) && Array.isArray(ys)) {
          const cx = xs as unknown as number[];
          const cy = ys as unknown as number[];
          for (let k = 0; k < cx.length; k += 1) controls.push([cx[k], cy[k] ?? 0]);
        }
        if (Array.isArray(fxs) && Array.isArray(fys)) {
          const fx = fxs as unknown as number[];
          const fy = fys as unknown as number[];
          for (let k = 0; k < fx.length; k += 1) fit.push([fx[k], fy[k] ?? 0]);
        }
        target().push({ t: "SPLINE", layer, color, controls, fit });
        bump("SPLINE");
        break;
      }
      case "INSERT":
        target().push({
          t: "INSERT",
          layer,
          color,
          name: str(groups, 2),
          x: num(groups, 10),
          y: num(groups, 20),
          sx: num(groups, 41, 1) || 1,
          sy: num(groups, 42, 1) || 1,
          rot: num(groups, 50),
        });
        bump("INSERT");
        break;
      case "TEXT":
      case "ATTRIB":
      case "ATTDEF":
        target().push({
          t: "TEXT",
          layer,
          color,
          x: num(groups, 11) || num(groups, 10),
          y: num(groups, 21) || num(groups, 20),
          height: num(groups, 40, 1),
          rotation: num(groups, 50),
          value: str(groups, 1),
        });
        bump("TEXT");
        break;
      case "MTEXT":
        target().push({
          t: "TEXT",
          layer,
          color,
          x: num(groups, 10),
          y: num(groups, 20),
          height: num(groups, 40, 1),
          rotation: num(groups, 50),
          value: cleanMtext(str(groups, 3) + str(groups, 1)),
        });
        bump("MTEXT");
        break;
      case "DIMENSION":
      case "ARC_DIMENSION":
      case "LARGE_RADIAL_DIMENSION": {
        const e1x = num(groups, 13);
        const e1y = getCodeY(groups, 13);
        const e2x = num(groups, 14);
        const e2y = getCodeY(groups, 14);
        const dlx = num(groups, 10);
        const dly = num(groups, 20);
        target().push({ t: "LINE", layer, color, x1: e1x, y1: e1y, x2: e2x, y2: e2y });
        target().push({ t: "LINE", layer, color, x1: e1x, y1: e1y, x2: dlx, y2: dly });
        target().push({ t: "LINE", layer, color, x1: e2x, y1: e2y, x2: dlx, y2: dly });
        bump("DIMENSION");
        break;
      }
      case "LEADER":
      case "MLEADER":
      case "MULTILEADER": {
        const xs = groups.get(10);
        const ys = groups.get(20);
        if (Array.isArray(xs) && Array.isArray(ys)) {
          const lx = xs as unknown as number[];
          const ly = ys as unknown as number[];
          for (let k = 0; k < lx.length - 1; k += 1) {
            target().push({
              t: "LINE",
              layer,
              color,
              x1: lx[k],
              y1: ly[k] ?? 0,
              x2: lx[k + 1],
              y2: ly[k + 1] ?? 0,
            });
          }
          bump(type);
        } else {
          skipped += 1;
        }
        break;
      }
      case "HATCH": {
        const xs = groups.get(10);
        const ys = groups.get(20);
        if (Array.isArray(xs) && Array.isArray(ys)) {
          const hx = xs as unknown as number[];
          const hy = ys as unknown as number[];
          if (hx.length >= 2) {
            const verts: Vert[] = [];
            for (let k = 0; k < hx.length; k += 1) {
              verts.push({ x: hx[k], y: hy[k] ?? 0, bulge: 0 });
            }
            target().push({ t: "POLY", layer, color, closed: true, verts });
            bump("HATCH");
            break;
          }
        }
        skipped += 1;
        break;
      }
      case "VIEWPORT":
      case "IMAGE":
      case "WIPEOUT":
      case "OLE2FRAME":
      case "ACAD_PROXY_ENTITY":
        skipped += 1;
        break;
      default:
        if (type && type !== "ENDSEC" && type !== "SECTION" && type !== "TABLE" && type !== "ENDTAB") {
          skipped += 1;
        }
    }
  };

  const pushGroup = (code: number, raw: string) => {
    if (
      code === 10 ||
      code === 20 ||
      code === 11 ||
      code === 21 ||
      code === 12 ||
      code === 22 ||
      code === 13 ||
      code === 23 ||
      code === 14 ||
      code === 24 ||
      code === 42 ||
      code === 40
    ) {
      const value = Number(raw);
      const prev = groups.get(code);
      if (prev === undefined) {
        groups.set(code, value);
      } else if (Array.isArray(prev)) {
        prev.push(value);
      } else {
        groups.set(code, [Number(prev), value]);
      }
      return;
    }
    if (
      (code >= 10 && code < 60) ||
      (code >= 140 && code < 150) ||
      (code >= 210 && code < 240) ||
      code === 62 ||
      code === 67 ||
      code === 70 ||
      code === 71 ||
      code === 72 ||
      code === 73 ||
      code === 90 ||
      code === 91
    ) {
      groups.set(code, Number(raw));
      return;
    }
    groups.set(code, raw);
  };

  const handleZero = (value: string) => {
    if (entityType) {
      if (section === "ENTITIES" || section === "BLOCKS") {
        finishEntity(entityType);
      } else if (section === "TABLES" && table === "LAYER" && entityType === "LAYER") {
        const name = str(groups, 2, "0") || "0";
        const color = Math.trunc(num(groups, 62, 7));
        const flags = Math.trunc(num(groups, 70));
        layers.set(name, {
          name,
          color: Math.abs(color) || 7,
          frozen: (flags & 1) === 1,
          off: color < 0,
        });
      }
    }

    groups.clear();
    entityType = value;

    if (value === "SECTION") {
      section = "";
      return;
    }
    if (value === "ENDSEC") {
      if (inPolyline) flushPolyline();
      section = "";
      ctx.currentBlock = null;
      entityType = "";
      return;
    }
    if (value === "TABLE") {
      table = "";
      return;
    }
    if (value === "ENDTAB") {
      table = "";
      entityType = "";
      return;
    }
    if (value === "BLOCK") {
      ctx.currentBlock = { name: "", baseX: 0, baseY: 0, entities: [] };
      return;
    }
    if (value === "ENDBLK") {
      if (ctx.currentBlock && ctx.currentBlock.name) {
        blocks.set(ctx.currentBlock.name, ctx.currentBlock);
      }
      ctx.currentBlock = null;
      entityType = "";
    }
  };

  report("parse", 0, "Scanning DXF…");

  while (i < n) {
    const codeEnd = lineEnd(text, i, n);
    const code = parseIntFast(text, i, codeEnd);
    i = skipLineEnd(text, codeEnd);
    if (i >= n) break;
    const valEnd = lineEnd(text, i, n);
    const raw = trimSlice(text, i, valEnd);
    i = skipLineEnd(text, valEnd);

    if (code === 0) {
      handleZero(raw);
      continue;
    }

    if (code === 2 && entityType === "SECTION") {
      section = raw;
      continue;
    }
    if (code === 2 && entityType === "TABLE") {
      table = raw;
      continue;
    }
    if (code === 2 && entityType === "BLOCK" && ctx.currentBlock) {
      ctx.currentBlock.name = raw;
    }
    if (entityType === "BLOCK" && ctx.currentBlock) {
      if (code === 10) ctx.currentBlock.baseX = Number(raw) || 0;
      if (code === 20) ctx.currentBlock.baseY = Number(raw) || 0;
    }

    if (section === "HEADER") {
      if (code === 9) lastHeaderVar = raw;
      if (lastHeaderVar === "$INSUNITS" && code === 70) units = parseIntFast(raw, 0, raw.length);
      if (lastHeaderVar === "$EXTMIN") {
        if (code === 10) headerMinX = Number(raw);
        if (code === 20) headerMinY = Number(raw);
      }
      if (lastHeaderVar === "$EXTMAX") {
        if (code === 10) headerMaxX = Number(raw);
        if (code === 20) headerMaxY = Number(raw);
      }
    }

    if (section === "ENTITIES" || section === "BLOCKS" || (section === "TABLES" && table === "LAYER")) {
      pushGroup(code, raw);
    }

    maybeReport();
  }

  if (entityType && (section === "ENTITIES" || section === "BLOCKS")) {
    finishEntity(entityType);
  }
  flushPolyline();

  report("geometry", 0.2, "Building draw lists…");

  const layerBags = new Map<
    string,
    { info: LayerInfo; lines: FloatBag; fills: FloatBag }
  >();

  const ensureLayer = (name: string) => {
    const key = name || "0";
    let bag = layerBags.get(key);
    if (bag) return bag;
    const info = layers.get(key) ?? { name: key, color: 7, frozen: false, off: false };
    if (!layers.has(key)) layers.set(key, info);
    bag = { info, lines: new FloatBag(), fills: new FloatBag() };
    layerBags.set(key, bag);
    return bag;
  };

  const texts: TextEntity[] = [];
  const bounds: DrawingBounds = {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
  };

  const include = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < bounds.minX) bounds.minX = x;
    if (y < bounds.minY) bounds.minY = y;
    if (x > bounds.maxX) bounds.maxX = x;
    if (y > bounds.maxY) bounds.maxY = y;
  };

  const emitTo = (layer: string, _entityColor: number, _blockColor: number): EmitSeg => {
    const bag = ensureLayer(layer);
    return (x1, y1, x2, y2) => {
      bag.lines.push4(x1, y1, x2, y2);
      include(x1, y1);
      include(x2, y2);
    };
  };

  const emitFill = (layer: string, pts: [number, number][], xf: Xform) => {
    const bag = ensureLayer(layer);
    if (pts.length < 3) return;
    const mapped = pts.map(([x, y]) => {
      const [px, py] = [x, y];
      const tx = applyLocal(xf, px, py);
      include(tx[0], tx[1]);
      return tx;
    });
    const a = mapped[0];
    const b = mapped[1];
    const c = mapped[2];
    bag.fills.push6(a[0], a[1], b[0], b[1], c[0], c[1]);
    if (mapped[3] && (mapped[3][0] !== mapped[2][0] || mapped[3][1] !== mapped[2][1])) {
      const d = mapped[3];
      bag.fills.push6(a[0], a[1], c[0], c[1], d[0], d[1]);
    }
  };

  function applyLocal(xf: Xform, x: number, y: number): [number, number] {
    let px = (x - xf.ox) * xf.sx;
    let py = (y - xf.oy) * xf.sy;
    return [px * xf.cos - py * xf.sin + xf.tx, px * xf.sin + py * xf.cos + xf.ty];
  }

  const emitEntity = (ent: RawEntity, xf: Xform, blockColor: number, depth: number) => {
    const emit = emitTo(ent.layer, ent.color, blockColor);
    switch (ent.t) {
      case "LINE":
        tessellateLine(emit, xf, ent.x1, ent.y1, ent.x2, ent.y2);
        break;
      case "CIRCLE":
        tessellateCircle(emit, xf, ent.cx, ent.cy, ent.r);
        break;
      case "ARC":
        tessellateArc(emit, xf, ent.cx, ent.cy, ent.r, ent.a0, ent.a1);
        break;
      case "ELLIPSE":
        tessellateEllipse(emit, xf, ent.cx, ent.cy, ent.mjx, ent.mjy, ent.ratio, ent.a0, ent.a1);
        break;
      case "POLY":
        tessellatePolyline(emit, xf, ent.verts, ent.closed);
        break;
      case "POINT":
        tessellatePoint(emit, xf, ent.x, ent.y, 1);
        break;
      case "SOLID":
        emitFill(ent.layer, ent.pts, xf);
        if (ent.pts.length >= 2) {
          for (let k = 0; k < ent.pts.length; k += 1) {
            const a = ent.pts[k];
            const b = ent.pts[(k + 1) % ent.pts.length];
            tessellateLine(emit, xf, a[0], a[1], b[0], b[1]);
          }
        }
        break;
      case "SPLINE":
        tessellateSpline(emit, xf, ent.controls, ent.fit);
        break;
      case "TEXT": {
        const [x, y] = applyLocal(xf, ent.x, ent.y);
        const rot =
          ent.rotation + (Math.atan2(xf.sin, xf.cos) * 180) / Math.PI;
        texts.push({
          x,
          y,
          height: ent.height * Math.abs(xf.sx),
          rotation: rot,
          value: ent.value,
          layer: ent.layer,
          color: resolveColor(ent.color, ensureLayer(ent.layer).info.color, blockColor),
        });
        include(x, y);
        break;
      }
      case "INSERT": {
        if (depth > 8 || !ent.name) break;
        const block = blocks.get(ent.name);
        if (!block) break;
        const child = makeXform(block.baseX, block.baseY, ent.sx, ent.sy, ent.rot, ent.x, ent.y);
        const next = composeXform(xf, child);
        const inherited = resolveColor(ent.color, ensureLayer(ent.layer).info.color, blockColor);
        for (const childEnt of block.entities) {
          emitEntity(childEnt, next, inherited, depth + 1);
        }
        break;
      }
    }
  };

  const total = modelEntities.length;
  for (let e = 0; e < total; e += 1) {
    emitEntity(modelEntities[e], identityXform(), 7, 0);
    if ((e & 8191) === 0) {
      report("geometry", 0.2 + (e / Math.max(total, 1)) * 0.75, `Tessellating ${e.toLocaleString()} entities…`);
    }
  }

  if (!Number.isFinite(bounds.minX)) {
    if (Number.isFinite(headerMinX) && Number.isFinite(headerMaxX)) {
      bounds.minX = headerMinX;
      bounds.minY = headerMinY;
      bounds.maxX = headerMaxX;
      bounds.maxY = headerMaxY;
    } else {
      bounds.minX = 0;
      bounds.minY = 0;
      bounds.maxX = 1;
      bounds.maxY = 1;
    }
  }

  const layerList: LayerGeometry[] = [];
  let segments = 0;
  let fills = 0;
  for (const bag of layerBags.values()) {
    const vertices = bag.lines.compact();
    const fillVerts = bag.fills.compact();
    const segmentCount = vertices.length / 4;
    const fillCount = fillVerts.length / 6;
    segments += segmentCount;
    fills += fillCount;
    layerList.push({
      name: bag.info.name,
      color: bag.info.color,
      rgb: aciRgb(bag.info.color),
      visible: !bag.info.off && !bag.info.frozen,
      frozen: bag.info.frozen,
      off: bag.info.off,
      vertices,
      fills: fillVerts,
      segmentCount,
      fillCount,
    });
  }

  layerList.sort((a, b) => a.name.localeCompare(b.name));

  report("geometry", 1, "Ready");

  return {
    fileName,
    fileBytes,
    bounds,
    layers: layerList,
    texts,
    units,
    stats: {
      entities: modelEntities.length,
      segments,
      fills,
      texts: texts.length,
      layers: layerList.length,
      blocks: blocks.size,
      skipped,
      parseMs: performance.now() - started,
      types: typeCounts,
    },
  };
}

function getCodeY(groups: GroupMap, xCode: number): number {
  const yCode = xCode + 10;
  const v = groups.get(yCode);
  if (typeof v === "number") return v;
  if (Array.isArray(v)) return v[0] ?? 0;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}
