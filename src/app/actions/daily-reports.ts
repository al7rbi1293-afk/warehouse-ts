"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";

/* =========================================================================
   Types
========================================================================= */

export interface ChecklistItem {
    id: string; // "1", "2"...
    text: string;
    checked: boolean;
}

export interface ChecklistSection {
    id: string; // "uniforms", "bathrooms"...
    title: string;
    items: ChecklistItem[];
    photos: string[]; // URLs
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

/* =========================================================================
   Server Actions
========================================================================= */

/**
 * Submit a new Daily Report
 */
export async function submitDailyReport(data: DailyReportData): Promise<DailyReportResponse> {
    try {
        console.log("Submitting Daily Report:", data);

        // Transaction to ensure atomicity
        const report = await prisma.$transaction(async (tx) => {
            // 1. Create the main round entry
            const round = await tx.dailyRound.create({
                data: {
                    date: new Date(),
                    roundNumber: data.roundNumber,
                    region: data.region,
                    supervisor: data.supervisorName,
                    supervisorId: data.supervisorId,
                    shiftId: data.shiftId,
                }
            });

            // 2. Create checklist entries for each section
            for (const section of data.sections) {
                await tx.roundChecklist.create({
                    data: {
                        roundId: round.id,
                        section: section.id,
                        // Store items as JSON. We could store structure or just results
                        // Storing full structure is safer for rendering history
                        items: section.items as any,
                        photos: section.photos
                    }
                });
            }

            return round;
        });

        revalidatePath("/reports");
        revalidatePath("/dashboard");

        return { success: true, message: "Daily Report submitted successfully", id: report.id };

    } catch (error) {
        console.error("Error submitting daily report:", error);
        return { success: false, message: "Failed to submit daily report" };
    }
}

/**
 * Fetch Daily Reports with filters
 */
export async function getDailyReports(
    dateStr?: string,
    region?: string
) {
    try {
        const date = dateStr ? new Date(dateStr) : new Date();
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const endOfDay = new Date(date.setHours(23, 59, 59, 999));

        const where: any = {
            date: {
                gte: startOfDay,
                lte: endOfDay
            }
        };

        if (region && region !== "All") {
            where.region = region;
        }

        const reports = await prisma.dailyRound.findMany({
            where,
            include: {
                checklists: true,
                shift: true
            },
            orderBy: {
                createdAt: 'desc'
            }
        });

        // Transform if needed, but returning raw structure is usually fine for UI to parse
        return { success: true, data: reports };

    } catch (error) {
        console.error("Error fetching daily reports:", error);
        return { success: false, data: [] };
    }
}

/**
 * Mock Photo Upload (In real app, upload to Vercel Clob / S3)
 * For this prototypes, we'll return a placeholder URL or base64 if small
 */
export async function uploadReportPhoto(formData: FormData): Promise<string | null> {
    const file = formData.get("file") as File;
    if (!file) return null;

    // In a real app:
    // const blob = await put(file.name, file, { access: 'public' });
    // return blob.url;

    console.log(`Mock uploading file: ${file.name} (${file.size} bytes)`);

    // Return a fake URL for now to simulate success
    // We can use a service like Cloudinary or just return a static placeholder for demo
    // Or if we want to be fancy, we could convert to base64 but that blows up DB size.
    // Let's use a placeholder that indicates "Photo Uploaded"
    return `https://placehold.co/600x400?text=${encodeURIComponent(file.name)}`;
}
