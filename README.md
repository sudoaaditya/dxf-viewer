# DXF Viewer

A React + Vite app for opening AutoCAD DXF files entirely in the browser. Files stay on your device. The viewer is built for large drawings, up to **100 MB**.

## Why it stays responsive on big files

- The file is streamed in with progress, then handed to a **Web Worker** as a transferable `ArrayBuffer`.
- A compact group-code scanner walks the DXF without building a huge entity object graph.
- Geometry is packed into `Float32Array` line and fill buffers, one set per layer.
- **WebGL** draws those buffers in a small number of calls. Text and measurements sit on a 2D overlay and only render when they are large enough to read.

## Features

- Drag and drop or file picker
- Sample campus site plan
- Pan, scroll-zoom toward the cursor, fit view
- Layer show/hide
- Distance measure
- Dark / light theme
- PNG export of the current view
- Keyboard: `F` fit, `+` / `-` zoom, `M` measure, `L` layers, `Esc` cancel, `⌘/Ctrl+O` open

## Run locally

Needs Node 18.18+ (this repo targets Vite 5).

```bash
npm install
npm run dev
```

Then open the printed local URL and drop a `.dxf` file, or load the sample drawing.

```bash
npm run build
npm run preview
```

## Limits

- ASCII DXF only. Binary DXF is rejected with a clear error.
- Paper-space entities are skipped so model geometry is not covered by layouts.
- Hatches, splines, and dimensions are approximated. Common 2D entities (lines, arcs, circles, polylines, blocks, text) are the focus.
