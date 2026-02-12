"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateDailyReportTemplate } from "@/app/actions/reportQuestionnaire";
import { DAILY_REPORT_SECTIONS, type DailyReportSection } from "@/lib/dailyReportTemplate";

interface DailyTemplateEditorClientProps {
    initialSections: DailyReportSection[];
    updatedAt: string | null;
}

function createSectionId() {
    const rand = Math.random().toString(16).slice(2, 8);
    return `section_${Date.now()}_${rand}`;
}

function sanitizeSections(sections: DailyReportSection[]) {
    return sections.map((section) => ({
        ...section,
        title: section.title.trim(),
        items: section.items.map((item) => item.trim()).filter((item) => item.length > 0),
    }));
}

export function DailyTemplateEditorClient({ initialSections, updatedAt }: DailyTemplateEditorClientProps) {
    const [sections, setSections] = useState<DailyReportSection[]>(
        initialSections.length > 0 ? initialSections : DAILY_REPORT_SECTIONS
    );
    const [isPending, startTransition] = useTransition();

    const lastUpdatedLabel = useMemo(() => {
        if (!updatedAt) {
            return "Unknown";
        }
        const date = new Date(updatedAt);
        if (Number.isNaN(date.valueOf())) {
            return "Unknown";
        }
        return date.toLocaleString();
    }, [updatedAt]);

    const moveSection = (index: number, direction: -1 | 1) => {
        setSections((prev) => {
            const nextIndex = index + direction;
            if (nextIndex < 0 || nextIndex >= prev.length) {
                return prev;
            }
            const next = [...prev];
            const tmp = next[index];
            next[index] = next[nextIndex];
            next[nextIndex] = tmp;
            return next;
        });
    };

    const removeSection = (index: number) => {
        setSections((prev) => prev.filter((_, idx) => idx !== index));
    };

    const updateSection = (index: number, patch: Partial<DailyReportSection>) => {
        setSections((prev) =>
            prev.map((section, idx) => (idx === index ? { ...section, ...patch } : section))
        );
    };

    const addSection = () => {
        setSections((prev) => [
            ...prev,
            {
                id: createSectionId(),
                title: "New section",
                required: false,
                items: ["New item"],
            },
        ]);
    };

    const resetToDefault = () => {
        setSections(DAILY_REPORT_SECTIONS);
        toast.message("Template reset to default (not saved yet).");
    };

    const handleSave = () => {
        const cleaned = sanitizeSections(sections);
        if (cleaned.length === 0) {
            toast.error("Template must include at least one section.");
            return;
        }

        for (const section of cleaned) {
            if (!section.title) {
                toast.error("All sections must have a title.");
                return;
            }
            if (section.items.length === 0) {
                toast.error(`Section "${section.title}" must include at least one item.`);
                return;
            }
        }

        startTransition(async () => {
            const result = await updateDailyReportTemplate(cleaned);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
        });
    };

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Edit Daily Report Template</h1>
                    <p className="text-sm text-slate-500">
                        Update section titles, required flags, and checkbox items. Last updated: {lastUpdatedLabel}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Link
                        href="/reports"
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    >
                        Back to reports
                    </Link>
                    <button
                        type="button"
                        onClick={resetToDefault}
                        disabled={isPending}
                        className="px-3 py-2 text-sm font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 disabled:opacity-60"
                    >
                        Reset to default
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={isPending}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                    >
                        {isPending ? "Saving..." : "Save template"}
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                {sections.map((section, index) => (
                    <div
                        key={section.id}
                        className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4"
                    >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="space-y-2 flex-1 min-w-[260px]">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-semibold text-slate-500">
                                        Section ID: {section.id}
                                    </span>
                                    <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            checked={section.required}
                                            onChange={(e) =>
                                                updateSection(index, { required: e.target.checked })
                                            }
                                            className="h-4 w-4"
                                        />
                                        Required
                                    </label>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-semibold text-slate-600">Title</label>
                                    <input
                                        type="text"
                                        value={section.title}
                                        onChange={(e) => updateSection(index, { title: e.target.value })}
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                        disabled={isPending}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => moveSection(index, -1)}
                                    disabled={isPending || index === 0}
                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    Up
                                </button>
                                <button
                                    type="button"
                                    onClick={() => moveSection(index, 1)}
                                    disabled={isPending || index === sections.length - 1}
                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                >
                                    Down
                                </button>
                                <button
                                    type="button"
                                    onClick={() => removeSection(index)}
                                    disabled={isPending || sections.length <= 1}
                                    className="px-3 py-2 text-xs font-semibold rounded-lg border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-60"
                                >
                                    Delete section
                                </button>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <label className="text-xs font-semibold text-slate-600">
                                Items (one per line)
                            </label>
                            <textarea
                                value={section.items.join("\n")}
                                onChange={(e) =>
                                    updateSection(index, {
                                        items: e.target.value.split("\n"),
                                    })
                                }
                                rows={Math.min(12, Math.max(4, section.items.length + 1))}
                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                disabled={isPending}
                            />
                        </div>
                    </div>
                ))}
            </div>

            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={addSection}
                    disabled={isPending}
                    className="px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                    Add section
                </button>
            </div>
        </div>
    );
}

