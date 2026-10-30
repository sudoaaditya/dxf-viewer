# DXF Viewer — project context

Read this file at the start of a session before changing the app. It is the handoff for architecture, constraints, and where to edit.

## What this is

In-browser AutoCAD **ASCII DXF** viewer. React + Vite + TypeScript. No backend. Files never leave the device.

- **Live demo:** https://dxf-viewer-one.vercel.app/
- **Cap:** 500 MB (`MAX_FILE_MB` / `MAX_FILE_BYTES` in `src/types/dxf.ts`). Chrome caps strings at ~512 Mi chars and the worker decodes the whole file to one string, so do not raise this further without chunked decoding.
- **Runtime:** Node `>=18.18.0` (Vite 5). Do not bump to Vite 6/7 without raising the Node floor.

Privacy and large-file performance are the product. Do not add a server-side upload/parse path unless that is an explicit request.

## Stack

| Piece | Choice | Why |
| --- | --- | --- |
| UI | React 18 | SPA |
| Build | Vite 5, `worker.format: "es"` | Module workers |
| Render | Custom WebGL (not Three.js) | Few draw calls, small bundle |
| Parse | Custom scanner in a Web Worker | Avoid a huge entity object graph |
| Hosting | Vercel static (`vercel.json`) | `npm run build` → `dist` |

Dependencies stay minimal: `react` and `react-dom` only. No UI kit, no Three.js, no `dxf-parser`.

## Pipeline

```
File / sample
  → stream read with progress (main thread)
  → transferable ArrayBuffer to worker
  → UTF-8 decode
  → scan DXF group codes (no full line-split of the file)
  → tessellate to per-layer Float32Array lines + fills
  → transfer buffers back
  → upload to GPU, one draw call per visible layer
  → Canvas 2D overlay for TEXT and measure
```

GPU vertices are stored relative to `ParsedDrawing.origin` (first finite point, rounded) so Float32 keeps precision at survey-scale coordinates. Anything reading `layer.vertices` must add the origin back; the renderer subtracts it from the camera center.

Camera: world Y-up. Screen Y is flipped in overlay math (`src/lib/camera.ts`). WebGL clip space maps world Y-up to the top of the canvas.

## Directory map

```
src/
  App.tsx                 # Shell: loader phase, camera, measure, layers, keys
  types/dxf.ts            # Shared types + 500 MB constant
  hooks/useDxfLoader.ts   # File read, worker lifecycle, sample load, cancel
  workers/parseDxf.worker.ts
  engine/
    parseDxf.ts           # Group-code scanner + block INSERT expansion
    tessellate.ts         # Line/arc/circle/ellipse/bulge/spline → segments
    buffers.ts            # Growable Float32 + INSERT xforms
    renderer.ts           # WebGL programs, per-layer buffers, PNG pixels
    segmentIndex.ts       # Uniform grid over segments (built in worker); hover pick + measure snap
  lib/
    camera.ts             # Fit, zoom-at-cursor, world ↔ screen
    aciColors.ts          # AutoCAD index colors
    units.ts              # INSUNITS labels, byte/count format, metric/imperial conversion (unitFormat)
    viewSettings.ts       # View settings (units, background) + localStorage persistence
    sampleDxf.ts          # Generated campus site plan
  components/
    ViewerCanvas.tsx      # GL + overlay, pointer/wheel, export
    Toolbar.tsx LayerPanel.tsx StatusBar.tsx
    DropZone.tsx LoadingOverlay.tsx Icons.tsx
    SettingsPanel.tsx     # View settings popover (toolbar sliders button)
```

Config: `vite.config.ts`, `vercel.json`, `package.json`. Styles: `src/index.css` (CSS variables, `data-theme` on `<html>`).

## Conventions

- TypeScript `strict`. `npm run build` runs `tsc --noEmit` then Vite — do not land type errors.
- Shared types live in `src/types/dxf.ts`. Worker messages are `WorkerRequest` / `WorkerResponse`.
- Geometry for the GPU is **line segments** (`x1,y1,x2,y2` in a `Float32Array`) and optional **triangle fills**. Do not send raw DXF entities to the main thread.
- Layer color drives the WebGL draw. Entity-level ACI is resolved for text; lines currently draw in the layer color.
- Paper space (`67 = 1`) is skipped so layouts do not cover model geometry.
- Binary DXF (`AutoCAD Binary DXF`) is rejected with a clear error.
- Nested functions that assign locals can break TS control flow. Mutable holders (see `ctx` in `parseDxf.ts`) are the existing pattern.
- Keep the UI CAD-like and CSS-variable themed. No new CSS framework unless asked.

## Supported vs approximate

**Drawn well:** LINE, CIRCLE, ARC, ELLIPSE, LWPOLYLINE (bulge), POLYLINE/VERTEX, POINT, SOLID/TRACE/3DFACE, INSERT/BLOCKS, TEXT, MTEXT (formatting stripped).

**Approximate:** SPLINE (fit points or simple Bezier), HATCH (polyline outline if 10/20 pairs exist), DIMENSION (definition points as lines), LEADER vertices.

**Skipped:** paper space, binary DXF, many proxy/image/viewport objects.

## UI and keys

Idle: drop zone + “Load sample campus”. Loaded: toolbar, viewer, layer panel, status bar.

| Key | Action |
| --- | --- |
| `F` / `0` | Fit |
| `+` / `-` | Zoom |
| `M` | Measure |
| `L` | Toggle layer panel |
| `Esc` | Cancel measure / dismiss error |
| `⌘/Ctrl+O` | Open file |

View settings (toolbar sliders button): measurement units as drawing units, metric (mm/cm/m/km) or imperial (in/ft/ft-in/yd/mi), applied to lengths and coordinates in the status bar, segment card and measure label. "Drawing is in" overrides the file's INSUNITS for this session; unitless files cannot convert until it is set. Background is theme default, a preset or a custom color; linework contrast (`displayRgb` dark flag) follows the background's luminance, not the UI theme. Units system and background persist in localStorage (`dxf-viewer:view-settings`); the drawing-unit override does not.

Pointer: drag pans; mouse wheel and touchpad pinch zoom toward cursor; two-finger touchpad swipe pans (`isTouchpadScroll` in `ViewerCanvas.tsx` tells notched wheels from touchpads by delta size). Hovering a straight segment (LINE, polyline edge) highlights it with endpoints, length and angle; click pins it, `Esc` clears. In measure mode clicks snap to endpoints, then midpoints, then nearest point on any visible segment; hold `Alt` to place freely. Each layer carries `kinds` (1 = straight, 0 = tessellated curve) so arc chords are not offered as segments.

## Deploy

- Production: https://dxf-viewer-one.vercel.app/
- `vercel.json`: Vite, `dist`, SPA rewrite that does **not** swallow `/assets/*`
- `.vercel` is gitignored
- No env vars required

## Where to change what

| Goal | Start here |
| --- | --- |
| New entity type | `parseDxf.ts` finishEntity + `tessellate.ts` |
| Faster / less memory | worker + `FloatBag` + transferables — do not parse on the main thread |
| Render quality | `renderer.ts` (GL), overlay text in `ViewerCanvas.tsx` |
| Camera / fit | `lib/camera.ts` |
| Sample drawing | `lib/sampleDxf.ts` |
| Theme / layout | `index.css`, `App.tsx` |
| File size limit | `MAX_FILE_BYTES` |
| Hosting | `vercel.json` only unless the app stops being static |

## Do not

- Add a backend just to parse DXF.
- `split('\n')` the entire file string.
- Replace the custom parser/renderer with a heavy CAD library unless the user asks and accepts the bundle/memory tradeoff.
- Force-push or change git remotes.

## Commands

```bash
npm install
npm run dev      # Vite
npm run build    # tsc + vite build
npm run preview
npx vercel       # first-time / preview
npx vercel --prod
```
