"use client";

/**
 * Loading skeleton components for performance optimization.
 * These provide instant visual feedback while data loads.
 */

export function SkeletonStatCard() {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 animate-pulse">
            <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-slate-200" />
                <div className="flex-1">
                    <div className="h-4 bg-slate-200 rounded w-20 mb-2" />
                    <div className="h-8 bg-slate-200 rounded w-16" />
                </div>
            </div>
        </div>
    );
}

export function SkeletonShiftCard() {
    return (
        <div className="bg-gradient-to-br from-slate-200 to-slate-300 p-6 rounded-2xl animate-pulse">
            <div className="h-4 bg-slate-400/30 rounded w-32 mb-3" />
            <div className="flex items-end gap-3">
                <div className="h-10 bg-slate-400/30 rounded w-12" />
                <div className="h-4 bg-slate-400/30 rounded w-24" />
            </div>
        </div>
    );
}

export function SkeletonChart() {
    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="h-6 bg-slate-200 rounded w-48 mb-6 animate-pulse" />
            <div className="h-[250px] bg-slate-100 rounded-lg animate-pulse flex items-center justify-center">
                <svg className="w-12 h-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50">
                <div className="h-6 bg-slate-200 rounded w-40 animate-pulse" />
            </div>
            <div className="divide-y divide-slate-100">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="px-6 py-4 flex gap-4 animate-pulse">
                        <div className="h-4 bg-slate-200 rounded flex-1" />
                        <div className="h-4 bg-slate-200 rounded w-24" />
                        <div className="h-4 bg-slate-200 rounded w-20" />
                        <div className="h-4 bg-slate-200 rounded w-16" />
                    </div>
                ))}
            </div>
        </div>
    );
}

export function DashboardSkeleton() {
    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="h-8 bg-slate-200 rounded w-32 mb-2 animate-pulse" />
                    <div className="h-4 bg-slate-200 rounded w-48 animate-pulse" />
                </div>
                <div className="flex items-center gap-3">
                    <div className="h-10 bg-slate-200 rounded w-32 animate-pulse" />
                    <div className="h-10 bg-slate-200 rounded w-40 animate-pulse" />
                </div>
            </div>

            {/* Shift Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SkeletonShiftCard />
                <SkeletonShiftCard />
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {Array.from({ length: 8 }).map((_, i) => (
                    <SkeletonStatCard key={i} />
                ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <SkeletonChart />
                <SkeletonChart />
            </div>
        </div>
    );
}

export function ManpowerSkeleton() {
    return (
        <div className="space-y-6 animate-fade-in pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="h-8 bg-slate-200 rounded w-40 mb-2 animate-pulse" />
                    <div className="h-4 bg-slate-200 rounded w-56 animate-pulse" />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-10 w-24 bg-slate-200 rounded-lg animate-pulse mx-1" />
                ))}
            </div>

            {/* Table */}
            <SkeletonTable rows={10} />
        </div>
    );
}

export function WarehouseSkeleton() {
    return (
        <div className="space-y-6 animate-fade-in pb-12">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="h-8 bg-slate-200 rounded w-48 mb-2 animate-pulse" />
                    <div className="h-4 bg-slate-200 rounded w-64 animate-pulse" />
                </div>
            </div>

            {/* Tabs */}
            <div className="bg-white p-1 rounded-xl border border-slate-200 inline-flex shadow-sm">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-10 w-20 bg-slate-200 rounded-lg animate-pulse mx-1" />
                ))}
            </div>

            {/* Content Card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                <div className="flex gap-4 mb-6">
                    <div className="h-10 bg-slate-200 rounded flex-1 animate-pulse" />
                    <div className="h-10 bg-slate-200 rounded w-32 animate-pulse" />
                </div>
                <SkeletonTable rows={8} />
            </div>
        </div>
    );
}
