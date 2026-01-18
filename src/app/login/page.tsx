"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { registerUser } from "@/app/actions/auth";
import { AREAS, TEXT } from "@/lib/constants";
import { toast } from "sonner";

export default function LoginPage() {
    const [activeTab, setActiveTab] = useState<"login" | "register">("login");
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
                toast.success("تم تسجيل الدخول بنجاح");
                router.push("/dashboard");
                router.refresh();
            }
        } catch {
            toast.error("حدث خطأ غير متوقع");
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsLoading(true);

        const formData = new FormData(e.currentTarget);

        try {
            const result = await registerUser(formData);

            if (result.success) {
                toast.success(TEXT.success_reg);
                setActiveTab("login");
            } else {
                toast.error(result.message);
            }
        } catch {
            toast.error("Registration failed");
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
                        <p className="text-gray-500">مرحباً بك في نظام إدارة المشاريع</p>
                    </div>

                    {/* Tabs */}
                    <div className="tabs justify-center">
                        <button
                            className={`tab ${activeTab === "login" ? "active" : ""}`}
                            onClick={() => setActiveTab("login")}
                        >
                            {TEXT.login_page}
                        </button>
                        <button
                            className={`tab ${activeTab === "register" ? "active" : ""}`}
                            onClick={() => setActiveTab("register")}
                        >
                            {TEXT.register_page}
                        </button>
                    </div>

                    {/* Login Form */}
                    {activeTab === "login" && (
                        <form onSubmit={handleLogin} className="space-y-4">
                            <div>
                                <label className="form-label">{TEXT.username}</label>
                                <input
                                    type="text"
                                    name="username"
                                    className="form-input"
                                    placeholder="أدخل اسم المستخدم"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label className="form-label">{TEXT.password}</label>
                                <input
                                    type="password"
                                    name="password"
                                    className="form-input"
                                    placeholder="أدخل كلمة المرور"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <button
                                type="submit"
                                className="btn w-full py-3"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="spinner" />
                                        جاري تسجيل الدخول...
                                    </span>
                                ) : (
                                    TEXT.login_btn
                                )}
                            </button>
                        </form>
                    )}

                    {/* Register Form */}
                    {activeTab === "register" && (
                        <form onSubmit={handleRegister} className="space-y-4">
                            <div>
                                <label className="form-label">{TEXT.username}</label>
                                <input
                                    type="text"
                                    name="username"
                                    className="form-input"
                                    placeholder="اختر اسم المستخدم"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label className="form-label">{TEXT.password}</label>
                                <input
                                    type="password"
                                    name="password"
                                    className="form-input"
                                    placeholder="اختر كلمة المرور"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label className="form-label">{TEXT.fullname}</label>
                                <input
                                    type="text"
                                    name="name"
                                    className="form-input"
                                    placeholder="أدخل الاسم الكامل"
                                    required
                                    disabled={isLoading}
                                />
                            </div>
                            <div>
                                <label className="form-label">{TEXT.region}</label>
                                <select
                                    name="regions"
                                    multiple
                                    className="form-input h-32"
                                    required
                                    disabled={isLoading}
                                >
                                    {AREAS.map((area) => (
                                        <option key={area} value={area}>
                                            {area}
                                        </option>
                                    ))}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    اضغط Ctrl للاختيار المتعدد
                                </p>
                            </div>
                            <button
                                type="submit"
                                className="btn w-full py-3"
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <span className="spinner" />
                                        جاري التسجيل...
                                    </span>
                                ) : (
                                    TEXT.register_btn
                                )}
                            </button>
                        </form>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-gray-400 text-sm mt-4">
                    COPYRIGHT © abdulaziz alhazmi AST.Project manager
                </p>
            </div>
        </div>
    );
}
