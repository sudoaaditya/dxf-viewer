import { parseDxf } from "../engine/parseDxf";
import type { WorkerRequest, WorkerResponse } from "../types/dxf";

/** Decodes and drops the request's buffer so large files do not keep bytes and string alive together. */
function decode(request: { buffer: ArrayBuffer | null }): string {
  const buffer = request.buffer;
  request.buffer = null;
  if (!buffer) return "";
  try {
    return new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  } catch (error) {
    if (error instanceof RangeError) {
      throw new Error("This file is too large for the browser to decode as text. Try a smaller export or another browser.");
    }
    throw error;
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const data = event.data;
  if (!data || data.type !== "parse") return;

  try {
    self.postMessage({
      type: "progress",
      stage: "decode",
      progress: 0.05,
      message: "Decoding file…",
    } satisfies WorkerResponse);

    const text = decode(data);

    const result = parseDxf(text, data.fileName, data.fileBytes, (progress) => {
      self.postMessage({
        type: "progress",
        stage: progress.stage,
        progress: progress.progress,
        message: progress.message,
      } satisfies WorkerResponse);
    });

    const transfers: Transferable[] = [];
    for (const layer of result.layers) {
      transfers.push(layer.vertices.buffer, layer.kinds.buffer, layer.fills.buffer);
    }
    transfers.push(result.index.cellStart.buffer, result.index.items.buffer, result.index.layerStart.buffer);

    self.postMessage({ type: "done", result } satisfies WorkerResponse, { transfer: transfers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", message } satisfies WorkerResponse);
  }
};
