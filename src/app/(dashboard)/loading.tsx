export default function DashboardLayoutLoading() {
    return (
        <div className="min-h-screen bg-slate-50 animate-pulse">
            {/* Top bar skeleton */}
            <div className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between">
                <div className="h-8 w-32 bg-slate-200 rounded" />
                <div className="flex gap-3 items-center">
                    <div className="h-8 w-8 bg-slate-200 rounded-full" />
                    <div className="h-4 w-24 bg-slate-200 rounded" />
                </div>
            </div>

            {/* Content area skeleton */}
            <div className="p-6">
                <div className="h-8 w-48 bg-slate-200 rounded mb-6" />
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {[...Array(6)].map((_, i) => (
                        <div key={i} className="bg-white rounded-xl p-6 shadow-sm h-40">
                            <div className="h-4 w-24 bg-slate-200 rounded mb-4" />
                            <div className="h-16 bg-slate-100 rounded" />
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
