import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { consolidateTags } from "@/lib/gemini";

export const runtime = "nodejs";
export const maxDuration = 60;

// One-off backfill: consolidate all existing tags into a canonical set.
export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-key") !== process.env.EDIT_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb.from("recipes").select("id, tags");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const distinct = [
    ...new Set((data || []).flatMap((r) => (r.tags as string[]) || [])),
  ];
  const map = await consolidateTags(distinct);
  if (!Object.keys(map).length) {
    return NextResponse.json({ error: "no mapping produced" }, { status: 500 });
  }

  let changed = 0;
  for (const r of data || []) {
    const orig: string[] = r.tags || [];
    const next = [...new Set(orig.map((t) => map[t] || t))];
    if (JSON.stringify(next) !== JSON.stringify(orig)) {
      await sb.from("recipes").update({ tags: next }).eq("id", r.id);
      changed++;
    }
  }
  const after = new Set(
    (data || []).flatMap((r) => ((r.tags as string[]) || []).map((t) => map[t] || t))
  );
  return NextResponse.json({
    ok: true,
    tagsBefore: distinct.length,
    tagsAfter: after.size,
    recipesChanged: changed,
  });
}
