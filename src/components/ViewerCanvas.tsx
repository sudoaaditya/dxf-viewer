import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { displayRgb, rgbCss } from "../lib/aciColors";
import { fitCamera, screenToWorld, worldToScreen, zoomAt, zoomLimits } from "../lib/camera";
import type { UnitFormat } from "../lib/units";
import { isDarkColor } from "../lib/viewSettings";
import { DxfGlRenderer } from "../engine/renderer";
import { findSnap, pickSegment, type SegmentHit, type SnapPoint } from "../engine/segmentIndex";
import type { CameraState, MeasureState, ParsedDrawing, Rgb } from "../types/dxf";

/** Pick tolerances in CSS pixels. */
const HOVER_PX = 6;
const TOUCH_PX = 14;
const SNAP_PX = 12;
const HIGHLIGHT = "#4ea1ff";
const MEASURE = "#f0a202";

function sameSegment(a: SegmentHit | null, b: SegmentHit | null): boolean {
  return a === b || (!!a && !!b && a.layer === b.layer && a.segment === b.segment);
}

/** macOS reports mouse-wheel notches as multiples of this (same detector as Mapbox GL). */
const MAC_WHEEL_STEP = 4.000244140625;

/**
 * Two-finger touchpad scrolls arrive as pixel-mode wheel events without ctrlKey
 * (pinch sets ctrlKey). Notched mouse wheels send one axis in fixed steps: line mode,
 * multiples of MAC_WHEEL_STEP on macOS, or large integers (100, 120, 125…) elsewhere.
 * Touchpads send fractional or small deltas, often with a horizontal component.
 */
function isTouchpadScroll(event: WheelEvent): boolean {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false;
  if (event.deltaX !== 0) return true;
  const dy = Math.abs(event.deltaY);
  if (dy === 0 || dy % MAC_WHEEL_STEP === 0) return false;
  return !Number.isInteger(dy) || dy < 50;
}

function strokeSegment(
  ctx: CanvasRenderingContext2D,
  hit: SegmentHit,
  cam: CameraState,
  w: number,
  h: number,
  color: string,
  strong: boolean,
) {
  const a = worldToScreen(hit.x1, hit.y1, cam, w, h);
  const b = worldToScreen(hit.x2, hit.y2, cam, w, h);
  ctx.save();
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.globalAlpha = strong ? 0.3 : 0.18;
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = strong ? 2.5 : 2;
  ctx.stroke();
  if (hit.straight) {
    ctx.fillStyle = color;
    ctx.font = "600 11px IBM Plex Sans, ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";
    for (const [p, label] of [[a, "A"], [b, "B"]] as const) {
      ctx.fillRect(p.x - 3.5, p.y - 3.5, 7, 7);
      ctx.fillText(label, p.x + 7, p.y - 9);
    }
  }
  ctx.restore();
}

function drawSnapMarker(ctx: CanvasRenderingContext2D, snap: SnapPoint, x: number, y: number) {
  const r = 6;
  ctx.save();
  ctx.strokeStyle = MEASURE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (snap.kind === "end") {
    ctx.rect(x - r, y - r, r * 2, r * 2);
  } else if (snap.kind === "mid") {
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y + r * 0.8);
    ctx.lineTo(x - r, y + r * 0.8);
    ctx.closePath();
  } else {
    ctx.moveTo(x - r, y - r);
    ctx.lineTo(x + r, y - r);
    ctx.lineTo(x - r, y + r);
    ctx.lineTo(x + r, y + r);
    ctx.closePath();
  }
  ctx.stroke();
  ctx.restore();
}

function SegmentCard({ hit, pinned, drawing, units }: { hit: SegmentHit; pinned: boolean; drawing: ParsedDrawing; units: UnitFormat }) {
  const length = Math.hypot(hit.x2 - hit.x1, hit.y2 - hit.y1);
  const angle = ((Math.atan2(hit.y2 - hit.y1, hit.x2 - hit.x1) * 180) / Math.PI + 360) % 360;
  return (
    <div className="segment-card">
      <div className="segment-card-head">
        <span>Segment · {drawing.layers[hit.layer]?.name ?? "—"}</span>
        {pinned ? <span className="segment-card-pin">Pinned · Esc</span> : null}
      </div>
      <dl>
        <dt>A</dt>
        <dd>
          X {units.coord(hit.x1)} &nbsp; Y {units.coord(hit.y1)}
        </dd>
        <dt>B</dt>
        <dd>
          X {units.coord(hit.x2)} &nbsp; Y {units.coord(hit.y2)}
        </dd>
        <dt>Length</dt>
        <dd>{units.length(length)}</dd>
        <dt>Angle</dt>
        <dd>{angle.toFixed(2)}°</dd>
      </dl>
    </div>
  );
}

type ViewerCanvasProps = {
  drawing: ParsedDrawing;
  camera: CameraState;
  onCameraChange: (camera: CameraState) => void;
  visibility: Record<string, boolean>;
  dark: boolean;
  /** Custom viewer background; null follows the theme. */
  background: Rgb | null;
  units: UnitFormat;
  measure: MeasureState;
  onMeasureChange: (measure: MeasureState) => void;
  cursor: { x: number; y: number } | null;
  onCursor: (point: { x: number; y: number } | null) => void;
  exportRef: MutableRefObject<(() => void) | null>;
};

export function ViewerCanvas({
  drawing,
  camera,
  onCameraChange,
  visibility,
  dark: themeDark,
  background,
  units,
  measure,
  onMeasureChange,
  cursor,
  onCursor,
  exportRef,
}: ViewerCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<DxfGlRenderer | null>(null);
  const cameraRef = useRef(camera);
  const measureRef = useRef(measure);
  const cursorRef = useRef(cursor);
  const sizeRef = useRef({ w: 1, h: 1 });
  // Linework contrast follows the actual canvas color, not the UI theme.
  const dark = background ? isDarkColor(background) : themeDark;
  const [hover, setHover] = useState<SegmentHit | null>(null);
  const [selected, setSelected] = useState<SegmentHit | null>(null);
  const [snap, setSnap] = useState<SnapPoint | null>(null);
  const hoverRef = useRef(hover);
  const selectedRef = useRef(selected);
  const snapRef = useRef(snap);
  const visibleLayers = useMemo(
    () => drawing.layers.map((layer) => visibility[layer.name] !== false),
    [drawing, visibility],
  );
  const visibleRef = useRef(visibleLayers);

  cameraRef.current = camera;
  measureRef.current = measure;
  cursorRef.current = cursor;
  hoverRef.current = hover;
  selectedRef.current = selected;
  snapRef.current = snap;
  visibleRef.current = visibleLayers;

  const paintOverlay = (forExport = false) => {
    const canvas = overlayRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr));
    canvas.height = Math.max(1, Math.floor(h * dpr));
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cam = cameraRef.current;
    ctx.font = "12px IBM Plex Sans, ui-sans-serif, system-ui";
    ctx.textBaseline = "middle";

    for (const text of drawing.texts) {
      if (visibility[text.layer] === false) continue;
      const heightPx = text.height * cam.zoom;
      if (heightPx < 6 || heightPx > 160) continue;
      const p = worldToScreen(text.x, text.y, cam, w, h);
      if (p.x < -200 || p.y < -80 || p.x > w + 200 || p.y > h + 80) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((-text.rotation * Math.PI) / 180);
      ctx.fillStyle = rgbCss(displayRgb(text.color, dark));
      ctx.font = `${Math.max(8, heightPx)}px IBM Plex Sans, ui-sans-serif, system-ui`;
      ctx.fillText(text.value, 0, 0);
      ctx.restore();
    }

    const sel = forExport ? null : selectedRef.current;
    const hov = forExport ? null : hoverRef.current;
    const sn = forExport ? null : snapRef.current;
    if (sel) strokeSegment(ctx, sel, cam, w, h, HIGHLIGHT, true);
    if (hov && !sameSegment(hov, sel)) strokeSegment(ctx, hov, cam, w, h, HIGHLIGHT, false);
    if (sn) strokeSegment(ctx, { ...sn.hit, straight: false }, cam, w, h, MEASURE, false);

    const m = measureRef.current;
    const live = sn ?? cursorRef.current;
    if (m.mode === "one" || m.mode === "two") {
      const startX = m.mode === "one" ? m.x : m.x1;
      const startY = m.mode === "one" ? m.y : m.y1;
      const a = worldToScreen(startX, startY, cam, w, h);
      const end =
        m.mode === "two"
          ? worldToScreen(m.x2, m.y2, cam, w, h)
          : live
            ? worldToScreen(live.x, live.y, cam, w, h)
            : a;
      ctx.strokeStyle = MEASURE;
      ctx.fillStyle = MEASURE;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(a.x, a.y, 4, 0, Math.PI * 2);
      ctx.arc(end.x, end.y, 4, 0, Math.PI * 2);
      ctx.fill();
      const endX = m.mode === "two" ? m.x2 : (live?.x ?? startX);
      const endY = m.mode === "two" ? m.y2 : (live?.y ?? startY);
      const label = units.length(Math.hypot(endX - startX, endY - startY));
      ctx.font = "12px IBM Plex Sans, ui-sans-serif, system-ui";
      ctx.fillStyle = dark ? "#16120a" : "#fff8e8";
      const tw = ctx.measureText(label).width + 12;
      const lx = (a.x + end.x) / 2 - tw / 2;
      const ly = (a.y + end.y) / 2 - 12;
      ctx.fillRect(lx, ly, tw, 20);
      ctx.fillStyle = MEASURE;
      ctx.fillText(label, lx + 6, ly + 10);
    }

    if (sn) {
      const p = worldToScreen(sn.x, sn.y, cam, w, h);
      drawSnapMarker(ctx, sn, p.x, p.y);
    }
  };

  useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const renderer = new DxfGlRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setTheme(dark, background);
    renderer.setDrawing(drawing);
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [drawing]);

  useEffect(() => {
    rendererRef.current?.setTheme(dark, background);
  }, [dark, background]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    for (const layer of drawing.layers) {
      renderer.setLayerVisible(layer.name, visibility[layer.name] !== false);
    }
  }, [drawing, visibility]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const renderer = rendererRef.current;
    if (!wrap || !renderer) return;

    const frame = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      sizeRef.current = { w, h };
      renderer.resize(w, h, window.devicePixelRatio || 1);
      renderer.render(cameraRef.current);
      paintOverlay();
    };

    const observer = new ResizeObserver(frame);
    observer.observe(wrap);
    frame();
    return () => observer.disconnect();
  }, [drawing, dark, background, visibility, units]);

  useEffect(() => {
    rendererRef.current?.render(camera);
    paintOverlay();
  }, [camera, measure, cursor, visibility, dark, background, units, hover, selected, snap]);

  useEffect(() => {
    setHover(null);
    setSelected(null);
    setSnap(null);
  }, [drawing]);

  useEffect(() => {
    setHover((current) => (current && !visibleLayers[current.layer] ? null : current));
    setSelected((current) => (current && !visibleLayers[current.layer] ? null : current));
  }, [visibleLayers]);

  const measuring = measure.mode !== "off";
  useEffect(() => {
    if (measuring) setHover(null);
    else setSnap(null);
  }, [measuring]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    exportRef.current = () => {
      const glCanvas = glRef.current;
      const overlay = overlayRef.current;
      if (!glCanvas || !overlay) return;
      rendererRef.current?.render(cameraRef.current);
      paintOverlay(true);
      const out = document.createElement("canvas");
      out.width = glCanvas.width;
      out.height = glCanvas.height;
      const ctx = out.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(glCanvas, 0, 0);
      ctx.drawImage(overlay, 0, 0, out.width, out.height);
      const url = out.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = url;
      link.download = `${drawing.fileName.replace(/\.dxf$/i, "") || "drawing"}.png`;
      link.click();
      paintOverlay();
    };
    return () => {
      exportRef.current = null;
    };
  }, [drawing.fileName, exportRef, dark, background, units]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let touchpadPanUntil = 0;
    let pointer: { sx: number; sy: number; free: boolean } | null = null;

    const pointFromEvent = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return { sx: event.clientX - rect.left, sy: event.clientY - rect.top, w: rect.width, h: rect.height };
    };

    /** Hover pick or measure snap for the pointer's current screen position under `cam`. */
    const inspect = (cam: CameraState) => {
      if (!pointer) return;
      const { w, h } = sizeRef.current;
      const world = screenToWorld(pointer.sx, pointer.sy, cam, w, h);
      if (measureRef.current.mode !== "off") {
        setSnap(pointer.free ? null : findSnap(drawing, world.x, world.y, SNAP_PX / cam.zoom, visibleRef.current));
        return;
      }
      const hit = pickSegment(drawing, world.x, world.y, HOVER_PX / cam.zoom, visibleRef.current, true);
      setHover((current) => (sameSegment(current, hit) ? current : hit));
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
      dragging = true;
      moved = false;
      lastX = event.clientX;
      lastY = event.clientY;
      wrap.setPointerCapture(event.pointerId);
    };

    const onPointerMove = (event: PointerEvent) => {
      const { sx, sy, w, h } = pointFromEvent(event);
      const world = screenToWorld(sx, sy, cameraRef.current, w, h);
      onCursor(world);
      pointer = event.pointerType === "mouse" || event.pointerType === "pen" ? { sx, sy, free: event.altKey } : null;

      if (!dragging) {
        inspect(cameraRef.current);
        return;
      }
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      const cam = cameraRef.current;
      // Update the ref now so moves that arrive before React re-renders still accumulate.
      cameraRef.current = { ...cam, x: cam.x - dx / cam.zoom, y: cam.y + dy / cam.zoom };
      onCameraChange(cameraRef.current);
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      wrap.releasePointerCapture(event.pointerId);
      if (moved || event.button !== 0) return;
      const m = measureRef.current;
      const cam = cameraRef.current;
      const { sx, sy, w, h } = pointFromEvent(event);
      const world = screenToWorld(sx, sy, cam, w, h);
      const tolerance = (event.pointerType === "touch" ? TOUCH_PX : HOVER_PX) / cam.zoom;
      if (m.mode === "off") {
        setSelected(pickSegment(drawing, world.x, world.y, tolerance, visibleRef.current, true));
        return;
      }
      const snapped = event.altKey
        ? null
        : findSnap(drawing, world.x, world.y, (event.pointerType === "touch" ? TOUCH_PX : SNAP_PX) / cam.zoom, visibleRef.current);
      const p = snapped ?? world;
      if (m.mode === "waiting" || m.mode === "two") {
        onMeasureChange({ mode: "one", x: p.x, y: p.y });
      } else if (m.mode === "one") {
        onMeasureChange({ mode: "two", x1: m.x, y1: m.y, x2: p.x, y2: p.y });
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const cam = cameraRef.current;
      let next: CameraState;
      // Latch pan for the rest of a gesture so momentum events cannot flip to zoom.
      if (!event.ctrlKey && (event.timeStamp < touchpadPanUntil || isTouchpadScroll(event))) {
        touchpadPanUntil = event.timeStamp + 200;
        next = { ...cam, x: cam.x + event.deltaX / cam.zoom, y: cam.y - event.deltaY / cam.zoom };
      } else {
        const limits = zoomLimits(drawing.bounds, rect.width, rect.height);
        const deltaY =
          event.deltaMode === WheelEvent.DOM_DELTA_LINE
            ? event.deltaY * 16
            : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
              ? event.deltaY * rect.height
              : event.deltaY;
        next = zoomAt(
          cam,
          event.clientX - rect.left,
          event.clientY - rect.top,
          Math.exp(-deltaY * 0.0015),
          rect.width,
          rect.height,
          limits.min,
          limits.max,
        );
      }
      cameraRef.current = next;
      onCameraChange(next);
      inspect(next);
    };

    const onPointerLeave = () => {
      pointer = null;
      onCursor(null);
      setHover(null);
      setSnap(null);
    };

    const onContext = (event: Event) => event.preventDefault();

    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerup", onPointerUp);
    wrap.addEventListener("pointerleave", onPointerLeave);
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("contextmenu", onContext);
    return () => {
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerup", onPointerUp);
      wrap.removeEventListener("pointerleave", onPointerLeave);
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("contextmenu", onContext);
    };
  }, [drawing, onCameraChange, onCursor, onMeasureChange]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      onCameraChange(fitCamera(drawing.bounds, rect.width, rect.height));
    }
  }, [drawing, onCameraChange]);

  const info = measuring ? null : (hover ?? selected);

  return (
    <div ref={wrapRef} className={`viewer${measuring ? " is-measuring" : hover ? " is-hovering" : ""}`}>
      <canvas ref={glRef} className="gl-canvas" />
      <canvas ref={overlayRef} className="overlay-canvas" />
      {info ? <SegmentCard hit={info} pinned={sameSegment(info, selected)} drawing={drawing} units={units} /> : null}
    </div>
  );
}
