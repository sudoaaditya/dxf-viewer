import { useMemo, useState } from "react";
import { rgbCss } from "../lib/aciColors";
import { formatCount } from "../lib/units";
import type { LayerGeometry } from "../types/dxf";
import { IconClose } from "./Icons";

type LayerPanelProps = {
  layers: LayerGeometry[];
  visibility: Record<string, boolean>;
  onToggle: (name: string, visible: boolean) => void;
  onToggleAll: (visible: boolean) => void;
  onClose: () => void;
};

export function LayerPanel({ layers, visibility, onToggle, onToggleAll, onClose }: LayerPanelProps) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return layers;
    return layers.filter((layer) => layer.name.toLowerCase().includes(q));
  }, [layers, query]);

  const visibleCount = layers.filter((layer) => visibility[layer.name] !== false).length;

  return (
    <aside className="layer-panel">
      <div className="panel-head">
        <div>
          <h2>Layers</h2>
          <p>
            {visibleCount} / {layers.length} visible
          </p>
        </div>
        <button type="button" className="btn icon ghost" onClick={onClose} aria-label="Close layers">
          <IconClose />
        </button>
      </div>

      <input
        className="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Filter layers"
      />

      <div className="panel-actions">
        <button type="button" className="link" onClick={() => onToggleAll(true)}>
          Show all
        </button>
        <button type="button" className="link" onClick={() => onToggleAll(false)}>
          Hide all
        </button>
      </div>

      <ul className="layer-list">
        {filtered.map((layer) => {
          const visible = visibility[layer.name] !== false;
          return (
            <li key={layer.name}>
              <label className="layer-row">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={(event) => onToggle(layer.name, event.target.checked)}
                />
                <span className="swatch" style={{ background: rgbCss(layer.rgb) }} />
                <span className="layer-name">{layer.name}</span>
                <span className="layer-count">{formatCount(layer.segmentCount)}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
