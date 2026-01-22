"use client";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { useUI } from "./UIProvider";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen } = useUI();

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row">
            {/* Mobile Navigation - Now part of the flow */}
            <div className="md:hidden">
                <MobileNav />
            </div>

            {/* Desktop Sidebar Container - Width set on wrapper! */}
            <div
                className={`hidden md:flex shrink-0 transition-all duration-300 ${isSidebarOpen ? 'w-[260px]' : 'w-[80px]'
                    }`}
            >
                <div className="sticky top-0 h-screen w-full">
                    <Sidebar staticPositioning={true} className="h-full w-full" />
                </div>
            </div>

            {/* Main Content - Takes remaining space */}
            <main className="flex-1 min-w-0 md:pt-0 flex flex-col">
                <div className="p-6 md:p-8 max-w-[1600px] mx-auto w-full flex-1">
                    {children}
                </div>
                <footer className="px-6 py-4 text-center text-xs text-slate-400 border-t border-slate-100 mt-auto">
                    made by Assistant Project Manager Abdulaziz Alhazmi
                </footer>
            </main>
        </div>
    );
}
