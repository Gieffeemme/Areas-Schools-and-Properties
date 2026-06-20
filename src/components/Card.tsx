export default function Card({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-sm">
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--muted)]">{subtitle}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
