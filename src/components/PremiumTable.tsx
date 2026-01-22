"use client";

interface Column<T> {
    header: string;
    accessorKey?: keyof T;
    render?: (item: T) => React.ReactNode;
    className?: string;
}

interface PremiumTableProps<T> {
    columns: Column<T>[];
    data: T[];
    actions?: (item: T) => React.ReactNode;
}

export function PremiumTable<T>({ columns, data, actions }: PremiumTableProps<T>) {
    return (
        <div className="w-full">
            {/* Mobile Card View */}
            <div className="block md:hidden space-y-4">
                {data.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 text-sm bg-white rounded-xl border border-slate-100">
                        No data available
                    </div>
                ) : (
                    data.map((item, rowIdx) => (
                        <div key={rowIdx} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
                            {columns.map((col, colIdx) => (
                                <div key={colIdx} className="flex justify-between items-start gap-4">
                                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">
                                        {col.header}
                                    </span>
                                    <div className="text-sm text-slate-800 text-right break-words max-w-[70%]">
                                        {col.render ? col.render(item) : (item[col.accessorKey as keyof T] as React.ReactNode)}
                                    </div>
                                </div>
                            ))}
                            {actions && (
                                <div className="pt-3 mt-3 border-t border-slate-100 flex justify-end gap-2">
                                    {actions(item)}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>

            {/* Desktop Table View */}
            <div className="hidden md:block overflow-hidden rounded-xl border border-slate-100 bg-white">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-[#F8FAFC]">
                            <tr>
                                {columns.map((col, idx) => (
                                    <th
                                        key={idx}
                                        className={`px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider ${col.className || ""}`}
                                    >
                                        {col.header}
                                    </th>
                                ))}
                                {actions && (
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {data.length === 0 ? (
                                <tr>
                                    <td colSpan={columns.length + (actions ? 1 : 0)} className="px-6 py-12 text-center text-slate-400 text-sm">
                                        No data available
                                    </td>
                                </tr>
                            ) : (
                                data.map((item, rowIdx) => (
                                    <tr key={rowIdx} className="hover:bg-slate-50/50 transition-colors">
                                        {columns.map((col, colIdx) => (
                                            <td key={colIdx} className="px-6 py-4 text-sm text-slate-700">
                                                {col.render ? col.render(item) : (item[col.accessorKey as keyof T] as React.ReactNode)}
                                            </td>
                                        ))}
                                        {actions && (
                                            <td className="px-6 py-4 text-right text-sm">
                                                {actions(item)}
                                            </td>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
