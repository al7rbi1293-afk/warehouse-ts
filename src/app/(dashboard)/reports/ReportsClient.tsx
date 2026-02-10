"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    deleteDischargeSupervisorReport,
    deleteDailyReportSubmission,
    deleteSupervisorReportAnswers,
    getDischargeReportData,
    getDailyReportSubmissions,
    getReportQuestionnaireData,
    submitDischargeReport,
    submitDailyReportForm,
    submitSupervisorReportAnswers,
    type DischargeEntryInput,
    type DischargeRoomType,
    type DailySubmissionInput,
    type ReportType,
} from "@/app/actions/reportQuestionnaire";
import {
    DAILY_REPORT_ROUNDS,
    DAILY_REPORT_SECTIONS,
} from "@/lib/dailyReportTemplate";
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

function createChecklistDefaults() {
    return DAILY_REPORT_SECTIONS.reduce((acc, section) => {
        acc[section.id] = [];
        return acc;
    }, {} as Record<string, string[]>);
}

function createEmptyDischargeRow(): DischargeEntryInput {
    return {
        roomNumber: "",
        roomType: "normal_patient",
        area: "",
    };
}

function dischargeRowHasValue(row: DischargeEntryInput) {
    return row.roomNumber.trim().length > 0 || row.area.trim().length > 0;
}

function getDischargeRoomTypeLabel(roomType: DischargeRoomType) {
    return roomType === "isolation" ? "Isolation" : "Normal patient";
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
        checklistAnswers: createChecklistDefaults(),
    });
    const [weeklyForm, setWeeklyForm] = useState<WeeklyFormState>(createWeeklyDefaults());

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
        requestedDate: string
    ) => {
        try {
            const result = await getReportQuestionnaireData(requestedTab, requestedDate);

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
            const result = await getDailyReportSubmissions(requestedDate);

            if (!isLatestLoad(token)) {
                return;
            }

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

                setDailyForm((prev) => {
                    const latestRegion = latest?.region || "";
                    const canUseLatest = latestRegion && (allowed.length === 0 || allowed.includes(latestRegion));
                    const canKeepCurrent = prev.region && (allowed.length === 0 || allowed.includes(prev.region));

                    return {
                        ...prev,
                        region: canUseLatest
                            ? latestRegion
                            : canKeepCurrent
                                ? prev.region
                                : (allowed[0] || ""),
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
            const result = await getDischargeReportData(requestedDate);

            if (!isLatestLoad(token)) {
                return;
            }

            if (!result.success || !result.data) {
                const message = result.message || "Failed to load discharge reports";
                toast.error(message);
                setDischargeLoadError(message);
                setDischargeEntries([]);
                setDischargeRows([createEmptyDischargeRow()]);
                setDischargeAllowedRegions([]);
                return;
            }

            setDischargeLoadError(null);
            setDischargeEntries(result.data.entries);
            setDischargeAllowedRegions(result.data.allowedRegions || []);

            if (isSupervisor) {
                const rowsFromServer = result.data.entries.map((entry) => ({
                    roomNumber: entry.roomNumber,
                    roomType: entry.roomType,
                    area: entry.area,
                }));

                setDischargeRows(
                    rowsFromServer.length > 0
                        ? rowsFromServer
                        : [createEmptyDischargeRow()]
                );
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
            setDischargeEntries([]);
            setDischargeRows([createEmptyDischargeRow()]);
            setDischargeAllowedRegions([]);
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
            void loadQuestionnaireData(token, activeTab, reportDate);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, reportDate]);

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
            const token = beginLoad();
            await loadQuestionnaireData(token, "weekly", reportDate);
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
            toast.error("يرجى اختيار المنطقة");
            return;
        }

        if (!dailyForm.roundNumber) {
            toast.error("يرجى اختيار رقم الجولة");
            return;
        }

        for (const section of DAILY_REPORT_SECTIONS) {
            if (
                section.required &&
                (!dailyForm.checklistAnswers[section.id] ||
                    dailyForm.checklistAnswers[section.id].length === 0)
            ) {
                toast.error(`يرجى تعبئة القسم الإلزامي: ${section.title}`);
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
            const token = beginLoad();
            await loadDailyData(token, reportDate);
        });
    };

    const handleSubmitDischargeReport = () => {
        if (dischargeLoadError) {
            toast.error("Failed to load discharge areas. Please refresh and try again.");
            return;
        }

        if (dischargeAllowedRegions.length === 0) {
            toast.error("No assigned areas found for your account");
            return;
        }

        const payload = dischargeRows
            .filter((row) => dischargeRowHasValue(row))
            .map((row) => ({
                roomNumber: row.roomNumber.trim(),
                roomType: row.roomType,
                area: row.area.trim(),
            }));

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
        if (!confirm(`Delete discharge report for ${supervisorName} on ${reportDate}?`)) {
            return;
        }

        startTransition(async () => {
            const result = await deleteDischargeSupervisorReport(reportDate, supervisorId);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadDischargeData(token, reportDate);
        });
    };

    const handleDeleteSupervisorReport = (supervisorId: number, supervisorName: string) => {
        if (
            !confirm(
                `Delete ${activeTab} report answers for ${supervisorName} on ${reportDate}?`
            )
        ) {
            return;
        }

        startTransition(async () => {
            const result = await deleteSupervisorReportAnswers(activeTab, reportDate, supervisorId);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate);
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
                const dailyResult = await getDailyReportSubmissions(reportDate);
                if (!dailyResult.success || !dailyResult.data) {
                    toast.error(dailyResult.message || "Failed to load daily reports for export");
                    return;
                }

                const dailyRows: Array<Record<string, string>> = [];
                for (const submission of dailyResult.data.submissions) {
                    for (const section of DAILY_REPORT_SECTIONS) {
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
                const weeklyResult = await getReportQuestionnaireData("weekly", reportDate);
                if (!weeklyResult.success || !weeklyResult.data) {
                    toast.error(weeklyResult.message || "Failed to load weekly reports for export");
                    return;
                }

                const weeklyRows = weeklyResult.data.managerAnswers.length > 0
                    ? weeklyResult.data.managerAnswers.map((answer) => ({
                        Date: reportDate,
                        Supervisor: answer.supervisorName,
                        Question: answer.question,
                        Answer: answer.answer,
                        UpdatedAt: new Date(answer.updatedAt).toLocaleString(),
                    }))
                    : [
                        {
                            Date: reportDate,
                            Supervisor: "",
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
                XLSX.writeFile(workbook, `weekly-report-${reportDate}.xlsx`);
                toast.success("Weekly reports exported");
                return;
            }

            const dischargeResult = await getDischargeReportData(reportDate);
            if (!dischargeResult.success || !dischargeResult.data) {
                toast.error(dischargeResult.message || "Failed to load discharge reports for export");
                return;
            }

            const dischargeRows = dischargeResult.data.entries.length > 0
                ? dischargeResult.data.entries.map((entry) => ({
                    Date: entry.reportDate.slice(0, 10),
                    RoomNumber: entry.roomNumber,
                    RoomType: getDischargeRoomTypeLabel(entry.roomType),
                    Supervisor: entry.supervisorName,
                    Area: entry.area,
                    UpdatedAt: new Date(entry.updatedAt).toLocaleString(),
                }))
                : [
                    {
                        Date: reportDate,
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
            number,
            { supervisorId: number; supervisorName: string; answers: ManagerAnswerItem[] }
        >();

        for (const answer of managerAnswers) {
            const existing = groups.get(answer.supervisorId);
            if (existing) {
                existing.answers.push(answer);
                continue;
            }

            groups.set(answer.supervisorId, {
                supervisorId: answer.supervisorId,
                supervisorName: answer.supervisorName,
                answers: [answer],
            });
        }

        return Array.from(groups.values()).sort((a, b) =>
            a.supervisorName.localeCompare(b.supervisorName, "ar")
        );
    }, [managerAnswers]);

    const groupedDischargeEntries = useMemo(() => {
        const groups = new Map<
            number,
            { supervisorId: number; supervisorName: string; rows: DischargeEntryItem[] }
        >();

        for (const entry of dischargeEntries) {
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
            a.supervisorName.localeCompare(b.supervisorName, "ar")
        );
    }, [dischargeEntries]);

    const myDailySubmissions = useMemo(() => {
        if (!isSupervisor) {
            return [];
        }

        return [...dailySubmissions].sort((a, b) =>
            a.roundNumber.localeCompare(b.roundNumber, "ar")
        );
    }, [dailySubmissions, isSupervisor]);

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
                    <label htmlFor="report-date" className="text-sm font-medium text-slate-700">
                        Report date
                    </label>
                    <input
                        id="report-date"
                        type="date"
                        value={reportDate}
                        onChange={(e) => setReportDate(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                    />
                    {isManager && (
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
                        <div className="space-y-6" dir="rtl">
                            {isSupervisor && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">نموذج تقرير الاشراف اليومي</h2>
                                        <p className="text-sm text-slate-500">
                                            النموذج يتضمن بعض الاسئلة التي يجب اجابتها بجميع التفاصيل
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">اسم المشرف</label>
                                            <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                                {userName || "Supervisor"}
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-sm font-medium text-slate-700">المنطقة</label>
                                            <select
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
                                                    <option value="">لا توجد مناطق مرتبطة بك</option>
                                                ) : (
                                                    <>
                                                        <option value="">اختر المنطقة</option>
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
                                            <label className="text-sm font-medium text-slate-700">جولة رقم</label>
                                            <select
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
                                            لا توجد مناطق مخصصة لهذا المشرف حالياً.
                                        </p>
                                    )}

                                    <div className="space-y-4">
                                        {DAILY_REPORT_SECTIONS.map((section) => {
                                            const selected = dailyForm.checklistAnswers[section.id] || [];
                                            return (
                                                <div key={section.id} className="border border-slate-200 rounded-lg p-4 space-y-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-sm font-semibold text-slate-900">
                                                            {section.title}
                                                        </h3>
                                                        {section.required && (
                                                            <span className="text-xs bg-red-50 text-red-600 px-2 py-1 rounded-full border border-red-100">
                                                                إلزامي
                                                            </span>
                                                        )}
                                                        <div className="mr-auto flex items-center gap-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => setAllSectionItems(section.id, section.items)}
                                                                className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100"
                                                            >
                                                                تحديد الكل
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => clearSectionItems(section.id)}
                                                                className="text-xs px-2 py-1 rounded-md bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200"
                                                            >
                                                                إلغاء الكل
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
                                            {isPending ? "جاري الإرسال..." : "إرسال التقرير اليومي"}
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isManager && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <div>
                                        <h2 className="text-lg font-semibold text-slate-900">ردود المشرفين</h2>
                                        <p className="text-sm text-slate-500">
                                            عرض الردود المرسلة بتاريخ {reportDate}
                                        </p>
                                    </div>

                                    {dailySubmissions.length === 0 ? (
                                        <p className="text-sm text-slate-500">لا توجد ردود مرسلة لهذا التاريخ.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {dailySubmissions.map((submission) => (
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
                                                                المنطقة: {submission.region} | الجولة: {submission.roundNumber} | آخر تحديث:{" "}
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
                                                        {DAILY_REPORT_SECTIONS.map((section) => {
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
                                        </div>
                                    )}
                                </div>
                            )}

                            {isSupervisor && (
                                <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                    <h3 className="text-sm font-semibold text-slate-900">تقاريرك المرسلة لهذا التاريخ</h3>
                                    {myDailySubmissions.length === 0 ? (
                                        <p className="text-sm text-slate-500">لم يتم إرسال أي تقرير بعد.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {myDailySubmissions.map((submission) => (
                                                <div
                                                    key={submission.id}
                                                    className="border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700"
                                                >
                                                    الجولة: <span className="font-semibold">{submission.roundNumber}</span> | آخر تحديث:{" "}
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
                                            Add rows like an Excel sheet, then submit once you finish.
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
                                            <label className="text-sm font-medium text-slate-700">Date</label>
                                            <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                                {reportDate}
                                            </div>
                                        </div>
                                    </div>

                                    {dischargeLoadError ? (
                                        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                                            Failed to load discharge areas: {dischargeLoadError}
                                        </p>
                                    ) : dischargeAllowedRegions.length === 0 ? (
                                        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                                            No areas are assigned to your account currently.
                                        </p>
                                    ) : null}

                                    <p className="text-xs text-slate-500">
                                        Fill rows normally: write Room number, then choose Type of room and Area from
                                        dropdown lists.
                                    </p>

                                    <DischargeSpreadsheet
                                        rows={dischargeRows}
                                        allowedRegions={dischargeAllowedRegions}
                                        disabled={
                                            dischargeAllowedRegions.length === 0 ||
                                            Boolean(dischargeLoadError) ||
                                            isPending
                                        }
                                        onRowsChange={setDischargeRows}
                                    />

                                    <div className="flex items-center justify-end gap-3">
                                        <button
                                            type="button"
                                            onClick={handleSubmitDischargeReport}
                                            disabled={
                                                isPending ||
                                                dischargeAllowedRegions.length === 0 ||
                                                Boolean(dischargeLoadError)
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
                                            Date | Room number | Type of room | Supervisor name | Area
                                        </p>
                                    </div>

                                    {groupedDischargeEntries.length === 0 ? (
                                        <p className="text-sm text-slate-500">No discharge report entries submitted yet.</p>
                                    ) : (
                                        <div className="space-y-4">
                                            {groupedDischargeEntries.map((group) => (
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
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Date</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Room number</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Type of room</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Supervisor name</th>
                                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Area</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-100">
                                                                {group.rows.map((entry) => (
                                                                    <tr key={entry.id}>
                                                                        <td className="px-3 py-2 text-slate-700">
                                                                            {entry.reportDate.slice(0, 10)}
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
                                    Weekly responses submitted for {reportDate}.
                                </p>
                            </div>

                            {groupedManagerAnswers.length === 0 ? (
                                <p className="text-sm text-slate-500">No responses submitted yet.</p>
                            ) : (
                                <div className="space-y-4">
                                    {groupedManagerAnswers.map((group) => (
                                        <div key={group.supervisorId} className="border border-slate-200 rounded-lg overflow-hidden">
                                            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                                                <p className="text-sm font-semibold text-slate-800">
                                                    {group.supervisorName}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        handleDeleteSupervisorReport(
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
                                    <label className="text-sm font-medium text-slate-700">Date</label>
                                    <div className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-800 text-sm">
                                        {reportDate}
                                    </div>
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
