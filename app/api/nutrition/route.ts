import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { estimateNutrition } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Backfill: estimate nutrition for recipes that don't have it yet.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-key") !== process.env.EDIT_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const force = (await req.json().catch(() => null))?.force === true;
  const sb = supabaseAdmin();
  let q = sb
    .from("recipes")
    .select("id, title, ingredients, servings, status")
    .eq("status", "ok")
    .limit(12);
  if (!force) q = q.is("nutrition", null);
  const { data } = await q;

  let updated = 0;
  for (const r of data || []) {
    if (!(r.ingredients || []).length) continue;
    const n = await estimateNutrition(r.title || "", r.ingredients, r.servings);
    if (n) {
      await sb.from("recipes").update({ nutrition: n }).eq("id", r.id);
      updated++;
    }
    await sleep(1500); // stay under the rate limit
  }
  return NextResponse.json({ ok: true, scanned: data?.length || 0, updated });
}
