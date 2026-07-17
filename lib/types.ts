export type RecipeStatus = "ok" | "needs_review" | "fetch_failed";

export interface Recipe {
  id: string;
  created_at: string;
  source_url: string;
  platform: string | null;
  author: string | null;
  title: string | null;
  caption: string | null;
  image_url: string | null;
  ingredients: string[];
  steps: string[];
  tags: string[];
  servings: string | null;
  time_minutes: number | null;
  status: RecipeStatus;
  lang: string | null;
  favorite: boolean;
  collections: string[];
}

export interface ExtractedRecipe {
  is_recipe: boolean;
  title: string;
  ingredients: string[];
  steps: string[];
  tags: string[];
  servings: string | null;
  time_minutes: number | null;
}

export interface PageMeta {
  image?: string;
  caption?: string;
  title?: string;
  author?: string;
}
