import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";
import RecipeView from "./RecipeView";

export const revalidate = 0;

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sb = supabasePublic();
  const { data } = await sb.from("recipes").select("*").eq("id", id).single();
  if (!data) notFound();
  return <RecipeView recipe={data as Recipe} />;
}
