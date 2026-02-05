"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TEXT } from "@/lib/constants";
import { toast } from "sonner";

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const username = formData.get("username") as string;
        const password = formData.get("password") as string;

        try {
            const result = await signIn("credentials", {
                username: username.trim(),
                password: password.trim(),
                redirect: false,
            });

            if (result?.error) {
                toast.error(TEXT.error_login);
            } else {
                toast.success("Login successful");
                router.push("/dashboard");
                router.refresh();
            }
        } catch {
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen grid lg:grid-cols-2 bg-[#F8FAFC]">
            {/* Branding Side - Corporate Blue Gradient */}
            <div className="hidden lg:flex flex-col justify-between p-12 relative overflow-hidden"
                style={{
                    background: "linear-gradient(180deg, #2563EB 0%, #1D4ED8 100%)",
                    color: "white"
                }}>

                {/* Abstract overlay */}
                <div className="absolute inset-0 opacity-10"
                    style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 0%, transparent 20%)" }}>
                </div>

                <div className="relative z-10 flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                    </div>
                    <div>
                        <h1 className="font-bold text-lg leading-tight">NSTC</h1>
                        <p className="text-[10px] opacity-80 tracking-widest font-medium">Project Managment System</p>
                    </div>
                </div>

                <div className="relative z-10 max-w-lg mb-20">
                    <h2 className="text-4xl font-bold mb-6 leading-tight">
                        NSTC Project <br />
                        Managment System
                    </h2>
                    <p className="text-blue-100 text-lg leading-relaxed opacity-90">
                        Streamline your warehouse operations with real-time tracking, intelligent reporting, and seamless manpower coordination.
                    </p>
                </div>

                <div className="relative z-10 text-sm opacity-60">
                    made by Assistant Project Manager Abdulaziz Alhazmi
                </div>
            </div>

            {/* Form Side */}
            <div className="flex items-center justify-center p-6 lg:p-12">
                <div className="w-full max-w-sm space-y-8">

                    {/* Mobile Logo */}
                    <div className="lg:hidden flex items-center justify-center gap-3 mb-8 text-blue-600">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7.5 4.27 9 5.15" /><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.3 7 8.7 5 8.7-5" /><path d="M12 22V12" /></svg>
                        </div>
                        <h1 className="font-bold text-xl">NSTC</h1>
                    </div>

                    <div className="text-center lg:text-left">
                        <h2 className="text-2xl font-bold text-slate-900">Welcome back</h2>
                        <p className="text-slate-500 mt-2">Please sign in to your dashboard</p>
                    </div>

                    <form onSubmit={handleLogin} className="space-y-5">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Username</label>
                            <input
                                type="text"
                                name="username"
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                placeholder="Enter your username"
                                required
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
                            <input
                                type="password"
                                name="password"
                                className="w-full px-4 py-3 bg-white border border-slate-200 rounded-lg text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all outline-none"
                                placeholder="Enter your password"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg shadow-blue-500/30 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                        >
                            {isLoading ? "Signing in..." : "Sign In"}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
