export class FloatBag {
  data: Float32Array;
  length = 0;

  constructor(capacity = 4096) {
    this.data = new Float32Array(capacity);
  }

  private grow(needed: number) {
    let cap = this.data.length;
    while (cap < needed) cap *= 2;
    const next = new Float32Array(cap);
    next.set(this.data);
    this.data = next;
  }

  push2(a: number, b: number) {
    if (this.length + 2 > this.data.length) this.grow(this.length + 2);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
  }

  push4(a: number, b: number, c: number, d: number) {
    if (this.length + 4 > this.data.length) this.grow(this.length + 4);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
  }

  push6(a: number, b: number, c: number, d: number, e: number, f: number) {
    if (this.length + 6 > this.data.length) this.grow(this.length + 6);
    this.data[this.length++] = a;
    this.data[this.length++] = b;
    this.data[this.length++] = c;
    this.data[this.length++] = d;
    this.data[this.length++] = e;
    this.data[this.length++] = f;
  }

  compact(): Float32Array {
    return this.data.slice(0, this.length);
  }
}

export type Xform = {
  ox: number;
  oy: number;
  sx: number;
  sy: number;
  cos: number;
  sin: number;
  tx: number;
  ty: number;
};

export function identityXform(): Xform {
  return { ox: 0, oy: 0, sx: 1, sy: 1, cos: 1, sin: 0, tx: 0, ty: 0 };
}

export function makeXform(
  ox: number,
  oy: number,
  sx: number,
  sy: number,
  rotDeg: number,
  tx: number,
  ty: number,
): Xform {
  const rad = (rotDeg * Math.PI) / 180;
  return { ox, oy, sx, sy, cos: Math.cos(rad), sin: Math.sin(rad), tx, ty };
}

export function composeXform(parent: Xform, child: Xform): Xform {
  const [x, y] = applyXform(parent, child.tx, child.ty);
  const cos = parent.cos * child.cos - parent.sin * child.sin;
  const sin = parent.sin * child.cos + parent.cos * child.sin;
  return {
    ox: child.ox,
    oy: child.oy,
    sx: parent.sx * child.sx,
    sy: parent.sy * child.sy,
    cos,
    sin,
    tx: x,
    ty: y,
  };
}

export function applyXform(xf: Xform, x: number, y: number): [number, number] {
  let px = (x - xf.ox) * xf.sx;
  let py = (y - xf.oy) * xf.sy;
  const rx = px * xf.cos - py * xf.sin;
  const ry = px * xf.sin + py * xf.cos;
  return [rx + xf.tx, ry + xf.ty];
}
