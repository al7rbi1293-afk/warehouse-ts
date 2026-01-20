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
        <div className="overflow-hidden rounded-xl border border-slate-100">
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
                    <tbody className="divide-y divide-slate-100 bg-white">
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
    );
}
