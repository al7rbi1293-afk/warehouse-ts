"use client";

import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { useUI } from "./UIProvider";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen } = useUI();

    return (
        <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row">
            {/* Mobile Navigation (Fixed Top, only visible on mobile) */}
            <div className="md:hidden">
                <MobileNav />
            </div>

            {/* Desktop Sidebar (Sticky, only visible on desktop) */}
            <div className="hidden md:block sticky top-0 h-screen shrink-0 z-50">
                <Sidebar staticPositioning={true} className="h-full" />
            </div>

            {/* 
                Main Content Area
                - Flex-1 to fill remaining space
                - No manual margins needed because it's a flex item
            */}
            <main className="flex-1 w-full p-6 md:p-8 max-w-[1600px] mx-auto overflow-x-hidden">
                {children}
            </main>
        </div>
    );
}
