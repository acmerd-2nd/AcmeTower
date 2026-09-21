"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  download?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect?: () => void;
}

/**
 * 通用右键上下文菜单（步骤：项目卡片右键操作）。
 * 返回绑到目标元素上的 onContextMenu 与要渲染进 JSX 的 menu（portal 到 body）。
 */
export function useContextMenu(items: MenuItem[]) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setPos(null), []);

  useEffect(() => {
    if (!pos) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onScrollResize = () => close();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScrollResize, true);
    window.addEventListener("resize", onScrollResize);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScrollResize, true);
      window.removeEventListener("resize", onScrollResize);
    };
  }, [pos, close]);

  const onContextMenu = (e: React.MouseEvent) => {
    // 表单控件上保留浏览器原生右键（复制粘贴文本）
    if ((e.target as HTMLElement).closest("input,textarea,select")) return;
    e.preventDefault();
    setPos({ x: e.clientX, y: e.clientY });
  };

  /** 供「⋯」等可见按钮调用：在指定坐标打开同一菜单。 */
  const open = (x: number, y: number) => setPos({ x, y });

  let menu: React.ReactNode = null;
  if (pos) {
    // 视口钳位：估算尺寸即可，避免菜单溢出屏幕
    const W = 208;
    const H = items.length * 34 + 12;
    const left = Math.min(pos.x, window.innerWidth - W - 8);
    const top = Math.min(pos.y, Math.max(8, window.innerHeight - H - 8));
    menu = createPortal(
      <div
        ref={menuRef}
        role="menu"
        style={{ position: "fixed", left, top, width: W }}
        className="z-50 rounded-lg border border-zinc-200 bg-white py-1 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
      >
        {items.map((it) => (
          <div key={it.id}>
            {it.separatorBefore && <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />}
            {it.href ? (
              <a
                href={it.href}
                {...(it.download ? { download: true } : {})}
                onClick={close}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  it.danger ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {it.icon && <span className="w-4 text-center">{it.icon}</span>}
                {it.label}
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 ${
                  it.danger ? "text-red-600 dark:text-red-400" : "text-zinc-700 dark:text-zinc-200"
                }`}
              >
                {it.icon && <span className="w-4 text-center">{it.icon}</span>}
                {it.label}
              </button>
            )}
          </div>
        ))}
      </div>,
      document.body,
    );
  }

  return { onContextMenu, open, menu };
}
