import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "./components/DropZone";
import { LayerPanel } from "./components/LayerPanel";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { StatusBar } from "./components/StatusBar";
import { Toolbar } from "./components/Toolbar";
import { ViewerCanvas } from "./components/ViewerCanvas";
import { useDxfLoader } from "./hooks/useDxfLoader";
import { fitCamera, zoomAt, zoomLimits } from "./lib/camera";
import type { CameraState, MeasureState } from "./types/dxf";

const fileInputId = "dxf-file-input";

export default function App() {
  const { phase, loadFile, loadSample, cancel, reset } = useDxfLoader();
  const [dark, setDark] = useState(true);
  const [layersOpen, setLayersOpen] = useState(true);
  const [camera, setCamera] = useState<CameraState>({ x: 0, y: 0, zoom: 1 });
  const [measure, setMeasure] = useState<MeasureState>({ mode: "off" });
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const exportRef = useRef<(() => void) | null>(null);
  const drawing = phase.status === "ready" ? phase.drawing : undefined;

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!drawing) {
      setVisibility({});
      setMeasure({ mode: "off" });
      return;
    }
    const next: Record<string, boolean> = {};
    for (const layer of drawing.layers) next[layer.name] = layer.visible;
    setVisibility(next);
    setLayersOpen(true);
  }, [drawing]);

  const openPicker = () => {
    document.getElementById(fileInputId)?.click();
  };

  const fit = useCallback(() => {
    if (!drawing) return;
    const host = document.querySelector(".viewer") as HTMLElement | null;
    const w = host?.clientWidth ?? 1200;
    const h = host?.clientHeight ?? 800;
    setCamera(fitCamera(drawing.bounds, w, h));
  }, [drawing]);

  const zoomBy = useCallback(
    (factor: number) => {
      if (!drawing) return;
      const host = document.querySelector(".viewer") as HTMLElement | null;
      const w = host?.clientWidth ?? 1200;
      const h = host?.clientHeight ?? 800;
      const limits = zoomLimits(drawing.bounds, w, h);
      setCamera((current) => zoomAt(current, w / 2, h / 2, factor, w, h, limits.min, limits.max));
    },
    [drawing],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "f" || event.key === "F" || event.key === "0") {
        event.preventDefault();
        fit();
      } else if (event.key === "+" || event.key === "=") {
        zoomBy(1.25);
      } else if (event.key === "-" || event.key === "_") {
        zoomBy(1 / 1.25);
      } else if (event.key === "m" || event.key === "M") {
        setMeasure((current) => (current.mode === "off" ? { mode: "waiting" } : { mode: "off" }));
      } else if (event.key === "l" || event.key === "L") {
        setLayersOpen((open) => !open);
      } else if (event.key === "Escape") {
        if (measure.mode !== "off") setMeasure({ mode: "off" });
        else if (phase.status === "error") reset();
      } else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
        event.preventDefault();
        openPicker();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fit, measure.mode, phase.status, reset, zoomBy]);

  const error = phase.status === "error" ? phase : null;
  const hasDrawing = Boolean(drawing);

  return (
    <div className="app">
      <Toolbar
        fileName={drawing?.fileName ?? (phase.status === "loading" ? phase.fileName : undefined)}
        dark={dark}
        measuring={measure.mode !== "off"}
        layersOpen={layersOpen}
        hasDrawing={hasDrawing}
        onOpen={openPicker}
        onFit={fit}
        onZoom={zoomBy}
        onToggleMeasure={() => setMeasure((current) => (current.mode === "off" ? { mode: "waiting" } : { mode: "off" }))}
        onToggleLayers={() => setLayersOpen((open) => !open)}
        onToggleTheme={() => setDark((value) => !value)}
        onExport={() => exportRef.current?.()}
        onClose={reset}
      />

      <input
        id={fileInputId}
        type="file"
        accept=".dxf,application/dxf,image/vnd.dxf,text/plain"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void loadFile(file);
          event.currentTarget.value = "";
        }}
      />

      <div
        className="workspace"
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          const file = event.dataTransfer.files[0];
          if (file) void loadFile(file);
        }}
      >
        {drawing ? (
          <>
            <ViewerCanvas
              drawing={drawing}
              camera={camera}
              onCameraChange={setCamera}
              visibility={visibility}
              dark={dark}
              measure={measure}
              onMeasureChange={setMeasure}
              cursor={cursor}
              onCursor={setCursor}
              exportRef={exportRef}
            />
            {layersOpen ? (
              <LayerPanel
                layers={drawing.layers}
                visibility={visibility}
                onToggle={(name, visible) => setVisibility((current) => ({ ...current, [name]: visible }))}
                onToggleAll={(visible) => {
                  const next: Record<string, boolean> = {};
                  for (const layer of drawing.layers) next[layer.name] = visible;
                  setVisibility(next);
                }}
                onClose={() => setLayersOpen(false)}
              />
            ) : null}
          </>
        ) : (
          <DropZone onFile={(file) => void loadFile(file)} onSample={() => void loadSample()} />
        )}
      </div>

      <StatusBar drawing={drawing} world={cursor} zoom={drawing ? camera.zoom : undefined} measure={measure} />

      {phase.status === "loading" ? (
        <LoadingOverlay
          fileName={phase.fileName}
          fileBytes={phase.fileBytes}
          stage={phase.stage}
          progress={phase.progress}
          onCancel={cancel}
        />
      ) : null}

      {error ? (
        <div className="overlay">
          <div className="overlay-card">
            <div className="hero-kicker">Could not open file</div>
            <h2>{error.fileName ?? "DXF"}</h2>
            <p>{error.message}</p>
            <div className="hero-actions">
              <button type="button" className="btn primary" onClick={openPicker}>
                Try another file
              </button>
              <button type="button" className="btn" onClick={reset}>
                Back
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
