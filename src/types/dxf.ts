export const MAX_FILE_MB = 500;
export const MAX_FILE_BYTES = MAX_FILE_MB * 1024 * 1024;

export type Rgb = [number, number, number];

export type LayerGeometry = {
  name: string;
  color: number;
  rgb: Rgb;
  visible: boolean;
  frozen: boolean;
  off: boolean;
  /** Segment endpoints relative to `ParsedDrawing.origin`. */
  vertices: Float32Array;
  /** One byte per segment: 1 = straight (LINE, polyline edge), 0 = tessellated curve. */
  kinds: Uint8Array;
  fills: Float32Array;
  segmentCount: number;
  fillCount: number;
};

export type TextEntity = {
  x: number;
  y: number;
  height: number;
  rotation: number;
  value: string;
  layer: string;
  color: number;
};

export type DrawingStats = {
  entities: number;
  segments: number;
  fills: number;
  texts: number;
  layers: number;
  blocks: number;
  skipped: number;
  parseMs: number;
  types: Record<string, number>;
};

export type DrawingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

/** Uniform grid over all segments, in origin-relative coordinates. */
export type SegmentIndex = {
  minX: number;
  minY: number;
  cellSize: number;
  cols: number;
  rows: number;
  /** Prefix offsets into `items`, length cols * rows + 1. */
  cellStart: Uint32Array;
  /** Global segment ids (layerStart[layer] + segment). */
  items: Uint32Array;
  /** Global id of each layer's first segment, length layers + 1. */
  layerStart: Uint32Array;
};

export type ParsedDrawing = {
  fileName: string;
  fileBytes: number;
  bounds: DrawingBounds;
  /** World offset subtracted from GPU vertices to keep Float32 precision on large coordinates. */
  origin: { x: number; y: number };
  index: SegmentIndex;
  layers: LayerGeometry[];
  texts: TextEntity[];
  stats: DrawingStats;
  units: number;
};

export type ParseProgress = {
  stage: "decode" | "parse" | "geometry" | "index";
  progress: number;
  message: string;
};

export type WorkerRequest = {
  type: "parse";
  buffer: ArrayBuffer;
  fileName: string;
  fileBytes: number;
};

export type WorkerResponse =
  | { type: "progress"; stage: ParseProgress["stage"]; progress: number; message: string }
  | { type: "done"; result: ParsedDrawing }
  | { type: "error"; message: string };

export type CameraState = {
  x: number;
  y: number;
  zoom: number;
};

export type MeasureState =
  | { mode: "off" }
  | { mode: "waiting" }
  | { mode: "one"; x: number; y: number }
  | { mode: "two"; x1: number; y1: number; x2: number; y2: number };
