"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: (id: string) => string; label: string; en: string; exact?: boolean }[] = [
  { href: (id) => `/projects/${id}`, label: "概览", en: "Overview", exact: true },
  { href: (id) => `/projects/${id}/roadmap`, label: "主线", en: "Roadmap" },
  { href: (id) => `/projects/${id}/tasks`, label: "任务", en: "Tasks" },
  { href: (id) => `/projects/${id}/branches`, label: "分支", en: "Branches" },
  { href: (id) => `/projects/${id}/decisions`, label: "决策", en: "Decisions" },
  { href: (id) => `/projects/${id}/issues`, label: "问题", en: "Issues" },
  { href: (id) => `/projects/${id}/proposals`, label: "提案", en: "Proposals" },
  { href: (id) => `/projects/${id}/checkpoints`, label: "检查点", en: "Checkpoints" },
  { href: (id) => `/projects/${id}/timeline`, label: "时间线", en: "Timeline" },
  { href: (id) => `/projects/${id}/agents`, label: "智能体", en: "Agents" },
  { href: (id) => `/projects/${id}/settings`, label: "设置", en: "Settings" },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav
      className={
        // 移动端：横向滚动的胶囊导航——隐去滚动条、贴屏幕边缘滚动、行内对齐不换行；
        // md+：还原成左侧竖排导航（去负边距/内边距）。
        "no-scrollbar -mx-4 flex snap-x snap-proximity gap-1 overflow-x-auto scroll-px-4 px-4 pb-1.5 " +
        "md:mx-0 md:scroll-px-0 md:flex-col md:gap-0.5 md:overflow-visible md:px-0 md:pb-0"
      }
    >
      {ITEMS.map((it) => {
        const href = it.href(projectId);
        const active = it.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            title={it.en}
            className={`snap-start whitespace-nowrap rounded-md px-3 py-2 text-sm md:py-1.5 ${
              active
                ? "bg-zinc-900 font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
                : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
