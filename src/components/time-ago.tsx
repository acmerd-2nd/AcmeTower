"use client";

import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/core/format";

/**
 * 相对时间渲染（步骤6）。
 * 不能直接在服务端渲染里算 timeAgo：SSR 与 hydration 的 Date.now() 不同，
 * 文本一旦跨分钟边界就会 mismatch，在 loading.tsx 的 Suspense 边界内会导致
 * 整棵子树 hydration bail、所有客户端交互失效。
 * 做法：服务端只输出确定性 ISO 字符串，客户端挂载后再算"X 分钟前"。
 */
export function TimeAgo({ d, className }: { d: Date | string; className?: string }) {
  const [txt, setTxt] = useState<string | null>(null);
  useEffect(() => {
    setTxt(timeAgo(d));
  }, [d]);
  const iso = typeof d === "string" ? d : d.toISOString();
  return (
    <span className={className} suppressHydrationWarning data-iso={iso}>
      {txt ?? iso.slice(0, 16).replace("T", " ")}
    </span>
  );
}
