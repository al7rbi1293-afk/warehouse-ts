"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    deleteDischargeSupervisorReport,
    deleteDailyReportSubmission,
    deleteSupervisorReportAnswers,
    getDischargeReportData,

    getMonthlyDischargeReportData,
    getDailyReportTemplate,
    getDailyReportSubmissions,
    getReportQuestionnaireData,
    submitDischargeReport,
    submitDailyReportForm,
    submitSupervisorReportAnswers,
    type DischargeEntryInput,
    type DischargeRoomType,
    type DailySubmissionInput,
    type ReportType,
    type WeeklyManagerRange,
} from "@/app/actions/reportQuestionnaire";
import {
    DAILY_REPORT_ROUNDS,
    DAILY_REPORT_SECTIONS,
    type DailyReportSection,
} from "@/lib/dailyReportTemplate";
import {
    getRoomOptionsForArea,
    hasMultipleRoomValues,
    normalizeSingleRoomValue,
    splitRoomValues,
} from "@/lib/dischargeLocations";
import { DischargeSpreadsheet } from "@/components/reports/DischargeSpreadsheet";

interface ReportsClientProps {
    userRole: string;
    userName?: string;
}

interface ReportQuestionItem {
    id: number;
    question: string;
    sortOrder: number;
}

interface ManagerAnswerItem {
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

interface DailySubmissionItem {
    id: number;
    reportDate: string;
    supervisorName: string;
    region: string;
    roundNumber: string;
    checklistAnswers: Record<string, string[]>;
    updatedAt: string;
}

interface DischargeEntryItem {
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

interface DailyFormState {
    region: string;
    roundNumber: string;
    checklistAnswers: Record<string, string[]>;
}

interface WeeklyFormState {
    area: string;
    areaType: string;
    specificWork: string;
}

type DischargeRowErrors = Partial<Record<"dischargeDate" | "roomNumber" | "area", string>>;
type DischargeSortKey =
    | "submission_desc"
    | "submission_asc"
    | "discharge_desc"
    | "discharge_asc"
    | "room_asc"
    | "room_desc";
type DailySortKey =
    | "updated_desc"
    | "updated_asc"
    | "supervisor_asc"
    | "supervisor_desc"
    | "area_asc"
    | "area_desc"
    | "round_asc"
    | "round_desc";

const WEEKLY_QUESTION_KEYS = {
    area: "Area",
    areaType: "Type of area",
    specificWork: "Specific work completed this week",
} as const;

const WEEKLY_AREA_TYPE_OPTIONS = [
    "High critical",
    "Mid critical",
    "Low critical",
];

const DISCHARGE_MANAGER_PAGE_SIZE = 5;
const DAILY_MANAGER_PAGE_SIZE = 8;
const DAILY_DRAFT_PREFIX = "reports.daily.draft";
const WEEKLY_DRAFT_PREFIX = "reports.weekly.draft";
const DISCHARGE_DRAFT_PREFIX = "reports.discharge.draft";

const reportTabs: Array<{ key: ReportType; label: string }> = [
    { key: "daily", label: "Daily report" },
    { key: "weekly", label: "Weekly report" },
    { key: "discharge", label: "Discharge report" },
];

const managerRoles = new Set(["manager", "admin"]);
const supervisorRoles = new Set(["supervisor", "night_supervisor"]);

function getTodayLocalDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function getShiftedLocalDateString(offsetDays: number) {
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function isValidDateInput(dateStr: string) {
    const trimmed = dateStr.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return false;
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
        return false;
    }

    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() === month - 1 &&
        parsed.getUTCDate() === day
    );
}

function getDailyDraftKey(date: string) {
    return `${DAILY_DRAFT_PREFIX}:${date}`;
}

function getWeeklyDraftKey(date: string) {
    return `${WEEKLY_DRAFT_PREFIX}:${date}`;
}

function getDischargeDraftKey(date: string) {
    return `${DISCHARGE_DRAFT_PREFIX}:${date}`;
}

function readDraft<T>(key: string): T | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = window.localStorage.getItem(key);
        if (!raw) {
            return null;
        }
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeDraft(key: string, value: unknown) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage quota and serialization failures.
    }
}

function clearDraft(key: string) {
    if (typeof window === "undefined") {
        return;
    }

    try {
        window.localStorage.removeItem(key);
    } catch {
        // Ignore storage cleanup failures.
    }
}

function createChecklistDefaults(sections: DailyReportSection[]) {
    return sections.reduce((acc, section) => {
        acc[section.id] = [];
        return acc;
    }, {} as Record<string, string[]>);
}

function createEmptyDischargeRow(): DischargeEntryInput {
    return {
        dischargeDate: "",
        roomNumber: "",
        roomType: "normal_patient",
        area: "",
    };
}

function coerceDailyDraft(value: unknown, sections: DailyReportSection[]): DailyFormState | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const draft = value as Partial<DailyFormState>;
    const checklistDefaults = createChecklistDefaults(sections);
    const checklistAnswers = { ...checklistDefaults };

    if (draft.checklistAnswers && typeof draft.checklistAnswers === "object") {
        for (const section of sections) {
            const row = draft.checklistAnswers[section.id];
            if (!Array.isArray(row)) {
                continue;
            }
            const allowedItems = new Set(section.items);
            checklistAnswers[section.id] = row
                .filter((item): item is string => typeof item === "string")
                .map((item) => item.trim())
                .filter((item) => item.length > 0 && allowedItems.has(item));
        }
    }

    return {
        region: typeof draft.region === "string" ? draft.region : "",
        roundNumber:
            typeof draft.roundNumber === "string" && draft.roundNumber
                ? draft.roundNumber
                : (DAILY_REPORT_ROUNDS[0] || ""),
        checklistAnswers,
    };
}

function coerceWeeklyDraft(value: unknown): WeeklyFormState | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const draft = value as Partial<WeeklyFormState>;
    return {
        area: typeof draft.area === "string" ? draft.area : "",
        areaType:
            typeof draft.areaType === "string" && WEEKLY_AREA_TYPE_OPTIONS.includes(draft.areaType)
                ? draft.areaType
                : (WEEKLY_AREA_TYPE_OPTIONS[0] || "High critical"),
        specificWork: typeof draft.specificWork === "string" ? draft.specificWork : "",
    };
}

function coerceDischargeDraftRows(value: unknown): DischargeEntryInput[] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value
        .map((row) => {
            if (!row || typeof row !== "object") {
                return null;
            }

            const typed = row as Partial<DischargeEntryInput>;
            const roomType =
                typed.roomType === "isolation" || typed.roomType === "normal_patient"
                    ? typed.roomType
                    : "normal_patient";

            return {
                dischargeDate: typeof typed.dischargeDate === "string" ? typed.dischargeDate : "",
                roomNumber: typeof typed.roomNumber === "string" ? typed.roomNumber : "",
                roomType,
                area: typeof typed.area === "string" ? typed.area : "",
            } satisfies DischargeEntryInput;
        })
        .filter((row): row is DischargeEntryInput => row !== null);
}

function getDischargeRoomTypeLabel(roomType: DischargeRoomType) {
    return roomType === "isolation" ? "Isolation" : "Normal patient";
}

function expandDischargeEntriesByRoom(entries: DischargeEntryItem[]) {
    return entries.flatMap((entry) => {
        const roomValues = splitRoomValues(entry.roomNumber);
        if (roomValues.length <= 1) {
            return [
                {
                    ...entry,
                    roomNumber: normalizeSingleRoomValue(entry.roomNumber),
                },
            ];
        }

        return roomValues.map((roomNumber) => ({
            ...entry,
            roomNumber,
        }));
    });
}

function buildDischargePayload(
    rows: DischargeEntryInput[],
    allowedRegions: string[]
): {
    payload: DischargeEntryInput[];
    errorsByRow: Record<number, DischargeRowErrors>;
} {
    const regionByKey = new Map(
        allowedRegions.map((region) => [region.trim().toUpperCase(), region.trim()])
    );

    const payload: DischargeEntryInput[] = [];
    const errorsByRow: Record<number, DischargeRowErrors> = {};

    for (const [index, row] of rows.entries()) {
        const dischargeDate = row.dischargeDate.trim();
        const roomNumber = normalizeSingleRoomValue(row.roomNumber);
        const area = row.area.trim();
        const hasAnyValue =
            dischargeDate.length > 0 ||
            roomNumber.length > 0 ||
            area.length > 0;

        if (!hasAnyValue) {
            continue;
        }

        const rowErrors: DischargeRowErrors = {};
        if (!dischargeDate) {
            rowErrors.dischargeDate = "Discharge date is required";
        } else if (!isValidDateInput(dischargeDate)) {
            rowErrors.dischargeDate = "Discharge date is invalid";
        }

        if (!roomNumber) {
            rowErrors.roomNumber = "Room number is required";
        } else if (hasMultipleRoomValues(roomNumber)) {
            rowErrors.roomNumber = "Only one room is allowed per row";
        }

        const normalizedArea = regionByKey.get(area.toUpperCase()) || area;
        if (!area) {
            rowErrors.area = "Area is required";
        } else if (allowedRegions.length > 0 && !regionByKey.has(area.toUpperCase())) {
            rowErrors.area = "Area is not assigned to your account";
        }

        const roomOptions = getRoomOptionsForArea(normalizedArea);
        if (roomOptions.length > 0 && roomNumber && !roomOptions.includes(roomNumber)) {
            rowErrors.roomNumber = "Room is invalid for the selected area";
        }

        if (Object.keys(rowErrors).length > 0) {
            errorsByRow[index] = rowErrors;
            continue;
        }

        payload.push({
            dischargeDate,
            roomNumber,
            roomType: row.roomType,
            area: normalizedArea,
        });
    }

    return {
        payload,
        errorsByRow,
    };
}

function normalizeQuestionKey(value: string) {
    return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function createWeeklyDefaults(): WeeklyFormState {
    return {
        area: "",
        areaType: WEEKLY_AREA_TYPE_OPTIONS[0] || "High critical",
        specificWork: "",
    };
}

function getWeeklyQuestionIdMap(questions: ReportQuestionItem[]) {
    const byNormalized = new Map<string, number>();
    for (const question of questions) {
        byNormalized.set(normalizeQuestionKey(question.question), question.id);
    }

    return {
        area: byNormalized.get(normalizeQuestionKey(WEEKLY_QUESTION_KEYS.area)) || null,
        areaType: byNormalized.get(normalizeQuestionKey(WEEKLY_QUESTION_KEYS.areaType)) || null,
        specificWork: byNormalized.get(normalizeQuestionKey(WEEKLY_QUESTION_KEYS.specificWork)) || null,
    };
}

export function ReportsClient({ userRole, userName }: ReportsClientProps) {
    const [activeTab, setActiveTab] = useState<ReportType>("daily");
    const [reportDate, setReportDate] = useState(getTodayLocalDateString());
    const [questions, setQuestions] = useState<ReportQuestionItem[]>([]);
    const [managerAnswers, setManagerAnswers] = useState<ManagerAnswerItem[]>([]);
    const [dailySubmissions, setDailySubmissions] = useState<DailySubmissionItem[]>([]);
    const [dailyTemplateSections, setDailyTemplateSections] = useState<DailyReportSection[]>(
        DAILY_REPORT_SECTIONS
    );
    const [dailyTemplateUpdatedAt, setDailyTemplateUpdatedAt] = useState<string | null>(null);
    const [dischargeEntries, setDischargeEntries] = useState<DischargeEntryItem[]>([]);
    const [dischargeRows, setDischargeRows] = useState<DischargeEntryInput[]>([
        createEmptyDischargeRow(),
    ]);
    const [dischargeAllowedRegions, setDischargeAllowedRegions] = useState<string[]>([]);
    const [dischargeLoadError, setDischargeLoadError] = useState<string | null>(null);
    const [weeklyAllowedRegions, setWeeklyAllowedRegions] = useState<string[]>([]);
    const [availableRegions, setAvailableRegions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isExporting, setIsExporting] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [dailyForm, setDailyForm] = useState<DailyFormState>({
        region: "",
        roundNumber: DAILY_REPORT_ROUNDS[0] || "",
        checklistAnswers: createChecklistDefaults(DAILY_REPORT_SECTIONS),
    });
    const [weeklyForm, setWeeklyForm] = useState<WeeklyFormState>(createWeeklyDefaults());
    const [dischargeRowErrors, setDischargeRowErrors] = useState<Record<number, DischargeRowErrors>>({});
    const [dischargeSearchTerm, setDischargeSearchTerm] = useState("");
    const [dischargeAreaFilter, setDischargeAreaFilter] = useState("all");
    const [dischargeSortKey, setDischargeSortKey] = useState<DischargeSortKey>("submission_desc");
    const [dischargePage, setDischargePage] = useState(1);
    const [dailySearchTerm, setDailySearchTerm] = useState("");
    const [dailyAreaFilter, setDailyAreaFilter] = useState("all");
    const [dailyRoundFilter, setDailyRoundFilter] = useState("all");
    const [dailySortKey, setDailySortKey] = useState<DailySortKey>("updated_desc");
    const [dailyPage, setDailyPage] = useState(1);
    const weeklyManagerRange: WeeklyManagerRange = "weekly";


    // Monthly Discharge State
    const [dischargeReportType, setDischargeReportType] = useState<"daily" | "monthly">("daily");
    const [dischargeMonth, setDischargeMonth] = useState(new Date().getMonth() + 1);
    const [dischargeYear, setDischargeYear] = useState(new Date().getFullYear());

    const isManager = managerRoles.has(userRole);
    const isSupervisor = supervisorRoles.has(userRole);
    const loadTokenRef = useRef(0);

    const beginLoad = () => {
        const token = loadTokenRef.current + 1;
        loadTokenRef.current = token;
        setIsLoading(true);
        return token;
    };

    const isLatestLoad = (token: number) => token === loadTokenRef.current;

    const loadQuestionnaireData = async (
        token: number,
        requestedTab: ReportType,
        requestedDate: string,
        requestedWeeklyRange: WeeklyManagerRange
    ) => {
        try {
            const result = await getReportQuestionnaireData(
                requestedTab,
                requestedDate,
                requestedWeeklyRange
            );

            if (!isLatestLoad(token)) {
                return;
            }

            if (!result.success || !result.data) {
                toast.error(result.message || "Failed to load report questionnaire");
                setQuestions([]);
                setManagerAnswers([]);
                return;
            }

            setQuestions(result.data.questions);
            setManagerAnswers(result.data.managerAnswers);

            const mappedAnswers = result.data.supervisorAnswers.reduce((acc, row) => {
                acc[row.questionId] = row.answer;
                return acc;
            }, {} as Record<number, string>);

            if (requestedTab === "weekly") {
                const allowed = result.data.allowedRegions || [];
                setWeeklyAllowedRegions(allowed);

                const questionIdMap = getWeeklyQuestionIdMap(result.data.questions);
                const areaValue = questionIdMap.area ? (mappedAnswers[questionIdMap.area] || "") : "";
                const areaTypeValue = questionIdMap.areaType ? (mappedAnswers[questionIdMap.areaType] || "") : "";
                const normalizedAreaType = WEEKLY_AREA_TYPE_OPTIONS.includes(areaTypeValue)
                    ? areaTypeValue
                    : (WEEKLY_AREA_TYPE_OPTIONS[0] || "High critical");

                setWeeklyForm({
                    area: areaValue,
                    areaType: normalizedAreaType,
                    specificWork: questionIdMap.specificWork
                        ? (mappedAnswers[questionIdMap.specificWork] || "")
                        : "",
                });

                if (isSupervisor) {
                    const draft = coerceWeeklyDraft(
                        readDraft<WeeklyFormState>(getWeeklyDraftKey(requestedDate))
                    );
                    if (draft) {
                        setWeeklyForm((prev) => ({
                            area: draft.area || prev.area,
                            areaType: draft.areaType || prev.areaType,
                            specificWork: draft.specificWork || prev.specificWork,
                        }));
                    }
                }
            } else {
                setWeeklyAllowedRegions([]);
            }
        } catch {
            if (!isLatestLoad(token)) {
                return;
            }

            toast.error("Failed to load report questionnaire");
            setQuestions([]);
            setManagerAnswers([]);
            if (requestedTab === "weekly") {
                setWeeklyAllowedRegions([]);
            }
        } finally {
            if (isLatestLoad(token)) {
                setIsLoading(false);
            }
        }
    };

    const loadDailyData = async (token: number, requestedDate: string) => {
        try {
            const [result, templateResult] = await Promise.all([
                getDailyReportSubmissions(requestedDate),
                getDailyReportTemplate(),
            ]);

            if (!isLatestLoad(token)) {
                return;
            }

            const templateSections =
                templateResult.success && templateResult.data
                    ? templateResult.data.sections
                    : DAILY_REPORT_SECTIONS;
            setDailyTemplateSections(templateSections);
            setDailyTemplateUpdatedAt(
                templateResult.success && templateResult.data ? templateResult.data.updatedAt : null
            );

            if (!result.success || !result.data) {
                toast.error(result.message || "Failed to load daily reports");
                setDailySubmissions([]);
                return;
            }

            setDailySubmissions(result.data.submissions);
            setAvailableRegions(result.data.allowedRegions || []);

            if (isSupervisor) {
                const latest = result.data.submissions[0];
                const allowed = result.data.allowedRegions || [];
                const draft = coerceDailyDraft(
                    readDraft<DailyFormState>(getDailyDraftKey(requestedDate)),
                    templateSections
                );

                setDailyForm((prev) => {
                    const latestRegion = latest?.region || "";
                    const canUseLatest =
                        latestRegion && (allowed.length === 0 || allowed.includes(latestRegion));
                    const canKeepCurrent =
                        prev.region && (allowed.length === 0 || allowed.includes(prev.region));
                    const fallbackRegion = canUseLatest
                        ? latestRegion
                        : canKeepCurrent
                            ? prev.region
                            : (allowed[0] || "");
                    const nextRegion =
                        draft?.region && (allowed.length === 0 || allowed.includes(draft.region))
                            ? draft.region
                            : fallbackRegion;

                    const nextChecklistAnswers = draft?.checklistAnswers
                        ? draft.checklistAnswers
                        : templateSections.reduce((acc, section) => {
                            const currentRow = prev.checklistAnswers[section.id] || [];
                            const allowedItems = new Set(section.items);
                            acc[section.id] = Array.from(
                                new Set(
                                    currentRow
                                        .filter((item): item is string => typeof item === "string")
                                        .map((item) => item.trim())
                                        .filter((item) => item.length > 0 && allowedItems.has(item))
                                )
                            );
                            return acc;
                        }, {} as Record<string, string[]>);

                    return {
                        ...prev,
                        region: nextRegion,
                        roundNumber: draft?.roundNumber || prev.roundNumber,
                        checklistAnswers: nextChecklistAnswers,
                    };
                });
            }
        } catch {
            if (!isLatestLoad(token)) {
                return;
            }

            toast.error("Failed to load daily reports");
            setDailySubmissions([]);
        } finally {
            if (isLatestLoad(token)) {
                setIsLoading(false);
            }
        }
    };

    const loadDischargeData = async (token: number, requestedDate: string) => {
        try {
            let result;
            if (dischargeReportType === "monthly") {
                result = await getMonthlyDischargeReportData(dischargeYear, dischargeMonth);
            } else {
                result = await getDischargeReportData(requestedDate);
            }

            if (!isLatestLoad(token)) {
                return;
            }

            if (!result.success || !result.data) {
                const message = result.message || "Failed to load discharge reports";
                toast.error(message);
                setDischargeLoadError(message);
                if (!isSupervisor) {
                    setDischargeEntries([]);
                }
                return;
            }

            setDischargeLoadError(null);
            const expandedEntries = expandDischargeEntriesByRoom(result.data.entries);
            setDischargeEntries(expandedEntries);
            setDischargeAllowedRegions(result.data.allowedRegions || []);

            if (isSupervisor) {
                const rowsFromServer = expandedEntries.map((entry) => ({
                    dischargeDate: entry.dischargeDate.slice(0, 10),
                    roomNumber: entry.roomNumber,
                    roomType: entry.roomType,
                    area: entry.area,
                }));
                const draftRows = coerceDischargeDraftRows(
                    readDraft<DischargeEntryInput[]>(getDischargeDraftKey(requestedDate))
                );

                setDischargeRows(
                    rowsFromServer.length > 0
                        ? rowsFromServer
                        : draftRows.length > 0
                            ? draftRows
                            : [createEmptyDischargeRow()]
                );
                setDischargeRowErrors({});
            } else {
                setDischargeRows([createEmptyDischargeRow()]);
            }
        } catch {
            if (!isLatestLoad(token)) {
                return;
            }

            const message = "Failed to load discharge reports";
            toast.error(message);
            setDischargeLoadError(message);
            if (!isSupervisor) {
                setDischargeEntries([]);
            }
        } finally {
            if (isLatestLoad(token)) {
                setIsLoading(false);
            }
        }
    };

    useEffect(() => {
        const token = beginLoad();
        if (activeTab === "daily") {
            void loadDailyData(token, reportDate);
        } else if (activeTab === "discharge") {
            setDischargeLoadError(null);
            void loadDischargeData(token, reportDate);
        } else {
            void loadQuestionnaireData(token, activeTab, reportDate, weeklyManagerRange);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, reportDate, dischargeReportType, dischargeMonth, dischargeYear, weeklyManagerRange]);

    useEffect(() => {
        if (!isSupervisor) {
            return;
        }
        writeDraft(getDailyDraftKey(reportDate), dailyForm);
    }, [dailyForm, isSupervisor, reportDate]);

    useEffect(() => {
        if (!isSupervisor) {
            return;
        }
        writeDraft(getWeeklyDraftKey(reportDate), weeklyForm);
    }, [isSupervisor, reportDate, weeklyForm]);

    useEffect(() => {
        if (!isSupervisor) {
            return;
        }
        writeDraft(getDischargeDraftKey(reportDate), dischargeRows);
    }, [dischargeRows, isSupervisor, reportDate]);

    const handleRetryDischargeLoad = () => {
        const token = beginLoad();
        setDischargeLoadError(null);
        void loadDischargeData(token, reportDate);
    };

    const handleDischargeRowsChange = (nextRows: DischargeEntryInput[]) => {
        setDischargeRows(nextRows);
        setDischargeRowErrors({});
    };

    const handleSubmitWeeklyReport = () => {
        const questionIdMap = getWeeklyQuestionIdMap(questions);
        const missingTemplateQuestion = Object.values(questionIdMap).some((id) => id === null);
        if (missingTemplateQuestion) {
            toast.error("Weekly report template is not ready. Please refresh and try again.");
            return;
        }

        if (!weeklyForm.area.trim()) {
            toast.error("Please select area");
            return;
        }

        if (!weeklyForm.areaType.trim()) {
            toast.error("Please select type of area");
            return;
        }

        if (!weeklyForm.specificWork.trim()) {
            toast.error("Please add specific work done this week");
            return;
        }

        if (
            weeklyAllowedRegions.length > 0 &&
            !weeklyAllowedRegions.includes(weeklyForm.area.trim())
        ) {
            toast.error("Selected area is not assigned to your account");
            return;
        }

        const payload = [
            { questionId: questionIdMap.area as number, answer: weeklyForm.area.trim() },
            { questionId: questionIdMap.areaType as number, answer: weeklyForm.areaType.trim() },
            { questionId: questionIdMap.specificWork as number, answer: weeklyForm.specificWork.trim() },
        ];

        startTransition(async () => {
            const result = await submitSupervisorReportAnswers("weekly", reportDate, payload);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success("Weekly report submitted");
            clearDraft(getWeeklyDraftKey(reportDate));
            const token = beginLoad();
            await loadQuestionnaireData(token, "weekly", reportDate, weeklyManagerRange);
        });
    };

    const toggleDailyItem = (sectionId: string, item: string) => {
        setDailyForm((prev) => {
            const currentItems = prev.checklistAnswers[sectionId] || [];
            const exists = currentItems.includes(item);
            const nextItems = exists
                ? currentItems.filter((x) => x !== item)
                : [...currentItems, item];

            return {
                ...prev,
                checklistAnswers: {
                    ...prev.checklistAnswers,
                    [sectionId]: nextItems,
                },
            };
        });
    };

    const setAllSectionItems = (sectionId: string, items: string[]) => {
        setDailyForm((prev) => ({
            ...prev,
            checklistAnswers: {
                ...prev.checklistAnswers,
                [sectionId]: [...items],
            },
        }));
    };

    const clearSectionItems = (sectionId: string) => {
        setDailyForm((prev) => ({
            ...prev,
            checklistAnswers: {
                ...prev.checklistAnswers,
                [sectionId]: [],
            },
        }));
    };

    const handleSubmitDailyReport = () => {
        if (!dailyForm.region.trim()) {
            toast.error("Please select an area");
            return;
        }

        if (!dailyForm.roundNumber) {
            toast.error("Please select round number");
            return;
        }

        for (const section of dailyTemplateSections) {
            if (
                section.required &&
                (!dailyForm.checklistAnswers[section.id] ||
                    dailyForm.checklistAnswers[section.id].length === 0)
            ) {
                toast.error(`Please complete required section: ${section.title}`);
                return;
            }
        }

        const payload: DailySubmissionInput = {
            region: dailyForm.region.trim(),
            roundNumber: dailyForm.roundNumber,
            checklistAnswers: dailyForm.checklistAnswers,
        };

        startTransition(async () => {
            const result = await submitDailyReportForm(reportDate, payload);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            clearDraft(getDailyDraftKey(reportDate));
            const token = beginLoad();
            await loadDailyData(token, reportDate);
        });
    };

    const handleSubmitDischargeReport = () => {
        if (dischargeAllowedRegions.length === 0) {
            toast.error(
                dischargeLoadError
                    ? "Areas are unavailable right now. Please retry loading and submit again."
                    : "No assigned areas found for your account"
            );
            return;
        }

        const { payload, errorsByRow } = buildDischargePayload(
            dischargeRows,
            dischargeAllowedRegions
        );

        setDischargeRowErrors(errorsByRow);

        if (Object.keys(errorsByRow).length > 0) {
            toast.error("Please fix the highlighted fields before submitting.");
            return;
        }

        if (payload.length === 0) {
            toast.error("Please add at least one room entry");
            return;
        }

        startTransition(async () => {
            const result = await submitDischargeReport(reportDate, payload);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            setDischargeRowErrors({});
            clearDraft(getDischargeDraftKey(reportDate));
            const token = beginLoad();
            await loadDischargeData(token, reportDate);
        });
    };

    const handleDeleteDailySubmission = (submissionId: number, supervisorName: string) => {
        if (!confirm(`Delete this daily report for ${supervisorName}?`)) {
            return;
        }

        startTransition(async () => {
            const result = await deleteDailyReportSubmission(submissionId);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadDailyData(token, reportDate);
        });
    };

    const handleDeleteDischargeReport = (supervisorId: number, supervisorName: string) => {
        const targetLabel =
            dischargeReportType === "monthly"
                ? `in ${new Date(dischargeYear, dischargeMonth - 1, 1).toLocaleString("default", {
                    month: "long",
                    year: "numeric",
                })}`
                : `on submission date ${reportDate}`;

        if (!confirm(`Delete discharge report for ${supervisorName} ${targetLabel}?`)) {
            return;
        }

        startTransition(async () => {
            const result = await deleteDischargeSupervisorReport(
                reportDate,
                supervisorId,
                dischargeReportType === "monthly"
                    ? {
                        year: dischargeYear,
                        month: dischargeMonth,
                    }
                    : undefined
            );
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadDischargeData(token, reportDate);
        });
    };

    const handleDeleteSupervisorReport = (
        supervisorId: number,
        supervisorName: string,
        targetReportDate: string = reportDate,
        targetArea?: string
    ) => {
        const areaLabel = targetArea?.trim() || "";
        if (
            !confirm(
                `Delete ${activeTab} report answers for ${supervisorName} on ${targetReportDate}${areaLabel ? ` (area: ${areaLabel})` : ""
                }?`
            )
        ) {
            return;
        }

        startTransition(async () => {
            const result = await deleteSupervisorReportAnswers(
                activeTab,
                targetReportDate,
                supervisorId,
                areaLabel || undefined
            );
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate, weeklyManagerRange);
        });
    };

    const handleExportTabReports = async () => {
        if (!isManager) {
            return;
        }

        setIsExporting(true);
        try {
            const XLSX = await import("xlsx");
            const workbook = XLSX.utils.book_new();

            if (activeTab === "daily") {
                const [dailyResult, templateResult] = await Promise.all([
                    getDailyReportSubmissions(reportDate),
                    getDailyReportTemplate(),
                ]);
                if (!dailyResult.success || !dailyResult.data) {
                    toast.error(dailyResult.message || "Failed to load daily reports for export");
                    return;
                }

                const templateSections =
                    templateResult.success && templateResult.data
                        ? templateResult.data.sections
                        : DAILY_REPORT_SECTIONS;

                const dailyRows: Array<Record<string, string>> = [];
                for (const submission of dailyResult.data.submissions) {
                    for (const section of templateSections) {
                        const selected = new Set(submission.checklistAnswers[section.id] || []);
                        for (const item of section.items) {
                            const isChecked = selected.has(item);
                            dailyRows.push({
                                Date: submission.reportDate.slice(0, 10),
                                Supervisor: submission.supervisorName,
                                Area: submission.region,
                                Round: submission.roundNumber,
                                Section: section.title,
                                Item: item,
                                Status: isChecked ? "Checked" : "Not checked",
                                Color: isChecked ? "Green" : "Red",
                            });
                        }
                    }
                }

                if (dailyRows.length === 0) {
                    dailyRows.push({
                        Date: reportDate,
                        Supervisor: "",
                        Area: "",
                        Round: "",
                        Section: "",
                        Item: "",
                        Status: "No daily submissions",
                        Color: "",
                    });
                }

                XLSX.utils.book_append_sheet(
                    workbook,
                    XLSX.utils.json_to_sheet(dailyRows),
                    "Daily Report"
                );
                XLSX.writeFile(workbook, `daily-report-${reportDate}.xlsx`);
                toast.success("Daily reports exported");
                return;
            }

            if (activeTab === "weekly") {
                const weeklyResult = await getReportQuestionnaireData(
                    "weekly",
                    reportDate,
                    weeklyManagerRange
                );
                if (!weeklyResult.success || !weeklyResult.data) {
                    toast.error(weeklyResult.message || "Failed to load weekly reports for export");
                    return;
                }

                const weeklyRows = weeklyResult.data.managerAnswers.length > 0
                    ? weeklyResult.data.managerAnswers.map((answer) => ({
                        Date: answer.reportDate,
                        Supervisor: answer.supervisorName,
                        Area: answer.area || "-",
                        Question: answer.question,
                        Answer: answer.answer,
                        UpdatedAt: new Date(answer.updatedAt).toLocaleString(),
                    }))
                    : [
                        {
                            Date: reportDate,
                            Supervisor: "",
                            Area: "",
                            Question: "",
                            Answer: "No weekly responses",
                            UpdatedAt: "",
                        },
                    ];

                XLSX.utils.book_append_sheet(
                    workbook,
                    XLSX.utils.json_to_sheet(weeklyRows),
                    "Weekly Report"
                );
                XLSX.writeFile(workbook, `weekly-report-${weeklyManagerRange}-${reportDate}.xlsx`);
                toast.success("Weekly reports exported");
                return;
            }

            if (dischargeReportType === "monthly") {
                const dischargeResult = await getMonthlyDischargeReportData(dischargeYear, dischargeMonth);

                if (!dischargeResult.success || !dischargeResult.data) {
                    toast.error(dischargeResult.message || "Failed to load monthly discharge reports for export");
                    return;
                }

                const expandedEntries = expandDischargeEntriesByRoom(dischargeResult.data.entries);
                const dischargeRows = expandedEntries.length > 0
                    ? expandedEntries.map((entry) => ({
                        SubmissionDate: entry.reportDate.slice(0, 10),
                        DischargeDate: entry.dischargeDate.slice(0, 10),
                        RoomNumber: entry.roomNumber,
                        RoomType: getDischargeRoomTypeLabel(entry.roomType),
                        Supervisor: entry.supervisorName,
                        Area: entry.area,
                        UpdatedAt: new Date(entry.updatedAt).toLocaleString(),
                    }))
                    : [
                        {
                            SubmissionDate: `${dischargeYear}-${dischargeMonth}`,
                            DischargeDate: "",
                            RoomNumber: "",
                            RoomType: "",
                            Supervisor: "",
                            Area: "",
                            UpdatedAt: "No discharge responses for this month",
                        },
                    ];

                XLSX.utils.book_append_sheet(
                    workbook,
                    XLSX.utils.json_to_sheet(dischargeRows),
                    "Monthly Discharge Report"
                );
                XLSX.writeFile(workbook, `monthly-discharge-report-${dischargeYear}-${dischargeMonth}.xlsx`);
                toast.success("Monthly discharge reports exported");
                return;
            }

            // Daily Discharge Report Export
            const dischargeResult = await getDischargeReportData(reportDate);
            if (!dischargeResult.success || !dischargeResult.data) {
                toast.error(dischargeResult.message || "Failed to load discharge reports for export");
                return;
            }

            const expandedEntries = expandDischargeEntriesByRoom(dischargeResult.data.entries);
            const dischargeRows = expandedEntries.length > 0
                ? expandedEntries.map((entry) => ({
                    SubmissionDate: entry.reportDate.slice(0, 10),
                    DischargeDate: entry.dischargeDate.slice(0, 10),
                    RoomNumber: entry.roomNumber,
                    RoomType: getDischargeRoomTypeLabel(entry.roomType),
                    Supervisor: entry.supervisorName,
                    Area: entry.area,
                    UpdatedAt: new Date(entry.updatedAt).toLocaleString(),
                }))
                : [
                    {
                        SubmissionDate: reportDate,
                        DischargeDate: "",
                        RoomNumber: "",
                        RoomType: "",
                        Supervisor: "",
                        Area: "",
                        UpdatedAt: "No discharge responses",
                    },
                ];

            XLSX.utils.book_append_sheet(
                workbook,
                XLSX.utils.json_to_sheet(dischargeRows),
                "Discharge Report"
            );
            XLSX.writeFile(workbook, `discharge-report-${reportDate}.xlsx`);
            toast.success("Discharge reports exported");
        } catch {
            toast.error("Failed to export reports");
        } finally {
            setIsExporting(false);
        }
    };

    const groupedManagerAnswers = useMemo(() => {
        const groups = new Map<
            string,
            {
                groupKey: string;
                supervisorId: number;
                supervisorName: string;
                reportDate: string;
                area: string;
                answers: ManagerAnswerItem[];
            }
        >();

        for (const answer of managerAnswers) {
            const normalizedArea = answer.area.trim();
            const groupKey = `${answer.supervisorId}:${answer.reportDate}:${normalizedArea}`;
            const existing = groups.get(groupKey);
            if (existing) {
                existing.answers.push(answer);
                continue;
            }

            groups.set(groupKey, {
                groupKey,
                supervisorId: answer.supervisorId,
                supervisorName: answer.supervisorName,
                reportDate: answer.reportDate,
                area: normalizedArea,
                answers: [answer],
            });
        }

        return Array.from(groups.values())
            .map((group) => ({
                ...group,
                answers: [...group.answers].sort((a, b) => {
                    const byQuestion = a.questionId - b.questionId;
                    if (byQuestion !== 0) {
                        return byQuestion;
                    }
                    return b.updatedAt.localeCompare(a.updatedAt, "en");
                }),
            }))
            .sort((a, b) => {
                const byDate = b.reportDate.localeCompare(a.reportDate, "en");
                if (byDate !== 0) {
                    return byDate;
                }
                const bySupervisor = a.supervisorName.localeCompare(b.supervisorName, "en");
                if (bySupervisor !== 0) {
                    return bySupervisor;
                }
                return a.area.localeCompare(b.area, "en");
            });
    }, [managerAnswers]);

    const dischargeManagerAreas = useMemo(() => {
        return Array.from(new Set(dischargeEntries.map((entry) => entry.area)))
            .filter((value) => value.trim().length > 0)
            .sort((a, b) => a.localeCompare(b, "en"));
    }, [dischargeEntries]);

    const dailyManagerAreas = useMemo(() => {
        return Array.from(new Set(dailySubmissions.map((submission) => submission.region)))
            .filter((value) => value.trim().length > 0)
            .sort((a, b) => a.localeCompare(b, "en"));
    }, [dailySubmissions]);

    const dailyManagerRounds = useMemo(() => {
        return Array.from(new Set(dailySubmissions.map((submission) => submission.roundNumber)))
            .filter((value) => value.trim().length > 0)
            .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
    }, [dailySubmissions]);

    const filteredDailySubmissions = useMemo(() => {
        const normalizedSearch = dailySearchTerm.trim().toLowerCase();
        const templateById = new Map(dailyTemplateSections.map((section) => [section.id, section]));

        return dailySubmissions.filter((submission) => {
            if (dailyAreaFilter !== "all" && submission.region !== dailyAreaFilter) {
                return false;
            }

            if (dailyRoundFilter !== "all" && submission.roundNumber !== dailyRoundFilter) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const selectedItems: string[] = [];
            for (const [sectionId, answers] of Object.entries(submission.checklistAnswers)) {
                if (!templateById.has(sectionId)) {
                    continue;
                }
                if (Array.isArray(answers)) {
                    selectedItems.push(...answers);
                }
            }

            const searchText = [
                submission.supervisorName,
                submission.region,
                submission.roundNumber,
                submission.reportDate.slice(0, 10),
                selectedItems.join(" "),
            ]
                .join(" ")
                .toLowerCase();

            return searchText.includes(normalizedSearch);
        });
    }, [dailyAreaFilter, dailyRoundFilter, dailySearchTerm, dailySubmissions, dailyTemplateSections]);

    const sortedDailySubmissions = useMemo(() => {
        const rows = [...filteredDailySubmissions];
        rows.sort((a, b) => {
            if (dailySortKey === "updated_asc") {
                return a.updatedAt.localeCompare(b.updatedAt, "en");
            }
            if (dailySortKey === "updated_desc") {
                return b.updatedAt.localeCompare(a.updatedAt, "en");
            }
            if (dailySortKey === "supervisor_asc") {
                return a.supervisorName.localeCompare(b.supervisorName, "en");
            }
            if (dailySortKey === "supervisor_desc") {
                return b.supervisorName.localeCompare(a.supervisorName, "en");
            }
            if (dailySortKey === "area_asc") {
                return a.region.localeCompare(b.region, "en");
            }
            if (dailySortKey === "area_desc") {
                return b.region.localeCompare(a.region, "en");
            }
            if (dailySortKey === "round_desc") {
                return b.roundNumber.localeCompare(a.roundNumber, "en", { numeric: true });
            }
            return a.roundNumber.localeCompare(b.roundNumber, "en", { numeric: true });
        });
        return rows;
    }, [dailySortKey, filteredDailySubmissions]);

    const dailyTotalPages = Math.max(
        1,
        Math.ceil(sortedDailySubmissions.length / DAILY_MANAGER_PAGE_SIZE)
    );

    const pagedDailySubmissions = useMemo(() => {
        const start = (dailyPage - 1) * DAILY_MANAGER_PAGE_SIZE;
        return sortedDailySubmissions.slice(start, start + DAILY_MANAGER_PAGE_SIZE);
    }, [dailyPage, sortedDailySubmissions]);

    const groupedDischargeEntries = useMemo(() => {
        const normalizedSearch = dischargeSearchTerm.trim().toLowerCase();
        const filteredRows = dischargeEntries.filter((entry) => {
            if (dischargeAreaFilter !== "all" && entry.area !== dischargeAreaFilter) {
                return false;
            }

            if (!normalizedSearch) {
                return true;
            }

            const searchText = [
                entry.supervisorName,
                entry.roomNumber,
                entry.area,
                entry.reportDate.slice(0, 10),
                entry.dischargeDate.slice(0, 10),
                getDischargeRoomTypeLabel(entry.roomType),
            ]
                .join(" ")
                .toLowerCase();

            return searchText.includes(normalizedSearch);
        });

        const sortedRows = [...filteredRows].sort((a, b) => {
            if (dischargeSortKey === "submission_asc") {
                return a.reportDate.localeCompare(b.reportDate, "en");
            }
            if (dischargeSortKey === "submission_desc") {
                return b.reportDate.localeCompare(a.reportDate, "en");
            }
            if (dischargeSortKey === "discharge_asc") {
                return a.dischargeDate.localeCompare(b.dischargeDate, "en");
            }
            if (dischargeSortKey === "discharge_desc") {
                return b.dischargeDate.localeCompare(a.dischargeDate, "en");
            }
            if (dischargeSortKey === "room_desc") {
                return b.roomNumber.localeCompare(a.roomNumber, "en", { numeric: true });
            }
            return a.roomNumber.localeCompare(b.roomNumber, "en", { numeric: true });
        });

        const groups = new Map<
            number,
            { supervisorId: number; supervisorName: string; rows: DischargeEntryItem[] }
        >();

        for (const entry of sortedRows) {
            const existing = groups.get(entry.supervisorId);
            if (existing) {
                existing.rows.push(entry);
                continue;
            }

            groups.set(entry.supervisorId, {
                supervisorId: entry.supervisorId,
                supervisorName: entry.supervisorName,
                rows: [entry],
            });
        }

        return Array.from(groups.values()).sort((a, b) =>
            a.supervisorName.localeCompare(b.supervisorName, "en")
        );
    }, [dischargeAreaFilter, dischargeEntries, dischargeSearchTerm, dischargeSortKey]);

    const dischargeTotalPages = Math.max(
        1,
        Math.ceil(groupedDischargeEntries.length / DISCHARGE_MANAGER_PAGE_SIZE)
    );

    const pagedDischargeEntries = useMemo(() => {
        const start = (dischargePage - 1) * DISCHARGE_MANAGER_PAGE_SIZE;
        return groupedDischargeEntries.slice(start, start + DISCHARGE_MANAGER_PAGE_SIZE);
    }, [dischargePage, groupedDischargeEntries]);

    const myDailySubmissions = useMemo(() => {
        if (!isSupervisor) {
            return [];
        }

        return [...dailySubmissions].sort((a, b) =>
            a.roundNumber.localeCompare(b.roundNumber, "en")
        );
    }, [dailySubmissions, isSupervisor]);

    useEffect(() => {
        setDischargePage(1);
    }, [dischargeAreaFilter, dischargeSearchTerm, dischargeSortKey, reportDate]);

    useEffect(() => {
        setDailyPage(1);
    }, [dailyAreaFilter, dailyRoundFilter, dailySearchTerm, dailySortKey, reportDate]);

    useEffect(() => {
        if (dischargePage > dischargeTotalPages) {
            setDischargePage(dischargeTotalPages);
        }
    }, [dischargePage, dischargeTotalPages]);

    useEffect(() => {
        if (dailyPage > dailyTotalPages) {
            setDailyPage(dailyTotalPages);
        }
    }, [dailyPage, dailyTotalPages]);

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm">
                    {activeTab === "daily"
                        ? "Daily report form cloned from the provided Google Form"
                        : activeTab === "weekly"
                            ? isManager
                                ? "Review weekly submissions from supervisors"
                                : "Submit your weekly report for your assigned area"
                            : activeTab === "discharge"
                                ? isManager
                                    ? "Review discharge entries submitted by supervisors"
                                    : "Fill the discharge report sheet and submit your rows"
                                : "Reports overview"}
                </p>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
                <div className="overflow-x-auto pb-2 -mx-1 px-1 md:mx-0 md:px-0">
                    <div className="bg-slate-50 p-1 rounded-xl border border-slate-200 inline-flex shadow-sm min-w-max">
                        {reportTabs.map((tab) => (
                            <button
                                key={tab.key}
                                type="button"
                                onClick={() => setActiveTab(tab.key)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${activeTab === tab.key
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-slate-600 hover:bg-white hover:text-slate-900"
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {activeTab === "discharge" && (
                        <div className="flex bg-slate-100 rounded-lg p-1 mr-2">
                            <button
                                type="button"
                                onClick={() => setDischargeReportType("daily")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${dischargeReportType === "daily"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                Daily
                            </button>
                            <button
                                type="button"
                                onClick={() => setDischargeReportType("monthly")}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${dischargeReportType === "monthly"
                                    ? "bg-white text-slate-900 shadow-sm"
                                    : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                Monthly
                            </button>
                        </div>
                    )}

                    {(activeTab === "daily" ||
                        (activeTab === "discharge" && dischargeReportType === "daily")) && (
                        <>
                            <label htmlFor="report-date" className="text-sm font-medium text-slate-700">
                                {activeTab === "discharge" ? "Submission date" : "Report date"}
                            </label>
                            <input
                                id="report-date"
                                type="date"
                                value={reportDate}
                                onChange={(e) => setReportDate(e.target.value)}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                            />
                            <button
                                type="button"
                                onClick={() => setReportDate(getTodayLocalDateString())}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            >
                                Today
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportDate(getShiftedLocalDateString(-1))}
                                className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                            >
                                Yesterday
                            </button>
                        </>
                    )}

                    {activeTab === "discharge" && dischargeReportType === "monthly" && (
                        <>
                            <select
                                value={dischargeMonth}
                                onChange={(e) => setDischargeMonth(Number(e.target.value))}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                aria-label="Select month"
                            >
                                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                                    <option key={m} value={m}>
                                        {new Date(0, m - 1).toLocaleString("default", { month: "long" })}
                                    </option>
                                ))}
                            </select>
                            <select
                                value={dischargeYear}
                                onChange={(e) => setDischargeYear(Number(e.target.value))}
                                className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                aria-label="Select year"
                            >
                                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(
                                    (y) => (
                                        <option key={y} value={y}>
                                            {y}
                                        </option>
                                    )
                                )}
                            </select>
                        </>
                    )}
                    {isManager && activeTab !== "weekly" && (
                        <button
                            type="button"
                            onClick={handleExportTabReports}
                            disabled={isExporting || isPending}
                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                            {isExporting ? "Exporting..." : `Export ${activeTab} .xlsx`}
                        </button>
                    )}
                </div>
            </div>

            {isLoading ? (
                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 text-slate-500 text-sm">
                    Loading questionnaire...
                </div>
            ) : (
                <>
                    {activeTab === "daily" && (
                        <div className="space-y-6">
                            {isSupervisor && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">Daily Supervision Report</h2>
                                        <p className="text-sm text-slate-500">
                                            Complete all required checklist sections before submission.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Supervisor</label>
                                            <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                                {userName || "Supervisor"}
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Area</label>
                                            <select
                                                aria-label="Select area"
                                                value={dailyForm.region}
                                                onChange={(e) =>
                                                    setDailyForm((prev) => ({
                                                        ...prev,
                                                        region: e.target.value,
                                                    }))
                                                }
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                disabled={availableRegions.length === 0}
                                            >
                                                {availableRegions.length === 0 ? (
                                                    <option value="">No areas assigned to your account</option>
                                                ) : (
                                                    <>
                                                        <option value="">Select area</option>
                                                        {availableRegions.map((region) => (
                                                            <option key={region} value={region}>
                                                                {region}
                                                            </option>
                                                        ))}
                                                    </>
                                                )}
                                            </select>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Round number</label>
                                            <select
                                                aria-label="Select round number"
                                                value={dailyForm.roundNumber}
                                                onChange={(e) =>
                                                    setDailyForm((prev) => ({
                                                        ...prev,
                                                        roundNumber: e.target.value,
                                                    }))
                                                }
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                            >
                                                {DAILY_REPORT_ROUNDS.map((round) => (
                                                    <option key={round} value={round}>
                                                        {round}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    {availableRegions.length === 0 && (
                                        <p className="text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            No areas are currently assigned to this supervisor.
                                        </p>
                                    )}

                                    <div className="space-y-4">
                                        {dailyTemplateSections.map((section) => {
                                            const selected = dailyForm.checklistAnswers[section.id] || [];
                                            return (
                                                <div key={section.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-sm font-semibold text-slate-900">
                                                            {section.title}
                                                        </h3>
                                                        {section.required && (
                                                            <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full border border-red-100">
                                                                Required
                                                            </span>
                                                        )}
                                                        <div className="ml-auto flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setAllSectionItems(section.id, section.items)}
                                                                className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
                                                            >
                                                                Select all
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSectionItems(section.id)}
                                                                className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                                                            >
                                                                Clear all
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                                        {section.items.map((item) => (
                                                            <label
                                                                key={item}
                                                                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors text-sm text-slate-800"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={selected.includes(item)}
                                                                    onChange={() => toggleDailyItem(section.id, item)}
                                                                    className="h-4 w-4"
                                                                />
                                                                <span>{item}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="pt-2 flex justify-end">
                                        <button
                                            type="button"
                                            onClick={handleSubmitDailyReport}
                                            disabled={isPending || availableRegions.length === 0}
                                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                        >
                                            {isPending ? "Submitting..." : "Submit daily report"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isManager && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <div className="flex items-start justify-between gap-3 flex-wrap">
                                        <div>
                                            <h2 className="text-lg font-semibold text-slate-900">Supervisor Responses</h2>
                                            <p className="text-sm text-slate-500">
                                                Responses submitted on {reportDate}
                                            </p>
                                            {dailyTemplateUpdatedAt && (
                                                <p className="text-xs text-slate-400 mt-1">
                                                    Template updated: {new Date(dailyTemplateUpdatedAt).toLocaleString()}
                                                </p>
                                            )}
                                        </div>
                                        <Link
                                            href="/reports/daily-template"
                                            className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                        >
                                            Edit daily template
                                        </Link>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                                        <div className="space-y-1 md:col-span-2">
                                            <label className="text-xs font-semibold text-slate-600">Search</label>
                                            <input
                                                type="text"
                                                value={dailySearchTerm}
                                                onChange={(event) => setDailySearchTerm(event.target.value)}
                                                placeholder="Supervisor, area, round..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Area filter</label>
                                            <select
                                                aria-label="Filter by area"
                                                value={dailyAreaFilter}
                                                onChange={(event) => setDailyAreaFilter(event.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="all">All areas</option>
                                                {dailyManagerAreas.map((area) => (
                                                    <option key={area} value={area}>
                                                        {area}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Round filter</label>
                                            <select
                                                aria-label="Filter by round"
                                                value={dailyRoundFilter}
                                                onChange={(event) => setDailyRoundFilter(event.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="all">All rounds</option>
                                                {dailyManagerRounds.map((round) => (
                                                    <option key={round} value={round}>
                                                        {round}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Sort</label>
                                            <select
                                                aria-label="Sort daily submissions"
                                                value={dailySortKey}
                                                onChange={(event) => setDailySortKey(event.target.value as DailySortKey)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="updated_desc">Updated (newest)</option>
                                                <option value="updated_asc">Updated (oldest)</option>
                                                <option value="supervisor_asc">Supervisor (A-Z)</option>
                                                <option value="supervisor_desc">Supervisor (Z-A)</option>
                                                <option value="area_asc">Area (A-Z)</option>
                                                <option value="area_desc">Area (Z-A)</option>
                                                <option value="round_asc">Round (A-Z)</option>
                                                <option value="round_desc">Round (Z-A)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1 md:col-span-5">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDailySearchTerm("");
                                                    setDailyAreaFilter("all");
                                                    setDailyRoundFilter("all");
                                                    setDailySortKey("updated_desc");
                                                }}
                                                className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                            >
                                                Reset filters
                                            </button>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500">
                                        Showing {sortedDailySubmissions.length} submission
                                        {sortedDailySubmissions.length === 1 ? "" : "s"}.
                                    </p>

                                    {sortedDailySubmissions.length === 0 ? (
                                        <p className="text-sm text-slate-500">
                                            {dailySubmissions.length === 0
                                                ? "No responses submitted for this date."
                                                : "No daily submissions match your current filters."}
                                        </p>
                                    ) : (
                                        <div className="space-y-4">
                                            {pagedDailySubmissions.map((submission) => (
                                                <div
                                                    key={submission.id}
                                                    className="border border-slate-200 rounded-lg overflow-hidden"
                                                >
                                                    <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex items-start justify-between gap-3">
                                                        <div>
                                                            <p className="text-sm font-semibold text-slate-900">
                                                                {submission.supervisorName}
                                                            </p>
                                                            <p className="text-xs text-slate-500 mt-1">
                                                                Area: {submission.region} | Round: {submission.roundNumber} | Updated:{" "}
                                                                {new Date(submission.updatedAt).toLocaleString()}
                                                            </p>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleDeleteDailySubmission(
                                                                    submission.id,
                                                                    submission.supervisorName
                                                                )
                                                            }
                                                            disabled={isPending}
                                                            className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-60"
                                                        >
                                                            Delete
                                                        </button>
                                                    </div>
                                                    <div className="p-4 space-y-4">
                                                        {dailyTemplateSections.map((section) => {
                                                            const selected = submission.checklistAnswers[section.id] || [];
                                                            const selectedSet = new Set(selected);
                                                            return (
                                                                <div key={section.id} className="space-y-2">
                                                                    <p className="text-xs font-semibold text-slate-600">
                                                                        {section.title}
                                                                    </p>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {section.items.map((item) => {
                                                                            const isChecked = selectedSet.has(item);
                                                                            return (
                                                                                <span
                                                                                    key={item}
                                                                                    className={`text-xs rounded-full px-2 py-1 border ${isChecked
                                                                                        ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                                                                                        : "bg-red-50 text-red-700 border-red-100"
                                                                                        }`}
                                                                                >
                                                                                    {item}
                                                                                </span>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex items-center justify-between pt-2">
                                                <p className="text-xs text-slate-500">
                                                    Page {dailyPage} of {dailyTotalPages}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDailyPage((prev) => Math.max(1, prev - 1))}
                                                        disabled={dailyPage <= 1}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setDailyPage((prev) =>
                                                                Math.min(dailyTotalPages, prev + 1)
                                                            )
                                                        }
                                                        disabled={dailyPage >= dailyTotalPages}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {isSupervisor && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900">Your submissions for this date</h3>
                                    {myDailySubmissions.length === 0 ? (
                                        <p className="text-sm text-slate-500">No reports submitted yet.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {myDailySubmissions.map((submission) => (
                                                <div
                                                    key={submission.id}
                                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                                                >
                                                    Round: <span className="font-semibold">{submission.roundNumber}</span> | Updated:{" "}
                                                    {new Date(submission.updatedAt).toLocaleString()}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "discharge" && (
                        <div className="space-y-6">
                            {isSupervisor && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">Discharge Report Sheet</h2>
                                        <p className="text-sm text-slate-500">
                                            Add rows, fill discharge details, then submit once you finish.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Supervisor</label>
                                            <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                                {userName || "Supervisor"}
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">Submission date</label>
                                            <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                                {reportDate}
                                            </div>
                                        </div>
                                    </div>

                                    {dischargeLoadError ? (
                                        <div className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                                            <span>Failed to load discharge data: {dischargeLoadError}</span>
                                            <button
                                                type="button"
                                                onClick={handleRetryDischargeLoad}
                                                disabled={isPending || isLoading}
                                                className="px-2.5 py-1.5 text-xs font-semibold rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-100 disabled:opacity-60"
                                            >
                                                Retry
                                            </button>
                                        </div>
                                    ) : dischargeAllowedRegions.length === 0 ? (
                                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            No areas are assigned to your account currently.
                                        </p>
                                    ) : null}

                                    <p className="text-xs text-slate-500">
                                        Choose area first. For E.R you can pick FT1, FT2, Triage, or CC Resus. For
                                        floor areas, pick one ward room (for example 50 or 51 on 5th floor).
                                    </p>

                                    <DischargeSpreadsheet
                                        rows={dischargeRows}
                                        rowErrors={dischargeRowErrors}
                                        allowedRegions={dischargeAllowedRegions}
                                        disabled={isPending || dischargeReportType === "monthly"}
                                        onRowsChange={handleDischargeRowsChange}
                                    />

                                    <div className="flex items-center justify-end gap-3">
                                        {dischargeReportType === "monthly" && (
                                            <p className="text-sm text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                                                Switch to Daily view to add or edit reports.
                                            </p>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleSubmitDischargeReport}
                                            disabled={
                                                isPending ||
                                                dischargeAllowedRegions.length === 0 ||
                                                dischargeReportType === "monthly"
                                            }
                                            className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                        >
                                            {isPending ? "Submitting..." : "Submit discharge report"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isManager && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">Discharge Entries</h2>
                                        <p className="text-sm text-slate-500">
                                            Submission date | Discharge date | Room / station | Type of room | Supervisor
                                            name | Area
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Search</label>
                                            <input
                                                type="text"
                                                value={dischargeSearchTerm}
                                                onChange={(event) => setDischargeSearchTerm(event.target.value)}
                                                placeholder="Supervisor, room/station, area..."
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Area filter</label>
                                            <select
                                                aria-label="Filter discharge entries by area"
                                                value={dischargeAreaFilter}
                                                onChange={(event) => setDischargeAreaFilter(event.target.value)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="all">All areas</option>
                                                {dischargeManagerAreas.map((area) => (
                                                    <option key={area} value={area}>
                                                        {area}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Sort</label>
                                            <select
                                                aria-label="Sort discharge entries"
                                                value={dischargeSortKey}
                                                onChange={(event) => setDischargeSortKey(event.target.value as DischargeSortKey)}
                                                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                                            >
                                                <option value="submission_desc">Submission date (newest)</option>
                                                <option value="submission_asc">Submission date (oldest)</option>
                                                <option value="discharge_desc">Discharge date (newest)</option>
                                                <option value="discharge_asc">Discharge date (oldest)</option>
                                                <option value="room_asc">Room number (A-Z)</option>
                                                <option value="room_desc">Room number (Z-A)</option>
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-xs font-semibold text-slate-600">Actions</label>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setDischargeSearchTerm("");
                                                    setDischargeAreaFilter("all");
                                                    setDischargeSortKey("submission_desc");
                                                }}
                                                className="w-full px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                                            >
                                                Reset filters
                                            </button>
                                        </div>
                                    </div>

                                    <p className="text-xs text-slate-500">
                                        Showing {groupedDischargeEntries.length} supervisor report
                                        {groupedDischargeEntries.length === 1 ? "" : "s"}.
                                    </p>

                                    {groupedDischargeEntries.length === 0 ? (
                                        <p className="text-sm text-slate-500">
                                            {dischargeEntries.length === 0
                                                ? "No discharge report entries submitted yet."
                                                : "No discharge entries match your current filters."}
                                        </p>
                                    ) : (
                                        <div className="space-y-4">
                                            {pagedDischargeEntries.map((group) => (
                                                <div
                                                    key={group.supervisorId}
                                                    className="border border-slate-200 rounded-lg overflow-hidden"
                                                >
                                                    <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                                                        <p className="text-sm font-semibold text-slate-800">
                                                            {group.supervisorName}
                                                        </p>
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                handleDeleteDischargeReport(
                                                                    group.supervisorId,
                                                                    group.supervisorName
                                                                )
                                                            }
                                                            disabled={isPending}
                                                            className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-60"
                                                        >
                                                            Delete report
                                                        </button>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="min-w-full text-sm">
                                                            <thead className="bg-slate-50/70 border-b border-slate-200">
                                                                <tr>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Submission date</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Discharge date</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Room / station</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Type of room</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Supervisor name</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Area</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {group.rows.map((entry, rowIndex) => (
                                                                    <tr key={`${entry.id}-${entry.roomNumber}-${rowIndex}`}>
                                                                        <td className="px-3 py-2 text-slate-700">
                                                                            {entry.reportDate.slice(0, 10)}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-slate-700">
                                                                            {entry.dischargeDate.slice(0, 10)}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-slate-700">{entry.roomNumber}</td>
                                                                        <td className="px-3 py-2 text-slate-700">
                                                                            {getDischargeRoomTypeLabel(entry.roomType)}
                                                                        </td>
                                                                        <td className="px-3 py-2 text-slate-700">{entry.supervisorName}</td>
                                                                        <td className="px-3 py-2 text-slate-700">{entry.area}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            ))}
                                            <div className="flex items-center justify-between pt-2">
                                                <p className="text-xs text-slate-500">
                                                    Page {dischargePage} of {dischargeTotalPages}
                                                </p>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setDischargePage((prev) => Math.max(1, prev - 1))}
                                                        disabled={dischargePage <= 1}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                    >
                                                        Previous
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            setDischargePage((prev) =>
                                                                Math.min(dischargeTotalPages, prev + 1)
                                                            )
                                                        }
                                                        disabled={dischargePage >= dischargeTotalPages}
                                                        className="px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                                                    >
                                                        Next
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "weekly" && isManager && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Supervisor answers</h2>
                                <p className="text-sm text-slate-500">
                                    All weekly responses, sorted by work date.
                                </p>
                            </div>

                            <p className="text-xs text-slate-500">
                                Showing {groupedManagerAnswers.length} weekly report
                                {groupedManagerAnswers.length === 1 ? "" : "s"}.
                            </p>

                            {groupedManagerAnswers.length === 0 ? (
                                <p className="text-sm text-slate-500">
                                    No responses submitted yet.
                                </p>
                            ) : (
                                <div className="space-y-4">
                                    {groupedManagerAnswers.map((group) => (
                                        <div key={group.groupKey} className="border border-slate-200 rounded-lg overflow-hidden">
                                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm font-semibold text-slate-800">
                                                        {group.supervisorName}
                                                    </p>
                                                    <p className="text-xs text-slate-500">
                                                        Work date: {group.reportDate} | Area: {group.area || "Unspecified"}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDeleteSupervisorReport(
                                                            group.supervisorId,
                                                            group.supervisorName,
                                                            group.reportDate,
                                                            group.area
                                                        )
                                                    }
                                                    disabled={isPending}
                                                    className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100 disabled:opacity-60"
                                                >
                                                    Delete report
                                                </button>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {group.answers.map((answer) => (
                                                    <div key={answer.id} className="px-4 py-3">
                                                        <p className="text-xs font-semibold text-slate-500 mb-1">
                                                            {answer.question}
                                                        </p>
                                                        <p className="text-sm text-slate-800 whitespace-pre-wrap">
                                                            {answer.answer}
                                                        </p>
                                                        <p className="text-[11px] text-slate-400 mt-2">
                                                            Updated: {new Date(answer.updatedAt).toLocaleString()}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === "weekly" && isSupervisor && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Weekly report</h2>
                                <p className="text-sm text-slate-500">
                                    Fill your weekly report and submit for manager review.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-slate-700">Supervisor</label>
                                    <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                        {userName || "Supervisor"}
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-slate-700">Work date</label>
                                    <input
                                        type="date"
                                        value={reportDate}
                                        onChange={(e) => setReportDate(e.target.value)}
                                        aria-label="Select work date"
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                </div>
                            </div>

                            {weeklyAllowedRegions.length === 0 && (
                                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                    No areas are assigned to your account currently.
                                </p>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-slate-700">Area</label>
                                    <select
                                        aria-label="Select area for weekly report"
                                        value={weeklyForm.area}
                                        onChange={(e) =>
                                            setWeeklyForm((prev) => ({
                                                ...prev,
                                                area: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                        disabled={weeklyAllowedRegions.length === 0}
                                    >
                                        <option value="">Select area</option>
                                        {weeklyAllowedRegions.map((region) => (
                                            <option key={region} value={region}>
                                                {region}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-sm font-medium text-slate-700">Type of area</label>
                                    <select
                                        aria-label="Select type of area"
                                        value={weeklyForm.areaType}
                                        onChange={(e) =>
                                            setWeeklyForm((prev) => ({
                                                ...prev,
                                                areaType: e.target.value,
                                            }))
                                        }
                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    >
                                        {WEEKLY_AREA_TYPE_OPTIONS.map((option) => (
                                            <option key={option} value={option}>
                                                {option}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-sm font-medium text-slate-700">
                                    Specific work completed this week
                                </label>
                                <textarea
                                    value={weeklyForm.specificWork}
                                    onChange={(e) =>
                                        setWeeklyForm((prev) => ({
                                            ...prev,
                                            specificWork: e.target.value,
                                        }))
                                    }
                                    rows={5}
                                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    placeholder="Write the specific work done this week"
                                />
                            </div>

                            <div className="pt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSubmitWeeklyReport}
                                    disabled={
                                        isPending ||
                                        questions.length === 0 ||
                                        weeklyAllowedRegions.length === 0
                                    }
                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                >
                                    {isPending ? "Submitting..." : "Submit weekly report"}
                                </button>
                            </div>
                        </div>
                    )}

                    {!isManager && !isSupervisor && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <p className="text-sm text-slate-500">You are not authorized to access reports.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
