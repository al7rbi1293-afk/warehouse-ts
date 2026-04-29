import { Worker } from "@/types";
import { WORKER_ATTENDANCE_STATUSES } from "@/lib/attendance-status";

interface AttendanceTableProps {
    workers: Worker[];
    getWorkerStatus: (workerId: number) => string;
    getWorkerNotes: (workerId: number) => string;
    onStatusChange: (workerId: number, status: string) => void;
    onNotesChange: (workerId: number, notes: string) => void;
}

export function AttendanceTable({
    workers,
    getWorkerStatus,
    getWorkerNotes,
    onStatusChange,
    onNotesChange
}: AttendanceTableProps) {
    const getStatusClasses = (status: string, active: boolean) => {
        if (!active) {
            return "bg-white text-slate-500 border-slate-200 hover:border-slate-300";
        }

        if (status === "Present") {
            return "bg-green-100 text-green-700 border-green-200";
        }

        if (status === "Absent") {
            return "bg-red-100 text-red-700 border-red-200";
        }

        if (status === "Sick Leave") {
            return "bg-amber-100 text-amber-700 border-amber-200";
        }

        if (status === "Vacation") {
            return "bg-blue-100 text-blue-700 border-blue-200";
        }

        if (status === "Day Off") {
            return "bg-indigo-100 text-indigo-700 border-indigo-200";
        }

        return "bg-blue-100 text-blue-700 border-blue-200";
    };

    if (workers.length === 0) {
        return (
            <div className="text-center py-8 text-slate-500">
                No workers found matching filters. Please select a Region and Shift.
            </div>
        );
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-medium border-b border-slate-200">
                    <tr key="header-row">
                        <th className="px-4 py-3">Worker</th>
                        <th className="px-4 py-3">Region / Shift</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Notes</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {workers.map(worker => (
                        <tr key={worker.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3">
                                <div className="font-medium text-slate-900">{worker.name}</div>
                                <div className="text-xs text-slate-400">{worker.empId}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="text-slate-700">{worker.region}</div>
                                <div className="text-xs text-slate-500">{worker.shiftName}</div>
                            </td>
                            <td className="px-4 py-3">
                                <div className="flex gap-2">
                                    {WORKER_ATTENDANCE_STATUSES.map(status => (
                                        <button
                                            key={status}
                                            onClick={() => onStatusChange(worker.id, status)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${getStatusClasses(status, getWorkerStatus(worker.id) === status)}`}
                                        >
                                            {status}
                                        </button>
                                    ))}
                                </div>
                            </td>
                            <td className="px-4 py-3">
                                <input
                                    type="text"
                                    placeholder="Add notes..."
                                    value={getWorkerNotes(worker.id)}
                                    onChange={(e) => onNotesChange(worker.id, e.target.value)}
                                    className="w-full px-3 py-1 text-xs border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}
