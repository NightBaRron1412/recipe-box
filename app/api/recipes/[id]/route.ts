import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const key = process.env.EDIT_KEY;
  if (!key) return false; // editing disabled unless a key is configured
  return req.headers.get("x-edit-key") === key;
}

const EDITABLE = new Set([
  "title",
  "author",
  "servings",
  "time_minutes",
  "ingredients",
  "steps",
  "tags",
  "status",
  "image_url",
  "favorite",
  "collections",
]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE.has(k)) continue;
    if (k === "time_minutes") {
      const n = Number(v);
      update[k] = Number.isFinite(n) && n > 0 ? Math.round(n) : null;
    } else if (k === "favorite") {
      update[k] = Boolean(v);
    } else if (
      k === "ingredients" ||
      k === "steps" ||
      k === "tags" ||
      k === "collections"
    ) {
      update[k] = Array.isArray(v)
        ? v.map((x) => String(x).trim()).filter(Boolean)
        : [];
    } else {
      update[k] = v === "" ? null : v;
    }
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "nothing to update" }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("recipes")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) {
    console.error("update failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, recipe: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const sb = supabaseAdmin();

  // Remove the stored cover image (best effort) before deleting the row.
  const { data: row } = await sb
    .from("recipes")
    .select("image_url")
    .eq("id", id)
    .single();
  const marker = "/recipe-images/";
  if (row?.image_url?.includes(marker)) {
    const path = row.image_url.split(marker)[1];
    if (path) await sb.storage.from("recipe-images").remove([path]);
  }

  const { error } = await sb.from("recipes").delete().eq("id", id);
  if (error) {
    console.error("delete failed", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
