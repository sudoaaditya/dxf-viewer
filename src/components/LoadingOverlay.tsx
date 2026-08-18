import { formatBytes } from "../lib/units";

type LoadingOverlayProps = {
  fileName: string;
  fileBytes: number;
  stage: string;
  progress: number;
  onCancel: () => void;
};

export function LoadingOverlay({ fileName, fileBytes, stage, progress, onCancel }: LoadingOverlayProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="hero-kicker">Opening drawing</div>
        <h2>{fileName}</h2>
        <p>
          {formatBytes(fileBytes)} · {stage}
        </p>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${pct}%` }} />
        </div>
        <div className="progress-label">{pct}%</div>
        <button type="button" className="btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
