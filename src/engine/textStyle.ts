import type { TextFont } from "../types/dxf";

const FALLBACK = "Arial, Helvetica, sans-serif";

export const DEFAULT_FONT: TextFont = { fontFamily: FALLBACK, bold: false, italic: false, widthFactor: 1, oblique: 0 };

// Windows TrueType file names (as written in STYLE group 3) to family + face.
const TTF: Record<string, [family: string, bold?: boolean, italic?: boolean]> = {
  arial: ["Arial"],
  arialbd: ["Arial", true],
  ariali: ["Arial", false, true],
  arialbi: ["Arial", true, true],
  arialn: ["Arial Narrow"],
  arialnb: ["Arial Narrow", true],
  arialni: ["Arial Narrow", false, true],
  arialnbi: ["Arial Narrow", true, true],
  times: ["Times New Roman"],
  timesbd: ["Times New Roman", true],
  timesi: ["Times New Roman", false, true],
  timesbi: ["Times New Roman", true, true],
  cour: ["Courier New"],
  courbd: ["Courier New", true],
  couri: ["Courier New", false, true],
  calibri: ["Calibri"],
  calibrib: ["Calibri", true],
  calibrii: ["Calibri", false, true],
  cambria: ["Cambria"],
  verdana: ["Verdana"],
  verdanab: ["Verdana", true],
  tahoma: ["Tahoma"],
  tahomabd: ["Tahoma", true],
  segoeui: ["Segoe UI"],
  segoeuib: ["Segoe UI", true],
  consola: ["Consolas"],
  georgia: ["Georgia"],
  trebuc: ["Trebuchet MS"],
  gothic: ["Century Gothic"],
  isocpeur: ["ISOCPEUR"],
  isocp: ["ISOCP"],
};

// XDATA 1071 font flags on a STYLE record.
const FLAG_ITALIC = 0x1000000;
const FLAG_BOLD = 0x2000000;

export function cssFamily(family: string): string {
  if (!family || /^arial$/i.test(family)) return FALLBACK;
  return `"${family.replace(/"/g, "")}", ${FALLBACK}`;
}

/**
 * Font from an inline MTEXT code. `\f` names a TrueType family ("Arial|b1|i0|c0|p34");
 * `\F` names a font file, usually SHX ("romans.shx|c0"). Flags b/i set bold and italic.
 */
export function inlineFont(arg: string, isFile: boolean): { fontFamily: string; bold?: boolean; italic?: boolean } {
  const [name, ...flags] = arg.split("|");
  const flag = (key: string) => {
    const f = flags.find((part) => part.startsWith(key));
    return f === undefined ? undefined : f.slice(1) === "1";
  };
  const fontFamily = isFile ? styleFont(name, "", 0, 1, 0).fontFamily : cssFamily(name.trim());
  return { fontFamily, bold: flag("b"), italic: flag("i") };
}

/**
 * CSS font for a STYLE record. Prefers the family name AutoCAD keeps in XDATA, then a
 * known TrueType file name, then the file's base name. SHX shape fonts have no web
 * equivalent and fall back to Arial; a family the browser lacks falls back the same way.
 */
export function styleFont(
  fontFile: string,
  xdataFamily: string,
  xdataFlags: number,
  widthFactor: number,
  oblique: number,
): TextFont {
  const base = fontFile.trim().toLowerCase().replace(/^.*[\\/]/, "");
  const name = base.replace(/\.(ttf|ttc|otf|shx)$/, "");
  const known = TTF[name];
  let family = xdataFamily.trim();
  let bold = (xdataFlags & FLAG_BOLD) !== 0;
  let italic = (xdataFlags & FLAG_ITALIC) !== 0;
  if (!family && known) {
    family = known[0];
    bold ||= known[1] === true;
    italic ||= known[2] === true;
  } else if (!family && /\.(ttf|ttc|otf)$/.test(base)) {
    // Unknown TrueType file: its base name is the best guess. Bare names ("txt", "romans") are SHX.
    family = name.charAt(0).toUpperCase() + name.slice(1);
  }
  return {
    fontFamily: cssFamily(family),
    bold,
    italic,
    widthFactor: widthFactor > 0 ? widthFactor : 1,
    oblique: Number.isFinite(oblique) ? oblique : 0,
  };
}
