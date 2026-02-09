"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
    DAILY_REPORT_ROUNDS,
    DAILY_REPORT_SECTIONS,
    DAILY_REPORT_SUPERVISORS,
} from "@/lib/dailyReportTemplate";

export type ReportType = "daily" | "weekly" | "discharge";

interface ActionResult<T = undefined> {
    success: boolean;
    message: string;
    data?: T;
}

interface ReportQuestionDto {
    id: number;
    question: string;
    sortOrder: number;
}

interface ManagerAnswerDto {
    id: number;
    questionId: number;
    question: string;
    supervisorName: string;
    answer: string;
    updatedAt: string;
}

interface SupervisorAnswerDto {
    questionId: number;
    answer: string;
}

export interface DailySubmissionInput {
    supervisorName: string;
    region: string;
    roundNumber: string;
    checklistAnswers: Record<string, string[]>;
}

interface DailySubmissionDto {
    id: number;
    reportDate: string;
    supervisorName: string;
    region: string;
    roundNumber: string;
    checklistAnswers: Record<string, string[]>;
    updatedAt: string;
}

const REPORT_TYPES: ReportType[] = ["daily", "weekly", "discharge"];
const MANAGER_ROLES = new Set(["manager", "admin"]);
const SUPERVISOR_ROLES = new Set(["supervisor", "night_supervisor"]);

const DEFAULT_QUESTIONS: Record<ReportType, string[]> = {
    daily: [
        "What are the key updates for today?",
        "What issues or blockers need support?",
        "What actions are required for the next shift?",
    ],
    weekly: [
        "What progress was completed this week?",
        "What recurring issues were observed this week?",
        "What priorities should be carried to next week?",
    ],
    discharge: [
        "Which items or tasks were discharged?",
        "Were there any delays or exceptions during discharge?",
        "What follow-up is required after discharge?",
    ],
};

function isReportType(value: string): value is ReportType {
    return REPORT_TYPES.includes(value as ReportType);
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

function getRole(session: { user?: { role?: string } } | null | undefined) {
    return session?.user?.role || "";
}

async function ensureDefaultQuestions(reportType: ReportType, createdBy: string) {
    const existingCount = await prisma.reportQuestion.count({
        where: { reportType, isActive: true },
    });

    if (existingCount > 0) {
        return;
    }

    await prisma.reportQuestion.createMany({
        data: DEFAULT_QUESTIONS[reportType].map((question, index) => ({
            reportType,
            question,
            sortOrder: index,
            createdBy,
        })),
    });
}

function sanitizeChecklistAnswers(input: Record<string, string[]>): Record<string, string[]> {
    const sectionMap = new Map(
        DAILY_REPORT_SECTIONS.map((section) => [section.id, new Set(section.items)])
    );

    const sanitized: Record<string, string[]> = {};

    for (const section of DAILY_REPORT_SECTIONS) {
        const allowed = sectionMap.get(section.id);
        const selected = Array.isArray(input[section.id]) ? input[section.id] : [];

        const cleaned = selected
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && allowed?.has(item));

        // Remove duplicates while preserving order
        sanitized[section.id] = Array.from(new Set(cleaned));
    }

    return sanitized;
}

function parseChecklistAnswers(raw: unknown): Record<string, string[]> {
    const empty: Record<string, string[]> = {};
    for (const section of DAILY_REPORT_SECTIONS) {
        empty[section.id] = [];
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return empty;
    }

    const parsed: Record<string, string[]> = { ...empty };

    for (const section of DAILY_REPORT_SECTIONS) {
        const candidate = (raw as Record<string, unknown>)[section.id];
        if (!Array.isArray(candidate)) {
            continue;
        }

        parsed[section.id] = candidate
            .filter((value): value is string => typeof value === "string")
            .filter((value) => section.items.includes(value));
    }

    return parsed;
}

export async function getReportQuestionnaireData(
    reportType: string,
    reportDate: string
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        questions: ReportQuestionDto[];
        managerAnswers: ManagerAnswerDto[];
        supervisorAnswers: SupervisorAnswerDto[];
    }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    if (!isReportType(reportType)) {
        return { success: false, message: "Invalid report type" };
    }

    const normalizedDate = normalizeReportDate(reportDate);

    await ensureDefaultQuestions(reportType, session.user.name || session.user.username || "manager");

    const questions = await prisma.reportQuestion.findMany({
        where: {
            reportType,
            isActive: true,
        },
        select: {
            id: true,
            question: true,
            sortOrder: true,
        },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    if (MANAGER_ROLES.has(role)) {
        const managerAnswers = await prisma.reportAnswer.findMany({
            where: {
                reportDate: normalizedDate,
                question: {
                    reportType,
                    isActive: true,
                },
            },
            select: {
                id: true,
                questionId: true,
                answer: true,
                supervisorName: true,
                updatedAt: true,
                question: {
                    select: {
                        question: true,
                    },
                },
            },
            orderBy: [
                { supervisorName: "asc" },
                { question: { sortOrder: "asc" } },
                { updatedAt: "desc" },
            ],
        });

        return {
            success: true,
            message: "OK",
            data: {
                mode: "manager",
                questions,
                managerAnswers: managerAnswers.map((row) => ({
                    id: row.id,
                    questionId: row.questionId,
                    question: row.question.question,
                    supervisorName: row.supervisorName,
                    answer: row.answer,
                    updatedAt: row.updatedAt.toISOString(),
                })),
                supervisorAnswers: [],
            },
        };
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const supervisorAnswers = await prisma.reportAnswer.findMany({
        where: {
            reportDate: normalizedDate,
            supervisorId,
            question: {
                reportType,
                isActive: true,
            },
        },
        select: {
            questionId: true,
            answer: true,
        },
    });

    return {
        success: true,
        message: "OK",
        data: {
            mode: "supervisor",
            questions,
            managerAnswers: [],
            supervisorAnswers,
        },
    };
}

export async function addReportQuestion(
    reportType: string,
    question: string
): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    if (!isReportType(reportType)) {
        return { success: false, message: "Invalid report type" };
    }

    const text = question.trim();
    if (text.length < 3) {
        return { success: false, message: "Question must be at least 3 characters" };
    }

    const aggregate = await prisma.reportQuestion.aggregate({
        where: { reportType },
        _max: { sortOrder: true },
    });

    await prisma.reportQuestion.create({
        data: {
            reportType,
            question: text,
            sortOrder: (aggregate._max.sortOrder ?? -1) + 1,
            createdBy: session.user.name || session.user.username || "manager",
            isActive: true,
        },
    });

    revalidatePath("/reports");
    return { success: true, message: "Question added" };
}

export async function updateReportQuestion(
    questionId: number,
    question: string
): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    const text = question.trim();
    if (text.length < 3) {
        return { success: false, message: "Question must be at least 3 characters" };
    }

    try {
        await prisma.reportQuestion.update({
            where: { id: questionId },
            data: { question: text },
        });
    } catch {
        return { success: false, message: "Question not found" };
    }

    revalidatePath("/reports");
    return { success: true, message: "Question updated" };
}

export async function deleteReportQuestion(questionId: number): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    try {
        await prisma.reportQuestion.update({
            where: { id: questionId },
            data: { isActive: false },
        });
    } catch {
        return { success: false, message: "Question not found" };
    }

    revalidatePath("/reports");
    return { success: true, message: "Question removed" };
}

export async function submitSupervisorReportAnswers(
    reportType: string,
    reportDate: string,
    answers: Array<{ questionId: number; answer: string }>
): Promise<ActionResult<{ submitted: number }>> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !SUPERVISOR_ROLES.has(role)) {
        return { success: false, message: "Only supervisors can submit answers" };
    }

    if (!isReportType(reportType)) {
        return { success: false, message: "Invalid report type" };
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const normalizedDate = normalizeReportDate(reportDate);

    await ensureDefaultQuestions(reportType, session.user.name || session.user.username || "manager");

    const activeQuestions = await prisma.reportQuestion.findMany({
        where: {
            reportType,
            isActive: true,
        },
        select: { id: true },
    });

    const validQuestionIds = new Set(activeQuestions.map((q) => q.id));

    const cleanedAnswers = answers
        .filter((row) => validQuestionIds.has(row.questionId))
        .map((row) => ({
            questionId: row.questionId,
            answer: row.answer.trim(),
        }))
        .filter((row) => row.answer.length > 0);

    await prisma.$transaction(async (tx) => {
        await tx.reportAnswer.deleteMany({
            where: {
                supervisorId,
                reportDate: normalizedDate,
                questionId: {
                    in: Array.from(validQuestionIds),
                },
            },
        });

        if (cleanedAnswers.length === 0) {
            return;
        }

        await tx.reportAnswer.createMany({
            data: cleanedAnswers.map((row) => ({
                questionId: row.questionId,
                reportDate: normalizedDate,
                answer: row.answer,
                supervisorId,
                supervisorName: session.user.name || session.user.username || "Supervisor",
            })),
        });
    });

    revalidatePath("/reports");
    return {
        success: true,
        message: "Answers submitted",
        data: { submitted: cleanedAnswers.length },
    };
}

export async function getDailyReportSubmissions(
    reportDate: string
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        submissions: DailySubmissionDto[];
    }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    const normalizedDate = normalizeReportDate(reportDate);
    const supervisorId = Number(session.user.id);
    if (SUPERVISOR_ROLES.has(role) && !Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const whereClause = MANAGER_ROLES.has(role)
        ? { reportDate: normalizedDate }
        : {
            reportDate: normalizedDate,
            supervisorId,
        };

    const records = await prisma.dailyReportSubmission.findMany({
        where: whereClause,
        orderBy: [
            { supervisorName: "asc" },
            { roundNumber: "asc" },
            { updatedAt: "desc" },
        ],
    });

    return {
        success: true,
        message: "OK",
        data: {
            mode: MANAGER_ROLES.has(role) ? "manager" : "supervisor",
            submissions: records.map((record) => ({
                id: record.id,
                reportDate: record.reportDate.toISOString(),
                supervisorName: record.supervisorName,
                region: record.region,
                roundNumber: record.roundNumber,
                checklistAnswers: parseChecklistAnswers(record.checklistAnswers),
                updatedAt: record.updatedAt.toISOString(),
            })),
        },
    };
}

export async function submitDailyReportForm(
    reportDate: string,
    payload: DailySubmissionInput
): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !SUPERVISOR_ROLES.has(role)) {
        return { success: false, message: "Only supervisors can submit daily reports" };
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const normalizedDate = normalizeReportDate(reportDate);

    const supervisorName = payload.supervisorName?.trim();
    const region = payload.region?.trim();
    const roundNumber = payload.roundNumber?.trim();

    if (!supervisorName || !DAILY_REPORT_SUPERVISORS.includes(supervisorName)) {
        return { success: false, message: "Please select a valid supervisor name" };
    }

    if (!region || region.length < 2) {
        return { success: false, message: "Please enter a valid region" };
    }

    if (!roundNumber || !DAILY_REPORT_ROUNDS.includes(roundNumber)) {
        return { success: false, message: "Please select a valid round number" };
    }

    const checklistAnswers = sanitizeChecklistAnswers(payload.checklistAnswers || {});

    for (const section of DAILY_REPORT_SECTIONS) {
        if (section.required && checklistAnswers[section.id].length === 0) {
            return {
                success: false,
                message: `Please complete required section: ${section.title}`,
            };
        }
    }

    await prisma.dailyReportSubmission.upsert({
        where: {
            reportDate_supervisorId_roundNumber: {
                reportDate: normalizedDate,
                supervisorId,
                roundNumber,
            },
        },
        update: {
            supervisorName,
            region,
            checklistAnswers,
        },
        create: {
            reportDate: normalizedDate,
            supervisorId,
            supervisorName,
            region,
            roundNumber,
            checklistAnswers,
        },
    });

    revalidatePath("/reports");
    return { success: true, message: "Daily report submitted successfully" };
}
