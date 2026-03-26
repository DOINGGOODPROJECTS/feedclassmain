"use client";

import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getBackendAiAlerts, getBackendAiForecast, getBackendAiWeeklyReport, getBackendSchools } from "@/lib/backendApi";
import { AiForecastSnapshot, AiReport, AnomalyAlert, School } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

function ForecastChart({ snapshot }: { snapshot: AiForecastSnapshot | null }) {
  if (!snapshot) {
    return <div className="h-56 rounded-2xl border border-dashed border-slate-200 bg-slate-50" />;
  }

  const points = [...snapshot.history.map((entry) => entry.meals), ...snapshot.forecast.map((entry) => entry.predictedMeals)];
  const labels = [
    ...snapshot.history.map((entry) =>
      new Date(entry.date).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    ),
    ...snapshot.forecast.map((entry) =>
      new Date(entry.date).toLocaleString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    ),
  ];

  if (points.length === 0) {
    return <div className="h-56 rounded-2xl border border-dashed border-slate-200 bg-slate-50" />;
  }

  const width = 640;
  const height = 220;
  // Extra left padding to fit y-axis tick labels.
  const paddingX = 48;
  const paddingTop = 26;
  const paddingBottom = 36;
  const max = Math.max(...points, 1);
  const step = points.length > 1 ? (width - paddingX * 2) / (points.length - 1) : 0;

  const yTicks = (() => {
    if (max <= 1) return [1, 0];
    const mid = Math.ceil(max / 2);
    return Array.from(new Set([max, mid, 0])).sort((a, b) => b - a);
  })();

  const actualPoints = snapshot.history.map((entry, index) => {
    const value = entry.meals;
    const x = paddingX + index * step;
    const y = paddingTop + (height - paddingTop - paddingBottom) * (1 - value / max);
    return { x, y, value };
  });

  const forecastPoints = snapshot.forecast.map((entry, index) => {
    const position = snapshot.history.length + index;
    const value = entry.predictedMeals;
    const x = paddingX + position * step;
    const y = paddingTop + (height - paddingTop - paddingBottom) * (1 - value / max);
    return { x, y, value };
  });

  const actualPath = actualPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ");
  const forecastPath = forecastPoints
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" preserveAspectRatio="none">
        {yTicks.map((tick) => {
          const y = paddingTop + (height - paddingTop - paddingBottom) * (1 - tick / max);
          return (
            <g key={`tick-${tick}`}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={paddingX - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                {tick}
              </text>
            </g>
          );
        })}
        {actualPoints.length > 0 && <path d={actualPath} fill="none" stroke="#0f172a" strokeWidth="2.5" />}
        {forecastPoints.length > 0 && <path d={forecastPath} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeDasharray="8 6" />}
        {actualPoints.map((point, index) => (
          <g key={`actual-${index}`}>
            <circle cx={point.x} cy={point.y} r="3.2" fill="#0f172a" />
            <text x={point.x} y={height - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">
              {labels[index]}
            </text>
          </g>
        ))}
        {forecastPoints.map((point, index) => {
          const labelIndex = snapshot.history.length + index;
          return (
            <g key={`forecast-${index}`}>
              <circle cx={point.x} cy={point.y} r="3.2" fill="#2563eb" />
              <text x={point.x} y={Math.max(point.y - 8, 14)} textAnchor="middle" fontSize="10" fill="#2563eb">
                {point.value}
              </text>
              <text x={point.x} y={height - 10} textAnchor="middle" fontSize="10" fill="#94a3b8">
                {labels[labelIndex]}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" />
          Last 7 actual days
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
          Next 7 forecast days
        </span>
      </div>
    </div>
  );
}

export default function AdminAiPage() {
  const [schools, setSchools] = useState<School[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [forecast, setForecast] = useState<AiForecastSnapshot | null>(null);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [report, setReport] = useState<AiReport | null>(null);

  useEffect(() => {
    getBackendSchools()
      .then(setSchools)
      .catch(() => setSchools([]));
  }, []);

  useEffect(() => {
    const schoolId = selectedSchoolId || undefined;
    let cancelled = false;

    Promise.allSettled([getBackendAiForecast(schoolId), getBackendAiAlerts(schoolId), getBackendAiWeeklyReport(schoolId)]).then(
      (results) => {
        if (cancelled) return;

        const [forecastResult, alertsResult, reportResult] = results;

        setForecast(forecastResult.status === "fulfilled" ? forecastResult.value : null);
        setAlerts(alertsResult.status === "fulfilled" ? alertsResult.value : []);
        setReport(reportResult.status === "fulfilled" ? reportResult.value : null);
      }
    );

    return () => {
      cancelled = true;
    };
  }, [selectedSchoolId]);

  const schoolLabel = useMemo(() => {
    if (!selectedSchoolId) {
      return "All schools";
    }
    return schools.find((entry) => entry.id === selectedSchoolId)?.name || "Selected school";
  }, [schools, selectedSchoolId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · AI Insights"
        description="7-day meal forecast, anomaly alerts, and aggregate-only weekly summary."
      />

      <div className="w-full max-w-xs">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">School scope</label>
        <select
          className="h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-sm text-slate-700 shadow-sm outline-none transition focus:border-slate-300"
          value={selectedSchoolId}
          onChange={(event) => setSelectedSchoolId(event.target.value)}
        >
          <option value="">All schools</option>
          {schools.map((school) => (
            <option key={school.id} value={school.id}>
              {school.name}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>7-day meal forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <ForecastChart snapshot={forecast} />
            <p className="mt-3 text-xs text-slate-500">
              Moving-average forecast for {forecast?.scope.school_name || schoolLabel}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Anomaly alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No active alerts for {schoolLabel.toLowerCase()}.
              </div>
            ) : (
              alerts.map((alert) => (
                <div key={alert.id} className="rounded-2xl border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <Badge variant={alert.severity === "HIGH" ? "danger" : alert.severity === "MEDIUM" ? "warning" : "default"}>
                      {alert.severity}
                    </Badge>
                    <span className="text-xs text-slate-400">{formatDateTime(alert.created_at)}</span>
                  </div>
                  <p className="mt-2 text-sm font-semibold text-slate-800">{alert.title || "Alert"}</p>
                  <p className="mt-1 text-sm text-slate-600">{alert.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Weekly executive summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {report ? (
            <>
              <p className="text-sm text-slate-500">
                {report.window_start} to {report.window_end} · Generated {formatDateTime(report.created_at)}
              </p>
              <p className="text-sm leading-7 text-slate-700">{report.summary}</p>
              {report.highlights && report.highlights.length > 0 && (
                <div className="grid gap-3 md:grid-cols-2">
                  {report.highlights.map((highlight) => (
                    <div key={highlight} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                      {highlight}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Weekly summary is not available yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
