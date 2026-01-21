"use client";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { useUI } from "./UIProvider";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen } = useUI();

    return (
        <div className="min-h-screen bg-[#F8FAFC]">
            {/* Mobile Navigation (Visible only on mobile) */}
            <MobileNav />

            {/* Desktop Sidebar (Visible only on md+) */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            {/* 
                Main Content Area
                - Mobile: No margin (ml-0)
                - Desktop (md+): Margin matches sidebar width
                  - Open: 260px
                  - Collapsed: 80px
            */}
            <main
                className={`transition-all duration-300 ease-in-out ${isSidebarOpen ? "md:ml-[260px]" : "md:ml-[80px]"
                    }`}
            >
                <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
