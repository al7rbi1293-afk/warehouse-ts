"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TEXT } from "@/lib/constants";
import { toast } from "sonner";

export default function LoginPage() {
    const [isLoading, setIsLoading] = useState(false);
    const [attempts, setAttempts] = useState(0);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        // Rate limiting - block after 5 failed attempts
        if (attempts >= 5) {
            toast.error("Too many attempts. Please wait 5 minutes.");
            return;
        }

        setIsLoading(true);

        const formData = new FormData(e.currentTarget);
        const username = formData.get("username") as string;
        const password = formData.get("password") as string;

        // Basic input validation
        if (!username.trim() || !password.trim()) {
            toast.error("Please enter username and password");
            setIsLoading(false);
            return;
        }

        try {
            const result = await signIn("credentials", {
                username: username.trim(),
                password: password.trim(),
                redirect: false,
            });

            if (result?.error) {
                setAttempts(prev => prev + 1);
                toast.error(TEXT.error_login);
            } else {
                setAttempts(0);
                toast.success("Login successful");
                router.push("/dashboard");
                router.refresh();
            }
        } catch {
            setAttempts(prev => prev + 1);
            toast.error("An unexpected error occurred");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <div className="w-full max-w-md">
                <div className="card">
                    {/* Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold text-gray-800 mb-2">
                            🔐 {TEXT.app_title}
                        </h1>
                        <p className="text-gray-500">Warehouse Management System</p>
                    </div>

                    {/* Login Form */}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="form-label">{TEXT.username}</label>
                            <input
                                type="text"
                                name="username"
                                className="form-input"
                                placeholder="Enter username"
                                required
                                disabled={isLoading}
                                autoComplete="username"
                            />
                        </div>
                        <div>
                            <label className="form-label">{TEXT.password}</label>
                            <input
                                type="password"
                                name="password"
                                className="form-input"
                                placeholder="Enter password"
                                required
                                disabled={isLoading}
                                autoComplete="current-password"
                            />
                        </div>

                        {attempts >= 3 && (
                            <div className="text-sm text-red-500 text-center">
                                ⚠️ {5 - attempts} attempts remaining
                            </div>
                        )}

                        <button
                            type="submit"
                            className="btn w-full py-3"
                            disabled={isLoading || attempts >= 5}
                        >
                            {isLoading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <span className="spinner" />
                                    Signing in...
                                </span>
                            ) : (
                                TEXT.login_btn
                            )}
                        </button>
                    </form>

                    {/* Security Notice */}
                    <div className="mt-6 p-3 bg-gray-50 rounded-lg text-center text-sm text-gray-500">
                        <p>🔒 Authorized personnel only</p>
                        <p className="text-xs mt-1">Contact your administrator for access</p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-sm mt-4">
                    COPYRIGHT © abdulaziz alhazmi AST.Project manager
                </p>
            </div>
        </div>
    );
}
