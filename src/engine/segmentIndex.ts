import type { LayerGeometry, ParsedDrawing, SegmentIndex } from "../types/dxf";

const MAX_CELLS = 1 << 22;
const MAX_AXIS = 8192;
const MAX_VISITS = 200_000;

/** Calls `visit(cell)` for every grid cell a segment passes through (row by row). */
function walkCells(
  minX: number,
  minY: number,
  inv: number,
  cols: number,
  rows: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  visit: (cell: number) => void,
) {
  const clampCol = (x: number) => Math.min(cols - 1, Math.max(0, Math.floor((x - minX) * inv)));
  const clampRow = (y: number) => Math.min(rows - 1, Math.max(0, Math.floor((y - minY) * inv)));
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  const r0 = clampRow(lo);
  const r1 = clampRow(hi);
  const dy = y2 - y1;
  const slope = dy !== 0 ? (x2 - x1) / dy : 0;
  for (let r = r0; r <= r1; r += 1) {
    let xa: number;
    let xb: number;
    if (dy === 0 || r0 === r1) {
      xa = x1;
      xb = x2;
    } else {
      const ya = Math.max(lo, minY + r / inv);
      const yb = Math.min(hi, minY + (r + 1) / inv);
      xa = x1 + (ya - y1) * slope;
      xb = x1 + (yb - y1) * slope;
    }
    const c0 = clampCol(Math.min(xa, xb));
    const c1 = clampCol(Math.max(xa, xb));
    const base = r * cols;
    for (let c = c0; c <= c1; c += 1) visit(base + c);
  }
}

export function buildSegmentIndex(layers: LayerGeometry[]): SegmentIndex {
  const layerStart = new Uint32Array(layers.length + 1);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let l = 0; l < layers.length; l += 1) {
    const v = layers[l].vertices;
    layerStart[l + 1] = layerStart[l] + layers[l].segmentCount;
    for (let k = 0; k < v.length; k += 2) {
      const x = v[k];
      const y = v[k + 1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const total = layerStart[layers.length];
  if (total === 0 || !Number.isFinite(minX)) {
    return {
      minX: 0,
      minY: 0,
      cellSize: 1,
      cols: 1,
      rows: 1,
      cellStart: new Uint32Array(2),
      items: new Uint32Array(0),
      layerStart,
    };
  }

  const w = Math.max(maxX - minX, 1e-9);
  const h = Math.max(maxY - minY, 1e-9);
  const target = Math.min(MAX_CELLS, Math.max(1, total));
  const cellSize = Math.max(Math.sqrt((w * h) / target), w / MAX_AXIS, h / MAX_AXIS, 1e-9);
  const cols = Math.min(MAX_AXIS, Math.floor(w / cellSize) + 1);
  const rows = Math.min(MAX_AXIS, Math.floor(h / cellSize) + 1);
  const inv = 1 / cellSize;
  const cellCount = cols * rows;

  const counts = new Uint32Array(cellCount + 1);
  const countCell = (cell: number) => {
    counts[cell + 1] += 1;
  };
  for (const layer of layers) {
    const v = layer.vertices;
    for (let k = 0; k < v.length; k += 4) {
      walkCells(minX, minY, inv, cols, rows, v[k], v[k + 1], v[k + 2], v[k + 3], countCell);
    }
  }
  for (let c = 0; c < cellCount; c += 1) counts[c + 1] += counts[c];

  const items = new Uint32Array(counts[cellCount]);
  const cursor = counts.slice(0, cellCount);
  let id = 0;
  const fillCell = (cell: number) => {
    items[cursor[cell]++] = id;
  };
  for (const layer of layers) {
    const v = layer.vertices;
    for (let k = 0; k < v.length; k += 4, id += 1) {
      walkCells(minX, minY, inv, cols, rows, v[k], v[k + 1], v[k + 2], v[k + 3], fillCell);
    }
  }

  return { minX, minY, cellSize, cols, rows, cellStart: counts, items, layerStart };
}

export type SegmentHit = {
  layer: number;
  segment: number;
  straight: boolean;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Closest point on the segment to the query, in world coordinates. */
  px: number;
  py: number;
  dist: number;
};

export type SnapKind = "end" | "mid" | "near";

export type SnapPoint = { kind: SnapKind; x: number; y: number; hit: SegmentHit };

function layerOf(layerStart: Uint32Array, id: number): number {
  let lo = 0;
  let hi = layerStart.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (layerStart[mid] <= id) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Visits each visible segment whose grid cell lies within `radius` of (wx, wy). */
function forEachNearby(
  drawing: ParsedDrawing,
  wx: number,
  wy: number,
  radius: number,
  visible: boolean[],
  visit: (layer: number, segment: number, x1: number, y1: number, x2: number, y2: number) => void,
) {
  const idx = drawing.index;
  if (idx.items.length === 0) return;
  const lx = wx - drawing.origin.x;
  const ly = wy - drawing.origin.y;
  const inv = 1 / idx.cellSize;
  const c0 = Math.max(0, Math.floor((lx - radius - idx.minX) * inv));
  const c1 = Math.min(idx.cols - 1, Math.floor((lx + radius - idx.minX) * inv));
  const r0 = Math.max(0, Math.floor((ly - radius - idx.minY) * inv));
  const r1 = Math.min(idx.rows - 1, Math.floor((ly + radius - idx.minY) * inv));
  let visits = 0;
  for (let r = r0; r <= r1; r += 1) {
    for (let c = c0; c <= c1; c += 1) {
      const cell = r * idx.cols + c;
      const end = idx.cellStart[cell + 1];
      for (let k = idx.cellStart[cell]; k < end; k += 1) {
        if (++visits > MAX_VISITS) return;
        const id = idx.items[k];
        const layer = layerOf(idx.layerStart, id);
        if (!visible[layer]) continue;
        const segment = id - idx.layerStart[layer];
        const v = drawing.layers[layer].vertices;
        const o = segment * 4;
        visit(layer, segment, v[o] + drawing.origin.x, v[o + 1] + drawing.origin.y, v[o + 2] + drawing.origin.x, v[o + 3] + drawing.origin.y);
      }
    }
  }
}

function closestOnSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): [number, number] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / len2)) : 0;
  return [x1 + dx * t, y1 + dy * t];
}

/** Nearest visible segment within `radius` world units, optionally only straight ones. */
export function pickSegment(
  drawing: ParsedDrawing,
  wx: number,
  wy: number,
  radius: number,
  visible: boolean[],
  straightOnly: boolean,
): SegmentHit | null {
  let best: SegmentHit | null = null;
  forEachNearby(drawing, wx, wy, radius, visible, (layer, segment, x1, y1, x2, y2) => {
    const straight = drawing.layers[layer].kinds[segment] === 1;
    if (straightOnly && !straight) return;
    const [px, py] = closestOnSegment(wx, wy, x1, y1, x2, y2);
    const dist = Math.hypot(px - wx, py - wy);
    if (dist > radius || (best && dist >= best.dist)) return;
    best = { layer, segment, straight, x1, y1, x2, y2, px, py, dist };
  });
  return best;
}

/**
 * Snap target near (wx, wy): endpoints of straight segments win, then their midpoints,
 * then the nearest point on any visible segment (curves included).
 */
export function findSnap(
  drawing: ParsedDrawing,
  wx: number,
  wy: number,
  radius: number,
  visible: boolean[],
): SnapPoint | null {
  let end: SnapPoint | null = null;
  let endDist = radius;
  let mid: SnapPoint | null = null;
  let midDist = radius;
  let near: SnapPoint | null = null;
  let nearDist = radius;

  forEachNearby(drawing, wx, wy, radius, visible, (layer, segment, x1, y1, x2, y2) => {
    const straight = drawing.layers[layer].kinds[segment] === 1;
    const [px, py] = closestOnSegment(wx, wy, x1, y1, x2, y2);
    const dist = Math.hypot(px - wx, py - wy);
    if (dist > radius) return;
    const hit: SegmentHit = { layer, segment, straight, x1, y1, x2, y2, px, py, dist };
    if (dist < nearDist) {
      nearDist = dist;
      near = { kind: "near", x: px, y: py, hit };
    }
    if (!straight) return;
    const d1 = Math.hypot(x1 - wx, y1 - wy);
    const d2 = Math.hypot(x2 - wx, y2 - wy);
    if (d1 <= endDist) {
      endDist = d1;
      end = { kind: "end", x: x1, y: y1, hit };
    }
    if (d2 <= endDist) {
      endDist = d2;
      end = { kind: "end", x: x2, y: y2, hit };
    }
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dm = Math.hypot(mx - wx, my - wy);
    if (dm <= midDist) {
      midDist = dm;
      mid = { kind: "mid", x: mx, y: my, hit };
    }
  });

  return end ?? mid ?? near;
}
