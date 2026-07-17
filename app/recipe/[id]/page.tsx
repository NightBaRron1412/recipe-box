import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";
import RecipeView from "./RecipeView";

export const revalidate = 0;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabasePublic()
    .from("recipes")
    .select("title,image_url,ingredients,time_minutes")
    .eq("id", id)
    .single();
  if (!data) return { title: "وصفة — كتاب وصفات أمير" };
  const desc = [
    data.time_minutes ? `⏱ ${data.time_minutes} دقيقة` : null,
    `${(data.ingredients || []).length} مكوّن`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    title: `${data.title} — كتاب وصفات أمير`,
    description: desc,
    openGraph: {
      title: data.title || "وصفة",
      description: desc,
      images: data.image_url ? [data.image_url] : [],
    },
  };
}

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabasePublic();
  const { data } = await sb.from("recipes").select("*").eq("id", id).single();
  if (!data) notFound();
  const recipe = data as Recipe;

  let related: Recipe[] = [];
  if (recipe.tags?.length) {
    const { data: rel } = await sb
      .from("recipes")
      .select("id,title,image_url")
      .overlaps("tags", recipe.tags)
      .neq("id", id)
      .limit(6);
    related = (rel as Recipe[]) || [];
  }

  return <RecipeView recipe={recipe} related={related} />;
}
