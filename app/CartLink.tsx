"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shoppingCount } from "@/lib/client";

export function CartLink() {
  const [n, setN] = useState(0);
  useEffect(() => {
    const refresh = () => setN(shoppingCount());
    refresh();
    window.addEventListener("shopping-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("shopping-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);
  return (
    <Link href="/shopping" className="cart-link" title="قائمة التسوق">
      🛒{n > 0 && <span className="cart-badge">{n}</span>}
    </Link>
  );
}
