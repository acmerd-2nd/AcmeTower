"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS: { href: (id: string) => string; label: string; exact?: boolean }[] = [
  { href: (id) => `/projects/${id}`, label: "Overview", exact: true },
  { href: (id) => `/projects/${id}/roadmap`, label: "Roadmap" },
  { href: (id) => `/projects/${id}/tasks`, label: "Tasks" },
  { href: (id) => `/projects/${id}/branches`, label: "Branches" },
  { href: (id) => `/projects/${id}/decisions`, label: "Decisions" },
  { href: (id) => `/projects/${id}/issues`, label: "Issues" },
  { href: (id) => `/projects/${id}/proposals`, label: "Proposals" },
  { href: (id) => `/projects/${id}/checkpoints`, label: "Checkpoints" },
  { href: (id) => `/projects/${id}/timeline`, label: "Timeline" },
  { href: (id) => `/projects/${id}/agents`, label: "Agents" },
  { href: (id) => `/projects/${id}/settings`, label: "Settings" },
];

export function ProjectNav({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
      {ITEMS.map((it) => {
        const href = it.href(projectId);
        const active = it.exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
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
