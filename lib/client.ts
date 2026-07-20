"use client";

// Personal edit key stored in the browser. Unlocks edit/delete; sent as a
// header to the write API routes which verify it against EDIT_KEY on the server.
const KEY = "recipebox_edit_key";

export function getEditKey(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(KEY) || "";
}

export function setEditKey(v: string) {
  if (typeof window === "undefined") return;
  if (v) window.localStorage.setItem(KEY, v);
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event("editkey-changed"));
}

export function hasEditKey(): boolean {
  return getEditKey().length > 0;
}

// ---------- Shopping list (localStorage) ----------
export interface ShopItem {
  text: string;
  from: string; // recipe title
  recipeId: string;
  checked: boolean;
}

const SHOP = "recipebox_shopping";

export function getShopping(): ShopItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(SHOP) || "[]");
  } catch {
    return [];
  }
}

function saveShopping(items: ShopItem[]) {
  window.localStorage.setItem(SHOP, JSON.stringify(items));
  window.dispatchEvent(new Event("shopping-changed"));
}

export function addToShopping(
  recipeId: string,
  title: string,
  ingredients: string[]
): number {
  const items = getShopping();
  const existing = new Set(
    items.filter((i) => i.recipeId === recipeId).map((i) => i.text)
  );
  let added = 0;
  for (const ing of ingredients) {
    if (existing.has(ing)) continue;
    items.push({ text: ing, from: title, recipeId, checked: false });
    added++;
  }
  saveShopping(items);
  return added;
}

export function setShopping(items: ShopItem[]) {
  saveShopping(items);
}

export function shoppingCount(): number {
  return getShopping().length;
}

/** Cook-mode: which ingredient indices are checked, persisted per recipe. */
export function getChecked(id: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(`checked:${id}`) || "[]");
  } catch {
    return [];
  }
}

export function setChecked(id: string, idxs: number[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`checked:${id}`, JSON.stringify(idxs));
}
