class DxfWriter {
  private lines: string[] = [];

  pair(code: number, value: string | number) {
    this.lines.push(String(code), String(value));
  }

  layer(name: string, color: number) {
    this.pair(0, "LAYER");
    this.pair(2, name);
    this.pair(70, 0);
    this.pair(62, color);
    this.pair(6, "CONTINUOUS");
  }

  line(layer: string, x1: number, y1: number, x2: number, y2: number) {
    this.pair(0, "LINE");
    this.pair(8, layer);
    this.pair(10, x1);
    this.pair(20, y1);
    this.pair(11, x2);
    this.pair(21, y2);
  }

  circle(layer: string, x: number, y: number, r: number) {
    this.pair(0, "CIRCLE");
    this.pair(8, layer);
    this.pair(10, x);
    this.pair(20, y);
    this.pair(40, r);
  }

  arc(layer: string, x: number, y: number, r: number, a0: number, a1: number) {
    this.pair(0, "ARC");
    this.pair(8, layer);
    this.pair(10, x);
    this.pair(20, y);
    this.pair(40, r);
    this.pair(50, a0);
    this.pair(51, a1);
  }

  rect(layer: string, x: number, y: number, w: number, h: number) {
    this.line(layer, x, y, x + w, y);
    this.line(layer, x + w, y, x + w, y + h);
    this.line(layer, x + w, y + h, x, y + h);
    this.line(layer, x, y + h, x, y);
  }

  polyline(layer: string, pts: [number, number][], closed = false) {
    this.pair(0, "LWPOLYLINE");
    this.pair(8, layer);
    this.pair(90, pts.length);
    this.pair(70, closed ? 1 : 0);
    for (const [x, y] of pts) {
      this.pair(10, x);
      this.pair(20, y);
    }
  }

  text(layer: string, x: number, y: number, height: number, value: string, rot = 0) {
    this.pair(0, "TEXT");
    this.pair(8, layer);
    this.pair(10, x);
    this.pair(20, y);
    this.pair(40, height);
    this.pair(1, value);
    this.pair(50, rot);
  }

  toString() {
    return `${this.lines.join("\n")}\n`;
  }
}

function door(dxf: DxfWriter, x: number, y: number, dir: "e" | "n") {
  if (dir === "e") {
    dxf.line("DOORS", x, y - 450, x, y + 450);
    dxf.arc("DOORS", x, y - 450, 900, 0, 90);
  } else {
    dxf.line("DOORS", x - 450, y, x + 450, y);
    dxf.arc("DOORS", x - 450, y, 900, 0, 90);
  }
}

function desk(dxf: DxfWriter, x: number, y: number) {
  dxf.rect("FURNITURE", x, y, 1600, 800);
  dxf.circle("FURNITURE", x + 800, y - 450, 280);
}

function tree(dxf: DxfWriter, x: number, y: number) {
  dxf.circle("LANDSCAPE", x, y, 700);
  dxf.circle("LANDSCAPE", x, y, 420);
  dxf.circle("LANDSCAPE", x, y, 90);
}

export function generateSampleDxf(): string {
  const dxf = new DxfWriter();
  dxf.pair(0, "SECTION");
  dxf.pair(2, "HEADER");
  dxf.pair(9, "$ACADVER");
  dxf.pair(1, "AC1021");
  dxf.pair(9, "$INSUNITS");
  dxf.pair(70, 4);
  dxf.pair(9, "$EXTMIN");
  dxf.pair(10, -2000);
  dxf.pair(20, -2000);
  dxf.pair(9, "$EXTMAX");
  dxf.pair(10, 42000);
  dxf.pair(20, 28000);
  dxf.pair(0, "ENDSEC");

  dxf.pair(0, "SECTION");
  dxf.pair(2, "TABLES");
  dxf.pair(0, "TABLE");
  dxf.pair(2, "LAYER");
  dxf.pair(70, 8);
  const defs: [string, number][] = [
    ["0", 7],
    ["GRID", 8],
    ["ROADS", 8],
    ["WALLS", 7],
    ["DOORS", 1],
    ["WINDOWS", 4],
    ["FURNITURE", 3],
    ["LANDSCAPE", 94],
    ["PARKING", 5],
    ["TEXT", 2],
    ["TITLE", 7],
  ];
  for (const [name, color] of defs) dxf.layer(name, color);
  dxf.pair(0, "ENDTAB");
  dxf.pair(0, "ENDSEC");

  dxf.pair(0, "SECTION");
  dxf.pair(2, "ENTITIES");

  for (let x = 0; x <= 40000; x += 5000) dxf.line("GRID", x, 0, x, 26000);
  for (let y = 0; y <= 26000; y += 5000) dxf.line("GRID", 0, y, 40000, y);

  dxf.polyline("ROADS", [
    [2000, 2000],
    [38000, 2000],
    [38000, 24000],
    [2000, 24000],
  ], true);
  dxf.rect("ROADS", 17000, 2000, 4000, 22000);
  dxf.rect("ROADS", 2000, 11000, 36000, 4000);

  const buildings: [number, number, number, number, string][] = [
    [4000, 4000, 11000, 5500, "BUILDING A — DESIGN"],
    [4000, 16500, 11000, 5500, "BUILDING B — LABS"],
    [23000, 4000, 12000, 5500, "BUILDING C — WORKSHOP"],
    [23000, 16500, 12000, 5500, "BUILDING D — OFFICES"],
  ];

  for (const [x, y, w, h, label] of buildings) {
    dxf.rect("WALLS", x, y, w, h);
    dxf.rect("WALLS", x + 250, y + 250, w - 500, h - 500);
    dxf.line("WALLS", x + w / 2, y + 250, x + w / 2, y + h - 250);
    dxf.line("WALLS", x + 250, y + h / 2, x + w - 250, y + h / 2);
    door(dxf, x + w / 2, y, "n");
    door(dxf, x + w, y + h / 2, "e");
    for (let i = 1; i < 6; i += 1) {
      const wx = x + 400 + i * ((w - 800) / 6);
      dxf.rect("WINDOWS", wx, y - 40, 700, 80);
      dxf.rect("WINDOWS", wx, y + h - 40, 700, 80);
    }
    dxf.text("TEXT", x + 400, y + h - 700, 420, label);
    for (let c = 0; c < 2; c += 1) {
      for (let r = 0; r < 2; r += 1) {
        const ox = x + 600 + c * (w / 2 - 200);
        const oy = y + 700 + r * (h / 2 - 200);
        desk(dxf, ox, oy);
        desk(dxf, ox + 2000, oy);
      }
    }
  }

  for (let i = 0; i < 12; i += 1) {
    const x = 15400 + (i % 4) * 1600;
    const y = 10200 + Math.floor(i / 4) * 1600;
    dxf.rect("PARKING", x, y, 1400, 1400);
    dxf.line("PARKING", x + 700, y + 180, x + 700, y + 1220);
  }

  const trees: [number, number][] = [
    [1500, 1500], [1500, 24500], [38500, 1500], [38500, 24500],
    [15000, 8000], [15000, 18000], [21000, 8000], [21000, 18000],
    [8000, 13000], [28000, 13000], [19000, 4000], [19000, 22000],
  ];
  for (const [x, y] of trees) tree(dxf, x, y);

  dxf.rect("TITLE", 500, -1800, 12000, 1400);
  dxf.text("TITLE", 700, -700, 380, "CAMPUS SITE PLAN");
  dxf.text("TITLE", 700, -1300, 220, "SAMPLE DRAWING — DXF VIEWER");
  dxf.text("TEXT", 17000, -900, 250, "UNITS: MILLIMETRES");

  dxf.pair(0, "ENDSEC");
  dxf.pair(0, "EOF");
  return dxf.toString();
}
