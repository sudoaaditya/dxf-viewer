import { useCallback, useRef, useState } from "react";
import { generateSampleDxf } from "../lib/sampleDxf";
import { MAX_FILE_BYTES, MAX_FILE_MB } from "../types/dxf";
import type { ParsedDrawing, WorkerRequest, WorkerResponse } from "../types/dxf";

export type LoadPhase =
  | { status: "idle" }
  | {
      status: "loading";
      fileName: string;
      fileBytes: number;
      stage: string;
      progress: number;
    }
  | { status: "ready"; drawing: ParsedDrawing }
  | { status: "error"; message: string; fileName?: string };

async function readFileBuffer(
  file: File,
  onProgress: (progress: number) => void,
): Promise<ArrayBuffer> {
  if (file.size < 4_000_000 || typeof file.stream !== "function") {
    onProgress(1);
    return file.arrayBuffer();
  }

  // Stream straight into one allocation: holding chunks and then merging them
  // would need twice the file size in memory, which hurts at hundreds of MB.
  const reader = file.stream().getReader();
  const out = new Uint8Array(file.size);
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (received + value.byteLength > out.length) throw new Error("The file changed while it was being read.");
    out.set(value, received);
    received += value.byteLength;
    onProgress(received / file.size);
  }
  return received === out.length ? out.buffer : out.slice(0, received).buffer;
}

export function useDxfLoader() {
  const [phase, setPhase] = useState<LoadPhase>({ status: "idle" });
  const workerRef = useRef<Worker | null>(null);
  const requestRef = useRef(0);

  const terminateWorker = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
  };

  // Runs under the caller's request id: taking a new one here would make loadFile's
  // catch treat worker errors as stale and leave the loading overlay up forever.
  const loadBuffer = useCallback(async (buffer: ArrayBuffer, fileName: string, fileBytes: number, requestId: number) => {
    terminateWorker();

    const worker = new Worker(new URL("../workers/parseDxf.worker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    await new Promise<void>((resolve, reject) => {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        if (requestId !== requestRef.current) return;
        const msg = event.data;
        if (msg.type === "progress") {
          setPhase({
            status: "loading",
            fileName,
            fileBytes,
            stage: msg.message,
            progress: 0.15 + msg.progress * 0.85,
          });
          return;
        }
        if (msg.type === "error") {
          reject(new Error(msg.message));
          return;
        }
        setPhase({ status: "ready", drawing: msg.result });
        resolve();
      };
      worker.onerror = (event) => {
        reject(new Error(event.message || "Worker failed while parsing the DXF file."));
      };

      const payload: WorkerRequest = { type: "parse", buffer, fileName, fileBytes };
      worker.postMessage(payload, [buffer]);
    });

    terminateWorker();
  }, []);

  const loadFile = useCallback(
    async (file: File) => {
      if (!/\.dxf$/i.test(file.name) && file.type && !file.type.includes("dxf") && !file.type.includes("text")) {
        setPhase({
          status: "error",
          message: "Please choose an ASCII .dxf file.",
          fileName: file.name,
        });
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        setPhase({
          status: "error",
          message: `This file is ${(file.size / (1024 * 1024)).toFixed(1)} MB. The viewer accepts files up to ${MAX_FILE_MB} MB.`,
          fileName: file.name,
        });
        return;
      }
      if (file.size === 0) {
        setPhase({ status: "error", message: "The selected file is empty.", fileName: file.name });
        return;
      }

      const requestId = ++requestRef.current;
      setPhase({
        status: "loading",
        fileName: file.name,
        fileBytes: file.size,
        stage: "Reading file…",
        progress: 0.02,
      });

      try {
        const buffer = await readFileBuffer(file, (progress) => {
          if (requestId !== requestRef.current) return;
          setPhase({
            status: "loading",
            fileName: file.name,
            fileBytes: file.size,
            stage: "Reading file…",
            progress: progress * 0.15,
          });
        });
        if (requestId !== requestRef.current) return;
        await loadBuffer(buffer, file.name, file.size, requestId);
      } catch (error) {
        if (requestId !== requestRef.current) return;
        setPhase({
          status: "error",
          fileName: file.name,
          message: error instanceof Error ? error.message : "Could not open this DXF file.",
        });
        terminateWorker();
      }
    },
    [loadBuffer],
  );

  const loadSample = useCallback(async () => {
    const text = generateSampleDxf();
    const blob = new Blob([text], { type: "application/dxf" });
    const file = new File([blob], "sample-campus.dxf", { type: "application/dxf" });
    await loadFile(file);
  }, [loadFile]);

  const cancel = useCallback(() => {
    requestRef.current += 1;
    terminateWorker();
    setPhase({ status: "idle" });
  }, []);

  const reset = useCallback(() => {
    requestRef.current += 1;
    terminateWorker();
    setPhase({ status: "idle" });
  }, []);

  return { phase, loadFile, loadSample, cancel, reset };
}
