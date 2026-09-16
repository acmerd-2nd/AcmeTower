/**
 * A tiny server-component form that submits hidden fields to a Server Action.
 * Renders as a single button. Used for status transitions / set-current / delete.
 */
export function ActionButton({
  action,
  fields,
  label,
  tone = "ghost",
}: {
  action: (fd: FormData) => Promise<void>;
  fields: { name: string; value: string }[];
  label: string;
  tone?: "ghost" | "solid" | "danger";
}) {
  const cls =
    tone === "solid"
      ? "bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900"
      : tone === "danger"
        ? "border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/30"
        : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800";
  return (
    <form action={action} className="inline">
      {fields.map((f) => (
        <input key={f.name} type="hidden" name={f.name} value={f.value} />
      ))}
      <button type="submit" className={`rounded-md px-2 py-1 text-xs ${cls}`}>
        {label}
      </button>
    </form>
  );
}
