import { formatBytes, formatCount, formatLength, unitLabel } from "../lib/units";
import type { MeasureState, ParsedDrawing } from "../types/dxf";

type StatusBarProps = {
  drawing?: ParsedDrawing;
  world?: { x: number; y: number } | null;
  zoom?: number;
  measure: MeasureState;
};

export function StatusBar({ drawing, world, zoom, measure }: StatusBarProps) {
  const units = drawing?.units ?? 0;
  const measureLabel =
    measure.mode === "two"
      ? formatLength(Math.hypot(measure.x2 - measure.x1, measure.y2 - measure.y1), units)
      : measure.mode === "one"
        ? "Click a second point"
        : measure.mode === "waiting"
          ? "Click a start point"
          : "Pan, scroll to zoom";

  return (
    <footer className="status-bar">
      <span>
        X {world ? world.x.toFixed(3) : "—"} &nbsp; Y {world ? world.y.toFixed(3) : "—"} {drawing ? unitLabel(units) : ""}
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
        <span>Ready for files up to 100 MB</span>
      )}
    </footer>
  );
}
