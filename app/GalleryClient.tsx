"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Recipe } from "@/lib/types";
import { UnlockButton } from "./Unlock";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "انستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  video: "فيديو",
  other: "أخرى",
};
const PLATFORM_ICON: Record<string, string> = {
  instagram: "📸",
  facebook: "📘",
  tiktok: "🎵",
  youtube: "▶️",
  video: "🎬",
  other: "🔗",
};

type Sort = "newest" | "oldest" | "fastest" | "az";

export default function GalleryClient({
  recipes,
  initialQuery = "",
  initialTag = "",
}: {
  recipes: Recipe[];
  initialQuery?: string;
  initialTag?: string;
}) {
  const [q, setQ] = useState(initialQuery);
  const [tags, setTags] = useState<string[]>(initialTag ? [initialTag] : []);
  const [platform, setPlatform] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [showAllTags, setShowAllTags] = useState(false);

  const allTags = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of recipes)
      for (const t of r.tags || []) count.set(t, (count.get(t) || 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
  }, [recipes]);

  const platforms = useMemo(
    () => [...new Set(recipes.map((r) => r.platform).filter(Boolean))] as string[],
    [recipes]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    let list = recipes.filter((r) => {
      if (platform && r.platform !== platform) return false;
      if (status && r.status !== status) return false;
      if (tags.length && !tags.every((t) => (r.tags || []).includes(t))) return false;
      if (needle) {
        const hay = [
          r.title,
          r.caption,
          r.author,
          ...(r.tags || []),
          ...(r.ingredients || []),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });

    list = [...list].sort((a, b) => {
      if (sort === "oldest")
        return a.created_at.localeCompare(b.created_at);
      if (sort === "az")
        return (a.title || "").localeCompare(b.title || "", "ar");
      if (sort === "fastest") {
        const av = a.time_minutes ?? Infinity;
        const bv = b.time_minutes ?? Infinity;
        return av - bv;
      }
      return b.created_at.localeCompare(a.created_at); // newest
    });
    return list;
  }, [recipes, q, tags, platform, status, sort]);

  const toggleTag = (t: string) =>
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));

  const activeFilters =
    tags.length + (platform ? 1 : 0) + (status ? 1 : 0) + (q.trim() ? 1 : 0);
  const clearAll = () => {
    setQ("");
    setTags([]);
    setPlatform("");
    setStatus("");
  };

  const reviewCount = recipes.filter((r) => r.status === "needs_review").length;
  const visibleTags = showAllTags ? allTags : allTags.slice(0, 12);

  return (
    <div className="container">
      <header className="site-header">
        <div className="brand">
          <span className="logo">🍽️</span>
          <div>
            <h1>كتاب الوصفات</h1>
            <span className="count">{recipes.length} وصفة</span>
          </div>
        </div>
        <UnlockButton />
      </header>

      <div className="toolbar">
        <div className="search">
          <span className="search-icon">🔍</span>
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="ابحث بالاسم، الوسم، أو المكوّن..."
            autoComplete="off"
          />
          {q && (
            <button className="search-clear" onClick={() => setQ("")} aria-label="مسح">
              ✕
            </button>
          )}
        </div>

        <div className="filters-row">
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
            <option value="fastest">الأسرع تحضيرًا</option>
            <option value="az">أبجدي</option>
          </select>

          {platforms.length > 1 && (
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              <option value="">كل المصادر</option>
              {platforms.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_ICON[p] || "🔗"} {PLATFORM_LABEL[p] || p}
                </option>
              ))}
            </select>
          )}

          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">كل الحالات</option>
            <option value="ok">مكتملة</option>
            <option value="needs_review">
              بحاجة لمراجعة{reviewCount ? ` (${reviewCount})` : ""}
            </option>
          </select>

          {activeFilters > 0 && (
            <button className="clear-btn" onClick={clearAll}>
              مسح الفلاتر ({activeFilters}) ✕
            </button>
          )}
        </div>

        {allTags.length > 0 && (
          <div className="tag-cloud">
            {visibleTags.map((t) => (
              <button
                key={t}
                className={`tag-pill ${tags.includes(t) ? "active" : ""}`}
                onClick={() => toggleTag(t)}
              >
                {t}
              </button>
            ))}
            {allTags.length > 12 && (
              <button
                className="tag-pill more"
                onClick={() => setShowAllTags((s) => !s)}
              >
                {showAllTags ? "أقل −" : `المزيد +${allTags.length - 12}`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="results-meta">
        {filtered.length} من {recipes.length} وصفة
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="big">🥘</div>
          {recipes.length === 0 ? (
            <p>لا توجد وصفات بعد. أرسل رابط وصفة إلى بوت تيليجرام لتظهر هنا.</p>
          ) : (
            <p>
              لا نتائج مطابقة.{" "}
              <button className="link-btn" onClick={clearAll}>
                مسح الفلاتر
              </button>
            </p>
          )}
        </div>
      ) : (
        <div className="grid">
          {filtered.map((r) => (
            <Link href={`/recipe/${r.id}`} key={r.id} className="card">
              <div className="card-thumb-wrap">
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
                {r.platform && (
                  <span className="platform-badge">
                    {PLATFORM_ICON[r.platform] || "🔗"}
                  </span>
                )}
                {r.status === "needs_review" && (
                  <span className="review-badge">بحاجة لمراجعة</span>
                )}
              </div>
              <div className="card-body">
                <h3 className="card-title">{r.title || "وصفة بدون عنوان"}</h3>
                <div className="card-meta">
                  {r.time_minutes ? (
                    <span className="chip time">⏱ {r.time_minutes} د</span>
                  ) : null}
                  {(r.ingredients?.length ?? 0) > 0 && (
                    <span className="chip soft">🧂 {r.ingredients.length}</span>
                  )}
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
