"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getBackendDashboardKpis } from "@/lib/backendApi";
import { formatCurrency } from "@/lib/utils";
import { useToast } from "@/components/ui/use-toast";

export default function AdminDashboardPage() {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<null | Awaited<ReturnType<typeof getBackendDashboardKpis>>>(null);
  useEffect(() => {
    getBackendDashboardKpis()
      .then((data) => {
        setKpis(data);
        setLoading(false);
      })
      .catch((error) => {
        push({ title: "Failed to load dashboard", description: error.message, variant: "danger" });
        setLoading(false);
      });
  }, [push]);

  const trendCards = kpis
    ? [
        {
          title: "Meal utilization trend",
          helper: "Last 6 weeks",
          values: (kpis.trends?.mealUtilization ?? []).map((entry) => entry.value),
          labels: (kpis.trends?.mealUtilization ?? []).map((entry) => entry.label),
        },
        {
          title: "Subscription renewals trend",
          helper: "Renewals per cycle",
          values: (kpis.trends?.subscriptionRenewals ?? []).map((entry) => entry.value),
          labels: (kpis.trends?.subscriptionRenewals ?? []).map((entry) => entry.label),
        },
        {
          title: "Cost per meal trend",
          helper: "Avg cost per meal",
          values: (kpis.trends?.costPerMeal ?? []).map((entry) => entry.value),
          labels: (kpis.trends?.costPerMeal ?? []).map((entry) => entry.label),
        },
        {
          title: "Payment success rate",
          helper: "Approved vs attempted",
          values: (kpis.trends?.paymentSuccessRate ?? []).map((entry) => entry.value),
          labels: (kpis.trends?.paymentSuccessRate ?? []).map((entry) => entry.label),
        },
      ]
    : [];

  const graceMealsToday = Number(kpis?.graceMealsToday ?? 0);
  const graceActive = Number(kpis?.graceActive ?? 0);
  const graceDays = 7;
  const graceSmsPreview =
    "FeedClass notice: Your child has started a 7-day free meal grace period today. Meals will stop after the grace period ends if payment is not completed.";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin Dashboard"
        description="Program-wide KPIs for meals, revenue, costs, and operational performance."
      />

      {loading || !kpis ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 7 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : (
        <StatCards
          items={[
            { label: "Meals Today", value: kpis.mealsToday.toString(), helper: "Live service counts" },
            {
              label: "Grace Meals Today",
              value: graceMealsToday.toString(),
              helper: "7-day free window",
            },
            { label: "Meals This Month", value: kpis.mealsMonth.toString(), helper: "Rolling 30 days" },
            { label: "Active Subscriptions", value: kpis.activeSubscriptions.toString(), helper: "Current cycle" },
            { label: "Expiring Soon", value: kpis.expiringSoon.toString(), helper: "Next 10 days" },
            { label: "Children on Grace", value: graceActive.toString(), helper: "Within 7 days" },
            {
              label: "Revenue (Month)",
              value: formatCurrency(kpis.revenueMonth),
              helper: "Subscription purchases",
            },
            {
              label: "Supplier Cost (Month)",
              value: formatCurrency(kpis.supplierCostMonth),
              helper: "Invoices",
            },
            {
              label: "Cost per Meal",
              value: formatCurrency(Math.round(kpis.costPerMeal)),
              helper: "Avg across schools",
            },
          ]}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Grace meal policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>
              Every child can receive one free meal per day for up to {graceDays} days when there is no active paid
              subscription.
            </p>
            <p>
              On the first grace meal, FeedClass sends an SMS to the parent or guardian explaining that the child is
              on a free grace period and will stop receiving meals once the grace window ends.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Current usage</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{graceActive}</p>
                <p className="text-xs text-slate-500">children currently inside the {graceDays}-day grace window</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Today</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{graceMealsToday}</p>
                <p className="text-xs text-slate-500">grace meals served today across the program</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">First-day SMS</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Notification preview</p>
              <p className="mt-3 text-sm leading-6 text-slate-700">{graceSmsPreview}</p>
            </div>
            <p className="text-xs text-slate-500">
              Trigger: sent once on the first day a child receives a grace meal.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {trendCards.map((card, index) => {
          if (card.values.length === 0) {
            return (
              <Card key={card.title}>
                <CardHeader>
                  <CardTitle className="text-base">{card.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex h-36 items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                      No trend data available yet
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">{card.helper}</p>
                </CardContent>
              </Card>
            );
          }

          const width = 420;
          const height = 140;
          // Extra left padding to fit y-axis tick labels.
          const paddingX = 48;
          const paddingTop = 24;
          const paddingBottom = 28;
          const values = card.values;
          const max = Math.max(...values);
          const min = Math.min(...values);
          const range = Math.max(max - min, 1);
          const step = values.length > 1 ? (width - paddingX * 2) / (values.length - 1) : 0;

          const yTicks = (() => {
            const mid = (max + min) / 2;
            const ticks = Array.from(new Set([max, mid, min]));
            return ticks.sort((a, b) => b - a);
          })();

          const formatTick = (value: number) => {
            if (Number.isInteger(value)) return String(value);
            return value.toFixed(2);
          };

          const points = values.map((value, i) => {
            const x = paddingX + i * step;
            const y = paddingTop + (height - paddingTop - paddingBottom) * (1 - (value - min) / range);
            return { x, y };
          });
          const linePath = points
            .map((point, i) => `${i === 0 ? "M" : "L"}${point.x},${point.y}`)
            .join(" ");
          const areaPath = `${linePath} L${points[points.length - 1].x},${height - paddingBottom} L${points[0].x},${height - paddingBottom} Z`;

          const palette = [
            { line: "#2563eb", fill: "rgba(37, 99, 235, 0.18)" },
            { line: "#0f766e", fill: "rgba(15, 118, 110, 0.18)" },
            { line: "#f97316", fill: "rgba(249, 115, 22, 0.18)" },
            { line: "#7c3aed", fill: "rgba(124, 58, 237, 0.18)" },
          ];
          const color = palette[index % palette.length];
          const gradientId = `trend-gradient-${index}`;

          return (
            <Card key={card.title}>
              <CardHeader>
                <CardTitle className="text-base">{card.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="h-36 w-full"
                    preserveAspectRatio="none"
                  >
                    <defs>
                      <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor={color.line} stopOpacity="0.25" />
                        <stop offset="100%" stopColor={color.line} stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    {yTicks.map((tick) => {
                      const y =
                        paddingTop +
                        (height - paddingTop - paddingBottom) * (1 - (tick - min) / range);
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
                          <text
                            x={paddingX - 10}
                            y={y + 3}
                            textAnchor="end"
                            fontSize="10"
                            fill="#94a3b8"
                          >
                            {formatTick(tick)}
                          </text>
                        </g>
                      );
                    })}
                    <path d={areaPath} fill={`url(#${gradientId})`} />
                    <path d={linePath} fill="none" stroke={color.line} strokeWidth="2.5" />
                    {points.map((point, i) => (
                      <g key={i}>
                        <text
                          x={point.x}
                          y={Math.max(point.y - 8, 12)}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#475569"
                        >
                          {values[i]}
                        </text>
                        <circle cx={point.x} cy={point.y} r="3.2" fill={color.line} />
                        <text
                          x={point.x}
                          y={height - 6}
                          textAnchor="middle"
                          fontSize="10"
                          fill="#94a3b8"
                        >
                          {card.labels[i] ?? ""}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
                <p className="mt-3 text-xs text-slate-500">{card.helper}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

    </div>
  );
}
