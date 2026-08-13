import { arabicNormalize } from "./arabic";

export interface RecipeIdentity {
  source_url?: string | null;
  author?: string | null;
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

/** Chef names are often stored in both Arabic and English, sometimes in the
 * opposite order. Sorting normalized words keeps those forms equivalent. */
function chefKey(value?: string | null): string {
  return textKey(value)
    .split(" ")
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ar"))
    .join(" ");
}

function sameChef(a?: string | null, b?: string | null): boolean {
  const aKey = chefKey(a);
  const bKey = chefKey(b);
  return Boolean(aKey && bKey && aKey === bKey);
}

const TITLE_STOPWORDS = new Set(["في", "من", "مع", "على", "الي", "و"]);

function titleTokenSet(value?: string | null): Set<string> {
  return new Set(
    textKey(value)
      .split(" ")
      .map((token) => /^(?:بال|وال).{3,}$/u.test(token) ? token.slice(1) : token)
      .filter((token) => token && !TITLE_STOPWORDS.has(token))
  );
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

function ingredientTokenSet(lines?: string[] | null): Set<string> {
  const tokens = new Set<string>();
  for (const line of lines || []) {
    for (const token of ingredientKey(line).split(" ")) {
      if (token && token.length >= 2 && !TITLE_STOPWORDS.has(token)) tokens.add(token);
    }
  }
  return tokens;
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

function sufficientlySimilarIngredients(a?: string[] | null, b?: string[] | null): boolean {
  if (sufficientlySimilar(lineSet(a, true), lineSet(b, true))) return true;
  const aTokens = ingredientTokenSet(a);
  const bTokens = ingredientTokenSet(b);
  const smaller = Math.min(aTokens.size, bTokens.size);
  if (smaller < 5) return false;
  let intersection = 0;
  for (const token of aTokens) if (bTokens.has(token)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return intersection / smaller >= 0.8 && intersection / union >= 0.55;
}

function similarTitles(a?: string | null, b?: string | null): boolean {
  const aTokens = titleTokenSet(a);
  const bTokens = titleTokenSet(b);
  const smaller = Math.min(aTokens.size, bTokens.size);
  if (smaller < 2) return false;
  let intersection = 0;
  for (const token of aTokens) if (bTokens.has(token)) intersection++;
  const union = aTokens.size + bTokens.size - intersection;
  return intersection / smaller >= 0.75 && intersection / union >= 0.6;
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

/** Exact canonical sources are duplicates. Across different sources, a match
 * is only allowed for the same known chef. An exact distinctive title is
 * enough; reordered/near-identical titles must also have matching content. */
export function isDuplicateRecipe(a: RecipeIdentity, b: RecipeIdentity): boolean {
  if (a.source_url && b.source_url && /^https?:/i.test(a.source_url) && /^https?:/i.test(b.source_url)) {
    if (canonicalizeRecipeUrl(a.source_url) === canonicalizeRecipeUrl(b.source_url)) return true;
  }

  if (!sameChef(a.author, b.author)) return false;

  const aTitle = textKey(a.title);
  const bTitle = textKey(b.title);
  if (!aTitle || !bTitle || GENERIC_TITLES.has(aTitle) || GENERIC_TITLES.has(bTitle)) return false;
  if (aTitle === bTitle) return true;
  if (!similarTitles(a.title, b.title)) return false;

  if (sufficientlySimilarIngredients(a.ingredients, b.ingredients)) return true;

  // Recipes extracted from spoken videos occasionally omit ingredients but
  // reproduce the same preparation steps nearly verbatim.
  return sufficientlySimilar(lineSet(a.steps), lineSet(b.steps));
}
