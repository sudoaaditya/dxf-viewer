import { parseDxf } from "../engine/parseDxf";
import type { WorkerRequest, WorkerResponse } from "../types/dxf";

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

    const decoder = new TextDecoder("utf-8", { fatal: false });
    const text = decoder.decode(data.buffer);

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
      transfers.push(layer.vertices.buffer);
      transfers.push(layer.fills.buffer);
    }

    self.postMessage({ type: "done", result } satisfies WorkerResponse, { transfer: transfers });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    self.postMessage({ type: "error", message } satisfies WorkerResponse);
  }
};
