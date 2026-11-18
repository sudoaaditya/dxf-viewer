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

// Codes whose argument runs to the next ';' (font, height, color, tracking, width, ...).
const WITH_ARG = new Set(["A", "C", "c", "F", "f", "H", "Q", "T", "W", "p"]);
// Toggles with no argument (underline, overline, strike-through, alignment reset).
const TOGGLES = new Set(["L", "l", "O", "o", "K", "k", "N"]);

/**
 * MTEXT content to plain lines. Paragraph breaks (\P, \X) split lines; inline
 * formatting is dropped without eating the text it applies to; \S stacks become a/b.
 */
export function parseMtext(raw: string): string[] {
  const value = decodePercent(decodeUnicode(raw));
  const lines: string[] = [];
  let line = "";
  let i = 0;
  while (i < value.length) {
    const ch = value[i];
    if (ch === "{" || ch === "}") {
      i += 1;
      continue;
    }
    if (ch !== "\\" || i + 1 >= value.length) {
      line += ch;
      i += 1;
      continue;
    }
    const code = value[i + 1];
    i += 2;
    if (code === "P" || code === "X") {
      lines.push(line);
      line = "";
    } else if (code === "~") {
      line += " ";
    } else if (code === "\\" || code === "{" || code === "}") {
      line += code;
    } else if (code === "S") {
      const end = value.indexOf(";", i);
      const stack = value.slice(i, end < 0 ? value.length : end);
      // Keep a mixed number readable: 1\S1#2; -> "1 1/2".
      if (/\d$/.test(line)) line += " ";
      line += stack.replace(/[\^#]/, "/").replace(/\^/g, "");
      i = end < 0 ? value.length : end + 1;
    } else if (WITH_ARG.has(code)) {
      const end = value.indexOf(";", i);
      i = end < 0 ? value.length : end + 1;
    } else if (!TOGGLES.has(code)) {
      line += code;
    }
  }
  lines.push(line);
  while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.map((l) => l.replace(/\s+$/, ""));
}
