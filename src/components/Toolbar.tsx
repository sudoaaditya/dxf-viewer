import {
  IconFit,
  IconImage,
  IconLayers,
  IconMinus,
  IconMoon,
  IconOpen,
  IconPlus,
  IconRuler,
  IconSun,
} from "./Icons";

type ToolbarProps = {
  fileName?: string;
  dark: boolean;
  measuring: boolean;
  layersOpen: boolean;
  hasDrawing: boolean;
  onOpen: () => void;
  onFit: () => void;
  onZoom: (factor: number) => void;
  onToggleMeasure: () => void;
  onToggleLayers: () => void;
  onToggleTheme: () => void;
  onExport: () => void;
  onClose?: () => void;
};

export function Toolbar({
  fileName,
  dark,
  measuring,
  layersOpen,
  hasDrawing,
  onOpen,
  onFit,
  onZoom,
  onToggleMeasure,
  onToggleLayers,
  onToggleTheme,
  onExport,
  onClose,
}: ToolbarProps) {
  return (
    <header className="toolbar">
      <div className="brand">
        <span className="brand-mark" />
        <div>
          <div className="brand-title">DXF Viewer</div>
          <div className="brand-sub">{fileName ?? "Local CAD preview"}</div>
        </div>
      </div>

      <div className="toolbar-group">
        <button type="button" className="btn" onClick={onOpen}>
          <IconOpen />
          Open
        </button>
        <button type="button" className="btn" onClick={onFit} disabled={!hasDrawing} title="Fit drawing (F)">
          <IconFit />
          Fit
        </button>
        <button type="button" className="btn icon" onClick={() => onZoom(1 / 1.25)} disabled={!hasDrawing} title="Zoom out">
          <IconMinus />
        </button>
        <button type="button" className="btn icon" onClick={() => onZoom(1.25)} disabled={!hasDrawing} title="Zoom in">
          <IconPlus />
        </button>
        <button
          type="button"
          className={`btn ${measuring ? "active" : ""}`}
          onClick={onToggleMeasure}
          disabled={!hasDrawing}
          title="Measure distance (M)"
        >
          <IconRuler />
          Measure
        </button>
        <button
          type="button"
          className={`btn ${layersOpen ? "active" : ""}`}
          onClick={onToggleLayers}
          disabled={!hasDrawing}
          title="Layers (L)"
        >
          <IconLayers />
          Layers
        </button>
        <button type="button" className="btn icon" onClick={onToggleTheme} title="Toggle theme">
          {dark ? <IconSun /> : <IconMoon />}
        </button>
        <button type="button" className="btn" onClick={onExport} disabled={!hasDrawing} title="Export current view as PNG">
          <IconImage />
          PNG
        </button>
        {hasDrawing && onClose ? (
          <button type="button" className="btn" onClick={onClose} title="Close drawing">
            Close
          </button>
        ) : null}
      </div>
    </header>
  );
}
