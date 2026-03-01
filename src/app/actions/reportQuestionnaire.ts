"use server";

import { revalidatePath } from "next/cache";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/app/actions/audit";
import { logServerError, logServerInfo } from "@/lib/observability";
import {
    DAILY_REPORT_ROUNDS,
    DAILY_REPORT_SECTIONS,
    type DailyReportSection,
} from "@/lib/dailyReportTemplate";

export type ReportType = "daily" | "weekly" | "discharge";
export type WeeklyManagerRange = "daily" | "weekly" | "monthly";

interface ActionResult<T = undefined> {
    success: boolean;
    message: string;
    data?: T;
}

interface ActionError {
    success: false;
    message: string;
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
    supervisorId: number;
    supervisorName: string;
    reportDate: string;
    area: string;
    answer: string;
    updatedAt: string;
}

interface SupervisorAnswerDto {
    questionId: number;
    answer: string;
    area: string;
}

export interface DailySubmissionInput {
    region: string;
    roundNumber: string;
    checklistAnswers: Record<string, string[]>;
}

export interface WeeklyReportInput {
    area: string;
    areaType: string;
    specificWork: string;
}

export type DischargeRoomType = "normal_patient" | "isolation";

export interface DischargeEntryInput {
    dischargeDate: string;
    roomNumber: string;
    roomType: DischargeRoomType;
    area: string;
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

interface DischargeEntryDto {
    id: number;
    reportDate: string;
    dischargeDate: string;
    supervisorId: number;
    supervisorName: string;
    area: string;
    roomNumber: string;
    roomType: DischargeRoomType;
    updatedAt: string;
}

const REPORT_TYPES: ReportType[] = ["daily", "weekly", "discharge"];
const WEEKLY_MANAGER_RANGES: WeeklyManagerRange[] = ["daily", "weekly", "monthly"];
const MANAGER_ROLES = new Set(["manager", "admin"]);
const SUPERVISOR_ROLES = new Set(["supervisor", "night_supervisor"]);
const DISCHARGE_ROOM_TYPES: DischargeRoomType[] = ["normal_patient", "isolation"];

const DEFAULT_QUESTIONS: Record<ReportType, string[]> = {
    daily: [
        "What are the key updates for today?",
        "What issues or blockers need support?",
        "What actions are required for the next shift?",
    ],
    weekly: [
        "Area",
        "Type of area",
        "Specific work completed this week",
    ],
    discharge: [
        "Which items or tasks were discharged?",
        "Were there any delays or exceptions during discharge?",
        "What follow-up is required after discharge?",
    ],
};

const WEEKLY_TEMPLATE_QUESTIONS = [
    "Area",
    "Type of area",
    "Specific work completed this week",
] as const;

function coerceDailyReportSections(value: unknown): DailyReportSection[] {
    if (!Array.isArray(value)) {
        return [];
    }

    const seen = new Set<string>();
    const sections: DailyReportSection[] = [];

    for (const raw of value) {
        if (!raw || typeof raw !== "object") {
            continue;
        }

        const section = raw as Partial<DailyReportSection>;
        const id = typeof section.id === "string" ? section.id.trim() : "";
        if (!id || seen.has(id)) {
            continue;
        }

        const title = typeof section.title === "string" ? section.title.trim() : "";
        if (!title) {
            continue;
        }

        const items = Array.isArray(section.items)
            ? section.items
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter((item) => item.length > 0)
            : [];

        sections.push({
            id,
            title,
            required: Boolean(section.required),
            items,
        });
        seen.add(id);
    }

    return sections;
}

function isReportType(value: string): value is ReportType {
    return REPORT_TYPES.includes(value as ReportType);
}

function isWeeklyManagerRange(value: string): value is WeeklyManagerRange {
    return WEEKLY_MANAGER_RANGES.includes(value as WeeklyManagerRange);
}

function isDischargeRoomType(value: string): value is DischargeRoomType {
    return DISCHARGE_ROOM_TYPES.includes(value as DischargeRoomType);
}

function normalizeQuestionKey(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeAreaKey(value: string) {
    return value.trim().toUpperCase();
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

function parseDateInput(dateStr?: string): Date | null {
    if (!dateStr) {
        return null;
    }

    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return null;
    }

    const [year, month, day] = trimmed.split("-").map(Number);
    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        year <= 1900 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
    ) {
        return null;
    }

    return parsed;
}

function getRole(session: { user?: { role?: string } } | null | undefined) {
    return session?.user?.role || "";
}

async function ensureDischargeDateSchema(): Promise<ActionError | null> {
    try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'discharge_report_entries'
                  AND column_name = 'discharge_date'
            ) AS "exists"
        `;

        const hasColumn = rows[0]?.exists === true;
        if (hasColumn) {
            return null;
        }

        await prisma.$executeRawUnsafe(`
            ALTER TABLE discharge_report_entries
            ADD COLUMN IF NOT EXISTS discharge_date DATE
        `);
        await prisma.$executeRawUnsafe(`
            UPDATE discharge_report_entries
            SET discharge_date = report_date
            WHERE discharge_date IS NULL
        `);
        await prisma.$executeRawUnsafe(`
            ALTER TABLE discharge_report_entries
            ALTER COLUMN discharge_date SET NOT NULL
        `);
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS discharge_report_entries_discharge_date_idx
            ON discharge_report_entries(discharge_date)
        `);

        logServerInfo("discharge_schema_auto_migrated", {
            table: "discharge_report_entries",
            column: "discharge_date",
        });

        return null;
    } catch (error) {
        logServerError("discharge_schema_auto_migration_failed", error, {
            table: "discharge_report_entries",
            column: "discharge_date",
        });
        return {
            success: false,
            message:
                "Database update is required for discharge reports (missing discharge_date column). " +
                "Please run the latest SQL migration and refresh.",
        };
    }
}

async function ensureReportAnswersAreaSchema(): Promise<ActionError | null> {
    try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.columns
                WHERE table_schema = 'public'
                  AND table_name = 'report_answers'
                  AND column_name = 'area'
            ) AS "exists"
        `;

        const hasColumn = rows[0]?.exists === true;
        const indexRows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1
                FROM pg_indexes
                WHERE schemaname = 'public'
                  AND indexname = 'report_answers_question_date_supervisor_area_key'
            ) AS "exists"
        `;
        const hasScopedUniqueIndex = indexRows[0]?.exists === true;

        if (hasColumn && hasScopedUniqueIndex) {
            return null;
        }

        if (!hasColumn) {
            await prisma.$executeRawUnsafe(`
                ALTER TABLE report_answers
                ADD COLUMN IF NOT EXISTS area TEXT
            `);
            await prisma.$executeRawUnsafe(`
                WITH weekly_area_rows AS (
                    SELECT
                        ra.report_date,
                        ra.supervisor_id,
                        NULLIF(TRIM(ra.answer), '') AS area
                    FROM report_answers ra
                    INNER JOIN report_questions rq ON rq.id = ra.question_id
                    WHERE rq.report_type = 'weekly'
                      AND LOWER(REGEXP_REPLACE(TRIM(rq.question), '\\s+', ' ', 'g')) = 'area'
                      AND NULLIF(TRIM(ra.answer), '') IS NOT NULL
                )
                UPDATE report_answers target
                SET area = source.area
                FROM weekly_area_rows source
                WHERE target.report_date = source.report_date
                  AND target.supervisor_id = source.supervisor_id
                  AND EXISTS (
                      SELECT 1
                      FROM report_questions target_q
                      WHERE target_q.id = target.question_id
                        AND target_q.report_type = 'weekly'
                  )
                  AND (target.area IS NULL OR TRIM(target.area) = '')
            `);

            logServerInfo("report_answers_area_schema_auto_migrated", {
                table: "report_answers",
                column: "area",
            });
        }

        await prisma.$executeRawUnsafe(`
            UPDATE report_answers
            SET area = ''
            WHERE area IS NULL
        `);
        await prisma.$executeRawUnsafe(`
            ALTER TABLE report_answers
            ALTER COLUMN area SET DEFAULT ''
        `);
        await prisma.$executeRawUnsafe(`
            ALTER TABLE report_answers
            ALTER COLUMN area SET NOT NULL
        `);

        await prisma.$executeRawUnsafe(`
            DROP INDEX IF EXISTS report_answers_question_date_supervisor_key
        `);
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS report_answers_question_date_supervisor_area_key
            ON report_answers(question_id, report_date, supervisor_id, area)
        `);
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS report_answers_report_date_supervisor_area_idx
            ON report_answers(report_date, supervisor_id, area)
        `);

        return null;
    } catch (error) {
        logServerError("report_answers_area_schema_auto_migration_failed", error, {
            table: "report_answers",
            column: "area",
        });
        return {
            success: false,
            message:
                "Database update is required for weekly report area scoping. " +
                "Please run the latest SQL migration and refresh.",
        };
    }
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

async function ensureWeeklyTemplateQuestions(createdBy: string) {
    const weeklyQuestions = await prisma.reportQuestion.findMany({
        where: { reportType: "weekly" },
        select: { id: true, question: true, sortOrder: true, isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    });

    const byKey = new Map<string, typeof weeklyQuestions>();
    for (const question of weeklyQuestions) {
        const key = normalizeQuestionKey(question.question);
        const list = byKey.get(key) || [];
        list.push(question);
        byKey.set(key, list);
    }

    await prisma.$transaction(async (tx) => {
        const usedIds = new Set<number>();

        for (const [index, templateQuestion] of WEEKLY_TEMPLATE_QUESTIONS.entries()) {
            const key = normalizeQuestionKey(templateQuestion);
            const existing = (byKey.get(key) || []).find((item) => !usedIds.has(item.id));

            if (existing) {
                usedIds.add(existing.id);
                await tx.reportQuestion.update({
                    where: { id: existing.id },
                    data: {
                        question: templateQuestion,
                        sortOrder: index,
                        isActive: true,
                    },
                });

                const duplicates = (byKey.get(key) || []).filter((item) => item.id !== existing.id);
                for (const duplicate of duplicates) {
                    if (usedIds.has(duplicate.id)) {
                        continue;
                    }
                    usedIds.add(duplicate.id);
                    if (duplicate.isActive) {
                        await tx.reportQuestion.update({
                            where: { id: duplicate.id },
                            data: { isActive: false },
                        });
                    }
                }
                continue;
            }

            await tx.reportQuestion.create({
                data: {
                    reportType: "weekly",
                    question: templateQuestion,
                    sortOrder: index,
                    createdBy,
                    isActive: true,
                },
            });
        }

        for (const question of weeklyQuestions) {
            if (usedIds.has(question.id)) {
                continue;
            }
            if (!question.isActive) {
                continue;
            }
            await tx.reportQuestion.update({
                where: { id: question.id },
                data: { isActive: false },
            });
        }
    });
}

async function getActiveDailyTemplateSections(): Promise<DailyReportSection[]> {
    const schemaCheck = await ensureDailyReportTemplateSchema();
    if (schemaCheck) {
        return DAILY_REPORT_SECTIONS;
    }

    try {
        const record = await prisma.dailyReportTemplate.findFirst({
            where: { isActive: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });
        const sections = record ? coerceDailyReportSections(record.template) : [];
        return sections.length > 0 ? sections : DAILY_REPORT_SECTIONS;
    } catch (error) {
        logServerError("daily_template_load_failed", error);
        return DAILY_REPORT_SECTIONS;
    }
}

function sanitizeChecklistAnswers(
    input: Record<string, string[]>,
    sections: DailyReportSection[]
): Record<string, string[]> {
    const sectionMap = new Map(
        sections.map((section) => [section.id, new Set(section.items)])
    );

    const sanitized: Record<string, string[]> = {};

    for (const section of sections) {
        const allowed = sectionMap.get(section.id);
        const selected = Array.isArray(input[section.id]) ? input[section.id] : [];

        const cleaned = selected
            .map((item) => item.trim())
            .filter((item) => item.length > 0 && allowed?.has(item));

        sanitized[section.id] = Array.from(new Set(cleaned));
    }

    return sanitized;
}

function parseChecklistAnswers(
    raw: unknown,
    sections: DailyReportSection[]
): Record<string, string[]> {
    const empty: Record<string, string[]> = {};
    for (const section of sections) {
        empty[section.id] = [];
    }

    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return empty;
    }

    const parsed: Record<string, string[]> = { ...empty };

    for (const section of sections) {
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

async function getSupervisorAllowedRegions(
    supervisorId: number,
    reportDate: Date
): Promise<string[]> {
    const user = await prisma.user.findUnique({
        where: { id: supervisorId },
        select: { region: true, regions: true },
    });

    const values: string[] = [];

    const pushValues = (source: string | null | undefined) => {
        if (!source) {
            return;
        }
        source
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .forEach((item) => values.push(item));
    };

    pushValues(user?.region);
    pushValues(user?.regions);

    const substitutions = await prisma.staffAttendance.findMany({
        where: {
            coveredBy: supervisorId,
            date: reportDate,
            substituteActive: true,
        },
        include: {
            user: {
                select: {
                    region: true,
                    regions: true,
                },
            },
        },
    });

    for (const substitution of substitutions) {
        pushValues(substitution.user?.region);
        pushValues(substitution.user?.regions);
    }

    const dedup = new Map<string, string>();
    for (const value of values) {
        const key = value.toUpperCase();
        if (!dedup.has(key)) {
            dedup.set(key, value);
        }
    }

    return Array.from(dedup.values()).sort((a, b) => a.localeCompare(b, "ar"));
}

export async function getReportQuestionnaireData(
    reportType: string,
    reportDate: string,
    weeklyRange: WeeklyManagerRange = "daily"
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        questions: ReportQuestionDto[];
        managerAnswers: ManagerAnswerDto[];
        supervisorAnswers: SupervisorAnswerDto[];
        allowedRegions: string[];
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

    if (!isWeeklyManagerRange(weeklyRange)) {
        return { success: false, message: "Invalid weekly range" };
    }

    const normalizedDate = normalizeReportDate(reportDate);
    const areaSchemaCheck = await ensureReportAnswersAreaSchema();
    if (areaSchemaCheck) {
        return areaSchemaCheck;
    }

    const actorName = session.user.name || session.user.username || "manager";
    if (reportType === "weekly") {
        await ensureWeeklyTemplateQuestions(actorName);
    } else {
        await ensureDefaultQuestions(reportType, actorName);
    }

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
                ...(reportType === "weekly" ? {} : { reportDate: normalizedDate }),
                question: {
                    reportType,
                    isActive: true,
                },
            },
            select: {
                id: true,
                questionId: true,
                answer: true,
                supervisorId: true,
                supervisorName: true,
                reportDate: true,
                area: true,
                updatedAt: true,
                question: {
                    select: {
                        question: true,
                    },
                },
            },
            orderBy: [
                { reportDate: "desc" },
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
                    supervisorId: row.supervisorId,
                    supervisorName: row.supervisorName,
                    reportDate: row.reportDate.toISOString().slice(0, 10),
                    area: row.area,
                    answer: row.answer,
                    updatedAt: row.updatedAt.toISOString(),
                })),
                supervisorAnswers: [],
                allowedRegions: [],
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
            area: true,
            updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    const preferredWeeklyArea =
        reportType === "weekly"
            ? supervisorAnswers.find((row) => row.area.trim().length > 0)?.area || ""
            : "";
    const scopedSupervisorAnswers =
        reportType === "weekly" && preferredWeeklyArea
            ? supervisorAnswers.filter((row) => row.area === preferredWeeklyArea)
            : supervisorAnswers;

    const allowedRegions =
        reportType === "weekly"
            ? await getSupervisorAllowedRegions(supervisorId, normalizedDate)
            : [];

    return {
        success: true,
        message: "OK",
        data: {
            mode: "supervisor",
            questions,
            managerAnswers: [],
            supervisorAnswers: scopedSupervisorAnswers.map((row) => ({
                questionId: row.questionId,
                answer: row.answer,
                area: row.area,
            })),
            allowedRegions,
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
    const areaSchemaCheck = await ensureReportAnswersAreaSchema();
    if (areaSchemaCheck) {
        return areaSchemaCheck;
    }

    const actorName = session.user.name || session.user.username || "manager";
    if (reportType === "weekly") {
        await ensureWeeklyTemplateQuestions(actorName);
    } else {
        await ensureDefaultQuestions(reportType, actorName);
    }

    const activeQuestions = await prisma.reportQuestion.findMany({
        where: {
            reportType,
            isActive: true,
        },
        select: { id: true, question: true },
    });

    const validQuestionIds = new Set(activeQuestions.map((q) => q.id));

    const cleanedAnswers = answers
        .filter((row) => validQuestionIds.has(row.questionId))
        .map((row) => ({
            questionId: row.questionId,
            answer: row.answer.trim(),
        }))
        .filter((row) => row.answer.length > 0);

    let areaScope = "";
    if (reportType === "weekly") {
        const areaQuestionId =
            activeQuestions.find(
                (question) =>
                    normalizeQuestionKey(question.question) ===
                    normalizeQuestionKey(WEEKLY_TEMPLATE_QUESTIONS[0])
            )?.id || null;
        const submittedArea =
            (areaQuestionId &&
                cleanedAnswers.find((row) => row.questionId === areaQuestionId)?.answer.trim()) ||
            "";
        if (!submittedArea) {
            return { success: false, message: "Area is required for weekly report" };
        }

        const allowedRegions = await getSupervisorAllowedRegions(supervisorId, normalizedDate);
        const regionByKey = new Map(
            allowedRegions.map((region) => [normalizeAreaKey(region), region])
        );
        const normalizedSubmittedArea = normalizeAreaKey(submittedArea);

        if (allowedRegions.length > 0 && !regionByKey.has(normalizedSubmittedArea)) {
            return { success: false, message: "Selected area is not assigned to your account" };
        }

        areaScope = regionByKey.get(normalizedSubmittedArea) || submittedArea;
    }

    await prisma.$transaction(async (tx) => {
        const deleteWhere: Prisma.ReportAnswerWhereInput = {
            supervisorId,
            reportDate: normalizedDate,
            questionId: {
                in: Array.from(validQuestionIds),
            },
        };
        if (reportType === "weekly") {
            deleteWhere.area = areaScope;
        } else {
            deleteWhere.area = "";
        }

        await tx.reportAnswer.deleteMany({
            where: deleteWhere,
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
                area: reportType === "weekly" ? areaScope : "",
            })),
        });
    });

    revalidatePath("/reports");
    await logAudit(
        session.user.name || session.user.username || "Supervisor",
        "Submit Report Answers",
        `${reportType} report submitted (${cleanedAnswers.length} answers) for ${reportDate}${reportType === "weekly" ? `, area ${areaScope}` : ""
        }`,
        "Reports"
    );
    logServerInfo("report_answers_submitted", {
        reportType,
        reportDate,
        supervisorId,
        area: areaScope,
        submitted: cleanedAnswers.length,
    });
    return {
        success: true,
        message: "Answers submitted",
        data: { submitted: cleanedAnswers.length },
    };
}

export async function deleteSupervisorReportAnswers(
    reportType: string,
    reportDate: string,
    supervisorId: number,
    area?: string
): Promise<ActionResult<{ deleted: number }>> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    if (!isReportType(reportType) || reportType === "daily") {
        return { success: false, message: "Invalid report type" };
    }

    if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
        return { success: false, message: "Invalid supervisor id" };
    }

    const normalizedDate = normalizeReportDate(reportDate);
    const normalizedArea = area?.trim() || "";
    const areaSchemaCheck = await ensureReportAnswersAreaSchema();
    if (areaSchemaCheck) {
        return areaSchemaCheck;
    }

    const where: Prisma.ReportAnswerWhereInput = {
        supervisorId,
        reportDate: normalizedDate,
        question: {
            reportType,
        },
    };
    if (reportType === "weekly" && normalizedArea) {
        where.area = normalizedArea;
    }

    const deleted = await prisma.reportAnswer.deleteMany({
        where,
    });

    revalidatePath("/reports");
    await logAudit(
        session.user.name || session.user.username || "Manager",
        "Delete Supervisor Report",
        `Deleted ${reportType} report answers for supervisor ${supervisorId} on ${reportDate}${reportType === "weekly" && normalizedArea ? `, area ${normalizedArea}` : ""
        }`,
        "Reports"
    );
    logServerInfo("supervisor_report_deleted", {
        reportType,
        reportDate,
        supervisorId,
        area: normalizedArea || null,
        deleted: deleted.count,
    });
    return {
        success: true,
        message: deleted.count > 0 ? "Report deleted" : "No report was found to delete",
        data: { deleted: deleted.count },
    };
}

async function ensureDailyReportTemplateSchema(): Promise<ActionError | null> {
    try {
        const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
            SELECT EXISTS (
                SELECT 1
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name = 'daily_report_templates'
            ) AS "exists"
        `;

        const hasTable = rows[0]?.exists === true;
        if (hasTable) {
            return null;
        }

        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS daily_report_templates (
                id SERIAL PRIMARY KEY,
                template JSONB NOT NULL,
                created_by TEXT,
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMP NOT NULL DEFAULT NOW()
            )
        `);
        await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS daily_report_templates_is_active_idx
            ON daily_report_templates(is_active)
        `);
        await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS daily_report_templates_one_active_idx
            ON daily_report_templates((1))
            WHERE is_active
        `);

        // Seed a default active template.
        await prisma.dailyReportTemplate.create({
            data: {
                template: DAILY_REPORT_SECTIONS as unknown as Prisma.InputJsonValue,
                createdBy: "system",
                isActive: true,
            },
        });

        logServerInfo("daily_template_schema_auto_migrated", {
            table: "daily_report_templates",
        });

        return null;
    } catch (error) {
        logServerError("daily_template_schema_auto_migration_failed", error, {
            table: "daily_report_templates",
        });
        return {
            success: false,
            message:
                "Database update is required for daily report templates. " +
                "Please run the latest SQL migration and refresh.",
        };
    }
}

export async function getDailyReportTemplate(): Promise<
    ActionResult<{ sections: DailyReportSection[]; updatedAt: string | null }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    const schemaCheck = await ensureDailyReportTemplateSchema();
    if (schemaCheck) {
        // Fall back to the bundled template so the app remains usable.
        return {
            success: true,
            message: schemaCheck.message,
            data: { sections: DAILY_REPORT_SECTIONS, updatedAt: null },
        };
    }

    try {
        const record = await prisma.dailyReportTemplate.findFirst({
            where: { isActive: true },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        });

        if (!record) {
            return { success: true, message: "OK", data: { sections: DAILY_REPORT_SECTIONS, updatedAt: null } };
        }

        const sections = coerceDailyReportSections(record.template);
        return {
            success: true,
            message: "OK",
            data: {
                sections: sections.length > 0 ? sections : DAILY_REPORT_SECTIONS,
                updatedAt: record.updatedAt.toISOString(),
            },
        };
    } catch (error) {
        logServerError("daily_template_load_failed", error);
        return {
            success: true,
            message: "Failed to load template, using default.",
            data: { sections: DAILY_REPORT_SECTIONS, updatedAt: null },
        };
    }
}

export async function updateDailyReportTemplate(
    sections: DailyReportSection[]
): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    const schemaCheck = await ensureDailyReportTemplateSchema();
    if (schemaCheck) {
        return schemaCheck;
    }

    const cleaned = coerceDailyReportSections(sections);
    if (cleaned.length === 0) {
        return { success: false, message: "Template must include at least one section" };
    }

    for (const section of cleaned) {
        if (section.items.length === 0) {
            return { success: false, message: `Section "${section.title}" must include at least one item` };
        }
    }

    const actor = session.user.name || session.user.username || "Manager";

    await prisma.$transaction(async (tx) => {
        await tx.dailyReportTemplate.updateMany({
            where: { isActive: true },
            data: { isActive: false },
        });

        await tx.dailyReportTemplate.create({
            data: {
                template: cleaned as unknown as Prisma.InputJsonValue,
                createdBy: actor,
                isActive: true,
            },
        });
    });

    await logAudit(
        actor,
        "Update Daily Template",
        `Updated daily report template (sections: ${cleaned.length})`,
        "Reports"
    );
    logServerInfo("daily_template_updated", { sections: cleaned.length });

    revalidatePath("/reports");
    revalidatePath("/reports/daily-template");
    return { success: true, message: "Daily report template updated" };
}

export async function getDailyReportSubmissions(
    reportDate: string
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        submissions: DailySubmissionDto[];
        allowedRegions: string[];
    }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    const templateSections = await getActiveDailyTemplateSections();

    const normalizedDate = normalizeReportDate(reportDate);
    const supervisorId = Number(session.user.id);
    if (SUPERVISOR_ROLES.has(role) && !Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const isManager = MANAGER_ROLES.has(role);
    const whereClause = isManager
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
            mode: isManager ? "manager" : "supervisor",
            allowedRegions: isManager ? [] : await getSupervisorAllowedRegions(supervisorId, normalizedDate),
            submissions: records.map((record) => ({
                id: record.id,
                reportDate: record.reportDate.toISOString(),
                supervisorName: record.supervisorName,
                region: record.region,
                roundNumber: record.roundNumber,
                checklistAnswers: parseChecklistAnswers(record.checklistAnswers, templateSections),
                updatedAt: record.updatedAt.toISOString(),
            })),
        },
    };
}

export async function getDischargeReportData(
    reportDate: string
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        entries: DischargeEntryDto[];
        allowedRegions: string[];
    }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    const schemaCheck = await ensureDischargeDateSchema();
    if (schemaCheck) {
        return schemaCheck;
    }

    const normalizedDate = normalizeReportDate(reportDate);
    const isManager = MANAGER_ROLES.has(role);

    if (isManager) {
        const records = await prisma.dischargeReportEntry.findMany({
            where: { reportDate: normalizedDate },
            orderBy: [
                { supervisorName: "asc" },
                { sortOrder: "asc" },
                { id: "asc" },
            ],
        });

        return {
            success: true,
            message: "OK",
            data: {
                mode: "manager",
                allowedRegions: [],
                entries: records.map((record) => ({
                    id: record.id,
                    reportDate: record.reportDate.toISOString(),
                    dischargeDate: record.dischargeDate.toISOString(),
                    supervisorId: record.supervisorId,
                    supervisorName: record.supervisorName,
                    area: record.area,
                    roomNumber: record.roomNumber,
                    roomType: isDischargeRoomType(record.roomType)
                        ? record.roomType
                        : "normal_patient",
                    updatedAt: record.updatedAt.toISOString(),
                })),
            },
        };
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const [records, allowedRegions] = await Promise.all([
        prisma.dischargeReportEntry.findMany({
            where: {
                reportDate: normalizedDate,
                supervisorId,
            },
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        }),
        getSupervisorAllowedRegions(supervisorId, normalizedDate),
    ]);

    return {
        success: true,
        message: "OK",
        data: {
            mode: "supervisor",
            allowedRegions,
            entries: records.map((record) => ({
                id: record.id,
                reportDate: record.reportDate.toISOString(),
                dischargeDate: record.dischargeDate.toISOString(),
                supervisorId: record.supervisorId,
                supervisorName: record.supervisorName,
                area: record.area,
                roomNumber: record.roomNumber,
                roomType: isDischargeRoomType(record.roomType)
                    ? record.roomType
                    : "normal_patient",
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

    const supervisorName = (session.user.name || session.user.username || "").trim();
    const region = payload.region?.trim();
    const roundNumber = payload.roundNumber?.trim();

    if (!supervisorName) {
        return { success: false, message: "Supervisor profile name is required" };
    }

    if (!region || region.length < 2) {
        return { success: false, message: "Please enter a valid region" };
    }

    const allowedRegions = await getSupervisorAllowedRegions(supervisorId, normalizedDate);
    if (allowedRegions.length > 0 && !allowedRegions.includes(region)) {
        return { success: false, message: "Selected region is not assigned to your account" };
    }

    if (!roundNumber || !DAILY_REPORT_ROUNDS.includes(roundNumber)) {
        return { success: false, message: "Please select a valid round number" };
    }

    const templateSections = await getActiveDailyTemplateSections();
    const checklistAnswers = sanitizeChecklistAnswers(payload.checklistAnswers || {}, templateSections);

    for (const section of templateSections) {
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
    await logAudit(
        session.user.name || session.user.username || "Supervisor",
        "Submit Daily Report",
        `Submitted daily report for ${reportDate}, round ${roundNumber}, area ${region}`,
        "Reports"
    );
    logServerInfo("daily_report_submitted", {
        reportDate,
        supervisorId,
        roundNumber,
        region,
    });
    return { success: true, message: "Daily report submitted successfully" };
}

export async function submitDischargeReport(
    reportDate: string,
    rows: DischargeEntryInput[]
): Promise<ActionResult<{ submitted: number }>> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !SUPERVISOR_ROLES.has(role)) {
        return { success: false, message: "Only supervisors can submit discharge reports" };
    }

    const schemaCheck = await ensureDischargeDateSchema();
    if (schemaCheck) {
        return schemaCheck;
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const normalizedDate = normalizeReportDate(reportDate);
    const supervisorName = (session.user.name || session.user.username || "").trim();
    if (!supervisorName) {
        return { success: false, message: "Supervisor profile name is required" };
    }

    const allowedRegions = await getSupervisorAllowedRegions(supervisorId, normalizedDate);
    const regionByKey = new Map(
        allowedRegions.map((region) => [region.trim().toUpperCase(), region])
    );

    const cleaned: Array<{
        dischargeDate: Date;
        roomNumber: string;
        roomType: DischargeRoomType;
        area: string;
        sortOrder: number;
    }> = [];

    for (const [index, row] of rows.entries()) {
        const dischargeDateInput = row?.dischargeDate?.trim() || "";
        const roomNumber = row?.roomNumber?.trim() || "";
        const roomType = row?.roomType?.trim() || "";
        const area = row?.area?.trim() || "";

        const hasAnyValue =
            dischargeDateInput.length > 0 ||
            roomNumber.length > 0 ||
            area.length > 0;
        if (!hasAnyValue) {
            continue;
        }

        if (dischargeDateInput.length === 0) {
            return {
                success: false,
                message: `Discharge date is required in row ${index + 1}`,
            };
        }

        const dischargeDate = parseDateInput(dischargeDateInput);
        if (!dischargeDate) {
            return {
                success: false,
                message: `Discharge date is invalid in row ${index + 1}`,
            };
        }

        if (roomNumber.length === 0) {
            return {
                success: false,
                message: `Room number is required in row ${index + 1}`,
            };
        }

        if (!isDischargeRoomType(roomType)) {
            return {
                success: false,
                message: `Room type is invalid in row ${index + 1}`,
            };
        }

        if (area.length === 0) {
            return {
                success: false,
                message: `Area is required in row ${index + 1}`,
            };
        }

        const normalizedArea =
            regionByKey.get(area.toUpperCase()) || area;

        if (allowedRegions.length > 0 && !regionByKey.has(area.toUpperCase())) {
            return {
                success: false,
                message: `Area is not assigned to your account in row ${index + 1}`,
            };
        }

        cleaned.push({
            dischargeDate,
            roomNumber,
            roomType,
            area: normalizedArea,
            sortOrder: cleaned.length,
        });
    }

    await prisma.$transaction(async (tx) => {
        await tx.dischargeReportEntry.deleteMany({
            where: {
                reportDate: normalizedDate,
                supervisorId,
            },
        });

        if (cleaned.length === 0) {
            return;
        }

        await tx.dischargeReportEntry.createMany({
            data: cleaned.map((entry) => ({
                reportDate: normalizedDate,
                dischargeDate: entry.dischargeDate,
                supervisorId,
                supervisorName,
                area: entry.area,
                roomNumber: entry.roomNumber,
                roomType: entry.roomType,
                sortOrder: entry.sortOrder,
            })),
        });
    });

    revalidatePath("/reports");
    await logAudit(
        session.user.name || session.user.username || "Supervisor",
        "Submit Discharge Report",
        `Submitted discharge report for submission date ${reportDate} (${cleaned.length} rows)`,
        "Reports"
    );
    logServerInfo("discharge_report_submitted", {
        reportDate,
        supervisorId,
        submitted: cleaned.length,
    });
    return {
        success: true,
        message: "Discharge report submitted successfully",
        data: { submitted: cleaned.length },
    };
}

export async function deleteDailyReportSubmission(
    submissionId: number
): Promise<ActionResult> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    if (!Number.isFinite(submissionId) || submissionId <= 0) {
        return { success: false, message: "Invalid submission id" };
    }

    try {
        await prisma.dailyReportSubmission.delete({
            where: { id: submissionId },
        });
    } catch {
        return { success: false, message: "Daily report not found" };
    }

    revalidatePath("/reports");
    await logAudit(
        session.user.name || session.user.username || "Manager",
        "Delete Daily Report",
        `Deleted daily report submission ${submissionId}`,
        "Reports"
    );
    logServerInfo("daily_report_deleted", {
        submissionId,
    });
    return { success: true, message: "Daily report deleted" };
}

export async function deleteDischargeSupervisorReport(
    reportDate: string,
    supervisorId: number,
    scope?: { year: number; month: number }
): Promise<ActionResult<{ deleted: number }>> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || !MANAGER_ROLES.has(role)) {
        return { success: false, message: "Unauthorized" };
    }

    if (!Number.isFinite(supervisorId) || supervisorId <= 0) {
        return { success: false, message: "Invalid supervisor id" };
    }

    const where: Prisma.DischargeReportEntryWhereInput = {
        supervisorId,
    };
    let auditTarget = `submission date ${reportDate}`;

    if (scope) {
        const { year, month } = scope;
        if (
            !Number.isInteger(year) ||
            !Number.isInteger(month) ||
            year < 1900 ||
            year > 9999 ||
            month < 1 ||
            month > 12
        ) {
            return { success: false, message: "Invalid monthly scope" };
        }

        const startDate = new Date(Date.UTC(year, month - 1, 1));
        const endDate = new Date(Date.UTC(year, month, 0));
        where.dischargeDate = {
            gte: startDate,
            lte: endDate,
        };
        auditTarget = `month ${year}-${String(month).padStart(2, "0")}`;
    } else {
        const normalizedDate = normalizeReportDate(reportDate);
        where.reportDate = normalizedDate;
    }

    const deleted = await prisma.dischargeReportEntry.deleteMany({
        where,
    });

    revalidatePath("/reports");
    await logAudit(
        session.user.name || session.user.username || "Manager",
        "Delete Discharge Report",
        `Deleted discharge report entries for supervisor ${supervisorId} on ${auditTarget}`,
        "Reports"
    );

    logServerInfo("discharge_report_deleted", {
        reportDate,
        supervisorId,
        deleted: deleted.count,
        ...(scope ? { year: scope.year, month: scope.month } : {}),
    });
    return {
        success: true,
        message: deleted.count > 0 ? "Discharge report deleted" : "No discharge report found to delete",
        data: { deleted: deleted.count },
    };
}

export async function getMonthlyDischargeReportData(
    year: number,
    month: number
): Promise<
    ActionResult<{
        mode: "manager" | "supervisor";
        entries: DischargeEntryDto[];
        allowedRegions: string[];
    }>
> {
    const session = await getServerSession(authOptions);
    const role = getRole(session);

    if (!session || (!MANAGER_ROLES.has(role) && !SUPERVISOR_ROLES.has(role))) {
        return { success: false, message: "Unauthorized" };
    }

    const schemaCheck = await ensureDischargeDateSchema();
    if (schemaCheck) {
        return schemaCheck;
    }

    // Calculate start and end dates for the month
    // Month is 1-indexed (1 = January, 12 = December)
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month, 0)); // Last day of the month

    const isManager = MANAGER_ROLES.has(role);

    if (isManager) {
        const records = await prisma.dischargeReportEntry.findMany({
            where: {
                dischargeDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            orderBy: [
                { dischargeDate: "desc" },
                { supervisorName: "asc" },
                { id: "asc" },
            ],
        });

        return {
            success: true,
            message: "OK",
            data: {
                mode: "manager",
                allowedRegions: [],
                entries: records.map((record) => ({
                    id: record.id,
                    reportDate: record.reportDate.toISOString(),
                    dischargeDate: record.dischargeDate.toISOString(),
                    supervisorId: record.supervisorId,
                    supervisorName: record.supervisorName,
                    area: record.area,
                    roomNumber: record.roomNumber,
                    roomType: isDischargeRoomType(record.roomType)
                        ? record.roomType
                        : "normal_patient",
                    updatedAt: record.updatedAt.toISOString(),
                })),
            },
        };
    }

    const supervisorId = Number(session.user.id);
    if (!Number.isFinite(supervisorId)) {
        return { success: false, message: "Invalid supervisor session" };
    }

    const [records, allowedRegions] = await Promise.all([
        prisma.dischargeReportEntry.findMany({
            where: {
                supervisorId,
                dischargeDate: {
                    gte: startDate,
                    lte: endDate,
                },
            },
            orderBy: [
                { dischargeDate: "desc" },
                { id: "asc" },
            ],
        }),
        getSupervisorAllowedRegions(supervisorId, new Date()), // Region check is general, so current date is fine/safe enough or we could pick start of month
    ]);

    return {
        success: true,
        message: "OK",
        data: {
            mode: "supervisor",
            allowedRegions,
            entries: records.map((record) => ({
                id: record.id,
                reportDate: record.reportDate.toISOString(),
                dischargeDate: record.dischargeDate.toISOString(),
                supervisorId: record.supervisorId,
                supervisorName: record.supervisorName,
                area: record.area,
                roomNumber: record.roomNumber,
                roomType: isDischargeRoomType(record.roomType)
                    ? record.roomType
                    : "normal_patient",
                updatedAt: record.updatedAt.toISOString(),
            })),
        },
    };
}
