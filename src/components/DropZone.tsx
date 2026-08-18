import { useState } from "react";

type DropZoneProps = {
  onFile: (file: File) => void;
  onSample: () => void;
};

export function DropZone({ onFile, onSample }: DropZoneProps) {
  const [over, setOver] = useState(false);

  return (
    <div
      className={`drop-zone ${over ? "over" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const file = event.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <div className="hero-card">
        <div className="hero-kicker">In-browser CAD preview</div>
        <h1>Open large DXF drawings without uploading them.</h1>
        <p>
          Drop an ASCII DXF file up to 100 MB. Parsing runs in a Web Worker, geometry is packed into typed
          arrays, and WebGL draws the result. The file never leaves this device.
        </p>
        <div className="hero-actions">
          <label className="btn primary">
            Choose DXF
            <input
              type="file"
              accept=".dxf,application/dxf,image/vnd.dxf,text/plain"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <button type="button" className="btn" onClick={onSample}>
            Load sample campus
          </button>
        </div>
        <ul className="hero-points">
          <li>100 MB file cap with streamed reads</li>
          <li>Layer visibility, measure, PNG export</li>
          <li>No server, no account, no cloud copy</li>
        </ul>
      </div>
    </div>
  );
}
