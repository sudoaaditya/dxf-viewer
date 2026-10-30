import { formatBytes, formatCount, type UnitFormat } from "../lib/units";
import { MAX_FILE_MB, type MeasureState, type ParsedDrawing } from "../types/dxf";

type StatusBarProps = {
  drawing?: ParsedDrawing;
  units: UnitFormat;
  world?: { x: number; y: number } | null;
  zoom?: number;
  measure: MeasureState;
};

export function StatusBar({ drawing, units, world, zoom, measure }: StatusBarProps) {
  const measureLabel =
    measure.mode === "two"
      ? units.length(Math.hypot(measure.x2 - measure.x1, measure.y2 - measure.y1))
      : measure.mode === "one"
        ? "Click a second point · Alt disables snap"
        : measure.mode === "waiting"
          ? "Click a start point · snaps to lines"
          : "Drag or two-finger swipe to pan · pinch or wheel to zoom";

  return (
    <footer className="status-bar">
      <span>
        X {drawing && world ? units.coord(world.x) : "—"} &nbsp; Y {drawing && world ? units.coord(world.y) : "—"} {drawing ? units.label : ""}
      </span>
      <span>{zoom ? `${Math.round(zoom * 100)}%` : "—"}</span>
      <span>{measureLabel}</span>
      {drawing ? (
        <>
          <span>{formatCount(drawing.stats.entities)} entities</span>
          <span>{formatCount(drawing.stats.segments)} segments</span>
          <span>{formatBytes(drawing.fileBytes)}</span>
          <span>{Math.round(drawing.stats.parseMs)} ms</span>
        </>
      ) : (
        <span>Ready for files up to {MAX_FILE_MB} MB</span>
      )}
    </footer>
  );
}
