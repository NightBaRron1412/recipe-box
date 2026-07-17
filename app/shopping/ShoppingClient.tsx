"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getShopping, setShopping, type ShopItem } from "@/lib/client";

export default function ShoppingClient() {
  const [items, setItems] = useState<ShopItem[]>([]);

  useEffect(() => {
    setItems(getShopping());
  }, []);

  const update = (next: ShopItem[]) => {
    setItems(next);
    setShopping(next);
  };
  const toggle = (i: number) =>
    update(items.map((it, idx) => (idx === i ? { ...it, checked: !it.checked } : it)));
  const remove = (i: number) => update(items.filter((_, idx) => idx !== i));
  const clearChecked = () => update(items.filter((it) => !it.checked));
  const clearAll = () => update([]);

  const groups = useMemo(() => {
    const g = new Map<string, { title: string; entries: { it: ShopItem; i: number }[] }>();
    items.forEach((it, i) => {
      const key = it.recipeId;
      if (!g.has(key)) g.set(key, { title: it.from, entries: [] });
      g.get(key)!.entries.push({ it, i });
    });
    return [...g.values()];
  }, [items]);

  const doneCount = items.filter((i) => i.checked).length;

  const copyList = () => {
    const txt = items.map((i) => `${i.checked ? "✓" : "•"} ${i.text}`).join("\n");
    navigator.clipboard.writeText("قائمة التسوق:\n" + txt);
  };

  return (
    <div className="container">
      <header className="site-header">
        <div className="brand">
          <span className="logo">🛒</span>
          <div>
            <h1>قائمة التسوق</h1>
            <span className="count">
              {items.length} عنصر · {doneCount} مكتمل
            </span>
          </div>
        </div>
        <Link href="/" className="btn-ghost">
          ← المعرض
        </Link>
      </header>

      {items.length === 0 ? (
        <div className="empty">
          <div className="big">🛒</div>
          <p>
            القائمة فارغة. افتح أي وصفة واضغط «أضف للتسوق» لإضافة مكوّناتها هنا.
          </p>
        </div>
      ) : (
        <>
          <div className="recipe-actions no-print">
            <button className="btn-ghost" onClick={copyList}>
              📋 نسخ القائمة
            </button>
            <button className="btn-ghost" onClick={clearChecked} disabled={!doneCount}>
              مسح المكتمل
            </button>
            <button className="btn-danger" onClick={clearAll}>
              مسح الكل
            </button>
          </div>

          {groups.map((g) => (
            <div className="section" key={g.title + g.entries[0].i}>
              <h2>🍽️ {g.title}</h2>
              <ul className="ingredients">
                {g.entries.map(({ it, i }) => (
                  <li key={i} className={it.checked ? "done" : ""}>
                    <span className="tick" onClick={() => toggle(i)}>
                      {it.checked ? "✓" : ""}
                    </span>
                    <span style={{ flex: 1 }} onClick={() => toggle(i)}>
                      {it.text}
                    </span>
                    <button className="mini-x" onClick={() => remove(i)} aria-label="حذف">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
