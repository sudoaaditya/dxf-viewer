import { displayRgb } from "../lib/aciColors";
import type { CameraState, ParsedDrawing } from "../types/dxf";

const LINE_VS = `
attribute vec2 a_pos;
uniform vec2 u_resolution;
uniform vec2 u_center;
uniform float u_zoom;
void main() {
  vec2 pixel = (a_pos - u_center) * u_zoom;
  vec2 clip = vec2(pixel.x * 2.0 / u_resolution.x, pixel.y * 2.0 / u_resolution.y);
  gl_Position = vec4(clip, 0.0, 1.0);
}
`;

const FILL_VS = LINE_VS;

const LINE_FS = `
precision mediump float;
uniform vec3 u_color;
void main() {
  gl_FragColor = vec4(u_color, 1.0);
}
`;

const FILL_FS = `
precision mediump float;
uniform vec3 u_color;
void main() {
  gl_FragColor = vec4(u_color, 0.28);
}
`;

type GpuLayer = {
  name: string;
  color: number;
  visible: boolean;
  lineBuffer: WebGLBuffer | null;
  fillBuffer: WebGLBuffer | null;
  lineCount: number;
  fillCount: number;
};

function compile(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to create WebGL shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader) ?? "shader error";
    gl.deleteShader(shader);
    throw new Error(info);
  }
  return shader;
}

function program(gl: WebGLRenderingContext, vs: string, fs: string): WebGLProgram {
  const p = gl.createProgram();
  if (!p) throw new Error("Unable to create WebGL program");
  const v = compile(gl, gl.VERTEX_SHADER, vs);
  const f = compile(gl, gl.FRAGMENT_SHADER, fs);
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(p) ?? "program link error");
  }
  return p;
}

export class DxfGlRenderer {
  private gl: WebGLRenderingContext;
  private lineProg: WebGLProgram;
  private fillProg: WebGLProgram;
  private layers: GpuLayer[] = [];
  private dark = true;
  private width = 1;
  private height = 1;

  constructor(canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", {
      antialias: true,
      alpha: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("WebGL is required to render large DXF files.");
    this.gl = gl;
    this.lineProg = program(gl, LINE_VS, LINE_FS);
    this.fillProg = program(gl, FILL_VS, FILL_FS);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  setTheme(dark: boolean) {
    this.dark = dark;
  }

  resize(cssWidth: number, cssHeight: number, dpr: number) {
    const gl = this.gl;
    const w = Math.max(1, Math.floor(cssWidth * dpr));
    const h = Math.max(1, Math.floor(cssHeight * dpr));
    if (gl.canvas.width !== w || gl.canvas.height !== h) {
      gl.canvas.width = w;
      gl.canvas.height = h;
    }
    this.width = cssWidth;
    this.height = cssHeight;
    gl.viewport(0, 0, w, h);
  }

  setDrawing(drawing: ParsedDrawing | null) {
    const gl = this.gl;
    for (const layer of this.layers) {
      if (layer.lineBuffer) gl.deleteBuffer(layer.lineBuffer);
      if (layer.fillBuffer) gl.deleteBuffer(layer.fillBuffer);
    }
    this.layers = [];
    if (!drawing) return;

    for (const layer of drawing.layers) {
      const gpu: GpuLayer = {
        name: layer.name,
        color: layer.color,
        visible: layer.visible,
        lineBuffer: null,
        fillBuffer: null,
        lineCount: layer.vertices.length / 2,
        fillCount: layer.fills.length / 2,
      };
      if (layer.vertices.length) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, layer.vertices, gl.STATIC_DRAW);
        gpu.lineBuffer = buf;
      }
      if (layer.fills.length) {
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, layer.fills, gl.STATIC_DRAW);
        gpu.fillBuffer = buf;
      }
      this.layers.push(gpu);
    }
  }

  setLayerVisible(name: string, visible: boolean) {
    const layer = this.layers.find((item) => item.name === name);
    if (layer) layer.visible = visible;
  }

  render(camera: CameraState) {
    const gl = this.gl;
    const bg = this.dark ? [0.07, 0.08, 0.1] : [0.96, 0.96, 0.94];
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    this.drawPass(this.fillProg, camera, true);
    this.drawPass(this.lineProg, camera, false);
  }

  private drawPass(prog: WebGLProgram, camera: CameraState, fills: boolean) {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.uniform2f(gl.getUniformLocation(prog, "u_resolution"), this.width, this.height);
    gl.uniform2f(gl.getUniformLocation(prog, "u_center"), camera.x, camera.y);
    gl.uniform1f(gl.getUniformLocation(prog, "u_zoom"), camera.zoom);

    const loc = gl.getAttribLocation(prog, "a_pos");
    const colorLoc = gl.getUniformLocation(prog, "u_color");

    for (const layer of this.layers) {
      if (!layer.visible) continue;
      const buffer = fills ? layer.fillBuffer : layer.lineBuffer;
      const count = fills ? layer.fillCount : layer.lineCount;
      if (!buffer || count < 2) continue;
      const rgb = displayRgb(layer.color, this.dark);
      gl.uniform3f(colorLoc, rgb[0] / 255, rgb[1] / 255, rgb[2] / 255);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(fills ? gl.TRIANGLES : gl.LINES, 0, count);
    }
  }

  readPixels(): Uint8Array {
    const gl = this.gl;
    const { width, height } = gl.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  dispose() {
    this.setDrawing(null);
    const gl = this.gl;
    gl.deleteProgram(this.lineProg);
    gl.deleteProgram(this.fillProg);
  }
}
