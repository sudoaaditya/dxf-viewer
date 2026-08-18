import { applyXform, type Xform } from "./buffers";

export type EmitSeg = (x1: number, y1: number, x2: number, y2: number) => void;

function emitXf(
  emit: EmitSeg,
  xf: Xform,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  const a = applyXform(xf, x1, y1);
  const b = applyXform(xf, x2, y2);
  emit(a[0], a[1], b[0], b[1]);
}

export function tessellateLine(
  emit: EmitSeg,
  xf: Xform,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
) {
  emitXf(emit, xf, x1, y1, x2, y2);
}

export function tessellateCircle(
  emit: EmitSeg,
  xf: Xform,
  cx: number,
  cy: number,
  r: number,
) {
  if (!(r > 0) || !Number.isFinite(r)) return;
  const n = Math.max(16, Math.min(96, Math.round(32 + Math.log2(r + 1) * 6)));
  let px = cx + r;
  let py = cy;
  for (let i = 1; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const qx = cx + r * Math.cos(a);
    const qy = cy + r * Math.sin(a);
    emitXf(emit, xf, px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

export function tessellateArc(
  emit: EmitSeg,
  xf: Xform,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
) {
  if (!(r > 0) || !Number.isFinite(r)) return;
  let a0 = (startDeg * Math.PI) / 180;
  let a1 = (endDeg * Math.PI) / 180;
  let sweep = a1 - a0;
  if (sweep <= 0) sweep += Math.PI * 2;
  const n = Math.max(4, Math.min(96, Math.ceil((sweep / (Math.PI * 2)) * 48)));
  let px = cx + r * Math.cos(a0);
  let py = cy + r * Math.sin(a0);
  for (let i = 1; i <= n; i += 1) {
    const a = a0 + (sweep * i) / n;
    const qx = cx + r * Math.cos(a);
    const qy = cy + r * Math.sin(a);
    emitXf(emit, xf, px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

export function tessellateEllipse(
  emit: EmitSeg,
  xf: Xform,
  cx: number,
  cy: number,
  mjx: number,
  mjy: number,
  ratio: number,
  startParam: number,
  endParam: number,
) {
  const majorLen = Math.hypot(mjx, mjy);
  if (!(majorLen > 0) || !Number.isFinite(majorLen)) return;
  const rx = mjx;
  const ry = mjy;
  const sx = (-mjy / majorLen) * majorLen * ratio;
  const sy = (mjx / majorLen) * majorLen * ratio;
  let a0 = startParam;
  let a1 = endParam;
  if (!Number.isFinite(a0)) a0 = 0;
  if (!Number.isFinite(a1)) a1 = Math.PI * 2;
  let sweep = a1 - a0;
  if (sweep <= 1e-9) sweep += Math.PI * 2;
  const n = Math.max(16, Math.min(96, Math.round(40 + majorLen / 50)));
  const point = (t: number): [number, number] => [
    cx + rx * Math.cos(t) + sx * Math.sin(t),
    cy + ry * Math.cos(t) + sy * Math.sin(t),
  ];
  let [px, py] = point(a0);
  for (let i = 1; i <= n; i += 1) {
    const [qx, qy] = point(a0 + (sweep * i) / n);
    emitXf(emit, xf, px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

export function tessellateBulge(
  emit: EmitSeg,
  xf: Xform,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bulge: number,
) {
  if (Math.abs(bulge) < 1e-10) {
    emitXf(emit, xf, x1, y1, x2, y2);
    return;
  }
  const dx = x2 - x1;
  const dy = y2 - y1;
  const chord = Math.hypot(dx, dy);
  if (chord < 1e-12) return;

  const included = 4 * Math.atan(bulge);
  const radius = chord / (2 * Math.sin(included / 2));
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const h = radius * Math.cos(included / 2);
  const nx = -dy / chord;
  const ny = dx / chord;
  const cx = midX + nx * h;
  const cy = midY + ny * h;
  const rabs = Math.abs(radius);

  let a0 = Math.atan2(y1 - cy, x1 - cx);
  const a1 = Math.atan2(y2 - cy, x2 - cx);
  let sweep = a1 - a0;
  if (bulge > 0 && sweep < 0) sweep += Math.PI * 2;
  if (bulge < 0 && sweep > 0) sweep -= Math.PI * 2;

  const n = Math.max(2, Math.min(128, Math.ceil(Math.abs(sweep) / (Math.PI / 24))));
  let px = x1;
  let py = y1;
  for (let i = 1; i <= n; i += 1) {
    const a = a0 + (sweep * i) / n;
    const qx = cx + rabs * Math.cos(a);
    const qy = cy + rabs * Math.sin(a);
    emitXf(emit, xf, px, py, qx, qy);
    px = qx;
    py = qy;
  }
}

export function tessellatePolyline(
  emit: EmitSeg,
  xf: Xform,
  verts: { x: number; y: number; bulge: number }[],
  closed: boolean,
) {
  if (verts.length < 2) return;
  const count = closed ? verts.length : verts.length - 1;
  for (let i = 0; i < count; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    tessellateBulge(emit, xf, a.x, a.y, b.x, b.y, a.bulge);
  }
}

export function tessellatePoint(
  emit: EmitSeg,
  xf: Xform,
  x: number,
  y: number,
  size: number,
) {
  const s = size > 0 ? size : 1;
  emitXf(emit, xf, x - s, y, x + s, y);
  emitXf(emit, xf, x, y - s, x, y + s);
}

function deCasteljau(points: [number, number][], t: number): [number, number] {
  const pts = points.map(([x, y]) => [x, y] as [number, number]);
  for (let r = 1; r < pts.length; r += 1) {
    for (let i = 0; i < pts.length - r; i += 1) {
      pts[i][0] = pts[i][0] * (1 - t) + pts[i + 1][0] * t;
      pts[i][1] = pts[i][1] * (1 - t) + pts[i + 1][1] * t;
    }
  }
  return pts[0];
}

export function tessellateSpline(
  emit: EmitSeg,
  xf: Xform,
  controls: [number, number][],
  fit: [number, number][],
) {
  const pts = fit.length >= 2 ? fit : controls;
  if (pts.length < 2) return;
  if (pts.length <= 4 && fit.length < 2) {
    const n = 24;
    let [px, py] = pts[0];
    for (let i = 1; i <= n; i += 1) {
      const [qx, qy] = deCasteljau(pts, i / n);
      emitXf(emit, xf, px, py, qx, qy);
      px = qx;
      py = qy;
    }
    return;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    emitXf(emit, xf, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]);
  }
}
