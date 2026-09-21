import { statusLabel } from "@/lib/core/labels";

export function ErrorBanner({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
      {message}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100";

export function TextField({
  name,
  label,
  placeholder,
  required,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input name={name} placeholder={placeholder} required={required} className={inputCls} />
    </label>
  );
}

export function TextArea({
  name,
  label,
  placeholder,
  rows = 2,
}: {
  name: string;
  label: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <textarea name={name} rows={rows} placeholder={placeholder} className={inputCls} />
    </label>
  );
}

export function SelectField({
  name,
  label,
  options,
  required,
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <select name={name} required={required} className={inputCls}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function Submit({ label }: { label: string }) {
  return (
    <button
      type="submit"
      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900"
    >
      {label}
    </button>
  );
}

export const pill: Record<string, string> = {
  // shared status → color classes
  COMPLETED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  ACTIVE: "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900",
  IN_PROGRESS: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  RESOLVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  BLOCKED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  TODO: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  OPEN: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  PLANNED: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  CANCELLED: "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800",
  ABANDONED: "bg-zinc-100 text-zinc-400 line-through dark:bg-zinc-800",
  APPROVED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  PAUSED: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ARCHIVED: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
  PROPOSED: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  REJECTED: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  SUPERSEDED: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
  PARKED: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  WONT_FIX: "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500",
};

export function StatusPill({ status }: { status: string }) {
  return (
    <span
      title={status}
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${pill[status] ?? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
    >
      {statusLabel(status)}
    </span>
  );
}
