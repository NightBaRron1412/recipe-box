// Normalize Arabic text for forgiving search: strip tashkeel/tatweel and unify
// alef, hamza, ta-marbuta, and alef-maqsura variants so "حلوى" matches "حلويات".
export function arabicNormalize(s: string): string {
  return (s || "")
    .replace(/[ً-ٰٟ]/g, "") // tashkeel + superscript alef
    .replace(/ـ/g, "") // tatweel
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/گ/g, "ك")
    .toLowerCase()
    .trim();
}
