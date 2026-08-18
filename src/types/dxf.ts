export const MAX_FILE_BYTES = 100 * 1024 * 1024;

export type Rgb = [number, number, number];

export type LayerGeometry = {
  name: string;
  color: number;
  rgb: Rgb;
  visible: boolean;
  frozen: boolean;
  off: boolean;
  vertices: Float32Array;
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

export type ParsedDrawing = {
  fileName: string;
  fileBytes: number;
  bounds: DrawingBounds;
  layers: LayerGeometry[];
  texts: TextEntity[];
  stats: DrawingStats;
  units: number;
};

export type ParseProgress = {
  stage: "decode" | "parse" | "geometry";
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
