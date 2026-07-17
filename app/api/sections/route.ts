import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sectionizeIngredients } from "@/lib/gemini";
import { normalizeQuantity } from "@/lib/scale";

export const runtime = "nodejs";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Backfill: group existing recipes' flat ingredients into sections (multi-part only).
export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-key") !== process.env.EDIT_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("recipes")
    .select("id, title, ingredients, ingredient_sections, status")
    .is("ingredient_sections", null)
    .eq("status", "ok")
    .limit(10);

  let scanned = 0;
  let updated = 0;
  for (const r of data || []) {
    const ingredients: string[] = r.ingredients || [];
    if (ingredients.length < 4) continue;
    scanned++;
    const secs = await sectionizeIngredients(r.title || "", ingredients);
    const clean = secs
      .map((s) => ({ title: s.title, items: s.items.map(normalizeQuantity) }))
      .filter((s) => s.title && s.items.length);
    if (clean.length >= 2) {
      const flat = clean.flatMap((s) => s.items);
      // only accept if no ingredients were dropped
      if (flat.length >= ingredients.length) {
        await sb.from("recipes").update({ ingredient_sections: clean, ingredients: flat }).eq("id", r.id);
        updated++;
      }
    }
    await sleep(1500);
  }
  return NextResponse.json({ ok: true, scanned, updated });
}
