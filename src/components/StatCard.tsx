"use client";

import { motion } from "framer-motion";

interface StatCardProps {
    title: string;
    value: string | number;
    icon: React.ReactNode;
    delay?: number;
    href?: string;
    onClick?: () => void;
}

import Link from "next/link";

export function StatCard({ title, value, icon, delay = 0, href, onClick }: StatCardProps) {
    const content = (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay }}
            className={`card-premium p-6 flex items-center gap-5 ${href || onClick ? "cursor-pointer hover:shadow-md transition-shadow" : ""}`}
        >
            <div className="flex-shrink-0">
                <div className="w-14 h-14 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
                    {icon}
                </div>
            </div>
            <div>
                <div className="text-3xl font-bold text-slate-800 tracking-tight">{value}</div>
                <div className="text-sm font-medium text-slate-500 mt-0.5">{title}</div>
            </div>
        </motion.div>
    );

    if (onClick) {
        return <div onClick={onClick} className="block w-full text-left">{content}</div>;
    }

    if (href) {
        return <Link href={href} className="block">{content}</Link>;
    }

    return content;
}
