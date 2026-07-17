"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Recipe } from "@/lib/types";
import {
  getEditKey,
  hasEditKey,
  getChecked,
  setChecked,
  addToShopping,
} from "@/lib/client";
import { UnlockButton } from "@/app/Unlock";
import { CartLink } from "@/app/CartLink";
import { ThemeToggle } from "@/app/ThemeToggle";
import { scaleIngredient, SCALE_OPTIONS } from "@/lib/scale";
import { Icon } from "@/app/Icon";

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "انستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  video: "الفيديو",
  other: "المصدر",
};

export default function RecipeView({
  recipe,
  related = [],
}: {
  recipe: Recipe;
  related?: Recipe[];
}) {
  const router = useRouter();
  const [r, setR] = useState<Recipe>(recipe);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [checked, setCheckedState] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const [scale, setScale] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanEdit(hasEditKey());
    setCheckedState(getChecked(recipe.id));
  }, [recipe.id]);

  // Keep in sync when the server re-renders (e.g. after retry via router.refresh).
  useEffect(() => {
    setR(recipe);
  }, [recipe]);

  // Keep the screen awake while viewing a recipe (handy while cooking).
  useEffect(() => {
    let lock: { release: () => void } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => void }> } };
    nav.wakeLock?.request("screen").then((l) => (lock = l)).catch(() => {});
    return () => lock?.release?.();
  }, []);

  const toggleFavorite = async () => {
    if (!hasEditKey()) {
      alert("فعّل وضع التحرير أولًا (زر القفل) لتتمكن من الحفظ في المفضلة.");
      return;
    }
    const next = !r.favorite;
    setR((c) => ({ ...c, favorite: next }));
    await fetch(`/api/recipes/${r.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json", "x-edit-key": getEditKey() },
      body: JSON.stringify({ favorite: next }),
    }).catch(() => setR((c) => ({ ...c, favorite: !next })));
  };

  const toggleCheck = (i: number) => {
    const next = checked.includes(i)
      ? checked.filter((x) => x !== i)
      : [...checked, i];
    setCheckedState(next);
    setChecked(r.id, next);
  };

  const platformLabel = PLATFORM_LABEL[r.platform || "other"] || "المصدر";
  const ingredients = r.ingredients || [];
  const steps = r.steps || [];
  const hasSource = r.source_url && r.source_url !== "video-upload";

  const copyRecipe = () => {
    const txt = [
      r.title,
      "",
      "المكونات:",
      ...ingredients.map((x) => `- ${x}`),
      "",
      "الطريقة:",
      ...steps.map((x, i) => `${i + 1}. ${x}`),
      hasSource ? `\nالمصدر: ${r.source_url}` : "",
    ].join("\n");
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="container recipe-page">
      <div className="recipe-topbar">
        <Link href="/" className="icon-btn" title="كل الوصفات" aria-label="رجوع">
          <Icon name="back" />
        </Link>
        <div className="topbar-actions">
          <button
            className={`icon-btn ${r.favorite ? "fav-on" : ""}`}
            onClick={toggleFavorite}
            title="المفضلة"
            aria-label="المفضلة"
          >
            <Icon name={r.favorite ? "heartFilled" : "heart"} />
          </button>
          {canEdit && !editing && (
            <button className="icon-btn" onClick={() => setEditing(true)} title="تعديل" aria-label="تعديل">
              <Icon name="edit" />
            </button>
          )}
          <ThemeToggle />
          <CartLink />
          <UnlockButton />
        </div>
      </div>

      {editing ? (
        <EditForm
          r={r}
          busy={busy}
          onImage={() => fileRef.current?.click()}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            setBusy(true);
            const res = await fetch(`/api/recipes/${r.id}`, {
              method: "PATCH",
              headers: {
                "content-type": "application/json",
                "x-edit-key": getEditKey(),
              },
              body: JSON.stringify(patch),
            });
            setBusy(false);
            if (res.ok) {
              const { recipe: updated } = await res.json();
              setR(updated);
              setEditing(false);
              router.refresh();
            } else {
              alert("فشل الحفظ — تأكد من مفتاح التحرير.");
            }
          }}
          onDelete={async () => {
            if (!confirm("حذف هذه الوصفة نهائيًا؟")) return;
            setBusy(true);
            const res = await fetch(`/api/recipes/${r.id}`, {
              method: "DELETE",
              headers: { "x-edit-key": getEditKey() },
            });
            setBusy(false);
            if (res.ok) router.push("/");
            else alert("فشل الحذف.");
          }}
        />
      ) : (
        <>
          {r.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.image_url} alt={r.title || "وصفة"} className="recipe-hero" />
          )}

          <h1 className="recipe-title">{r.title || "وصفة بدون عنوان"}</h1>

          <div className="recipe-sub">
            {r.author && <span>👤 {r.author}</span>}
            {r.servings && <span>🍽️ {r.servings}</span>}
            {r.time_minutes ? <span>⏱ {r.time_minutes} دقيقة</span> : null}
            {(r.tags || []).map((t) => (
              <Link className="chip clickable" key={t} href={`/?tag=${encodeURIComponent(t)}`}>
                #{t}
              </Link>
            ))}
            {(r.collections || []).map((c) => (
              <Link
                className="chip collection"
                key={c}
                href={`/?collection=${encodeURIComponent(c)}`}
              >
                <Icon name="folder" size={13} /> {c}
              </Link>
            ))}
          </div>

          <div className="recipe-actions no-print">
            {ingredients.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() => {
                  addToShopping(
                    r.id,
                    r.title || "وصفة",
                    ingredients.map((i) => scaleIngredient(i, scale))
                  );
                  setAdded(true);
                  setTimeout(() => setAdded(false), 1500);
                }}
              >
                <Icon name="cart" size={17} /> {added ? "أضيفت" : "أضف للتسوق"}
              </button>
            )}
            <button className="btn-ghost" onClick={copyRecipe}>
              <Icon name={copied ? "check" : "copy"} size={17} /> {copied ? "تم النسخ" : "نسخ"}
            </button>
            <button className="btn-ghost" onClick={() => setTimeout(() => window.print(), 60)}>
              <Icon name="printer" size={17} /> طباعة
            </button>
            {canEdit && r.status !== "ok" && hasSource && (
              <button
                className="btn-ghost"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  const res = await fetch("/api/web-save", {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                      "x-edit-key": getEditKey(),
                    },
                    body: JSON.stringify({ url: r.source_url }),
                  });
                  setBusy(false);
                  if (res.ok) router.refresh();
                  else alert("تعذّرت إعادة المحاولة.");
                }}
              >
                <Icon name="refresh" size={17} className={busy ? "spin" : ""} />{" "}
                {busy ? "جاري الاستخراج..." : "إعادة الاستخراج"}
              </button>
            )}
            {hasSource && (
              <a className="btn-primary" href={r.source_url} target="_blank" rel="noopener noreferrer">
                <Icon name="external" size={17} /> شاهد على {platformLabel}
              </a>
            )}
          </div>

          {r.status !== "ok" && (
            <div className="note">
              {r.status === "needs_review"
                ? "⚠️ لم أتمكن من استخراج الوصفة تلقائيًا. فعّل وضع التحرير لإضافتها يدويًا، أو اضغط «إعادة الاستخراج»."
                : "⚠️ تعذّر الوصول إلى هذا المنشور (قد يكون خاصًا أو محذوفًا). الرابط الأصلي محفوظ بالأسفل."}
            </div>
          )}

          {ingredients.length > 0 && (
            <div className="section">
              <div className="section-head">
                <h2><Icon name="utensils" size={18} /> المكونات</h2>
                <span className="progress">
                  {checked.length}/{ingredients.length}
                </span>
              </div>
              <div className="scaler no-print">
                <span className="scaler-label">الكمية:</span>
                {SCALE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    className={`scale-btn ${scale === o.value ? "active" : ""}`}
                    onClick={() => setScale(o.value)}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              <ul className="ingredients">
                {ingredients.map((ing, i) => (
                  <li
                    key={i}
                    className={checked.includes(i) ? "done" : ""}
                    onClick={() => toggleCheck(i)}
                  >
                    <span className="tick">{checked.includes(i) ? "✓" : ""}</span>
                    {scaleIngredient(ing, scale)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div className="section">
              <h2><Icon name="hat" size={18} /> طريقة التحضير</h2>
              <ol className="steps">
                {steps.map((s, i) => (
                  <li key={i}>{s}</li>
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

          {related.length > 0 && (
            <div className="section no-print">
              <h2><Icon name="utensils" size={18} /> وصفات مشابهة</h2>
              <div className="related-grid">
                {related.map((rec) => (
                  <Link href={`/recipe/${rec.id}`} key={rec.id} className="related-card">
                    {rec.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={rec.image_url} alt={rec.title || ""} loading="lazy" />
                    ) : (
                      <div className="related-ph">🍲</div>
                    )}
                    <span>{rec.title || "وصفة"}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          const fd = new FormData();
          fd.append("file", file);
          const res = await fetch(`/api/recipes/${r.id}/image`, {
            method: "POST",
            headers: { "x-edit-key": getEditKey() },
            body: fd,
          });
          setBusy(false);
          if (res.ok) {
            const { image_url } = await res.json();
            setR((cur) => ({ ...cur, image_url }));
            router.refresh();
          } else alert("فشل رفع الصورة.");
        }}
      />
    </div>
  );
}

function EditForm({
  r,
  busy,
  onSave,
  onCancel,
  onDelete,
  onImage,
}: {
  r: Recipe;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onCancel: () => void;
  onDelete: () => void;
  onImage: () => void;
}) {
  const [title, setTitle] = useState(r.title || "");
  const [author, setAuthor] = useState(r.author || "");
  const [servings, setServings] = useState(r.servings || "");
  const [time, setTime] = useState(r.time_minutes ? String(r.time_minutes) : "");
  const [tags, setTags] = useState((r.tags || []).join("، "));
  const [collections, setCollections] = useState((r.collections || []).join("، "));
  const [ingredients, setIngredients] = useState((r.ingredients || []).join("\n"));
  const [steps, setSteps] = useState((r.steps || []).join("\n"));

  const save = () =>
    onSave({
      title,
      author,
      servings,
      time_minutes: time ? Number(time) : null,
      tags: tags.split(/[،,\n]/).map((s) => s.trim()).filter(Boolean),
      collections: collections.split(/[،,\n]/).map((s) => s.trim()).filter(Boolean),
      ingredients: ingredients.split("\n").map((s) => s.trim()).filter(Boolean),
      steps: steps.split("\n").map((s) => s.trim()).filter(Boolean),
      status: "ok",
    });

  return (
    <div className="edit-form">
      <div className="edit-hero">
        {r.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" className="recipe-hero" />
        ) : (
          <div className="recipe-hero placeholder-hero">🍲</div>
        )}
        <button className="btn-ghost change-img" onClick={onImage} disabled={busy}>
          <Icon name="camera" size={16} /> تغيير الصورة
        </button>
      </div>

      <label>العنوان</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />

      <div className="edit-row">
        <div>
          <label>الطاهي / المصدر</label>
          <input value={author} onChange={(e) => setAuthor(e.target.value)} />
        </div>
        <div>
          <label>الحصص</label>
          <input value={servings} onChange={(e) => setServings(e.target.value)} />
        </div>
        <div>
          <label>الوقت (دقيقة)</label>
          <input
            type="number"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <label>الوسوم (افصل بفاصلة)</label>
      <input value={tags} onChange={(e) => setTags(e.target.value)} />

      <label>المجموعات (عشاء، حلويات، رمضان...)</label>
      <input value={collections} onChange={(e) => setCollections(e.target.value)} />

      <label>المكونات (سطر لكل مكوّن)</label>
      <textarea
        rows={8}
        value={ingredients}
        onChange={(e) => setIngredients(e.target.value)}
      />

      <label>الخطوات (سطر لكل خطوة)</label>
      <textarea rows={10} value={steps} onChange={(e) => setSteps(e.target.value)} />

      <div className="edit-actions">
        <button className="btn-primary" onClick={save} disabled={busy}>
          <Icon name="check" size={17} /> {busy ? "..." : "حفظ"}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
        <button className="btn-danger" onClick={onDelete} disabled={busy}>
          <Icon name="trash" size={17} /> حذف الوصفة
        </button>
      </div>
    </div>
  );
}
