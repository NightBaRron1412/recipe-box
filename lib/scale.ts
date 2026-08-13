// Scales the leading quantity in an Arabic ingredient line. Handles latin +
// Arabic-Indic digits, decimals, ranges, unicode fractions, fraction words,
// dual nouns (كوبين=2), and written cardinals (ثلاثة=3). Lines with no leading
// quantity are returned unchanged.

const AR_DIGITS: Record<string, string> = {
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9", "٫": ".",
};
const UNICODE_FRAC: Record<string, number> = {
  "½": 0.5, "¼": 0.25, "¾": 0.75, "⅓": 1 / 3, "⅔": 2 / 3,
  "⅛": 0.125, "⅜": 0.375, "⅝": 0.625, "⅞": 0.875,
};
// word -> value
const WORDS: [RegExp, number][] = [
  [/^نصف\s+/, 0.5], [/^نص\s+/, 0.5], [/^ربع\s+/, 0.25],
  [/^ثلثا\s+/, 2 / 3], [/^ثلث\s+/, 1 / 3],
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
  [/^كوب(?:ين|ان|ي)\s+/, "كوب"], [/^ملعقت(?:ين|ان|ا|ي)\s+/, "ملعقة"],
  [/^حبت(?:ين|ان|ا|ي)\s+/, "حبة"], [/^فص(?:ين|ان|ي)\s+/, "فص"],
  [/^كأس(?:ين|ان|ي)\s+/, "كأس"], [/^علبت(?:ين|ان|ا|ي)\s+/, "علبة"],
  [/^ثمرت(?:ين|ان|ا|ي)\s+/, "ثمرة"], [/^رأس(?:ين|ان|ي)\s+/, "رأس"],
  [/^شريحت(?:ين|ان|ا|ي)\s+/, "شريحة"], [/^قطعت(?:ين|ان|ا|ي)\s+/, "قطعة"],
  [/^ظرف(?:ين|ان|ي)\s+/, "ظرف"], [/^كيلوين\s+/, "كيلو"], [/^لترين\s+/, "لتر"],
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
  const map: [number, string][] = [
    [0.125, "⅛"], [0.25, "¼"], [1 / 3, "⅓"], [0.375, "⅜"],
    [0.5, "½"], [0.625, "⅝"], [2 / 3, "⅔"], [0.75, "¾"], [0.875, "⅞"],
  ];
  for (const [v, g] of map) if (Math.abs(frac - v) < 0.03) return (intPart ? intPart + " " : "") + g;
  return String(r);
}

function normalizeDualTail(tail: string): string {
  return tail
    .replace(/^(كبير|صغير|متوسط)(?:تين|تان)(?=\s|$)/u, "$1ة")
    .replace(/^(كبير|صغير|متوسط)(?:ين|ان)(?=\s|$)/u, "$1");
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
    if (d) return `2 ${singular} ${normalizeDualTail(s.slice(d[0].length))}`.replace(/\s+/g, " ").trim();
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
  if (/^\d/.test(s) || /^[½¼¾⅓⅔⅛⅜⅝⅞]/.test(s)) return true;
  if (WORDS.some(([re]) => re.test(s))) return true;
  if (DUALS.some(([re]) => re.test(s))) return true;
  if (UNIT.test(s)) return true;
  return false;
}

export function scaleIngredient(text: string, factor: number): string {
  if (!factor || factor === 1) return text;
  const s = toLatin(text.trim());

  const m = s.match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*(\d+(?:\.\d+)?))?(?:\s*([½¼¾⅓⅔⅛⅜⅝⅞]))?/);
  if (m && m[1] && m[0].trim()) {
    const base = parseFloat(m[1]) + (m[3] ? UNICODE_FRAC[m[3]] || 0 : 0);
    let out = fmt(base * factor);
    if (m[2]) out += "-" + fmt(parseFloat(m[2]) * factor);
    return out + s.slice(m[0].length);
  }
  const mf = s.match(/^([½¼¾⅓⅔⅛⅜⅝⅞])\s*/);
  if (mf) return fmt((UNICODE_FRAC[mf[1]] || 0) * factor) + " " + s.slice(mf[0].length);
  for (const [re, singular] of DUALS) {
    const d = s.match(re);
    if (d) return fmt(2 * factor) + " " + singular + " " + normalizeDualTail(s.slice(d[0].length));
  }
  for (const [re, val] of WORDS) {
    const w = s.match(re);
    if (w) return fmt(val * factor) + " " + s.slice(w[0].length);
  }
  if (UNIT.test(s)) return fmt(1 * factor) + " " + s;
  return text;
}

const INLINE_WORD_QUANTITY =
  "(?:نصف|نص|ربع|ثلثا|ثلث|واحدة|واحد|اثنتين|اثنتان|اثنين|اثنان|ثلاثة|ثلاث|أربعة|أربع|اربعة|اربع|خمسة|خمس|ستة|ست|سبعة|سبع|ثمانية|ثماني|ثمان|تسعة|تسع|عشرة|عشر)";
const INLINE_NUMBER_QUANTITY =
  "(?:(?:[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)(?:\\s*[-–]\\s*[0-9٠-٩]+(?:[.٫][0-9٠-٩]+)?)?\\s*[½¼¾⅓⅔⅛⅜⅝⅞]?|[½¼¾⅓⅔⅛⅜⅝⅞])";
const INLINE_UNIT =
  "(?:أكواب|اكواب|كوب|كوباية|كوبايه|كأس|كاس|كاسة|كاسه|ملاعق|ملعقة|ملعقه|حبات|حبة|حبه|فصوص|فص|علب|علبة|علبه|ثمرات|ثمرة|ثمره|رأس|راس|شرائح|شريحة|شريحه|قطع|قطعة|قطعه|كيلوغرام|كيلوجرام|كيلو|كغ|غرام|جرام|غم|جم|غ|مليلتر|مل|لتر|رشة|رشه|حزمة|حزمه|ظرف|cups?|tbsp|tablespoons?|tsp|teaspoons?|grams?|kg|g|ml|lit(?:er|re)s?|oz|ounces?)(?:ًا|اً)?";
const INLINE_DUAL =
  "(?:كوب(?:ين|ان|ي)|ملعقت(?:ين|ان|ا|ي)|حبت(?:ين|ان|ا|ي)|فص(?:ين|ان|ي)|كأس(?:ين|ان|ي)|علبت(?:ين|ان|ا|ي)|ثمرت(?:ين|ان|ا|ي)|رأس(?:ين|ان|ي)|شريحت(?:ين|ان|ا|ي)|قطعت(?:ين|ان|ا|ي)|ظرف(?:ين|ان|ي)|كيلوين|لترين)";
const INLINE_DUAL_MODIFIER =
  "(?:(?:كبير|صغير|متوسط)(?:تين|تان|ين|ان))";
const INLINE_BARE_UNIT =
  "(?:كوب|كوباية|كأس|كاس|كاسة|ملعقة|حبة|فص|علبة|ثمرة|رأس|راس|شريحة|قطعة|كيلو|لتر|رشة|حزمة|ظرف)(?:ًا|اً)?";
const INLINE_POST_FRACTION = "(?:نصف|ربع|ثلث)";
const INLINE_CLITIC = "(?:[وف](?:[بلك])?|[بلك])?";
const INLINE_AMOUNT = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${INLINE_CLITIC})(((?:(?:${INLINE_NUMBER_QUANTITY}|${INLINE_WORD_QUANTITY})\\s*${INLINE_UNIT})|${INLINE_DUAL}(?:\\s+${INLINE_DUAL_MODIFIER})?|${INLINE_BARE_UNIT})(?:\\s+و${INLINE_POST_FRACTION})?)(?=$|[^\\p{L}\\p{N}])`,
  "giu"
);
const INLINE_ORDINAL_UNIT = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${INLINE_CLITIC})ال(كوب|ملعقة|ملعقه|علبة|علبه|حبة|حبه|قطعة|قطعه)\\s+(الثاني|الثانية)(?=$|[^\\p{L}\\p{N}])`,
  "giu"
);
const POST_FRACTION_VALUE: Record<string, number> = {
  نصف: 0.5,
  ربع: 0.25,
  ثلث: 1 / 3,
};

function quantityAndRest(text: string): { value: number; rest: string } | null {
  const s = toLatin(text.trim().replace(/(?:ًا|اً)$/u, ""));
  const numeric = s.match(/^(\d+(?:\.\d+)?)(?:\s*([½¼¾⅓⅔⅛⅜⅝⅞]))?\s*(.*)$/u);
  if (numeric) {
    return {
      value: parseFloat(numeric[1]) + (numeric[2] ? UNICODE_FRAC[numeric[2]] || 0 : 0),
      rest: numeric[3].trim(),
    };
  }
  const fraction = s.match(/^([½¼¾⅓⅔⅛⅜⅝⅞])\s*(.*)$/u);
  if (fraction) return { value: UNICODE_FRAC[fraction[1]] || 0, rest: fraction[2].trim() };

  const padded = `${s} `;
  for (const [re, singular] of DUALS) {
    const dual = padded.match(re);
    if (dual) {
      const tail = normalizeDualTail(padded.slice(dual[0].length).trim());
      return { value: 2, rest: [singular, tail].filter(Boolean).join(" ") };
    }
  }
  for (const [re, value] of WORDS) {
    const word = padded.match(re);
    if (word) return { value, rest: padded.slice(word[0].length).trim() };
  }
  if (UNIT.test(padded)) return { value: 1, rest: s };
  return null;
}

function scaleInlinePhrase(phrase: string, factor: number): string {
  const normalized = phrase.trim().replace(/(?:ًا|اً)(?=\s|$)/gu, "");
  const composite = normalized.match(/^(.*?)\s+و(نصف|ربع|ثلث)$/u);
  if (composite) {
    const parsed = quantityAndRest(composite[1]);
    if (parsed?.rest) {
      return `${fmt((parsed.value + POST_FRACTION_VALUE[composite[2]]) * factor)} ${parsed.rest}`;
    }
  }

  const marker = "__recipe_amount_end__";
  return scaleIngredient(`${normalized} ${marker}`, factor)
    .replace(new RegExp(`\\s*${marker}$`), "")
    .trim();
}

function renderClitic(clitic: string): string {
  return /[بلك]$/u.test(clitic) ? `${clitic}ـ ` : clitic;
}

/** Scale ingredient quantities wherever they appear in a preparation step.
 * Only phrases tied to cooking units are changed, so times, temperatures, and
 * numbered instructions remain untouched. */
export function scaleInstruction(text: string, factor: number): string {
  if (!factor || factor === 1 || !text) return text;
  // A ratio stated "per cup" is independent of the recipe's serving count.
  if (/(?:بنسبة|نسبة|بمعدل|معدل|لكل)\s/u.test(text)) return text;

  const scaled = text.replace(
    INLINE_AMOUNT,
    (match, prefix: string, clitic: string, phrase: string) => {
      const replacement = scaleInlinePhrase(phrase, factor);
      return `${prefix}${renderClitic(clitic)}${replacement || match.slice(prefix.length + clitic.length)}`;
    }
  );

  // Split additions such as "one cup, then the second cup" encode another
  // quantity of one even though the second occurrence is written as an ordinal.
  return scaled.replace(
    INLINE_ORDINAL_UNIT,
    (_match, prefix: string, clitic: string, unit: string) => {
      const feminine = /^(?:ملعقة|ملعقه|علبة|علبه|حبة|حبه|قطعة|قطعه)$/u.test(unit);
      return `${prefix}${renderClitic(clitic)}${fmt(factor)} ${unit} ${feminine ? "إضافية" : "إضافي"}`;
    }
  );
}

export const SCALE_OPTIONS: { label: string; value: number }[] = [
  { label: "½", value: 0.5 },
  { label: "1×", value: 1 },
  { label: "2×", value: 2 },
  { label: "3×", value: 3 },
];
