"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
