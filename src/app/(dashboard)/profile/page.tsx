"use client";

import { useSession } from "next-auth/react";

export default function ProfilePage() {
    const { data: session } = useSession();

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <h1 className="text-2xl font-bold text-slate-900">User Profile</h1>
            <div className="card-premium p-6 space-y-4">
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 text-2xl font-bold">
                        {session?.user?.name?.[0] || "U"}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{session?.user?.name}</h2>
                        <p className="text-slate-500">{session?.user?.email}</p>
                        <span className="inline-block mt-2 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-semibold capitalize">
                            {session?.user?.role}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
