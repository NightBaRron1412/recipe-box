"use client";

import { useEffect, useState } from "react";
import { getEditKey, setEditKey } from "@/lib/client";
import { Icon } from "./Icon";

export function UnlockButton() {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    setUnlocked(getEditKey().length > 0);
  }, []);

  const save = () => {
    setEditKey(val.trim());
    setUnlocked(val.trim().length > 0);
    setOpen(false);
    setVal("");
  };
  const lock = () => {
    setEditKey("");
    setUnlocked(false);
    setOpen(false);
  };

  return (
    <div className="unlock">
      <button
        className={`icon-btn ${unlocked ? "on" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title={unlocked ? "وضع التحرير مفعّل" : "تفعيل وضع التحرير"}
        aria-label="وضع التحرير"
      >
        <Icon name={unlocked ? "unlock" : "lock"} />
      </button>
      {open && (
        <div className="unlock-pop">
          {unlocked ? (
            <>
              <p>وضع التحرير مفعّل — يمكنك تعديل وحذف الوصفات.</p>
              <button className="btn-danger" onClick={lock}>
                إيقاف التحرير
              </button>
            </>
          ) : (
            <>
              <p>أدخل مفتاح التحرير لتفعيل التعديل والحذف.</p>
              <input
                type="password"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                placeholder="مفتاح التحرير"
                onKeyDown={(e) => e.key === "Enter" && save()}
              />
              <button className="btn-primary" onClick={save}>
                تفعيل
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
