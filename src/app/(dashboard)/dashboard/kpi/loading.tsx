export default function ExecutiveKpiLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="space-y-3">
        <div className="h-4 w-40 rounded bg-slate-200" />
        <div className="h-10 w-80 rounded bg-slate-200" />
        <div className="h-4 w-full max-w-3xl rounded bg-slate-200" />
      </div>

      <div className="h-14 rounded-2xl bg-slate-200" />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="card-premium h-36 rounded-2xl bg-slate-200" />
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="card-premium h-[380px] rounded-2xl bg-slate-200" />
        <div className="card-premium h-[380px] rounded-2xl bg-slate-200" />
      </div>

      <div className="card-premium h-[480px] rounded-2xl bg-slate-200" />
    </div>
  );
}
