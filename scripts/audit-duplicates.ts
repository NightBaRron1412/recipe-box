import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import { isDuplicateRecipe, type RecipeIdentity } from "../lib/dedupe";

loadEnvConfig(process.cwd());

type StoredRecipe = RecipeIdentity & {
  id: string;
  created_at: string;
  status: string;
};

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server credentials");

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await sb
    .from("recipes")
    .select("id,created_at,status,source_url,author,title,ingredients,steps")
    .eq("status", "ok")
    .limit(1000);
  if (error) throw error;

  const recipes = (data || []) as StoredRecipe[];
  const duplicatePairs: Array<{ first: StoredRecipe; second: StoredRecipe }> = [];
  for (let i = 0; i < recipes.length; i++) {
    for (let j = i + 1; j < recipes.length; j++) {
      if (isDuplicateRecipe(recipes[i], recipes[j])) {
        duplicatePairs.push({ first: recipes[i], second: recipes[j] });
      }
    }
  }

  console.log(`Checked ${recipes.length} complete recipes.`);
  if (!duplicatePairs.length) {
    console.log("No duplicates found.");
    return;
  }

  console.log(`Found ${duplicatePairs.length} duplicate pair(s):`);
  for (const { first, second } of duplicatePairs) {
    console.log(JSON.stringify({
      first: {
        id: first.id,
        title: first.title,
        author: first.author,
        created_at: first.created_at,
        ingredients: first.ingredients?.length || 0,
        steps: first.steps?.length || 0,
      },
      second: {
        id: second.id,
        title: second.title,
        author: second.author,
        created_at: second.created_at,
        ingredients: second.ingredients?.length || 0,
        steps: second.steps?.length || 0,
      },
    }));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
