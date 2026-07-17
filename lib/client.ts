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
}

export function hasEditKey(): boolean {
  return getEditKey().length > 0;
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
