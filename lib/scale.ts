// Scales the leading quantity in an Arabic ingredient line. Handles latin +
// Arabic-Indic digits, decimals, ranges, unicode fractions, fraction words,
// dual nouns (كوبين=2), and written cardinals (ثلاثة=3). Lines with no leading
// quantity are returned unchanged.

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".",
};
const UNICODE_FRAC: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": 0.125, "⅜": 0.375,
};
// word -> value
const WORDS: [RegExp, number][] = [
  [/^نصف\s+/, 0.5], [/^نص\s+/, 0.5], [/^ربع\s+/, 0.25], [/^ثلث\s+/, 1 / 3],
  [/^(?:واحدة|واحد)\s+/, 1],
  [/^(?:اثنتين|اثنتان|اثنين|اثنان)\s+/, 2],
  [/^(?:ثلاثة|ثلاث)\s+/, 3],
  [/^(?:أربعة|أربع|اربعة|اربع)\s+/, 4],
  [/^(?:خمسة|خمس)\s+/, 5],
  [/^(?:ستة|ست)\s+/, 6],
  [/^(?:سبعة|سبع)\s+/, 7],
  [/^(?:ثمانية|ثماني|ثمان)\s+/, 8],
  [/^(?:تسعة|تسع)\s+/, 9],
  [/^(?:عشرة|عشر)\s+/, 10],
];
// dual noun -> singular (value is 2)
const DUALS: [RegExp, string][] = [
  [/^كوب(?:ين|ان)\s+/, "كوب"], [/^ملعقت(?:ين|ان)\s+/, "ملعقة"],
  [/^حبت(?:ين|ان)\s+/, "حبة"], [/^فص(?:ين|ان)\s+/, "فص"],
  [/^كأس(?:ين|ان)\s+/, "كأس"], [/^علبت(?:ين|ان)\s+/, "علبة"],
  [/^ثمرت(?:ين|ان)\s+/, "ثمرة"], [/^رأس(?:ين|ان)\s+/, "رأس"],
  [/^شريحت(?:ين|ان)\s+/, "شريحة"], [/^قطعت(?:ين|ان)\s+/, "قطعة"],
  [/^كيلوين\s+/, "كيلو"], [/^لترين\s+/, "لتر"],
];

// A leading measurement/countable unit with no number implies a quantity of 1
// ("كوب من السكر" = 1 cup). Scaling then works ("2 كوب من السكر").
const UNIT =
  /^(?:كوب|كوباية|كوبايه|كأس|كاسة|كاسه|ملعقة|ملعقه|ملعقتان|حبة|حبه|فص|فصوص|علبة|علبه|ثمرة|ثمره|رأس|راس|شريحة|شريحه|قطعة|قطعه|كيلو|كيلوغرام|كيلوجرام|غرام|جرام|لتر|رشة|رشه|حزمة|حزمه|ظرف|علبتان)\s+/;

function toLatin(s: string): string {
  return s.replace(/[٠-٩٫]/g, (d) => AR_DIGITS[d] || d);
}

function fmt(n: number): string {
  const r = Math.round(n * 100) / 100;
  if (Math.abs(r - Math.round(r)) < 0.02) return String(Math.round(r));
  const intPart = Math.floor(r);
  const frac = r - intPart;
  const map: [number, string][] = [[0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1 / 3, "⅓"], [2 / 3, "⅔"]];
  for (const [v, g] of map) if (Math.abs(frac - v) < 0.03) return (intPart ? intPart + " " : "") + g;
  return String(r);
}

/**
 * Rewrite a leading Arabic word/dual quantity into canonical digit form
 * ("كوبين حليب" -> "2 كوب حليب", "نصف كوب" -> "½ كوب", "٣ أكواب" -> "3 أكواب").
 * Makes stored ingredients consistently scalable. Non-quantity lines pass through
 * (with Arabic-Indic digits converted to latin).
 */
export function normalizeQuantity(text: string): string {
  if (!text) return text;
  const s = toLatin(text.trim());
  for (const [re, singular] of DUALS) {
    const d = s.match(re);
    if (d) return `2 ${singular} ${s.slice(d[0].length)}`.replace(/\s+/g, " ").trim();
  }
  for (const [re, val] of WORDS) {
    const w = s.match(re);
    if (w) return `${fmt(val)} ${s.slice(w[0].length)}`.replace(/\s+/g, " ").trim();
  }
  if (UNIT.test(s)) return `1 ${s}`;
  return s;
}

export function canScale(text: string): boolean {
  const s = toLatin(text.trim());
  if (/^\d/.test(s) || /^[½¼¾⅓⅔⅛⅜]/.test(s)) return true;
  if (WORDS.some(([re]) => re.test(s))) return true;
  if (DUALS.some(([re]) => re.test(s))) return true;
  if (UNIT.test(s)) return true;
  return false;
}

export function scaleIngredient(text: string, factor: number): string {
  if (!factor || factor === 1) return text;
  const s = toLatin(text.trim());

  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?(?:\s*([½¼¾⅓⅔⅛⅜]))?/);
  if (m && m[1] && m[0].trim()) {
    const base = parseFloat(m[1]) + (m[3] ? UNICODE_FRAC[m[3]] || 0 : 0);
    let out = fmt(base * factor);
    if (m[2]) out += "-" + fmt(parseFloat(m[2]) * factor);
    return out + s.slice(m[0].length);
  }
  const mf = s.match(/^([½¼¾⅓⅔⅛⅜])\s*/);
  if (mf) return fmt((UNICODE_FRAC[mf[1]] || 0) * factor) + " " + s.slice(mf[0].length);
  for (const [re, singular] of DUALS) {
    const d = s.match(re);
    if (d) return fmt(2 * factor) + " " + singular + " " + s.slice(d[0].length);
  }
  for (const [re, val] of WORDS) {
    const w = s.match(re);
    if (w) return fmt(val * factor) + " " + s.slice(w[0].length);
  }
  if (UNIT.test(s)) return fmt(1 * factor) + " " + s;
  return text;
}

const INLINE_WORD_QUANTITY =
  "(?:نصف|نص|ربع|ثلث|واحدة|واحد|اثنتين|اثنتان|اثنين|اثنان|ثلاثة|ثلاث|أربعة|أربع|اربعة|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثماني|ثمان|تسعة|تسع|عشرة|عشر)";
const INLINE_NUMBER_QUANTITY =
  "(?:(?:[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)(?:\\s*[-–]\\s*[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)?\\s*[½¼¾⅓⅔⅛⅜]?|[½¼¾⅓⅔⅛⅜])";
const INLINE_UNIT =
  "(?:أكواب|اكواب|كوب|كوباية|كوبايه|كأس|كاس|كاسة|كاسه|ملاعق|ملعقة|ملعقه|حبات|حبة|حبه|فصوص|فص|علب|علبة|علبه|ثمرات|ثمرة|ثمره|رأس|راس|شرائح|شريحة|شريحه|قطع|قطعة|قطعه|كيلوغرام|كيلوجرام|كيلو|كغ|غرام|جرام|غم|جم|غ|مليلتر|مل|لتر|رشة|رشه|حزمة|حزمه|ظرف|cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|kg|g|ml|lit(?:er|re)s?|oz|ounces?)";
const INLINE_DUAL =
  "(?:كوب(?:ين|ان)|ملعقت(?:ين|ان)|حبت(?:ين|ان)|فص(?:ين|ان)|كأس(?:ين|ان)|علبت(?:ين|ان)|ثمرت(?:ين|ان)|رأس(?:ين|ان)|شريحت(?:ين|ان)|قطعت(?:ين|ان)|كيلوين|لترين)";
const INLINE_BARE_UNIT =
  "(?:كوب|كوباية|كوبايه|كأس|كاس|كاسة|كاسه|ملعقة|ملعقه|حبة|حبه|فص|علبة|علبه|ثمرة|ثمره|رأس|راس|شريحة|شريحه|قطعة|قطعه|كيلو|لتر|رشة|رشه|حزمة|حزمه|ظرف)";
const INLINE_AMOUNT = new RegExp(
  `(^|[^\\p{L}\\p{N}])(و?)((?:(?:${INLINE_NUMBER_QUANTITY}|${INLINE_WORD_QUANTITY})\\s*${INLINE_UNIT})|${INLINE_DUAL}|${INLINE_BARE_UNIT})(?=$|[^\\p{L}\\p{N}])`,
  "giu"
);

/** Scale ingredient quantities wherever they appear in a preparation step.
 * Only phrases tied to cooking units are changed, so times, temperatures, and
 * numbered instructions remain untouched. */
export function scaleInstruction(text: string, factor: number): string {
  if (!factor || factor === 1 || !text) return text;
  return text.replace(INLINE_AMOUNT, (match, prefix: string, conjunction: string, phrase: string) => {
    const marker = "__recipe_amount_end__";
    const scaled = scaleIngredient(`${phrase} ${marker}`, factor)
      .replace(new RegExp(`\\s*${marker}$`), "")
      .trim();
    // Numeric English units are handled by scaleIngredient. Bare-unit matches
    // are Arabic units that scaleIngredient already understands.
    return `${prefix}${conjunction}${scaled || match.slice(prefix.length + conjunction.length)}`;
  });
}

export const SCALE_OPTIONS: { label: string; value: number }[] = [
  { label: "½", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];
