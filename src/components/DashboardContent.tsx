"use client";

import { useUI } from "./UIProvider";

export function DashboardContent({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen, openSidebar } = useUI();

    return (
        <div
            className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out 
            ${isSidebarOpen ? "md:ml-[260px]" : "md:ml-[80px]"} ml-0`}
        >
            {/* Mobile Header */}
            <div className="md:hidden bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
                <div className="flex items-center gap-3">
                    <button
                        onClick={openSidebar}
                        className="p-2 -ml-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" x2="21" y1="6" y2="6" /><line x1="3" x2="21" y1="12" y2="12" /><line x1="3" x2="21" y1="18" y2="18" /></svg>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                        </div>
                        <span className="font-bold text-slate-800">WAREFLOW</span>
                    </div>
                </div>
            </div>

            {children}
        </div>
    );
}
