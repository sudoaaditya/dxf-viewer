# DXF Viewer

**Live demo:** [https://dxf-viewer-one.vercel.app/](https://dxf-viewer-one.vercel.app/)

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

## Deploy on Vercel

This is a static Vite app. `vercel.json` already sets the framework, build command (`npm run build`), and output folder (`dist`). DXF files are parsed in the browser, so Vercel does not receive or store drawings.

### Git integration

1. Push this repo to GitHub, GitLab, or Bitbucket.
2. In [Vercel](https://vercel.com/new), import the repository.
3. Leave the detected Vite settings as they are and deploy.

Later pushes to the production branch publish automatically.

### CLI

```bash
npm i -g vercel
vercel
```

Follow the prompts the first time. For a production deploy:

```bash
vercel --prod
```

## Limits

- ASCII DXF only. Binary DXF is rejected with a clear error.
- Paper-space entities are skipped so model geometry is not covered by layouts.
- Hatches, splines, and dimensions are approximated. Common 2D entities (lines, arcs, circles, polylines, blocks, text) are the focus.
