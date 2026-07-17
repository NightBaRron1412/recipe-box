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

const PLATFORM_LABEL: Record<string, string> = {
  instagram: "انستغرام",
  facebook: "فيسبوك",
  tiktok: "تيك توك",
  youtube: "يوتيوب",
  video: "الفيديو",
  other: "المصدر",
};

export default function RecipeView({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const [r, setR] = useState<Recipe>(recipe);
  const [editing, setEditing] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [checked, setCheckedState] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [added, setAdded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setCanEdit(hasEditKey());
    setCheckedState(getChecked(recipe.id));
  }, [recipe.id]);

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
        <Link href="/" className="back">
          ← كل الوصفات
        </Link>
        <div className="topbar-actions">
          {canEdit && !editing && (
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              ✏️ تعديل
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
          </div>

          <div className="recipe-actions no-print">
            {ingredients.length > 0 && (
              <button
                className="btn-ghost"
                onClick={() => {
                  addToShopping(r.id, r.title || "وصفة", ingredients);
                  setAdded(true);
                  setTimeout(() => setAdded(false), 1500);
                }}
              >
                {added ? "✓ أضيفت" : "🛒 أضف للتسوق"}
              </button>
            )}
            <button className="btn-ghost" onClick={copyRecipe}>
              {copied ? "✓ تم النسخ" : "📋 نسخ"}
            </button>
            <button className="btn-ghost" onClick={() => window.print()}>
              🖨️ طباعة
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
                  if (res.ok) window.location.reload();
                  else alert("تعذّرت إعادة المحاولة.");
                }}
              >
                {busy ? "..." : "🔄 إعادة الاستخراج"}
              </button>
            )}
            {hasSource && (
              <a className="btn-primary" href={r.source_url} target="_blank" rel="noopener noreferrer">
                ▶️ شاهد على {platformLabel}
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
                <h2>🧂 المكونات</h2>
                <span className="progress">
                  {checked.length}/{ingredients.length}
                </span>
              </div>
              <ul className="ingredients">
                {ingredients.map((ing, i) => (
                  <li
                    key={i}
                    className={checked.includes(i) ? "done" : ""}
                    onClick={() => toggleCheck(i)}
                  >
                    <span className="tick">{checked.includes(i) ? "✓" : ""}</span>
                    {ing}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {steps.length > 0 && (
            <div className="section">
              <h2>👩‍🍳 طريقة التحضير</h2>
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
  const [ingredients, setIngredients] = useState((r.ingredients || []).join("\n"));
  const [steps, setSteps] = useState((r.steps || []).join("\n"));

  const save = () =>
    onSave({
      title,
      author,
      servings,
      time_minutes: time ? Number(time) : null,
      tags: tags.split(/[،,\n]/).map((s) => s.trim()).filter(Boolean),
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
          🖼️ تغيير الصورة
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
          {busy ? "..." : "💾 حفظ"}
        </button>
        <button className="btn-ghost" onClick={onCancel} disabled={busy}>
          إلغاء
        </button>
        <button className="btn-danger" onClick={onDelete} disabled={busy}>
          🗑️ حذف الوصفة
        </button>
      </div>
    </div>
  );
}
