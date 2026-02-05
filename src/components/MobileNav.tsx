"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TEXT } from "@/lib/constants";

// Reuse icons concept for mobile
const Icons = {
    Menu: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>,
    LogOut: (props: React.SVGProps<SVGSVGElement>) => <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
};

export function MobileNav() {
    const { data: session } = useSession();
    const router = useRouter();
    const [isOpen, setIsOpen] = useState(false);

    if (!session?.user) return null;

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push("/login");
    };

    return (
        <div className="md:hidden">
            {/* Top Bar - Blue to match Sidebar */}
            <div className="fixed top-0 left-0 right-0 h-16 bg-[#2563EB] z-40 px-4 flex items-center justify-between shadow-md">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsOpen(true)}
                        className="p-2 -ml-2 text-white hover:bg-white/10 rounded-lg transition-colors"
                    >
                        <Icons.Menu className="w-6 h-6" />
                    </button>
                    <span className="font-bold text-sm text-white tracking-wide">NSTC Project Management System</span>
                </div>

                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-bold border border-white/20">
                    {session.user.name?.[0]?.toUpperCase() || "U"}
                </div>
            </div>

            {/* Spacer */}
            <div className="h-16" />

            {/* Backdrop */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Drawer */}
            <div className={`fixed top-0 left-0 bottom-0 w-[280px] bg-[#2563EB] z-[60] shadow-2xl transform transition-transform duration-300 ease-out ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
                {/* Drawer Header matches sidebar */}
                <div className="p-6 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                        </div>
                        <div className="text-white">
                            <h2 className="font-bold text-sm">NSTC Project Management System</h2>
                        </div>
                    </div>
                </div>

                <div className="p-4 flex flex-col h-[calc(100%-89px)]">
                    <nav className="space-y-1">
                        {/* Manager Only */}
                        {session.user.role === "manager" && (
                            <Link href="/dashboard" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl">Dashboard</Link>
                        )}

                        <Link href="/warehouse" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl">Inventory and Supply Request</Link>

                        {/* Manager & Supervisor Only */}
                        {["manager", "supervisor"].includes(session.user.role) && (
                            <Link href="/manpower" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl">Manpower</Link>
                        )}

                        <div className="border-t border-white/10 my-2 pt-2">
                            <Link href="/settings" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl">Settings</Link>
                            <Link href="/profile" onClick={() => setIsOpen(false)} className="block px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl">Profile</Link>
                        </div>
                    </nav>

                    <div className="mt-auto pt-4 border-t border-white/10">
                        <button
                            onClick={handleLogout}
                            className="w-full flex items-center gap-3 px-4 py-3 text-white font-medium hover:bg-white/10 rounded-xl"
                        >
                            <Icons.LogOut className="w-5 h-5" />
                            {TEXT.logout}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
