// Scales the leading quantity in an Arabic ingredient line ("2 كوب دقيق" -> "4 كوب دقيق").
// Heuristic: handles latin/Arabic-Indic digits, decimals, ranges, unicode
// fractions, and common Arabic fraction words. Lines without a leading number
// are left unchanged.

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".",
};
const UNICODE_FRAC: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375,
};
const WORD_FRAC: [RegExp, number][] = [
  [/^نصف\s+/, 0.5],
  [/^نص\s+/, 0.5],
  [/^ربع\s+/, 0.25],
  [/^ثلث\s+/, 1 / 3],
];

function toLatin(s: string): string {
  return s.replace(/[٠-٩٫]/g, (d) => AR_DIGITS[d] || d);
}

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 0.02) return String(Math.round(r));
  const intPart = Math.floor(r);
  const frac = r - intPart;
  const map: [number, string][] = [
    [0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1 / 3, "⅓"], [2 / 3, "⅔"],
  ];
  for (const [v, g] of map) {
    if (Math.abs(frac - v) < 0.03) return (intPart ? intPart + " " : "") + g;
  }
  return String(r);
}

export function scaleIngredient(text: string, factor: number): string {
  if (!factor || factor === 1) return text;
  const s = toLatin(text.trim());

  const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:[-–]\s*(\d+(?:\.\d+)?))?\s*([½¼¾⅓⅔⅛⅜])?/);
  if (m && m[1] && m[0].trim()) {
    const base = parseFloat(m[1]) + (m[3] ? UNICODE_FRAC[m[3]] || 0 : 0);
    let out = fmt(base * factor);
    if (m[2]) out += "-" + fmt(parseFloat(m[2]) * factor);
    return out + s.slice(m[0].length);
  }
  const mf = s.match(/^([½¼¾⅓⅔⅛⅜])\s*/);
  if (mf) return fmt((UNICODE_FRAC[mf[1]] || 0) * factor) + " " + s.slice(mf[0].length);
  for (const [re, val] of WORD_FRAC) {
    if (re.test(s)) return fmt(val * factor) + " " + s.replace(re, "");
  }
  return text;
}

export const SCALE_OPTIONS: { label: string; value: number }[] = [
  { label: "½", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];
