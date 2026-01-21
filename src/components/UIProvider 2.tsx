"use client";

import React, { createContext, useContext, useState } from "react";

interface UIContextType {
    isSidebarOpen: boolean;
    toggleSidebar: () => void;
    closeSidebar: () => void;
}

const UIContext = createContext<UIContextType | undefined>(undefined);

export function UIProvider({ children }: { children: React.ReactNode }) {
    // Default to open on desktop, closed on mobile (logic can be refined)
    // For now, we initialize to 'true' and let layout adjust based on screen size if needed,
    // or start with 'true' and user can toggle.
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);

    const toggleSidebar = () => setIsSidebarOpen((prev) => !prev);
    const closeSidebar = () => setIsSidebarOpen(false);

    return (
        <UIContext.Provider value={{ isSidebarOpen, toggleSidebar, closeSidebar }}>
            {children}
        </UIContext.Provider>
    );
}

export function useUI() {
    const context = useContext(UIContext);
    if (context === undefined) {
        throw new Error("useUI must be used within a UIProvider");
    }
    return context;
}
