import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicNormalize } from "../lib/arabic";
import { canScale, normalizeQuantity, scaleIngredient, scaleInstruction } from "../lib/scale";
import { canonicalizeRecipeUrl, isDuplicateRecipe } from "../lib/dedupe";

test("Arabic search normalization removes marks and unifies variants", () => {
  assert.equal(arabicNormalize("  إِلى الحَلْوَىـ  "), "الي الحلوي");
  assert.equal(arabicNormalize("كُبَّة"), arabicNormalize("كبه"));
});

test("quantity normalization handles Arabic digits, words, and dual nouns", () => {
  assert.equal(normalizeQuantity("٣ أكواب دقيق"), "3 أكواب دقيق");
  assert.equal(normalizeQuantity("نصف كوب حليب"), "½ كوب حليب");
  assert.equal(normalizeQuantity("كوبين حليب"), "2 كوب حليب");
});

test("ingredient scaling preserves text while scaling supported quantities", () => {
  assert.equal(scaleIngredient("1 ½ كوب دقيق", 2), "3 كوب دقيق");
  assert.equal(scaleIngredient("كوب سكر", 2), "2 كوب سكر");
  assert.equal(scaleIngredient("ملح حسب الرغبة", 2), "ملح حسب الرغبة");
  assert.equal(canScale("ملعقتين زيت"), true);
});

test("instruction scaling changes ingredient amounts but not time or temperature", () => {
  assert.equal(
    scaleInstruction("أضف 2 كوب دقيق وملعقة زيت ثم اخبز لمدة 20 دقيقة على 180 درجة", 0.5),
    "أضف 1 كوب دقيق و½ ملعقة زيت ثم اخبز لمدة 20 دقيقة على 180 درجة"
  );
  assert.equal(scaleInstruction("اخلط ٢٠٠غ دقيق مع نصف كوب حليب", 2), "اخلط 400غ دقيق مع 1 كوب حليب");
});

test("recipe URL canonicalization removes share tracking and unifies variants", () => {
  assert.equal(
    canonicalizeRecipeUrl("https://www.instagram.com/reels/ABC123/?igsh=tracking&utm_source=copy"),
    "https://instagram.com/reel/ABC123/"
  );
  assert.equal(
    canonicalizeRecipeUrl("https://youtu.be/xyz987?si=tracking"),
    canonicalizeRecipeUrl("https://www.youtube.com/watch?v=xyz987&utm_source=share")
  );
});

test("duplicate detection requires matching recipe content, not title alone", () => {
  const original = {
    title: "كيكة الشوكولاتة",
    ingredients: ["2 كوب دقيق", "1 كوب سكر", "½ كوب كاكاو", "3 بيضات"],
    steps: ["اخلط المكونات", "اخبز الكيكة"],
  };
  assert.equal(
    isDuplicateRecipe(original, {
      title: "كِيكَة الشوكولاتة",
      ingredients: ["كوبان دقيق", "2 كوب سكر", "1 كوب كاكاو", "6 بيضات"],
      steps: [],
    }),
    true
  );
  assert.equal(
    isDuplicateRecipe(original, {
      title: "كيكة الشوكولاتة",
      ingredients: ["تمر", "شوفان", "عسل"],
      steps: [],
    }),
    false
  );
});
