import { useEffect, useRef, type MutableRefObject } from "react";
import { displayRgb, rgbCss } from "../lib/aciColors";
import { fitCamera, screenToWorld, worldToScreen, zoomAt, zoomLimits } from "../lib/camera";
import { formatLength } from "../lib/units";
import { DxfGlRenderer } from "../engine/renderer";
import type { CameraState, MeasureState, ParsedDrawing } from "../types/dxf";

type ViewerCanvasProps = {
  drawing: ParsedDrawing;
  camera: CameraState;
  onCameraChange: (camera: CameraState) => void;
  visibility: Record<string, boolean>;
  dark: boolean;
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
  dark,
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

  cameraRef.current = camera;
  measureRef.current = measure;
  cursorRef.current = cursor;

  const paintOverlay = () => {
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

    const m = measureRef.current;
    if (m.mode === "one" || m.mode === "two") {
      const startX = m.mode === "one" ? m.x : m.x1;
      const startY = m.mode === "one" ? m.y : m.y1;
      const a = worldToScreen(startX, startY, cam, w, h);
      const end =
        m.mode === "two"
          ? worldToScreen(m.x2, m.y2, cam, w, h)
          : cursorRef.current
            ? worldToScreen(cursorRef.current.x, cursorRef.current.y, cam, w, h)
            : a;
      ctx.strokeStyle = "#f0a202";
      ctx.fillStyle = "#f0a202";
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
      const endX = m.mode === "two" ? m.x2 : (cursorRef.current?.x ?? startX);
      const endY = m.mode === "two" ? m.y2 : (cursorRef.current?.y ?? startY);
      const label = formatLength(Math.hypot(endX - startX, endY - startY), drawing.units);
      ctx.font = "12px IBM Plex Sans, ui-sans-serif, system-ui";
      ctx.fillStyle = dark ? "#16120a" : "#fff8e8";
      const tw = ctx.measureText(label).width + 12;
      const lx = (a.x + end.x) / 2 - tw / 2;
      const ly = (a.y + end.y) / 2 - 12;
      ctx.fillRect(lx, ly, tw, 20);
      ctx.fillStyle = "#f0a202";
      ctx.fillText(label, lx + 6, ly + 10);
    }
  };

  useEffect(() => {
    const canvas = glRef.current;
    if (!canvas) return;
    const renderer = new DxfGlRenderer(canvas);
    rendererRef.current = renderer;
    renderer.setTheme(dark);
    renderer.setDrawing(drawing);
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, [drawing]);

  useEffect(() => {
    rendererRef.current?.setTheme(dark);
  }, [dark]);

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
  }, [drawing, dark, visibility]);

  useEffect(() => {
    rendererRef.current?.render(camera);
    paintOverlay();
  }, [camera, measure, cursor, visibility, dark]);

  useEffect(() => {
    exportRef.current = () => {
      const glCanvas = glRef.current;
      const overlay = overlayRef.current;
      if (!glCanvas || !overlay) return;
      rendererRef.current?.render(cameraRef.current);
      paintOverlay();
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
    };
    return () => {
      exportRef.current = null;
    };
  }, [drawing.fileName, exportRef]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;

    const pointFromEvent = (event: PointerEvent) => {
      const rect = wrap.getBoundingClientRect();
      return { sx: event.clientX - rect.left, sy: event.clientY - rect.top, w: rect.width, h: rect.height };
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

      if (!dragging) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      if (Math.hypot(dx, dy) > 3) moved = true;
      lastX = event.clientX;
      lastY = event.clientY;
      const cam = cameraRef.current;
      onCameraChange({
        ...cam,
        x: cam.x - dx / cam.zoom,
        y: cam.y + dy / cam.zoom,
      });
    };

    const onPointerUp = (event: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      wrap.releasePointerCapture(event.pointerId);
      if (moved || event.button !== 0) return;
      const m = measureRef.current;
      if (m.mode === "off") return;
      const { sx, sy, w, h } = pointFromEvent(event);
      const world = screenToWorld(sx, sy, cameraRef.current, w, h);
      if (m.mode === "waiting" || m.mode === "two") {
        onMeasureChange({ mode: "one", x: world.x, y: world.y });
      } else if (m.mode === "one") {
        onMeasureChange({ mode: "two", x1: m.x, y1: m.y, x2: world.x, y2: world.y });
      }
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = wrap.getBoundingClientRect();
      const limits = zoomLimits(drawing.bounds, rect.width, rect.height);
      const factor = Math.exp(-event.deltaY * 0.0015);
      onCameraChange(
        zoomAt(
          cameraRef.current,
          event.clientX - rect.left,
          event.clientY - rect.top,
          factor,
          rect.width,
          rect.height,
          limits.min,
          limits.max,
        ),
      );
    };

    const onContext = (event: Event) => event.preventDefault();

    wrap.addEventListener("pointerdown", onPointerDown);
    wrap.addEventListener("pointermove", onPointerMove);
    wrap.addEventListener("pointerup", onPointerUp);
    wrap.addEventListener("pointerleave", () => onCursor(null));
    wrap.addEventListener("wheel", onWheel, { passive: false });
    wrap.addEventListener("contextmenu", onContext);
    return () => {
      wrap.removeEventListener("pointerdown", onPointerDown);
      wrap.removeEventListener("pointermove", onPointerMove);
      wrap.removeEventListener("pointerup", onPointerUp);
      wrap.removeEventListener("wheel", onWheel);
      wrap.removeEventListener("contextmenu", onContext);
    };
  }, [drawing.bounds, onCameraChange, onCursor, onMeasureChange]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      onCameraChange(fitCamera(drawing.bounds, rect.width, rect.height));
    }
  }, [drawing, onCameraChange]);

  return (
    <div ref={wrapRef} className="viewer">
      <canvas ref={glRef} className="gl-canvas" />
      <canvas ref={overlayRef} className="overlay-canvas" />
    </div>
  );
}
