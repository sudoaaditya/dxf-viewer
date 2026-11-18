import type { TextRun } from "../types/dxf";
import { inlineFont } from "./textStyle";

/** AutoCAD %% control codes shared by TEXT and MTEXT. */
function decodePercent(value: string): string {
  return value.replace(/%%(\d{3}|[cCdDpP%uUoOkK])/g, (_, code: string) => {
    switch (code.toLowerCase()) {
      case "c":
        return "⌀";
      case "d":
        return "°";
      case "p":
        return "±";
      case "%":
        return "%";
      case "u":
      case "o":
      case "k":
        return ""; // underline / overline / strike toggles
      default:
        return String.fromCharCode(Number(code));
    }
  });
}

function decodeUnicode(value: string): string {
  return value.replace(/\\U\+([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Single-line TEXT / ATTRIB value: only %% codes and \U+ escapes apply. */
export function decodeText(value: string): string {
  return decodePercent(decodeUnicode(value));
}

type RunStyle = Omit<TextRun, "text">;

/** Number argument of \H / \W: "2.5" is absolute, "0.5x" multiplies the current value. */
function sizeArg(arg: string, current: number, absolute: (n: number) => number): number | undefined {
  const relative = /x$/i.test(arg.trim());
  const n = parseFloat(arg);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return relative ? current * n : absolute(n);
}

/**
 * MTEXT content to lines. Paragraph breaks (\P, \X) split lines and \S stacks become a/b.
 * Inline formatting (\f \F \H \W \Q \C \c \L \O \K) becomes styled runs scoped by { };
 * `runs` is only returned when some formatting is present.
 */
export function parseMtext(raw: string, height = 1, widthFactor = 1): { lines: string[]; runs?: TextRun[][] } {
  const value = decodePercent(decodeUnicode(raw));
  const paragraphs: TextRun[][] = [[]];
  const stack: RunStyle[] = [];
  let style: RunStyle = {};
  let buf = "";
  let rich = false;

  const flush = () => {
    if (!buf) return;
    paragraphs[paragraphs.length - 1].push({ text: buf, ...style });
    buf = "";
  };
  const restyle = (patch: RunStyle) => {
    flush();
    style = { ...style, ...patch };
    rich = true;
  };
  const argument = (from: number): [string, number] => {
    const end = value.indexOf(";", from);
    return end < 0 ? [value.slice(from), value.length] : [value.slice(from, end), end + 1];
  };

  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "{") {
      flush();
      stack.push(style);
      i += 1;
      continue;
    }
    if (ch === "}") {
      flush();
      style = stack.pop() ?? style;
      i += 1;
      continue;
    }
    if (ch !== "\\" || i + 1 >= value.length) {
      buf += ch;
      i += 1;
      continue;
    }
    const code = value[i + 1];
    i += 2;
    switch (code) {
      case "P":
      case "X":
        flush();
        paragraphs.push([]);
        break;
      case "~":
        buf += "\u00a0";
        break;
      case "\\":
      case "{":
      case "}":
        buf += code;
        break;
      case "S": {
        const [stackText, next] = argument(i);
        i = next;
        // Keep a mixed number readable: 1\S1#2; -> "1 1/2".
        if (/\d$/.test(buf)) buf += " ";
        buf += stackText.replace(/[\^#]/, "/").replace(/\^/g, "");
        break;
      }
      case "f":
      case "F": {
        const [arg, next] = argument(i);
        i = next;
        const font = inlineFont(arg, code === "F");
        restyle({ fontFamily: font.fontFamily, bold: font.bold ?? style.bold, italic: font.italic ?? style.italic });
        break;
      }
      case "H": {
        const [arg, next] = argument(i);
        i = next;
        const scale = sizeArg(arg, style.scale ?? 1, (n) => (height > 0 ? n / height : 1));
        if (scale !== undefined) restyle({ scale });
        break;
      }
      case "W": {
        const [arg, next] = argument(i);
        i = next;
        const width = sizeArg(arg, style.widthFactor ?? widthFactor, (n) => n);
        if (width !== undefined) restyle({ widthFactor: width });
        break;
      }
      case "Q": {
        const [arg, next] = argument(i);
        i = next;
        const angle = parseFloat(arg);
        if (Number.isFinite(angle)) restyle({ oblique: angle });
        break;
      }
      case "C": {
        const [arg, next] = argument(i);
        i = next;
        restyle({ color: Math.trunc(Number(arg)) || 256, trueColor: undefined });
        break;
      }
      case "c": {
        const [arg, next] = argument(i);
        i = next;
        const rgb = Math.trunc(Number(arg));
        if (Number.isFinite(rgb)) restyle({ trueColor: rgb & 0xffffff, color: undefined });
        break;
      }
      case "L":
      case "l":
        restyle({ underline: code === "L" });
        break;
      case "O":
      case "o":
        restyle({ overline: code === "O" });
        break;
      case "K":
      case "k":
        restyle({ strike: code === "K" });
        break;
      case "A":
      case "T":
      case "p":
        // Vertical alignment, tracking and paragraph settings: not rendered.
        i = argument(i)[1];
        break;
      case "N":
        break;
      default:
        buf += code;
    }
  }
  flush();

  while (paragraphs.length > 1 && paragraphs[paragraphs.length - 1].every((run) => run.text.trim() === "")) paragraphs.pop();
  for (const runs of paragraphs) {
    const last = runs[runs.length - 1];
    if (last) last.text = last.text.replace(/\s+$/, "");
  }
  const lines = paragraphs.map((runs) => runs.map((run) => run.text).join(""));
  return rich ? { lines, runs: paragraphs.map((runs) => runs.filter((run) => run.text)) } : { lines };
}
