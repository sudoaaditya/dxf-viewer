import { useEffect, useRef } from "react";
import { IMPERIAL_UNITS, METRIC_UNITS, UNIT_CODES, isConvertible, unitLabel, type UnitSystem } from "../lib/units";
import { BACKGROUND_PRESETS, type ViewSettings } from "../lib/viewSettings";
import { IconClose } from "./Icons";

type SettingsPanelProps = {
  settings: ViewSettings;
  onChange: (settings: ViewSettings) => void;
  /** Unit the drawing is measured in; undefined when no drawing is open. */
  drawingUnits?: number;
  fileUnits?: number;
  onDrawingUnits: (code: number) => void;
  onClose: () => void;
};

const SYSTEMS: { value: UnitSystem; label: string }[] = [
  { value: "drawing", label: "Drawing" },
  { value: "metric", label: "Metric" },
  { value: "imperial", label: "Imperial" },
];

export function SettingsPanel({ settings, onChange, drawingUnits, fileUnits, onDrawingUnits, onClose }: SettingsPanelProps) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (ref.current?.contains(target) || target?.closest("[data-settings-toggle]")) return;
      onClose();
    };
    // Capture phase so Esc only closes the panel instead of also cancelling measure or selection.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [onClose]);

  const set = (patch: Partial<ViewSettings>) => onChange({ ...settings, ...patch });
  const units = settings.system === "metric" ? METRIC_UNITS : settings.system === "imperial" ? IMPERIAL_UNITS : null;
  const current = settings.system === "metric" ? settings.metric : settings.imperial;
  const needsSource = units !== null && drawingUnits !== undefined && !isConvertible(drawingUnits);

  return (
    <section ref={ref} className="settings-panel" aria-label="View settings">
      <div className="panel-head">
        <h2>View settings</h2>
        <button type="button" className="btn icon ghost" onClick={onClose} aria-label="Close settings">
          <IconClose />
        </button>
      </div>

      <div className="settings-group">
        <div className="settings-label">Measurement units</div>
        <div className="segmented" role="radiogroup">
          {SYSTEMS.map((item) => (
            <button
              key={item.value}
              type="button"
              role="radio"
              aria-checked={settings.system === item.value}
              className={settings.system === item.value ? "on" : ""}
              onClick={() => set({ system: item.value })}
            >
              {item.label}
            </button>
          ))}
        </div>
        {units ? (
          <div className="chips" role="radiogroup">
            {units.map((unit) => (
              <button
                key={unit}
                type="button"
                role="radio"
                aria-checked={current === unit}
                className={current === unit ? "on" : ""}
                onClick={() => set(settings.system === "metric" ? { metric: unit as ViewSettings["metric"] } : { imperial: unit as ViewSettings["imperial"] })}
              >
                {unit}
              </button>
            ))}
          </div>
        ) : null}

        {drawingUnits !== undefined ? (
          <label className="settings-row">
            <span>Drawing is in</span>
            <select value={drawingUnits} onChange={(event) => onDrawingUnits(Number(event.target.value))}>
              {UNIT_CODES.map((code) => (
                <option key={code} value={code}>
                  {unitLabel(code)}
                  {code === fileUnits ? " (from file)" : ""}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {needsSource ? (
          <p className="settings-note">This drawing doesn't say what unit it uses. Pick one above to convert lengths.</p>
        ) : null}
      </div>

      <div className="settings-group">
        <div className="settings-label">Viewer background</div>
        <div className="swatches">
          <button
            type="button"
            className={`swatch-btn theme${settings.background === null ? " on" : ""}`}
            onClick={() => set({ background: null })}
            title="Follow theme"
            aria-label="Follow theme"
          />
          {BACKGROUND_PRESETS.map((preset) => (
            <button
              key={preset.value}
              type="button"
              className={`swatch-btn${settings.background === preset.value ? " on" : ""}`}
              style={{ background: preset.value }}
              onClick={() => set({ background: preset.value })}
              title={preset.name}
              aria-label={preset.name}
            />
          ))}
          <label
            className={`swatch-btn custom${settings.background && !BACKGROUND_PRESETS.some((p) => p.value === settings.background) ? " on" : ""}`}
            title="Custom color"
          >
            <input
              type="color"
              value={settings.background ?? "#1e2228"}
              onChange={(event) => set({ background: event.target.value })}
              aria-label="Custom background color"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
