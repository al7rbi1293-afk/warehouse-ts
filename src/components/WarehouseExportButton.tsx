"use client";

import { useTransition } from "react";
import { toast } from "sonner";

import { buildWarehouseExportUrl, WarehouseExportModule } from "@/lib/warehouse-export";
import { WarehouseExportFilterState } from "@/types";

interface WarehouseExportButtonProps {
  module: WarehouseExportModule;
  filters?: WarehouseExportFilterState;
  label?: string;
  className?: string;
}

export function WarehouseExportButton({
  module,
  filters,
  label = "Export Excel",
  className,
}: WarehouseExportButtonProps) {
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      try {
        const url = buildWarehouseExportUrl(module, filters);
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.error("Warehouse export failed", error);
        toast.error("Failed to start export");
      }
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className={`inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60 ${className || ""}`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
      {isPending ? "Preparing..." : label}
    </button>
  );
}
