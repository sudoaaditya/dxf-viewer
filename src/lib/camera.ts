import type { CameraState, DrawingBounds } from "../types/dxf";

export function fitCamera(
  bounds: DrawingBounds,
  width: number,
  height: number,
  padding = 0.9,
): CameraState {
  const worldW = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const worldH = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const zoom = Math.min((width * padding) / worldW, (height * padding) / worldH);
  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
  };
}

export function screenToWorld(
  sx: number,
  sy: number,
  camera: CameraState,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (sx - width / 2) / camera.zoom + camera.x,
    y: -(sy - height / 2) / camera.zoom + camera.y,
  };
}

export function worldToScreen(
  wx: number,
  wy: number,
  camera: CameraState,
  width: number,
  height: number,
): { x: number; y: number } {
  return {
    x: (wx - camera.x) * camera.zoom + width / 2,
    y: -(wy - camera.y) * camera.zoom + height / 2,
  };
}

export function zoomAt(
  camera: CameraState,
  sx: number,
  sy: number,
  factor: number,
  width: number,
  height: number,
  minZoom: number,
  maxZoom: number,
): CameraState {
  const before = screenToWorld(sx, sy, camera, width, height);
  const zoom = Math.min(maxZoom, Math.max(minZoom, camera.zoom * factor));
  const next = { ...camera, zoom };
  const after = screenToWorld(sx, sy, next, width, height);
  return {
    x: camera.x + (before.x - after.x),
    y: camera.y + (before.y - after.y),
    zoom,
  };
}

export function zoomLimits(bounds: DrawingBounds, width: number, height: number) {
  const fitted = fitCamera(bounds, width, height, 1);
  return {
    min: fitted.zoom / 80,
    max: fitted.zoom * 400,
  };
}
