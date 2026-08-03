import { test } from "node:test";
import assert from "node:assert/strict";
import { arabicNormalize } from "../lib/arabic";
import { canScale, normalizeQuantity, scaleIngredient } from "../lib/scale";

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
