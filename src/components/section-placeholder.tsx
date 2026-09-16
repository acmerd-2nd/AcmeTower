export function SectionPlaceholder({
  title,
  step,
}: {
  title: string;
  step: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <p className="mt-6 rounded-lg border border-dashed border-zinc-300 p-4 text-sm text-zinc-500 dark:border-zinc-700">
        该区域将在 {step} 落地。
      </p>
    </div>
  );
}
