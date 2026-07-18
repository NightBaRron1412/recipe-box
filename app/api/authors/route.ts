import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { resolveVideoUrl } from "@/lib/pipeline";

export const runtime = "nodejs";
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const GENERIC = new Set(["facebook", "instagram", "youtube", "tiktok", "فيسبوك", "انستغرام"]);

// Backfill: set the chef/author from the real uploader (channel / IG / TikTok account).
export async function POST(req: NextRequest) {
  if (req.headers.get("x-edit-key") !== process.env.EDIT_KEY) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = supabaseAdmin();
  const { data } = await sb
    .from("recipes")
    .select("id, source_url, author")
    .ilike("source_url", "http%")
    .limit(40);

  const todo = (data || [])
    .filter((r) => !r.author || GENERIC.has(String(r.author).trim().toLowerCase()))
    .slice(0, 12);

  let updated = 0;
  for (const r of todo) {
    const resolved = await resolveVideoUrl(r.source_url).catch(() => null);
    const uploader = resolved?.uploader?.trim();
    if (uploader && uploader.toLowerCase() !== String(r.author || "").toLowerCase()) {
      await sb.from("recipes").update({ author: uploader }).eq("id", r.id);
      updated++;
    }
    await sleep(700);
  }
  return NextResponse.json({ ok: true, scanned: todo.length, updated });
}
