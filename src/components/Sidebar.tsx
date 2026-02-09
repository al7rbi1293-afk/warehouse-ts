"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useUI } from "./UIProvider";
import { useEffect } from "react";

// Define the exact icons from the mockup conceptually
const Icons = {
    Dashboard: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
    ),
    Inventory: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
    ),
    Requests: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><path d="M16 13H8" /><path d="M16 17H8" /><path d="M10 9H8" /></svg>
    ),
    Reports: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="20" y2="10" /><line x1="18" x2="18" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="16" /></svg>
    ),
    Settings: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.47a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
    ),
    Profile: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
    ),
    ChevronLeft: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
    ),
    ChevronRight: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
    ),
    LogOut: (props: React.SVGProps<SVGSVGElement>) => (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></svg>
    )
};

interface SidebarProps {
    className?: string;
    staticPositioning?: boolean;
}

export function Sidebar({ className = "", staticPositioning = false }: SidebarProps) {
    const { data: session } = useSession();
    const pathname = usePathname();

    const { isSidebarOpen, toggleSidebar, closeSidebar } = useUI();

    // Close sidebar on mobile mount
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth < 768) {
                closeSidebar();
            }
        };

        // Initial check
        handleResize();

        // Optional: Listen for resize if we want dynamic adaptation
        // window.addEventListener('resize', handleResize);
        // return () => window.removeEventListener('resize', handleResize);
    }, [closeSidebar]); // Run once on mount, but depends on closeSidebar identity which should be stable

    if (!session?.user) return null;

    const navItems = [
        { name: "Dashboard", href: "/dashboard", icon: Icons.Dashboard, roles: ["manager"] },
        { name: "Inventory and Supply Request", href: "/warehouse", icon: Icons.Inventory, roles: ["manager", "supervisor", "storekeeper"] },
        { name: "Manpower", href: "/manpower", icon: Icons.Reports, roles: ["manager", "supervisor"] },
    ];

    const filteredNavItems = navItems.filter(item => item.roles.includes(session.user.role as string));

    const bottomItems = [
        { name: "Settings", href: "/settings", icon: Icons.Settings },
        { name: "Profile", href: "/profile", icon: Icons.Profile },
    ];

    return (
        <>
            {/* Mobile Backdrop */}
            {isSidebarOpen && (
                <div
                    className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={closeSidebar}
                />
            )}

            <aside
                className={`${staticPositioning ? "relative" : "fixed top-0 left-0"} h-full text-white transition-all duration-300 z-50 flex flex-col sidebar-gradient
                ${isSidebarOpen ? "translate-x-0 w-[260px]" : "-translate-x-full md:translate-x-0 w-[260px] md:w-[80px]"} 
                ${className}`}
            >
                {/* Logo Area */}
                <div className={`p-6 flex items-center gap-3 ${!isSidebarOpen && "justify-center"}`}>
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center backdrop-blur-sm shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                    </div>
                    {isSidebarOpen && (
                        <div className="overflow-hidden">
                            <h1 className="font-bold text-sm leading-tight">NSTC Project Management System</h1>
                        </div>
                    )}
                </div>

                {/* Main Navigation */}
                <nav className="flex-1 px-4 py-4 space-y-1">
                    {filteredNavItems.map((item) => {
                        const isActive = item.name === "Overview"
                            ? pathname === "/dashboard"
                            : pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                                    ? "bg-white/10 shadow-[inner_0_0_0_1px_rgba(255,255,255,0.1)]"
                                    : "hover:bg-white/5"
                                    } ${!isSidebarOpen && "justify-center px-2"}`}
                            >
                                <item.icon className={`w-5 h-5 shrink-0 ${isActive ? "opacity-100" : "opacity-70 group-hover:opacity-100"}`} />
                                {isSidebarOpen && (
                                    <span className={`text-sm font-medium leading-tight ${isActive ? "opacity-100" : "opacity-80 group-hover:opacity-100"}`}>
                                        {item.name}
                                    </span>
                                )}
                            </Link>
                        )
                    })}
                </nav>

                {/* Toggle Button */}
                <button
                    onClick={toggleSidebar}
                    className="absolute -right-3 top-20 bg-white text-blue-600 rounded-full p-1 shadow-md border border-slate-100 hover:bg-slate-50 transition-colors z-50 md:flex hidden"
                >
                    {isSidebarOpen ? <Icons.ChevronLeft className="w-4 h-4" /> : <Icons.ChevronRight className="w-4 h-4" />}
                </button>

                {/* Bottom Section */}
                <div className="p-4 space-y-1 mt-auto border-t border-white/10">
                    {bottomItems.map((item) => (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-all duration-200 group text-left ${!isSidebarOpen && "justify-center px-2"}`}
                        >
                            <item.icon className="w-5 h-5 opacity-70 group-hover:opacity-100 shrink-0" />
                            {isSidebarOpen && (
                                <span className="text-sm font-medium opacity-80 group-hover:opacity-100 whitespace-nowrap">
                                    {item.name}
                                </span>
                            )}
                        </Link>
                    ))}

                    <button
                        onClick={() => signOut()}
                        className={`w-full flex items-center gap-4 px-4 py-3 rounded-xl hover:bg-white/5 transition-all duration-200 group text-left ${!isSidebarOpen && "justify-center px-2"}`}
                    >
                        <Icons.LogOut className="w-5 h-5 opacity-70 group-hover:opacity-100 shrink-0" />
                        {isSidebarOpen && (
                            <span className="text-sm font-medium opacity-80 group-hover:opacity-100 whitespace-nowrap">
                                Log Out
                            </span>
                        )}
                    </button>
                </div>
            </aside>
        </>
    );
}
