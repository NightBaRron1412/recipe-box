import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sectionizeIngredients } from "@/lib/gemini";
import { normalizeQuantity } from "@/lib/scale";

export const runtime = "nodejs";
export const maxDuration = 30;

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
  "notes",
  "rating",
  "cooked",
]);

// Returns private fields (notes) — only for the owner (edit key).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const { data, error } = await supabaseAdmin()
    .from("recipes")
    .select("notes")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 404 });
  return NextResponse.json({ notes: data?.notes ?? null });
}

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
    } else if (k === "favorite" || k === "cooked") {
      update[k] = Boolean(v);
    } else if (k === "rating") {
      const n = Number(v);
      update[k] = Number.isFinite(n) && n >= 0 && n <= 5 ? Math.round(n) : null;
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

  // Editing the ingredients: normalize quantities and RE-SLICE into sections so
  // the recipe keeps its grouping with the new values (multi-part recipes).
  if ("ingredients" in update) {
    const ings = (update.ingredients as string[]).map(normalizeQuantity);
    let title = typeof update.title === "string" ? update.title : "";
    if (!title) {
      const { data: cur } = await sb.from("recipes").select("title").eq("id", id).single();
      title = cur?.title || "";
    }
    const secs = (await sectionizeIngredients(title, ings))
      .map((s) => ({ title: s.title, items: s.items.map(normalizeQuantity) }))
      .filter((s) => s.title && s.items.length);
    if (secs.length >= 2 && secs.flatMap((s) => s.items).length >= ings.length) {
      update.ingredient_sections = secs;
      update.ingredients = secs.flatMap((s) => s.items);
    } else {
      update.ingredient_sections = null;
      update.ingredients = ings;
    }
  }
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
