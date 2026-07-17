import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { normalizeQuantity } from "@/lib/scale";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-off backfill: normalize ingredient quantities on all existing recipes.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-key") !== process.env.EDIT_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("recipes").select("id, ingredients");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let changed = 0;
  for (const r of data || []) {
    const orig: string[] = r.ingredients || [];
    const next = orig.map(normalizeQuantity);
    if (JSON.stringify(next) !== JSON.stringify(orig)) {
      await sb.from("recipes").update({ ingredients: next }).eq("id", r.id);
      changed++;
    }
  }
  return NextResponse.json({ ok: true, total: data?.length || 0, changed });
}
