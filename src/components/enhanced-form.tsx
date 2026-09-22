"use client";

import { useRef, useTransition } from "react";
import { toast } from "@/components/toast";

/**
 * 表单增强壳（步骤A）：提交 → 成功弹 toast → 清空字段 → 焦点回到第一个输入框，方便连续录入。
 * 失败时 action redirect 到 ?error=（ErrorBanner 显示），此路径不弹成功 toast。
 *
 * 为什么用 onSubmit+preventDefault 而不是把函数交给 <form action={fn}>：
 * 实测发现，把内联闭包传给 form 的 `action` 时，Next/React 有时会给这张表单挂上 `$ACTION_ID`
 * 服务端 action 绑定（尤其像 add 这种带可见输入、会 revalidatePath 的整页表单），于是提交时
 * React 直接以「渐进增强」的原生方式跑服务端 action——写是写成功、字段也被 RSC 重渲染清空了，
 * 但我的闭包（toast/聚焦）根本不执行，toast 出不来。结构完全一致的 ActionButton 之所以能弹，
 * 是因为它的表单没有 $ACTION_ID 绑定。
 * 改用 onSubmit：React 从不把 onSubmit 当作 server action 去绑定，闭包必定在 preventDefault 后运行，
 * 手动 await action(fd) 再 toast——即复现 ActionButton 那条稳定可用的路径。
 */
export function EnhancedForm({
  action,
  done,
  className,
  focus = true,
  children,
}: {
  action: (fd: FormData) => Promise<void>;
  done?: string;
  className?: string;
  /** 列表行内的小表单关掉自动聚焦，避免页面滚动跳动 */
  focus?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const busy = useRef(false);
  const [pending, start] = useTransition();

  return (
    <form
      ref={ref}
      className={`${className ?? ""}${pending ? " opacity-60" : ""}`}
      onSubmit={(e) => {
        e.preventDefault(); // 阻断原生/渐进增强提交，改由下面的闭包驱动服务端 action
        const fd = new FormData(e.currentTarget);
        if (busy.current) return;
        busy.current = true;
        start(async () => {
          try {
            await action(fd);
            toast(done ?? "已提交 ✓");
            ref.current?.reset();
            if (focus)
              ref.current
                ?.querySelector<HTMLElement>("input:not([type=hidden]), textarea, select")
                ?.focus();
          } catch (err) {
            // NEXT_REDIRECT（失败跳 ?error=）由 router 处理，其余兜底提示
            const msg = String((err as Error)?.message ?? "");
            if (!/NEXT_REDIRECT|Redirect/i.test(msg)) toast(`失败：${msg || "未知错误"}`);
          } finally {
            busy.current = false;
          }
        });
      }}
    >
      {children}
    </form>
  );
}
