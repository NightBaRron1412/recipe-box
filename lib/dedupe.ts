import { arabicNormalize } from "./arabic";

export interface RecipeIdentity {
  source_url?: string | null;
  title?: string | null;
  ingredients?: string[] | null;
  steps?: string[] | null;
}

const GENERIC_TITLES = new Set([
  "وصفه",
  "وصفه بدون عنوان",
  "وصفه من صوره",
  "وصفه من فيديو",
]);

const QUANTITY_TOKENS = new Set([
  "نصف", "نص", "ربع", "ثلث", "واحد", "واحده", "اثنان", "اثنين", "اثنتان", "اثنتين",
  "ثلاث", "ثلاثه", "اربع", "اربعه", "خمس", "خمسه", "ست", "سته", "سبع", "سبعه",
  "ثمان", "ثماني", "ثمانيه", "تسع", "تسعه", "عشر", "عشره",
]);

const UNIT_TOKENS = new Set([
  "كوب", "اكواب", "كوبايه", "كاس", "كاسه", "ملعقه", "ملاعق", "صغيره", "كبيره",
  "حبه", "حبات", "فص", "فصوص", "علبه", "علب", "ثمره", "ثمرات", "راس", "شريحه",
  "شرائح", "قطعه", "قطع", "كيلو", "كيلوغرام", "كيلوجرام", "غرام", "جرام", "غم",
  "لتر", "مل", "مليلتر", "رشه", "حزمه", "ظرف", "ملعقتين", "كوبين", "حبتين",
  "cup", "cups", "tbsp", "tablespoon", "tablespoons", "tsp", "teaspoon", "teaspoons",
  "gram", "grams", "kg", "ml", "liter", "liters", "litre", "litres", "oz", "ounce", "ounces",
]);

function textKey(value?: string | null): string {
  return arabicNormalize((value || "").normalize("NFKC"))
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function ingredientKey(value: string): string {
  return textKey(value)
    .split(" ")
    .filter((token) => token && !/^\d+$/.test(token) && !QUANTITY_TOKENS.has(token) && !UNIT_TOKENS.has(token))
    .join(" ");
}

function lineSet(lines?: string[] | null, ingredient = false): Set<string> {
  return new Set(
    (lines || [])
      .map((line) => (ingredient ? ingredientKey(line) : textKey(line)))
      .filter((line) => line.length >= 2)
  );
}

function sufficientlySimilar(a: Set<string>, b: Set<string>): boolean {
  const smaller = Math.min(a.size, b.size);
  if (smaller < 2) return false;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection++;
  const coverage = intersection / smaller;
  const union = a.size + b.size - intersection;
  return coverage >= 0.75 && intersection / union >= 0.5;
}

/**
 * Convert common social/share URL variants to one stable identity. The returned
 * URL is safe to store and strips tracking parameters that otherwise bypass
 * duplicate checks.
 */
export function canonicalizeRecipeUrl(input: string): string {
  try {
    const url = new URL(input.trim());
    const host = url.hostname.toLowerCase().replace(/^(?:www\.|m\.)/, "");
    const path = url.pathname.replace(/\/{2,}/g, "/");

    const instagram = host === "instagram.com" && path.match(/^\/(reel|reels|p|tv)\/([^/]+)/i);
    if (instagram) {
      const kind = instagram[1].toLowerCase() === "reels" ? "reel" : instagram[1].toLowerCase();
      return `https://instagram.com/${kind}/${instagram[2]}/`;
    }

    if (host === "youtu.be") {
      const id = path.split("/").filter(Boolean)[0];
      if (id) return `https://youtube.com/watch?v=${encodeURIComponent(id)}`;
    }
    if (host.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") || path.match(/^\/(?:shorts|embed)\/([^/]+)/i)?.[1];
      if (id) return `https://youtube.com/watch?v=${encodeURIComponent(id)}`;
    }

    const tiktok = host.endsWith("tiktok.com") && path.match(/\/video\/(\d+)/i);
    if (tiktok) return `https://tiktok.com/video/${tiktok[1]}`;

    url.protocol = url.protocol.toLowerCase();
    url.hostname = host;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_|fbclid$|gclid$|igsh$|igshid$|si$|share_|feature$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    url.pathname = path !== "/" ? path.replace(/\/$/, "") : path;
    return url.toString();
  } catch {
    return input.trim();
  }
}

/** Conservative content check: the normalized title and most ingredient lines
 * must agree. This rejects true reposts without blocking distinct recipes that
 * happen to share a generic title such as "cake" or "soup". */
export function isDuplicateRecipe(a: RecipeIdentity, b: RecipeIdentity): boolean {
  if (a.source_url && b.source_url && /^https?:/i.test(a.source_url) && /^https?:/i.test(b.source_url)) {
    if (canonicalizeRecipeUrl(a.source_url) === canonicalizeRecipeUrl(b.source_url)) return true;
  }

  const aTitle = textKey(a.title);
  const bTitle = textKey(b.title);
  if (!aTitle || aTitle !== bTitle || GENERIC_TITLES.has(aTitle)) return false;

  const aIngredients = lineSet(a.ingredients, true);
  const bIngredients = lineSet(b.ingredients, true);
  if (sufficientlySimilar(aIngredients, bIngredients)) return true;

  // Recipes extracted from spoken videos occasionally omit ingredients but
  // reproduce the same preparation steps nearly verbatim.
  return sufficientlySimilar(lineSet(a.steps), lineSet(b.steps));
}
