"use client";

import { useUI } from "./UIProvider";

export function DashboardContent({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen } = useUI();

    return (
        <div
            className={`flex-1 flex flex-col min-h-screen transition-all duration-300 ease-in-out ${isSidebarOpen ? "md:ml-[260px]" : "md:ml-[80px]"
                }`}
        >
            {children}
        </div>
    );
}
