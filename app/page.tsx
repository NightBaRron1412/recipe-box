import { supabasePublic } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";
import GalleryClient from "./GalleryClient";

export const revalidate = 0; // always fresh — new recipes show immediately

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tag?: string; collection?: string }>;
}) {
  const { q = "", tag = "", collection = "" } = await searchParams;

  const sb = supabasePublic();
  const { data } = await sb
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <GalleryClient
      recipes={(data as Recipe[]) || []}
      initialQuery={q}
      initialTag={tag}
      initialCollection={collection}
    />
  );
}
