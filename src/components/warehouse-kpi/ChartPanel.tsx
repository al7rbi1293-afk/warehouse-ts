"use client";

interface ChartPanelProps {
  title: string;
  description: string;
  actions?: React.ReactNode;
  emptyMessage?: string;
  isEmpty?: boolean;
  children: React.ReactNode;
}

export function ChartPanel({
  title,
  description,
  actions,
  emptyMessage = "No data available for the selected filters.",
  isEmpty = false,
  children,
}: ChartPanelProps) {
  return (
    <section className="card-premium p-6">
      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>

      {isEmpty ? (
        <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-500">
          {emptyMessage}
        </div>
      ) : (
        <div className="h-[280px]">{children}</div>
      )}
    </section>
  );
}
