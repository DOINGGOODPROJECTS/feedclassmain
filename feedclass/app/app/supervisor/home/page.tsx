"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBackendSchoolDashboard } from "@/lib/backendApi";
import { SchoolDashboardSnapshot } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

export default function SupervisorHomePage() {
  const schoolId = useAppStore((state) => state.supervisorSchoolId);
  const { push } = useToast();
  const [dashboard, setDashboard] = useState<SchoolDashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBackendSchoolDashboard(schoolId)
      .then((payload) => {
        setDashboard(payload);
        setLoading(false);
      })
      .catch((error) => {
        push({
          title: "Failed to load school dashboard",
          description: error instanceof Error ? error.message : "Unable to load daily operations data.",
          variant: "danger",
        });
        setLoading(false);
      });
  }, [push, schoolId]);

  const roleLabel = "School Admin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${roleLabel} · Home`}
        description={
          dashboard?.school?.name
            ? `Daily ops dashboard · ${dashboard.school.name}`
            : "Daily ops dashboard"
        }
      />

      <StatCards
        items={[
          {
            label: "Meals served today",
            value: String(dashboard?.mealsServedToday ?? 0),
            helper: loading ? "Loading..." : "School-scoped live data",
          },
          {
            label: "Failed scans today",
            value: String(dashboard?.failedScans.length ?? 0),
            helper: loading ? "Loading..." : "Resolve scanner issues fast",
          },
          {
            label: "Missing subscriptions",
            value: String(dashboard?.childrenMissingSubscriptions.length ?? 0),
            helper: loading ? "Loading..." : "Payment follow-up needed",
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Daily meals by class</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!dashboard || dashboard.mealsByClass.length === 0 ? (
              <p className="text-sm text-slate-500">
                {loading ? "Loading class meal totals..." : "No class meal data yet today."}
              </p>
            ) : (
              dashboard.mealsByClass.map((item) => (
                <div key={item.class_id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                  <span className="text-sm font-medium text-slate-700">{item.class_name}</span>
                  <Badge variant="secondary">{item.total}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Failed scans with reason codes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {!dashboard || dashboard.failedScans.length === 0 ? (
              <p className="text-sm text-slate-500">
                {loading ? "Loading failed scans..." : "No failed scans logged today."}
              </p>
            ) : (
              dashboard.failedScans.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-900">
                        {entry.child_name}
                        {entry.student_id ? ` · ${entry.student_id}` : ""}
                      </p>
                      <p className="text-xs text-slate-500">
                        {entry.class_name || "Class unavailable"}
                        {entry.meal_type ? ` · ${entry.meal_type}` : ""}
                      </p>
                      <p className="text-sm text-slate-700">{entry.reason}</p>
                    </div>
                    <Badge variant="danger">FAILED</Badge>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Children missing subscriptions</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/supervisor/children">Open children</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!dashboard || dashboard.childrenMissingSubscriptions.length === 0 ? (
            <p className="text-sm text-slate-500">
              {loading ? "Loading children without subscriptions..." : "All children currently have valid meal access."}
            </p>
          ) : (
            dashboard.childrenMissingSubscriptions.map((entry) => (
              <div key={entry.child_id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {entry.child_name} · {entry.student_id}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.class_name || "Class unavailable"} · {entry.subscription_status}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.guardian_name || "Guardian unavailable"}
                    {entry.guardian_phone ? ` · ${entry.guardian_phone}` : ""}
                  </p>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/app/supervisor/payments">Send payment follow-up</Link>
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Payment follow-up</CardTitle>
          <Button asChild variant="outline" size="sm">
            <Link href="/app/supervisor/payments">Open payments</Link>
          </Button>
        </CardHeader>
        <CardContent className="space-y-2">
          {!dashboard || dashboard.paymentFollowUps.length === 0 ? (
            <p className="text-sm text-slate-500">
              {loading ? "Loading payment follow-up..." : "No pending payment follow-up needed right now."}
            </p>
          ) : (
            dashboard.paymentFollowUps.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {entry.reference} · {entry.child_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.student_id}
                    {entry.class_name ? ` · ${entry.class_name}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.guardian_name || "Guardian unavailable"}
                    {entry.guardian_phone ? ` · ${entry.guardian_phone}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="warning">{entry.status}</Badge>
                  {entry.guardian_phone ? (
                    <Button asChild variant="outline" size="sm">
                      <a href={`tel:${entry.guardian_phone}`}>Call guardian</a>
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Successful scans within 24 hours</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!dashboard || dashboard.successfulScans24h.length === 0 ? (
            <p className="text-sm text-slate-500">
              {loading ? "Loading successful scans..." : "No successful scans recorded within the last 24 hours."}
            </p>
          ) : (
            dashboard.successfulScans24h.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">
                    {entry.child_name}
                    {entry.student_id ? ` · ${entry.student_id}` : ""}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.class_name || "Class unavailable"}
                    {entry.meal_type ? ` · ${entry.meal_type}` : ""}
                  </p>
                </div>
                <Badge variant="success">Successful</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
