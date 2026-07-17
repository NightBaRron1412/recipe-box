"use client";

import { useEffect, useState } from "react";

type ToastType = "info" | "success" | "error";
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let counter = 0;

export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("app-toast", { detail: { message, type } }));
}

export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handler = (e: Event) => {
      const { message, type } = (e as CustomEvent).detail as { message: string; type: ToastType };
      const id = ++counter;
      setItems((x) => [...x, { id, message, type }]);
      setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200);
    };
    window.addEventListener("app-toast", handler);
    return () => window.removeEventListener("app-toast", handler);
  }, []);

  return (
    <div className="toast-host">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.type}`} role="status">
          {t.message}
        </div>
      ))}
    </div>
  );
}
