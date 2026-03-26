"use client";

import { useEffect, useState } from "react";
import { getBackendAiAlerts, getBackendAiForecast, getBackendAiWeeklyReport } from "@/lib/backendApi";
import { AiForecastSnapshot, AiReport, AnomalyAlert } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/utils";

function MiniForecastChart({ snapshot }: { snapshot: AiForecastSnapshot | null }) {
  if (!snapshot) {
    return <div className="h-44 rounded-2xl border border-dashed border-slate-200 bg-slate-50" />;
  }

  const values = [...snapshot.history.map((entry) => entry.meals), ...snapshot.forecast.map((entry) => entry.predictedMeals)];
  if (values.length === 0) {
    return <div className="h-44 rounded-2xl border border-dashed border-slate-200 bg-slate-50" />;
  }

  const width = 520;
  const height = 180;
  // Extra left padding to fit y-axis tick labels.
  const paddingX = 38;
  const paddingY = 20;
  const max = Math.max(...values, 1);
  const step = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0;

  const yTicks = (() => {
    if (max <= 1) return [1, 0];
    const mid = Math.ceil(max / 2);
    return Array.from(new Set([max, mid, 0])).sort((a, b) => b - a);
  })();

  const actualPoints = snapshot.history.map((entry, index) => ({
    x: paddingX + index * step,
    y: paddingY + (height - paddingY * 2) * (1 - entry.meals / max),
  }));
  const forecastPoints = snapshot.forecast.map((entry, index) => ({
    x: paddingX + (snapshot.history.length + index) * step,
    y: paddingY + (height - paddingY * 2) * (1 - entry.predictedMeals / max),
    value: entry.predictedMeals,
  }));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-44 w-full" preserveAspectRatio="none">
        {yTicks.map((tick) => {
          const y = paddingY + (height - paddingY * 2) * (1 - tick / max);
          return (
            <g key={`tick-${tick}`}>
              <line x1={paddingX} x2={width - paddingX} y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
              <text x={paddingX - 10} y={y + 3} textAnchor="end" fontSize="10" fill="#94a3b8">
                {tick}
              </text>
            </g>
          );
        })}
        {actualPoints.length > 0 && (
          <path
            d={actualPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="#0f172a"
            strokeWidth="2.5"
          />
        )}
        {forecastPoints.length > 0 && (
          <path
            d={forecastPoints.map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`).join(" ")}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            strokeDasharray="8 6"
          />
        )}
        {actualPoints.map((point, index) => (
          <circle key={`actual-${index}`} cx={point.x} cy={point.y} r="3" fill="#0f172a" />
        ))}
        {forecastPoints.map((point, index) => (
          <g key={`forecast-${index}`}>
            <circle cx={point.x} cy={point.y} r="3" fill="#2563eb" />
            <text x={point.x} y={Math.max(point.y - 8, 12)} textAnchor="middle" fontSize="10" fill="#2563eb">
              {point.value}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function SupervisorAiPage() {
  const [forecast, setForecast] = useState<AiForecastSnapshot | null>(null);
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [report, setReport] = useState<AiReport | null>(null);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([getBackendAiForecast(), getBackendAiAlerts(), getBackendAiWeeklyReport()]).then((results) => {
      if (cancelled) return;

      const [forecastResult, alertsResult, reportResult] = results;

      setForecast(forecastResult.status === "fulfilled" ? forecastResult.value : null);
      setAlerts(alertsResult.status === "fulfilled" ? alertsResult.value : []);
      setReport(reportResult.status === "fulfilled" ? reportResult.value : null);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Admin · AI Insights"
        description="School-scoped 7-day meal forecast, anomaly alerts, and weekly summary."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>7-day meal forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <MiniForecastChart snapshot={forecast} />
            <p className="mt-3 text-xs text-slate-500">
              Forecast uses a moving-average baseline for {forecast?.scope.school_name || "your school"}.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Actionable alerts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {alerts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                No AI alerts for your school right now.
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
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
              Weekly AI summary is not available yet.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
