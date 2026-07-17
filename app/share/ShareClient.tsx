"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getEditKey, setEditKey } from "@/lib/client";

type State = "idle" | "saving" | "done" | "error" | "nokey" | "nourl";

export default function ShareClient({ shared }: { shared: string }) {
  const router = useRouter();
  const [state, setState] = useState<State>("idle");
  const [msg, setMsg] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const started = useRef(false);

  const run = async () => {
    if (!shared.trim()) {
      setState("nourl");
      return;
    }
    if (!getEditKey()) {
      setState("nokey");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/api/web-save", {
        method: "POST",
        headers: { "content-type": "application/json", "x-edit-key": getEditKey() },
        body: JSON.stringify({ url: shared }),
      });
      if (!res.ok) {
        setState("error");
        setMsg(res.status === 401 ? "مفتاح التحرير غير صحيح." : "تعذّر الحفظ.");
        return;
      }
      const r = await res.json();
      setState("done");
      setMsg(r.title || "");
      setTimeout(() => router.replace(`/recipe/${r.id}`), 900);
    } catch {
      setState("error");
      setMsg("تعذّر الاتصال.");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="container share-page">
      <div className="share-card">
        <div className="share-logo">🍽️</div>
        {state === "saving" && (
          <>
            <div className="spinner" />
            <h2>جاري حفظ الوصفة...</h2>
            <p className="muted">نقرأ المنشور ونستخرج الوصفة — قد يستغرق حتى دقيقة.</p>
          </>
        )}
        {state === "done" && (
          <>
            <div className="big-ok">✅</div>
            <h2>تم الحفظ!</h2>
            <p className="muted">{msg}</p>
          </>
        )}
        {state === "nourl" && (
          <>
            <h2>لم أجد رابطًا في المشاركة</h2>
            <Link className="btn-primary" href="/">
              الذهاب للمعرض
            </Link>
          </>
        )}
        {state === "nokey" && (
          <>
            <h2>فعّل وضع التحرير أولًا</h2>
            <p className="muted">أدخل مفتاح التحرير مرة واحدة على هذا الجهاز.</p>
            <input
              type="password"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              placeholder="مفتاح التحرير"
            />
            <button
              className="btn-primary"
              onClick={() => {
                setEditKey(keyInput.trim());
                run();
              }}
            >
              متابعة
            </button>
          </>
        )}
        {state === "error" && (
          <>
            <div className="big-ok">⚠️</div>
            <h2>حدث خطأ</h2>
            <p className="muted">{msg}</p>
            <button className="btn-ghost" onClick={run}>
              إعادة المحاولة
            </button>
            <Link className="btn-ghost" href="/">
              المعرض
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
