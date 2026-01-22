"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { MobileNav } from "./MobileNav";
import { useUI } from "./UIProvider";
import { motion } from "framer-motion";

export function DashboardLayoutClient({ children }: { children: React.ReactNode }) {
    const { isSidebarOpen, toggleSidebar } = useUI();
    const [isMobile, setIsMobile] = useState(false);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth < 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Mobile Navigation */}
            <MobileNav />

            {/* Desktop Sidebar */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            {/* Desktop Sidebar Toggle */}
            <button
                onClick={toggleSidebar}
                className={`hidden md:flex fixed top-4 z-50 items-center justify-center w-8 h-8 bg-white border border-slate-200 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-50 shadow-sm transition-all duration-300 ${isSidebarOpen ? "left-[270px]" : "left-4"
                    }`}
            >
                {isSidebarOpen ? "◀" : "▶"}
            </button>

            {/* Main Content */}
            <motion.main
                initial={false}
                animate={{
                    marginLeft: !isMobile && isSidebarOpen ? 260 : 0,
                }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="min-h-screen"
            >
                <div className="p-4 md:p-6 lg:p-8 max-w-[1600px] mx-auto">
                    {children}
                </div>

                {/* Footer */}
                <footer className="py-6 px-8 text-center border-t border-slate-200 bg-white mt-8">
                    <p className="text-sm text-slate-500">
                        © 2026 <span className="font-semibold text-blue-600">Wareflow Solutions</span>. All rights reserved.
                    </p>
                </footer>
            </motion.main>
        </div>
    );
}
