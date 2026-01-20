"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { useUI } from "./UIProvider";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen } = useUI();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return (
        <div className="min-h-screen bg-[#F8FAFC]"> {/* Mockup Background Color */}
            <MobileNav />

            <div className="hidden md:block">
                <Sidebar />
            </div>

            <main
                className={`transition-all duration-300 ease-in-out ${!isMobile && isSidebarOpen ? "md:ml-[260px]" : ""
                    }`}
            >
                <div className="p-6 md:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
