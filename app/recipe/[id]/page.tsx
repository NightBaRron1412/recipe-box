import Link from "next/link";
import { notFound } from "next/navigation";
import { supabasePublic } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";

export const revalidate = 0;

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "انستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  other: "المصدر",
};

export default async function RecipePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const sb = supabasePublic();
  const { data } = await sb.from("recipes").select("*").eq("id", id).single();
  const r = data as Recipe | null;
  if (!r) notFound();

  const ingredients = r.ingredients || [];
  const steps = r.steps || [];
  const platformLabel = PLATFORM_LABEL[r.platform || "other"] || "المصدر";

  return (
    <div className="container">
      <Link href="/" className="back">
        ← رجوع لكل الوصفات
      </Link>

      {r.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={r.image_url} alt={r.title || "وصفة"} className="recipe-hero" />
      ) : null}

      <h1 className="recipe-title">{r.title || "وصفة بدون عنوان"}</h1>
      <div className="recipe-sub">
        {r.author && <span>👤 {r.author}</span>}
        {r.servings && <span>🍽️ {r.servings}</span>}
        {r.time_minutes ? <span>⏱ {r.time_minutes} دقيقة</span> : null}
        {(r.tags || []).map((t) => (
          <span className="chip" key={t}>
            {t}
          </span>
        ))}
      </div>

      {r.status !== "ok" && (
        <div className="note">
          {r.status === "needs_review"
            ? "⚠️ لم نتمكن من قراءة الوصفة بالكامل من المنشور — قد تكون التفاصيل في الفيديو. يمكنك مشاهدة المصدر الأصلي بالأسفل."
            : "⚠️ تعذّر جلب محتوى المنشور (قد يكون خاصًا). الرابط الأصلي محفوظ بالأسفل."}
        </div>
      )}

      {ingredients.length > 0 && (
        <div className="section">
          <h2>🧂 المكونات</h2>
          <ul className="ingredients">
            {ingredients.map((ing, i) => (
              <li key={i}>{ing}</li>
            ))}
          </ul>
        </div>
      )}

      {steps.length > 0 && (
        <div className="section">
          <h2>👩‍🍳 طريقة التحضير</h2>
          <ol className="steps">
            {steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {ingredients.length === 0 && steps.length === 0 && r.caption && (
        <div className="section">
          <h2>📝 النص الأصلي</h2>
          <div className="caption-raw">{r.caption}</div>
        </div>
      )}

      <a
        className="orig-link"
        href={r.source_url}
        target="_blank"
        rel="noopener noreferrer"
      >
        ▶️ شاهد على {platformLabel}
      </a>
    </div>
  );
}
