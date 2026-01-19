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
        // Night shift can only access Manpower
        if (isNightShift && item.name !== "Manpower") return false;
        // Storekeeper cannot access Dashboard
        if (user.role === "storekeeper" && item.name === "Dashboard") return false;
        return item.roles.includes(user.role);
    });

    const handleLogout = async () => {
        await signOut({ redirect: false });
        router.push("/login");
    };

    return (
        <aside className="sidebar">
            {/* User Info */}
            <div className="mb-6">
                <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                    👤 {user.name}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                    📍 {user.region} | 🔑 {user.role}
                </p>
                {isNightShift && (
                    <div className="mt-2 px-3 py-2 bg-blue-50 rounded-lg text-sm text-blue-700">
                        🌙 Night Shift Mode ({user.shiftName})
                    </div>
                )}
            </div>

            <hr className="my-4 border-gray-200" />

            {/* Navigation */}
            {!isNightShift && (
                <>
                    <p className="text-xs font-semibold text-gray-400 uppercase mb-2">
                        🔀 Module Selection
                    </p>
                    <nav className="space-y-1">
                        {filteredNav.map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                            >
                                <span>{item.icon}</span>
                                <span>{item.name}</span>
                            </Link>
                        ))}
                    </nav>
                    <hr className="my-4 border-gray-200" />
                </>
            )}

            {/* Refresh Button */}
            <button
                onClick={() => router.refresh()}
                className="btn w-full mb-4"
            >
                {TEXT.refresh_data}
            </button>

            {/* Profile Editor */}
            <div className="mb-4">
                <button
                    onClick={() => setIsProfileOpen(!isProfileOpen)}
                    className="w-full text-left p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                    <span className="flex items-center gap-2">
                        🛠 {TEXT.edit_profile}
                        <span className="ml-auto">{isProfileOpen ? "▲" : "▼"}</span>
                    </span>
                </button>

                {isProfileOpen && (
                    <form className="mt-3 space-y-3 p-3 bg-gray-50 rounded-lg">
                        <div>
                            <label className="form-label text-sm">{TEXT.username}</label>
                            <input
                                type="text"
                                className="form-input text-sm"
                                defaultValue={user.username}
                                name="username"
                            />
                        </div>
                        <div>
                            <label className="form-label text-sm">{TEXT.new_name}</label>
                            <input
                                type="text"
                                className="form-input text-sm"
                                defaultValue={user.name}
                                name="name"
                            />
                        </div>
                        <div>
                            <label className="form-label text-sm">{TEXT.new_pass}</label>
                            <input
                                type="password"
                                className="form-input text-sm"
                                placeholder="Leave empty to keep current"
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

            {/* Version */}
            <p className="text-xs text-gray-400 mt-4 text-center">
                v2.0 - TypeScript Edition
            </p>
        </aside>
    );
}
