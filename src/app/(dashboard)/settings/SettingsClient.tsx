"use client";

import { useState } from "react";
import { updateUserProfile } from "@/app/actions/auth";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { User } from "@/types";

interface Props {
    user: User;
}

export function SettingsClient({ user }: Props) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);

        try {
            const result = await updateUserProfile(user.username, formData);
            if (result.success) {
                toast.success(result.message);
                router.refresh();
            } else {
                toast.error(result.message);
            }
        } catch {
            toast.error("Failed to update profile");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto space-y-8 animate-fade-in pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Account Settings</h1>
                <p className="text-slate-500 text-sm">Update your profile and personal details</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100">
                    <h2 className="font-semibold text-slate-800">Profile Information</h2>
                    <p className="text-sm text-slate-500 mt-1">Update your login credentials and display name</p>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Full Name</label>
                            <input
                                name="name"
                                type="text"
                                defaultValue={user.name || ""}
                                required
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700">Username</label>
                            <input
                                name="username"
                                type="text"
                                defaultValue={user.username}
                                required
                                className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium text-slate-700">New Password (Optional)</label>
                        <input
                            name="password"
                            type="password"
                            placeholder="Leave blank to keep current password"
                            className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                        />
                        <p className="text-xs text-slate-400">Min. 6 characters if changing</p>
                    </div>

                    <div className="pt-4 flex justify-end">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg shadow-lg shadow-blue-500/30 transition-all disabled:opacity-70 flex items-center gap-2"
                        >
                            {isLoading ? "Saving Changes..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>

            <div className="bg-blue-50 rounded-xl p-6 border border-blue-100">
                <div className="flex gap-4">
                    <div className="p-3 bg-blue-100 text-blue-600 rounded-full h-fit">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    </div>
                    <div>
                        <h3 className="font-semibold text-blue-900">Logged in as {user.username}</h3>
                        <p className="text-sm text-blue-700 mt-1">
                            Role: <span className="capitalize font-medium">{user.role}</span>
                            {user.region && ` • Region: ${user.region}`}
                            {user.shiftName && ` • Shift: ${user.shiftName}`}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
