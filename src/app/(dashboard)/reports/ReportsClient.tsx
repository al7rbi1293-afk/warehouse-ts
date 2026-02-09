"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import {
    addReportQuestion,
    deleteReportQuestion,
    getReportQuestionnaireData,
    submitSupervisorReportAnswers,
    updateReportQuestion,
    type ReportType,
} from "@/app/actions/reportQuestionnaire";

interface ReportsClientProps {
    userRole: string;
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
    supervisorName: string;
    answer: string;
    updatedAt: string;
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

export function ReportsClient({ userRole }: ReportsClientProps) {
    const [activeTab, setActiveTab] = useState<ReportType>("daily");
    const [reportDate, setReportDate] = useState(getTodayLocalDateString());
    const [questions, setQuestions] = useState<ReportQuestionItem[]>([]);
    const [managerAnswers, setManagerAnswers] = useState<ManagerAnswerItem[]>([]);
    const [draftAnswers, setDraftAnswers] = useState<Record<number, string>>({});
    const [newQuestion, setNewQuestion] = useState("");
    const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
    const [editingQuestionText, setEditingQuestionText] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    const isManager = managerRoles.has(userRole);
    const isSupervisor = supervisorRoles.has(userRole);

    const loadQuestionnaireData = async () => {
        setIsLoading(true);
        const result = await getReportQuestionnaireData(activeTab, reportDate);

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

    useEffect(() => {
        loadQuestionnaireData();
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
            await loadQuestionnaireData();
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
            await loadQuestionnaireData();
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
            await loadQuestionnaireData();
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
            await loadQuestionnaireData();
        });
    };

    const groupedManagerAnswers = useMemo(() => {
        return managerAnswers.reduce((acc, answer) => {
            if (!acc[answer.supervisorName]) {
                acc[answer.supervisorName] = [];
            }
            acc[answer.supervisorName].push(answer);
            return acc;
        }, {} as Record<string, ManagerAnswerItem[]>);
    }, [managerAnswers]);

    const currentTabLabel = reportTabs.find((tab) => tab.key === activeTab)?.label || "Report";

    return (
        <div className="space-y-6 animate-fade-in pb-12">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
                <p className="text-slate-500 text-sm">
                    {isManager
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
                    {isManager && (
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

                                {Object.keys(groupedManagerAnswers).length === 0 ? (
                                    <p className="text-sm text-slate-500">No responses submitted yet.</p>
                                ) : (
                                    <div className="space-y-4">
                                        {Object.entries(groupedManagerAnswers).map(([supervisorName, answers]) => (
                                            <div key={supervisorName} className="border border-slate-200 rounded-lg overflow-hidden">
                                                <div className="px-4 py-2 bg-slate-50 border-b border-slate-200">
                                                    <p className="text-sm font-semibold text-slate-800">{supervisorName}</p>
                                                </div>
                                                <div className="divide-y divide-slate-100">
                                                    {answers.map((answer) => (
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

                    {isSupervisor && (
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
