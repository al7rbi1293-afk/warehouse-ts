


interface AttendanceActionControlsProps {
    activeTab: string;
    userRole: string;
    attendanceDate: string;
    setAttendanceDate: (date: string) => void;
    selectedRegion: string;
    setSelectedRegion: (region: string) => void;
    availableRegions: { id: number; name: string }[];
    selectedShift: string;
    setSelectedShift: (shift: string) => void;
    shifts: { id: number; name: string }[];
    onSubmit: () => void;
    onAddWorker: () => void;
    isLoading?: boolean;
    mode?: 'all' | 'filters' | 'actions';
}

export function AttendanceActionControls({
    activeTab,
    userRole,
    attendanceDate,
    setAttendanceDate,
    selectedRegion,
    setSelectedRegion,
    availableRegions,
    selectedShift,
    setSelectedShift,
    shifts,
    onSubmit,
    onAddWorker,
    isLoading = false,
    mode = 'all'
}: AttendanceActionControlsProps) {
    const showFilters = mode === 'all' || mode === 'filters';
    const showActions = mode === 'all' || mode === 'actions';

    return (
        <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto items-center">
            {showFilters && (
                <>
                    <div className="relative w-full md:w-auto">
                        <input
                            type="date"
                            value={attendanceDate}
                            onChange={(e) => setAttendanceDate(e.target.value)}
                            className="w-full md:w-auto px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        />
                    </div>

                    <select
                        value={selectedRegion}
                        onChange={(e) => setSelectedRegion(e.target.value)}
                        className="w-full md:w-auto px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    >
                        <option value="All">All Regions</option>
                        {availableRegions.map(r => (
                            <option key={r.id} value={r.name}>{r.name}</option>
                        ))}
                    </select>

                    {userRole === "supervisor" && shifts.length <= 1 ? (
                        <div className="w-full md:w-auto px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm font-medium text-slate-600 text-center">
                            Shift: {shifts.find(s => s.id.toString() === selectedShift)?.name || "Assigned Shift"}
                        </div>
                    ) : (
                        <select
                            value={selectedShift}
                            onChange={(e) => setSelectedShift(e.target.value)}
                            className="w-full md:w-auto px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                        >
                            <option value="All">All Shifts</option>
                            {shifts.map(s => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    )}
                </>
            )}

            {showActions && (
                <>
                    {activeTab === "mark_attendance" && (
                        <button
                            onClick={onSubmit}
                            disabled={isLoading}
                            className={`px-4 py-2 text-white rounded-lg shadow-sm font-medium text-sm w-full md:w-auto transition-colors ${isLoading
                                ? "bg-slate-400 cursor-not-allowed"
                                : "bg-green-600 hover:bg-green-700"
                                }`}
                        >
                            {isLoading ? "Submitting..." : "Submit Attendance"}
                        </button>
                    )}

                    {activeTab === "workers" && (
                        <button
                            onClick={onAddWorker}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shadow-sm font-medium text-sm w-full md:w-auto justify-center"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                            Add Worker
                        </button>
                    )}
                </>
            )}
        </div>
    );
}

