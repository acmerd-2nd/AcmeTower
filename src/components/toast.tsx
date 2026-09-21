"use client";

import { useEffect, useState } from "react";

/**
 * 极简全局轻提示（步骤6 UX 打磨）。
 * 任意客户端代码 toast("已归档 ✓")；Toaster 挂在根布局，底部居中浮现 2.4s 自动消失。
 * 不引入 context/provider —— 用 window 自定义事件解耦，服务端渲染时列表恒为空。
 */
export function toast(message: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("acme-toast", { detail: message }));
  }
}

let seq = 0;

export function Toaster() {
  const [items, setItems] = useState<{ id: number; msg: string }[]>([]);

  useEffect(() => {
    const on = (e: Event) => {
      const id = ++seq;
      setItems((x) => [...x.slice(-2), { id, msg: (e as CustomEvent<string>).detail }]);
      setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 2400);
    };
    window.addEventListener("acme-toast", on);
    return () => window.removeEventListener("acme-toast", on);
  }, []);

  if (items.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {items.map((i) => (
        <div
          key={i.id}
          className="rounded-full bg-zinc-900/90 px-4 py-1.5 text-xs text-white shadow-lg dark:bg-zinc-100/90 dark:text-zinc-900"
        >
          {i.msg}
        </div>
      ))}
    </div>
  );
}
