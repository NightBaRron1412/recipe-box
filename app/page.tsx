import Link from "next/link";
import { supabasePublic } from "@/lib/supabase";
import type { Recipe } from "@/lib/types";

export const revalidate = 0; // always fresh — new recipes show immediately

function matches(r: Recipe, q: string): boolean {
  if (!q) return true;
  const hay = [r.title, r.caption, ...(r.tags || [])]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q.toLowerCase());
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();

  const sb = supabasePublic();
  const { data } = await sb
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(300);

  const all = (data as Recipe[]) || [];
  const recipes = all.filter((r) => matches(r, query));

  return (
    <div className="container">
      <header className="site-header">
        <div className="brand">
          <span className="logo">🍽️</span>
          <div>
            <h1>كتاب الوصفات</h1>
            <span className="count">{all.length} وصفة محفوظة</span>
          </div>
        </div>
        <form className="search" action="/" method="get">
          <input
            type="text"
            name="q"
            placeholder="ابحث عن وصفة أو وسم..."
            defaultValue={query}
          />
          <button type="submit">بحث</button>
        </form>
      </header>

      {recipes.length === 0 ? (
        <div className="empty">
          <div className="big">🥘</div>
          {query ? (
            <p>لا توجد نتائج للبحث «{query}».</p>
          ) : (
            <p>
              لا توجد وصفات بعد. أرسل رابط وصفة إلى بوت تيليجرام وستظهر هنا
              تلقائيًا.
            </p>
          )}
        </div>
      ) : (
        <div className="grid">
          {recipes.map((r) => (
            <Link href={`/recipe/${r.id}`} key={r.id} className="card">
              {r.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.image_url}
                  alt={r.title || "وصفة"}
                  className="card-thumb"
                  loading="lazy"
                />
              ) : (
                <div className="card-thumb placeholder">🍲</div>
              )}
              <div className="card-body">
                <h3 className="card-title">{r.title || "وصفة بدون عنوان"}</h3>
                <div className="card-meta">
                  {r.status === "needs_review" && (
                    <span className="badge-review">بحاجة لمراجعة</span>
                  )}
                  {r.time_minutes ? (
                    <span className="chip time">⏱ {r.time_minutes} د</span>
                  ) : null}
                  {(r.tags || []).slice(0, 2).map((t) => (
                    <span className="chip" key={t}>
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
