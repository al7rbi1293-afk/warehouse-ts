"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    addReportQuestion,
    deleteDischargeSupervisorReport,
    deleteDailyReportSubmission,
    deleteReportQuestion,
    deleteSupervisorReportAnswers,
    getDischargeReportData,
    getDailyReportSubmissions,
    getReportQuestionnaireData,
    submitDischargeReport,
    submitDailyReportForm,
    submitSupervisorReportAnswers,
    updateReportQuestion,
    type DischargeEntryInput,
    type DischargeRoomType,
    type DailySubmissionInput,
    type ReportType,
} from "@/app/actions/reportQuestionnaire";
import {
    DAILY_REPORT_ROUNDS,
    DAILY_REPORT_SECTIONS,
} from "@/lib/dailyReportTemplate";

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
    const [availableRegions, setAvailableRegions] = useState<string[]>([]);
    const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});
    const [newQuestion, setNewQuestion] = useState("");
    const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
    const [editingQuestionText, setEditingQuestionText] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [dailyForm, setDailyForm] = useState<DailyFormState>({
        region: "",
        roundNumber: DAILY_REPORT_ROUNDS[0] || "",
        checklistAnswers: createChecklistDefaults(),
    });

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
        const result = await getReportQuestionnaireData(requestedTab, requestedDate);

        if (!isLatestLoad(token)) {
            return;
        }

        if (!result.success || !result.data) {
            toast.error(result.message || "Failed to load report questionnaire");
            setQuestions([]);
            setManagerAnswers([]);
            setDraftAnswers({});
            setIsLoading(false);
            return;
        }

        setQuestions(result.data.questions);
        setManagerAnswers(result.data.managerAnswers);

        const mappedAnswers = result.data.supervisorAnswers.reduce((acc, row) => {
            acc[row.questionId] = row.answer;
            return acc;
        }, {} as Record<number, string>);
        setDraftAnswers(mappedAnswers);
        setIsLoading(false);
    };

    const loadDailyData = async (token: number, requestedDate: string) => {
        const result = await getDailyReportSubmissions(requestedDate);

        if (!isLatestLoad(token)) {
            return;
        }

        if (!result.success || !result.data) {
            toast.error(result.message || "Failed to load daily reports");
            setDailySubmissions([]);
            setIsLoading(false);
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

        setIsLoading(false);
    };

    const loadDischargeData = async (token: number, requestedDate: string) => {
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
            setIsLoading(false);
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
                dischargeRowHasValue(
                    rowsFromServer[rowsFromServer.length - 1] || createEmptyDischargeRow()
                )
                    ? [...rowsFromServer, createEmptyDischargeRow()]
                    : rowsFromServer.length > 0
                        ? rowsFromServer
                        : [createEmptyDischargeRow()]
            );
        } else {
            setDischargeRows([createEmptyDischargeRow()]);
        }

        setIsLoading(false);
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

    const handleAddQuestion = () => {
        if (!newQuestion.trim()) {
            toast.error("Please enter a question first");
            return;
        }

        startTransition(async () => {
            const result = await addReportQuestion(activeTab, newQuestion);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            setNewQuestion("");
            toast.success("Question added");
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate);
        });
    };

    const handleSaveEditedQuestion = () => {
        if (editingQuestionId === null) {
            return;
        }

        startTransition(async () => {
            const result = await updateReportQuestion(editingQuestionId, editingQuestionText);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success("Question updated");
            setEditingQuestionId(null);
            setEditingQuestionText("");
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate);
        });
    };

    const handleDeleteQuestion = (questionId: number) => {
        if (!confirm("Delete this question from the active questionnaire?")) {
            return;
        }

        startTransition(async () => {
            const result = await deleteReportQuestion(questionId);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success("Question removed");
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate);
        });
    };

    const handleSubmitSupervisorAnswers = () => {
        const payload = questions.map((question) => ({
            questionId: question.id,
            answer: draftAnswers[question.id] || "",
        }));

        startTransition(async () => {
            const result = await submitSupervisorReportAnswers(activeTab, reportDate, payload);
            if (!result.success) {
                toast.error(result.message);
                return;
            }

            toast.success(result.message);
            const token = beginLoad();
            await loadQuestionnaireData(token, activeTab, reportDate);
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

    const updateDischargeRow = (
        index: number,
        field: keyof DischargeEntryInput,
        value: string
    ) => {
        setDischargeRows((prev) => {
            const next = [...prev];
            const current = next[index] || createEmptyDischargeRow();
            next[index] = {
                ...current,
                [field]: value,
            };

            if (next.length === 0) {
                return [createEmptyDischargeRow()];
            }

            if (dischargeRowHasValue(next[next.length - 1])) {
                next.push(createEmptyDischargeRow());
            }

            return next;
        });
    };

    const addDischargeRow = () => {
        setDischargeRows((prev) => [...prev, createEmptyDischargeRow()]);
    };

    const removeDischargeRow = (index: number) => {
        setDischargeRows((prev) => {
            const next = prev.filter((_, rowIndex) => rowIndex !== index);

            if (next.length === 0) {
                return [createEmptyDischargeRow()];
            }

            if (dischargeRowHasValue(next[next.length - 1])) {
                next.push(createEmptyDischargeRow());
            }

            return next;
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

    const currentTabLabel = reportTabs.find((tab) => tab.key === activeTab)?.label || "Report";

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm">
                    {activeTab === "daily"
                        ? "Daily report form cloned from the provided Google Form"
                        : activeTab === "discharge"
                        ? isManager
                            ? "Review discharge entries submitted by supervisors"
                            : "Fill the discharge report sheet and submit your rows"
                        : isManager
                        ? "Configure report questions and review supervisor answers"
                        : "Answer manager-defined questions for each report type"}
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

                <div className="flex items-center gap-2">
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
                                                            return (
                                                                <div key={section.id} className="space-y-2">
                                                                    <p className="text-xs font-semibold text-slate-600">
                                                                        {section.title}
                                                                    </p>
                                                                    {selected.length === 0 ? (
                                                                        <p className="text-xs text-slate-400">لا يوجد اختيار</p>
                                                                    ) : (
                                                                        <div className="flex flex-wrap gap-2">
                                                                            {selected.map((item) => (
                                                                                <span
                                                                                    key={item}
                                                                                    className="text-xs bg-blue-50 text-blue-700 border border-blue-100 rounded-full px-2 py-1"
                                                                                >
                                                                                    {item}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
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

                                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                                        <table className="min-w-full text-sm">
                                            <thead className="bg-slate-50">
                                                <tr>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Room number</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Type of room</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Area</th>
                                                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {dischargeRows.map((row, index) => (
                                                    <tr key={`discharge-row-${index}`}>
                                                        <td className="px-3 py-2">
                                                            <input
                                                                type="text"
                                                                value={row.roomNumber}
                                                                onChange={(e) =>
                                                                    updateDischargeRow(
                                                                        index,
                                                                        "roomNumber",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                placeholder="e.g. 1203"
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-md focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                                disabled={
                                                                    dischargeAllowedRegions.length === 0 ||
                                                                    Boolean(dischargeLoadError)
                                                                }
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <select
                                                                value={row.roomType}
                                                                onChange={(e) =>
                                                                    updateDischargeRow(
                                                                        index,
                                                                        "roomType",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                                disabled={
                                                                    dischargeAllowedRegions.length === 0 ||
                                                                    Boolean(dischargeLoadError)
                                                                }
                                                            >
                                                                <option value="normal_patient">Normal patient</option>
                                                                <option value="isolation">Isolation</option>
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <select
                                                                value={row.area}
                                                                onChange={(e) =>
                                                                    updateDischargeRow(
                                                                        index,
                                                                        "area",
                                                                        e.target.value
                                                                    )
                                                                }
                                                                className="w-full px-3 py-2 border border-slate-200 rounded-md bg-white focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                                disabled={
                                                                    dischargeAllowedRegions.length === 0 ||
                                                                    Boolean(dischargeLoadError)
                                                                }
                                                            >
                                                                <option value="">Select area</option>
                                                                {dischargeAllowedRegions.map((region) => (
                                                                    <option key={region} value={region}>
                                                                        {region}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </td>
                                                        <td className="px-3 py-2">
                                                            <button
                                                                type="button"
                                                                onClick={() => removeDischargeRow(index)}
                                                                className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200 disabled:opacity-60"
                                                                disabled={dischargeRows.length <= 1}
                                                            >
                                                                Remove
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="flex items-center justify-between gap-3">
                                        <button
                                            type="button"
                                            onClick={addDischargeRow}
                                            disabled={
                                                dischargeAllowedRegions.length === 0 ||
                                                Boolean(dischargeLoadError)
                                            }
                                            className="px-4 py-2 text-sm font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-60"
                                        >
                                            Add row
                                        </button>
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
                        <div className="space-y-6">
                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">{currentTabLabel} questions</h2>
                                    <p className="text-sm text-slate-500">
                                        Add or edit questions that supervisors must answer.
                                    </p>
                                </div>

                                <div className="flex flex-col md:flex-row gap-2">
                                    <input
                                        type="text"
                                        value={newQuestion}
                                        onChange={(e) => setNewQuestion(e.target.value)}
                                        placeholder={`Add a new ${activeTab} question`}
                                        className="flex-1 px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddQuestion}
                                        disabled={isPending}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                    >
                                        Add question
                                    </button>
                                </div>

                                <div className="space-y-2">
                                    {questions.length === 0 && (
                                        <p className="text-sm text-slate-500">No questions configured yet.</p>
                                    )}
                                    {questions.map((question, index) => (
                                        <div
                                            key={question.id}
                                            className="border border-slate-200 rounded-lg p-3 flex flex-col md:flex-row md:items-center gap-3"
                                        >
                                            <span className="text-xs font-semibold text-slate-400 min-w-8">
                                                Q{index + 1}
                                            </span>
                                            <div className="flex-1">
                                                {editingQuestionId === question.id ? (
                                                    <input
                                                        type="text"
                                                        value={editingQuestionText}
                                                        onChange={(e) => setEditingQuestionText(e.target.value)}
                                                        className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                    />
                                                ) : (
                                                    <p className="text-sm text-slate-800">{question.question}</p>
                                                )}
                                            </div>
                                            <div className="flex gap-2">
                                                {editingQuestionId === question.id ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={handleSaveEditedQuestion}
                                                            disabled={isPending}
                                                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60"
                                                        >
                                                            Save
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingQuestionId(null);
                                                                setEditingQuestionText("");
                                                            }}
                                                            className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                setEditingQuestionId(question.id);
                                                                setEditingQuestionText(question.question);
                                                            }}
                                                            className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-md hover:bg-slate-200"
                                                        >
                                                            Edit
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteQuestion(question.id)}
                                                            className="px-3 py-1.5 text-xs font-medium bg-red-50 text-red-600 rounded-md hover:bg-red-100"
                                                        >
                                                            Remove
                                                        </button>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-900">Supervisor answers</h2>
                                    <p className="text-sm text-slate-500">
                                        Responses submitted for {reportDate} ({currentTabLabel.toLowerCase()}).
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
                        </div>
                    )}

                    {activeTab === "weekly" && isSupervisor && (
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">{currentTabLabel} questionnaire</h2>
                                <p className="text-sm text-slate-500">
                                    Insert your answers and submit for manager review.
                                </p>
                            </div>

                            {questions.length === 0 ? (
                                <p className="text-sm text-slate-500">No questions are configured for this report type yet.</p>
                            ) : (
                                <div className="space-y-4">
                                    {questions.map((question, index) => (
                                        <div key={question.id} className="space-y-2">
                                            <label className="text-sm font-semibold text-slate-800 block">
                                                Q{index + 1}. {question.question}
                                            </label>
                                            <textarea
                                                value={draftAnswers[question.id] || ""}
                                                onChange={(e) =>
                                                    setDraftAnswers((prev) => ({
                                                        ...prev,
                                                        [question.id]: e.target.value,
                                                    }))
                                                }
                                                rows={3}
                                                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
                                                placeholder="Type your answer..."
                                            />
                                        </div>
                                    ))}
                                </div>
                            )}

                            <div className="pt-2 flex justify-end">
                                <button
                                    type="button"
                                    onClick={handleSubmitSupervisorAnswers}
                                    disabled={isPending || questions.length === 0}
                                    className="px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                                >
                                    {isPending ? "Submitting..." : "Submit answers"}
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
