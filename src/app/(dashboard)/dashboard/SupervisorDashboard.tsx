import Link from "next/link";

import type {
  SupervisorDailyReportMonitor,
  SupervisorDischargeBreakdownRow,
  SupervisorReportDashboardData,
} from "@/lib/supervisor-report-dashboard";

function formatInteger(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercentage(value: number) {
  return `${value.toFixed(2)}%`;
}

function getStatusView(status: SupervisorDailyReportMonitor["status"]) {
  if (status === "complete") {
    return {
      label: "Complete",
      className: "bg-emerald-50 text-emerald-700 border-emerald-100",
    };
  }

  if (status === "exceeded") {
    return {
      label: "Exceeded",
      className: "bg-blue-50 text-blue-700 border-blue-100",
    };
  }

  return {
    label: "Incomplete",
    className: "bg-amber-50 text-amber-700 border-amber-100",
  };
}

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        {label}
      </p>
      <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{helper}</p>
    </div>
  );
}

function ProgressBar({ value }: { value: number }) {
  const width = Math.min(Math.max(value, 0), 100);
  return (
    <div className="h-2 w-full rounded-full bg-slate-100">
      <div
        className="h-2 rounded-full bg-blue-600"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

function RoundList({
  title,
  rounds,
  emptyText,
}: {
  title: string;
  rounds: string[];
  emptyText: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        {title}
      </p>
      {rounds.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">{emptyText}</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {rounds.map((round) => (
            <span
              key={round}
              className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-700"
            >
              {round}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DischargeBreakdownTable({
  title,
  rows,
  emptyText,
}: {
  title: string;
  rows: SupervisorDischargeBreakdownRow[];
  emptyText: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Area</th>
                <th className="px-4 py-3">Floor / Detail</th>
                <th className="px-4 py-3 text-right">Count</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={`${row.area}-${row.floorOrDetail}`}>
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {row.area}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {row.floorOrDetail}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {formatInteger(row.count)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function SupervisorDashboard({
  data,
  supervisorName,
}: {
  data: SupervisorReportDashboardData;
  supervisorName: string;
}) {
  const dailyStatus = getStatusView(data.daily.status);

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Supervisor Dashboard
          </h1>
          <p className="text-sm text-slate-500">
            Daily required rounds and monthly report performance for{" "}
            {supervisorName || "Supervisor"}.
          </p>
        </div>
        <form
          action="/dashboard"
          method="get"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
        >
          <label htmlFor="dashboard-date" className="text-sm font-medium text-slate-600">
            Date
          </label>
          <input
            id="dashboard-date"
            type="date"
            name="date"
            defaultValue={data.selectedDate}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
          />
          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View
          </button>
        </form>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Daily Report Monitor
            </h2>
            <p className="text-sm text-slate-500">
              {data.selectedDate} target is based on the four mandatory rounds.
            </p>
          </div>
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${dailyStatus.className}`}
          >
            {dailyStatus.label}
          </span>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Required Today"
            value={formatInteger(data.daily.requiredReports)}
            helper="Mandatory daily reports."
          />
          <MetricCard
            label="Completed"
            value={formatInteger(data.daily.completedRequiredReports)}
            helper="Mandatory rounds submitted."
          />
          <MetricCard
            label="Remaining"
            value={formatInteger(data.daily.remainingReports)}
            helper="Mandatory rounds still missing."
          />
          <MetricCard
            label="Daily Achievement"
            value={formatPercentage(data.daily.achievementRate)}
            helper="Completed mandatory reports divided by 4."
          />
          <MetricCard
            label="Total Submitted"
            value={formatInteger(data.daily.totalCompletedReports)}
            helper="Mandatory plus optional rounds."
          />
        </div>

        <div className="mt-6 space-y-3">
          <ProgressBar value={data.daily.achievementRate} />
          {data.daily.status === "exceeded" && (
            <p className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-700">
              The required rounds are complete and optional rounds were submitted.
            </p>
          )}
          {data.daily.duplicateMandatoryRounds.length > 0 && (
            <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
              Duplicate mandatory round detected:{" "}
              {data.daily.duplicateMandatoryRounds.join(", ")}
            </p>
          )}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <RoundList
            title="Submitted Mandatory Rounds"
            rounds={data.daily.submittedMandatoryRounds}
            emptyText="No mandatory rounds submitted yet."
          />
          <RoundList
            title="Missing Mandatory Rounds"
            rounds={data.daily.missingMandatoryRounds}
            emptyText="No missing mandatory rounds."
          />
          <RoundList
            title="Optional Rounds"
            rounds={data.daily.optionalRounds}
            emptyText="No optional rounds submitted."
          />
        </div>

        <div className="mt-6">
          <Link
            href={`/reports?date=${data.selectedDate}`}
            className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
          >
            Open reports page
          </Link>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Discharge Monitor
          </h2>
          <p className="text-sm text-slate-500">
            Counts are based on discharge date for {data.selectedDate} and{" "}
            {data.monthly.label}.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <MetricCard
            label="Total Discharged Today"
            value={formatInteger(data.discharge.dailyTotal)}
            helper="Total discharge rooms for the selected date."
          />
          <MetricCard
            label="Monthly Total Discharged"
            value={formatInteger(data.discharge.monthlyTotal)}
            helper="Total discharge rooms for the selected month."
          />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <DischargeBreakdownTable
            title="Daily by Area and Floor"
            rows={data.discharge.dailyBreakdown}
            emptyText="No discharge entries for the selected date."
          />
          <DischargeBreakdownTable
            title="Monthly by Area and Floor"
            rows={data.discharge.monthlyBreakdown}
            emptyText="No discharge entries for the selected month."
          />
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Monthly Monitor
          </h2>
          <p className="text-sm text-slate-500">
            {data.monthly.label}: standard supervisor working days are{" "}
            {data.monthly.standardWorkingDays}, so the monthly target is{" "}
            {data.monthly.expectedReports} mandatory reports.
          </p>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Standard Work Days"
            value={formatInteger(data.monthly.standardWorkingDays)}
            helper="Month days minus 8."
          />
          <MetricCard
            label="Monthly Target"
            value={formatInteger(data.monthly.expectedReports)}
            helper="Standard work days multiplied by 4."
          />
          <MetricCard
            label="Completed"
            value={formatInteger(data.monthly.completedRequiredReports)}
            helper="Mandatory reports this month."
          />
          <MetricCard
            label="Remaining"
            value={formatInteger(data.monthly.remainingReports)}
            helper="Reports remaining against target."
          />
          <MetricCard
            label="Monthly Achievement"
            value={formatPercentage(data.monthly.achievementRate)}
            helper="Completed divided by monthly target."
          />
        </div>

        <div className="mt-6 space-y-3">
          <ProgressBar value={data.monthly.achievementRate} />
          <p className="text-sm text-slate-500">
            Average completed mandatory reports per standard working day:{" "}
            <span className="font-semibold text-slate-800">
              {data.monthly.averageRequiredReportsPerStandardDay.toFixed(2)}
            </span>
            . Optional rounds this month:{" "}
            <span className="font-semibold text-slate-800">
              {formatInteger(data.monthly.optionalReports)}
            </span>
            .
          </p>
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Mandatory</th>
                <th className="px-4 py-3">Optional</th>
                <th className="px-4 py-3">Achievement</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Missing Rounds</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.monthly.dailyBreakdown.map((day) => {
                const status = getStatusView(day.status);
                return (
                  <tr key={day.date} className={day.date === data.selectedDate ? "bg-blue-50/40" : ""}>
                    <td className="px-4 py-3 font-medium text-slate-900">{day.date}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {day.completedRequiredReports}/{day.requiredReports}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {day.optionalReports}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {formatPercentage(day.achievementRate)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-1 text-xs font-semibold ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">
                      {day.missingMandatoryRounds.length > 0
                        ? day.missingMandatoryRounds.join(", ")
                        : "-"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
