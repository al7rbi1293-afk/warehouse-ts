"use client";

import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { TEXT } from "@/lib/constants";
import { useState } from "react";

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

export function Sidebar() {
    const { data: session } = useSession();
    const pathname = usePathname();
    const router = useRouter();
    const [isProfileOpen, setIsProfileOpen] = useState(false);

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
        <aside className="sidebar">
            {/* Header - User Info */}
            <div className="sidebar-header">
                <div>
                    <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        👤 {user.name}
                    </h2>
                    <p className="text-xs text-gray-500">
                        📍 {user.region?.split(",")[0]}... | {user.role}
                    </p>
                </div>
                {isNightShift && (
                    <span className="px-2 py-1 bg-blue-100 rounded text-xs text-blue-700">
                        🌙 Night
                    </span>
                )}
            </div>

            {/* Navigation */}
            <nav className="sidebar-nav">
                {filteredNav.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                    >
                        <span>{item.icon}</span>
                        <span className="nav-text">{item.name}</span>
                    </Link>
                ))}
            </nav>

            {/* Actions - only show on larger screens */}
            <div className="sidebar-actions">
                {/* Refresh Button */}
                <button
                    onClick={() => router.refresh()}
                    className="btn w-full mb-2"
                >
                    {TEXT.refresh_data}
                </button>

                {/* Profile Editor */}
                <div className="mb-2">
                    <button
                        onClick={() => setIsProfileOpen(!isProfileOpen)}
                        className="w-full text-left p-2 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                    >
                        <span className="flex items-center gap-2">
                            🛠 {TEXT.edit_profile}
                            <span className="ml-auto">{isProfileOpen ? "▲" : "▼"}</span>
                        </span>
                    </button>

                    {isProfileOpen && (
                        <form className="mt-2 space-y-2 p-2 bg-gray-50 rounded-lg">
                            <div>
                                <label className="form-label text-xs">{TEXT.username}</label>
                                <input
                                    type="text"
                                    className="form-input text-sm"
                                    defaultValue={user.username}
                                    name="username"
                                />
                            </div>
                            <div>
                                <label className="form-label text-xs">{TEXT.new_name}</label>
                                <input
                                    type="text"
                                    className="form-input text-sm"
                                    defaultValue={user.name}
                                    name="name"
                                />
                            </div>
                            <div>
                                <label className="form-label text-xs">{TEXT.new_pass}</label>
                                <input
                                    type="password"
                                    className="form-input text-sm"
                                    placeholder="Leave empty to keep"
                                    name="password"
                                />
                            </div>
                            <button type="submit" className="btn w-full text-sm">
                                {TEXT.save_changes}
                            </button>
                        </form>
                    )}
                </div>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="btn btn-secondary w-full"
                >
                    {TEXT.logout}
                </button>
            </div>

            {/* Footer */}
            <div className="sidebar-footer">
                <p className="text-xs text-gray-400">v2.0 - TypeScript</p>
            </div>
        </aside>
    );
}
