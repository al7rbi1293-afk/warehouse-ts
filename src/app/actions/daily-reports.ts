"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";

export interface ChecklistItem {
    id: string;
    text: string;
    checked: boolean;
}

export interface ChecklistSection {
    id: string;
    title: string;
    items: ChecklistItem[];
    photos: string[];
}

export interface DailyReportData {
    roundNumber: number;
    region: string;
    shiftId: number;
    supervisorId: number;
    supervisorName: string;
    sections: ChecklistSection[];
}

export interface DailyReportResponse {
    success: boolean;
    message: string;
    id?: string;
}

function normalizeReportDate(dateStr?: string): Date {
    if (dateStr) {
        const [year, month, day] = dateStr.split("-").map(Number);
        if (
            Number.isInteger(year) &&
            Number.isInteger(month) &&
            Number.isInteger(day) &&
            year > 1900 &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
        ) {
            return new Date(Date.UTC(year, month - 1, day));
        }
    }

    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function buildChecklistAnswers(sections: ChecklistSection[]): Record<string, string[]> {
    const answers: Record<string, string[]> = {};

    for (const section of sections) {
        const checkedItems = (section.items || [])
            .filter((item) => item.checked)
            .map((item) => item.text.trim())
            .filter((item) => item.length > 0);

        answers[section.id] = Array.from(new Set(checkedItems));
    }

    return answers;
}

/**
 * Submit a daily report row into the existing daily_report_submissions table.
 */
export async function submitDailyReport(data: DailyReportData): Promise<DailyReportResponse> {
    try {
        const supervisorName = data.supervisorName?.trim();
        const region = data.region?.trim();
        const roundNumber = String(data.roundNumber || "").trim();

        if (!supervisorName) {
            return { success: false, message: "Supervisor name is required" };
        }

        if (!region) {
            return { success: false, message: "Region is required" };
        }

        if (!roundNumber) {
            return { success: false, message: "Round number is required" };
        }

        const reportDate = normalizeReportDate();
        const checklistAnswers = buildChecklistAnswers(data.sections || []);

        const report = await prisma.dailyReportSubmission.upsert({
            where: {
                reportDate_supervisorId_roundNumber: {
                    reportDate,
                    supervisorId: data.supervisorId,
                    roundNumber,
                },
            },
            update: {
                supervisorName,
                region,
                checklistAnswers,
            },
            create: {
                reportDate,
                supervisorId: data.supervisorId,
                supervisorName,
                region,
                roundNumber,
                checklistAnswers,
            },
        });

        revalidatePath("/reports");
        revalidatePath("/dashboard");

        return {
            success: true,
            message: "Daily report submitted successfully",
            id: String(report.id),
        };
    } catch (error) {
        console.error("Error submitting daily report:", error);
        return { success: false, message: "Failed to submit daily report" };
    }
}

/**
 * Fetch daily reports from daily_report_submissions table.
 */
export async function getDailyReports(dateStr?: string, region?: string) {
    try {
        const reportDate = normalizeReportDate(dateStr);

        const reports = await prisma.dailyReportSubmission.findMany({
            where: {
                reportDate,
                ...(region && region !== "All" ? { region } : {}),
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });

        return { success: true, data: reports };
    } catch (error) {
        console.error("Error fetching daily reports:", error);
        return { success: false, data: [] };
    }
}

/**
 * Placeholder upload implementation.
 */
export async function uploadReportPhoto(formData: FormData): Promise<string | null> {
    const file = formData.get("file") as File | null;
    if (!file) {
        return null;
    }

    return `https://placehold.co/600x400?text=${encodeURIComponent(file.name)}`;
}
