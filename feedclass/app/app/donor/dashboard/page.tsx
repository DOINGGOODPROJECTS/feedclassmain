"use client";

import { useEffect, useState } from "react";
import { getBackendAiWeeklyReport, getBackendDonorDashboard } from "@/lib/backendApi";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { AiReport } from "@/lib/types";

function TrendChartCard({
  title,
  helper,
  labels,
  values,
  formatter,
  color,
}: {
  title: string;
  helper: string;
  labels: string[];
  values: number[];
  formatter: (value: number) => string;
  color: { line: string; fill: string };
}) {
  if (values.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
              No trend data available yet
            </div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{helper}</p>
        </CardContent>
      </Card>
    );
  }

  const width = 420;
  const height = 140;
  // Extra left padding to fit y-axis tick labels (currency strings can be long).
  const paddingX = 62;
  const paddingTop = 24;
  const paddingBottom = 28;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const step = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0;

  const yTicks = (() => {
    const mid = (max + min) / 2;
    const ticks = Array.from(new Set([max, mid, min]));
    return ticks.sort((a, b) => b - a);
  })();

  const points = values.map((value, index) => {
    const x = paddingX + index * step;
    const y = paddingTop + (height - paddingTop - paddingBottom) * (1 - (value - min) / range);
    return { x, y };
  });
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${height - paddingBottom} L${points[0].x},${height - paddingBottom} Z`;
  const gradientId = `donor-trend-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-36 w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color.line} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color.line} stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map((tick) => {
              const y =
                paddingTop + (height - paddingTop - paddingBottom) * (1 - (tick - min) / range);
              return (
                <g key={`tick-${tick}`}>
                  <line
                    x1={paddingX}
                    x2={width - paddingX}
                    y1={y}
                    y2={y}
                    stroke="#e2e8f0"
                    strokeDasharray="4 4"
                  />
                  <text x={paddingX - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                    {formatter(tick)}
                  </text>
                </g>
              );
            })}
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke={color.line} strokeWidth="2.5" />
            {points.map((point, index) => (
              <g key={`${title}-${labels[index] ?? index}`}>
                <text
                  x={point.x}
                  y={Math.max(point.y - 8, 12)}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#475569"
                >
                  {formatter(values[index])}
                </text>
                <circle cx={point.x} cy={point.y} r="3.2" fill={color.line} />
                <text x={point.x} y={height - 6} textAnchor="middle" fontSize="10" fill="#94a3b8">
                  {labels[index] ?? ""}
                </text>
              </g>
            ))}
          </svg>
        </div>
        <p className="mt-3 text-xs text-slate-500">{helper}</p>
      </CardContent>
    </Card>
  );
}

export default function DonorDashboardPage() {
  const [dashboard, setDashboard] = useState<null | Awaited<ReturnType<typeof getBackendDonorDashboard>>>(null);
  const [weeklyReport, setWeeklyReport] = useState<AiReport | null>(null);

  useEffect(() => {
    getBackendDonorDashboard().then(setDashboard).catch(() => setDashboard(null));
    getBackendAiWeeklyReport().then(setWeeklyReport).catch(() => setWeeklyReport(null));
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Donor Dashboard"
        description="Aggregate impact metrics with strict PII masking."
      />

      {dashboard && (
        <StatCards
          items={[
            { label: "Total meals served", value: dashboard.totalMeals.toString() },
            { label: "Children reached", value: dashboard.totalChildren.toString() },
            { label: "Funds received", value: formatCurrency(dashboard.fundsReceived) },
            { label: "Cost per meal", value: formatCurrency(dashboard.costPerMeal) },
          ]}
        />
      )}

      {(() => {
        const labels = dashboard?.trends.map((entry) => entry.label) || [];
        const cards = [
          {
            title: "Meals served trend",
            helper: "Monthly total served meals across all supported schools.",
            values: dashboard?.trends.map((entry) => entry.mealsServed) || [],
            formatter: (value: number) => `${value}`,
            color: { line: "#2563eb", fill: "rgba(37, 99, 235, 0.18)" },
          },
          {
            title: "Funds received trend",
            helper: "Monthly aggregate subscription revenue, donor-safe and PII-free.",
            values: dashboard?.trends.map((entry) => entry.fundsReceived) || [],
            formatter: (value: number) => formatCurrency(value),
            color: { line: "#0f766e", fill: "rgba(15, 118, 110, 0.18)" },
          },
          {
            title: "Cost per meal trend",
            helper: "Monthly supplier cost divided by meals served for the same period.",
            values: dashboard?.trends.map((entry) => entry.costPerMeal) || [],
            formatter: (value: number) => formatCurrency(value),
            color: { line: "#f97316", fill: "rgba(249, 115, 22, 0.18)" },
          },
          {
            title: "Schools supported trend",
            helper: "Count of schools with at least one served meal in the month.",
            values: dashboard?.trends.map((entry) => entry.schoolsSupported) || [],
            formatter: (value: number) => `${value}`,
            color: { line: "#7c3aed", fill: "rgba(124, 58, 237, 0.18)" },
          },
        ];

        return (
          <div className="grid gap-4 md:grid-cols-2">
            {cards.map((card) => (
              <TrendChartCard
                key={card.title}
                title={card.title}
                helper={card.helper}
                labels={labels}
                values={card.values}
                formatter={card.formatter}
                color={card.color}
              />
            ))}
          </div>
        );
      })()}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Weekly executive summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {weeklyReport ? (
            <>
              <p className="text-xs text-slate-500">
                {weeklyReport.window_start} to {weeklyReport.window_end}
              </p>
              <p className="text-sm leading-7 text-slate-700">{weeklyReport.summary}</p>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-400">
              Weekly executive summary is not available yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
