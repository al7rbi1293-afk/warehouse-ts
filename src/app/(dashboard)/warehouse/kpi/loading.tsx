import { SkeletonChart, SkeletonStatCard, SkeletonTable } from "@/components/LoadingSkeleton";

export default function WarehouseKpiLoading() {
  return (
    <div className="space-y-8 pb-12">
      <div className="space-y-2">
        <div className="h-4 w-40 animate-pulse rounded bg-slate-200" />
        <div className="h-10 w-96 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-[36rem] animate-pulse rounded bg-slate-200" />
      </div>

      <div className="card-premium p-5">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <div key={index} className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <SkeletonStatCard key={index} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <SkeletonChart key={index} />
        ))}
      </div>

      <div className="space-y-6">
        {Array.from({ length: 5 }).map((_, index) => (
          <SkeletonTable key={index} rows={6} />
        ))}
      </div>
    </div>
  );
}
