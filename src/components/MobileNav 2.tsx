"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TEXT } from "@/lib/constants";
import { motion, AnimatePresence } from "framer-motion";

interface NavItem {
    name: string;
    href: string;
    icon: string;
    roles: string[];
}

const navItems: NavItem[] = [
    { name: "Dashboard", href: "/dashboard", icon: "📊", roles: ["manager"] },
    { name: "Warehouse", href: "/warehouse", icon: "📦", roles: ["manager", "supervisor", "storekeeper"] },
    { name: "Manpower", href: "/manpower", icon: "👷", roles: ["manager", "supervisor", "night_supervisor"] },
];

export function MobileNav() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    if (!session?.user) return null;

    const user = session.user;
    const isNightShift = user.role === "night_supervisor" || ["B", "B1"].includes(user.shiftName || "");

    const filteredNav = navItems.filter((item) => {
        if (isNightShift && item.name !== "Manpower") return false;
        if (user.role === "storekeeper" && item.name === "Dashboard") return false;
        return item.roles.includes(user.role);
    });

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push("/login");
    };

    return (
        <div className="md:hidden">
            {/* Top Bar - Corporate Blue Style */}
            <div className="fixed top-0 left-0 right-0 h-14 bg-white border-b border-slate-200 z-50 px-4 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 -ml-2 hover:bg-slate-100 rounded-lg transition-colors"
                    >
                        <span className="text-xl">☰</span>
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
                            W
                        </div>
                        <span className="font-semibold text-slate-800">Wareflow</span>
                    </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
                    {user.name?.[0]?.toUpperCase() || "?"}
                </div>
            </div>

            {/* Spacer */}
            <div className="h-14" />

            {/* Backdrop */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/30 z-50"
                        onClick={() => setIsOpen(false)}
                    />
                )}
            </AnimatePresence>

            {/* Drawer - Corporate Style */}
            <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: isOpen ? 0 : "-100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="fixed top-0 left-0 bottom-0 w-[280px] bg-white z-[60] shadow-xl border-r border-slate-200"
            >
                {/* Drawer Header */}
                <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                            W
                        </div>
                        <div>
                            <h1 className="font-bold text-slate-800 text-sm">Wareflow</h1>
                            <p className="text-[10px] text-slate-400 font-medium uppercase">Solutions</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* User Info */}
                <div className="p-4 mx-3 mt-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                            {user.name?.[0]?.toUpperCase() || "?"}
                        </div>
                        <div>
                            <h2 className="font-semibold text-slate-800 text-sm">{user.name}</h2>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{user.role}</p>
                        </div>
                    </div>
                </div>

                {/* Navigation */}
                <div className="p-3 flex flex-col h-[calc(100%-180px)]">
                    <p className="px-3 mb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Menu</p>
                    <nav className="space-y-1">
                        {filteredNav.map((item) => {
                            const isActive = pathname.startsWith(item.href);
                            return (
                                <Link
                                    key={item.href}
                                    href={item.href}
                                    onClick={() => setIsOpen(false)}
                                    className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-all ${isActive
                                            ? "bg-blue-600 text-white shadow-sm"
                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                        }`}
                                >
                                    <span className="text-lg">{item.icon}</span>
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* Footer Actions */}
                    <div className="mt-auto pt-4 border-t border-slate-100 space-y-1">
                        <button
                            onClick={() => {
                                setIsOpen(false);
                                router.refresh();
                            }}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
                        >
                            <span>🔄</span>
                            {TEXT.refresh_data}
                        </button>
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
                        >
                            <span>🚪</span>
                            {TEXT.logout}
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
