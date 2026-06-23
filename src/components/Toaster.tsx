import { useEffect, useState } from "react";
import { onToast } from "../lib/toast";

interface Item {
  id: number;
  msg: string;
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<Item[]>([]);

  useEffect(
    () =>
      onToast((msg) => {
        const id = ++seq;
        setItems((xs) => [...xs, { id, msg }]);
        setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2500);
      }),
    [],
  );

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none flex flex-col items-center gap-2"
      style={{ position: "fixed", left: "50%", bottom: 88, transform: "translateX(-50%)", zIndex: 60 }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          className="rounded-md border border-line px-3 py-2 text-[13px] text-ink"
          style={{ background: "var(--color-raise)" }}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}
