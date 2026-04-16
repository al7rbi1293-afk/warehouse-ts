"use client";

interface KpiCardProps {
  title: string;
  value: string | number;
  supportText: string;
  icon: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "red" | "slate";
  trendLabel?: string;
  trendDirection?: "up" | "down" | "stable";
  onClick?: () => void;
}

const toneClasses: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100",
  green: "bg-emerald-50 text-emerald-600 border-emerald-100",
  amber: "bg-amber-50 text-amber-600 border-amber-100",
  red: "bg-rose-50 text-rose-600 border-rose-100",
  slate: "bg-slate-100 text-slate-600 border-slate-200",
};

const trendClasses: Record<NonNullable<KpiCardProps["trendDirection"]>, string> = {
  up: "text-emerald-600",
  down: "text-rose-600",
  stable: "text-slate-500",
};

export function KpiCard({
  title,
  value,
  supportText,
  icon,
  tone = "blue",
  trendLabel,
  trendDirection = "stable",
  onClick,
}: KpiCardProps) {
  const content = (
    <div className="card-premium h-full p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-500">{title}</p>
          <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
          <p className="text-sm text-slate-500">{supportText}</p>
        </div>
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border ${toneClasses[tone]}`}
        >
          {icon}
        </div>
      </div>

      {trendLabel ? (
        <div className="mt-4 flex items-center gap-2 text-xs font-medium">
          <span className={trendClasses[trendDirection]}>
            {trendDirection === "up"
              ? "Up"
              : trendDirection === "down"
                ? "Down"
                : "Stable"}
          </span>
          <span className="text-slate-400">{trendLabel}</span>
        </div>
      ) : null}
    </div>
  );

  if (!onClick) {
    return content;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="h-full text-left transition-transform hover:-translate-y-0.5"
    >
      {content}
    </button>
  );
}
