"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type DualMetricChartProps = {
  title: string;
  description: string;
  data: Array<{
    label: string;
    actual: number;
    expected: number;
  }>;
  actualLabel: string;
  expectedLabel: string;
  height?: number;
};

type PercentageTrendChartProps = {
  title: string;
  description: string;
  data: Array<{
    label: string;
    percentage: number;
  }>;
  lineLabel: string;
  height?: number;
};

type SingleMetricBarChartProps = {
  title: string;
  description: string;
  data: Array<{
    label: string;
    value: number;
  }>;
  barLabel: string;
  height?: number;
};

function EmptyChartState({ title, description }: { title: string; description: string }) {
  return (
    <section className="card-premium p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div className="flex h-[280px] items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        No chart data for the selected filters.
      </div>
    </section>
  );
}

export function DualMetricBarChart({
  title,
  description,
  data,
  actualLabel,
  expectedLabel,
  height = 320,
}: DualMetricChartProps) {
  if (data.length === 0) {
    return <EmptyChartState title={title} description={description} />;
  }

  return (
    <section className="card-premium p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748B", fontSize: 12 }}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="actual" name={actualLabel} fill="#2563EB" radius={[8, 8, 0, 0]} />
            <Bar dataKey="expected" name={expectedLabel} fill="#94A3B8" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function PercentageTrendChart({
  title,
  description,
  data,
  lineLabel,
  height = 320,
}: PercentageTrendChartProps) {
  if (data.length === 0) {
    return <EmptyChartState title={title} description={description} />;
  }

  return (
    <section className="card-premium p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748B", fontSize: 12 }}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Line
              type="monotone"
              dataKey="percentage"
              name={lineLabel}
              stroke="#0F172A"
              strokeWidth={3}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

export function SingleMetricBarChart({
  title,
  description,
  data,
  barLabel,
  height = 320,
}: SingleMetricBarChartProps) {
  if (data.length === 0) {
    return <EmptyChartState title={title} description={description} />;
  }

  return (
    <section className="card-premium p-6">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>
      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748B", fontSize: 12 }}
              angle={-20}
              textAnchor="end"
              height={56}
            />
            <YAxis tick={{ fill: "#64748B", fontSize: 12 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="value" name={barLabel} fill="#0F766E" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
