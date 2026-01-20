"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { UIProvider } from "./UIProvider";
import { Toaster } from "sonner";

export function Providers({ children }: { children: ReactNode }) {
    return (
        <SessionProvider>
            <UIProvider>
                {children}
                <Toaster position="top-right" richColors />
            </UIProvider>
        </SessionProvider>
    );
}
