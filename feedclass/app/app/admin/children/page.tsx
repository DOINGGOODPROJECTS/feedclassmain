"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  cancelBackendChildSubscription,
  createBackendChildEnrollment,
  createBackendPaymentIntent,
  getBackendChildren,
  getBackendClasses,
  getBackendSchools,
  getBackendSubscriptionPlans,
  manuallyAttachBackendChildSubscription,
  resetBackendChildMealServiceForTest,
  sendBackendPaymentLink,
} from "@/lib/backendApi";
import { Child, ChildSubscription, ClassRoom, GracePeriod, Guardian, School, SubscriptionPlan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function AdminChildrenPage() {
  const { push } = useToast();
  const [children, setChildren] = useState<Child[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [subscriptions, setSubscriptions] = useState<ChildSubscription[]>([]);
  const [gracePeriods, setGracePeriods] = useState<GracePeriod[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [csvText, setCsvText] = useState("");
  const [preview, setPreview] = useState<string[][]>([]);
  const [importSchool, setImportSchool] = useState("");
  const [importClass, setImportClass] = useState("");
  const [manualForm, setManualForm] = useState({
    student_id: "",
    full_name: "",
    school_id: "",
    class_id: "",
    guardian_name: "",
    guardian_phone: "",
    profile_image_url: "",
  });
  const [attachForm, setAttachForm] = useState({
    child_id: "",
    plan_id: "",
    target_status: "ACTIVE" as "ACTIVE" | "GRACE_PERIOD" | "CANCELLED",
  });
  const [attaching, setAttaching] = useState(false);
  const [resettingMealService, setResettingMealService] = useState(false);

  useEffect(() => {
    Promise.all([getBackendChildren(), getBackendSchools(), getBackendClasses(), getBackendSubscriptionPlans()])
      .then(([childData, schoolData, classData, planData]) => {
        setChildren(childData.children);
        setSchools(schoolData);
        setClasses(classData);
        setGuardians(childData.guardians);
        setPlans(planData);
        setSubscriptions([]);
        setGracePeriods([]);
      setAttachForm((current) => ({
        ...current,
        child_id: childData.children[0]?.id || "",
        plan_id: planData.find((entry) => entry.active)?.id || planData[0]?.id || "",
        target_status: current.target_status || "ACTIVE",
      }));
        setLoading(false);
      })
      .catch((error) => {
        push({ title: "Failed to load children", description: error.message, variant: "danger" });
        setLoading(false);
      });
  }, [push]);

  const filtered = useMemo(() => {
    return children.filter((child) =>
      `${child.student_id} ${child.full_name}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [children, query]);

  const importClasses = useMemo(
    () => classes.filter((cls) => !importSchool || cls.school_id === importSchool),
    [classes, importSchool]
  );

  const manualClasses = useMemo(
    () => (manualForm.school_id ? classes.filter((cls) => cls.school_id === manualForm.school_id) : classes),
    [classes, manualForm.school_id]
  );

  const resetManualForm = () =>
    setManualForm({
      student_id: "",
      full_name: "",
      school_id: "",
      class_id: "",
      guardian_name: "",
      guardian_phone: "",
      profile_image_url: "",
    });

  const parsePreview = () => {
    const lines = csvText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const data = lines.map((line) => line.split(",").map((item) => item.trim()));
    setPreview(data);
  };

  const handleSendPaymentLink = async (child: Child) => {
    try {
      const plans = await getBackendSubscriptionPlans();
      const plan = plans.find((entry) => entry.active) ?? plans[0];
      if (!plan) {
        throw new Error("No subscription plan is available.");
      }

      const intent = await createBackendPaymentIntent({
        child_id: child.id,
        plan_id: plan.id,
      });
      const result = await sendBackendPaymentLink(intent.id);
      push({
        title: "Payment link sent",
        description: `${child.full_name} guardian notified via ${result.channel}.`,
      });
    } catch (error) {
      push({
        title: "Send failed",
        description: error instanceof Error ? error.message : "Unable to send payment link.",
        variant: "danger",
      });
    }
  };

  const handleImport = async () => {
    push({
      title: "CSV import not wired",
      description: "Manual enrollment is connected to the backend. CSV import still needs backend integration.",
      variant: "danger",
    });
  };

  const handleDownloadTemplate = () => {
    const template = [
      "student_id,full_name,guardian_name,guardian_phone",
      "RB-1009,Esi Arthur,Adwoa Arthur,+233-555-900-111",
      "CP-3302,Bright Aariaiwe,Ama Mensima,+233-555-000-555",
    ].join("\n");

    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "children-import-template.csv";
    link.click();
    window.URL.revokeObjectURL(url);
  };

  const handleManualEnrollment = async () => {
    try {
      const created = await createBackendChildEnrollment(manualForm);
      const refreshed = await getBackendChildren();
      setChildren(refreshed.children);
      setGuardians(refreshed.guardians);
      setSubscriptions([]);
      setGracePeriods([]);
      resetManualForm();
      push({
        title: "Child enrolled",
        description: `${created.child.full_name} was added successfully.`,
        variant: "success",
      });
    } catch (error) {
      push({
        title: "Enrollment failed",
        description: error instanceof Error ? error.message : "Unable to enroll child.",
        variant: "danger",
      });
    }
  };

  const handleManualAttachSubscription = async () => {
    if (!attachForm.child_id) {
      push({ title: "Child required", description: "Select a child first.", variant: "danger" });
      return;
    }
    if (attachForm.target_status === "ACTIVE" && !attachForm.plan_id) {
      push({ title: "Plan required", description: "Select a subscription plan.", variant: "danger" });
      return;
    }
    try {
      setAttaching(true);
      if (attachForm.target_status === "ACTIVE") {
        const subscription = await manuallyAttachBackendChildSubscription({
          childId: attachForm.child_id,
          planId: attachForm.plan_id,
          reason: "Manual admin attach",
        });
        const refreshed = await getBackendChildren();
        setChildren(refreshed.children);
        setGuardians(refreshed.guardians);
        push({
          title: "Subscription attached",
          description: `${subscription.plan_name ?? "Selected plan"} attached manually.`,
          variant: "success",
        });
        return;
      }

      await cancelBackendChildSubscription({
        childId: attachForm.child_id,
        reason:
          attachForm.target_status === "GRACE_PERIOD"
            ? "Admin restored grace period"
            : "Admin cancelled subscription",
        nextStatus: attachForm.target_status,
      });

      const nextGracePeriodEndsAt =
        attachForm.target_status === "GRACE_PERIOD"
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;

      setChildren((current) =>
        current.map((child) =>
          child.id === attachForm.child_id
            ? {
                ...child,
                subscription_status: attachForm.target_status,
                grace_period_ends_at: nextGracePeriodEndsAt,
              }
            : child
        )
      );
      push({
        title: "Subscription updated",
        description:
          attachForm.target_status === "GRACE_PERIOD"
            ? "The child has been returned to grace period."
            : "The child subscription has been cancelled.",
        variant: "success",
      });
    } catch (error) {
      push({
        title: "Subscription update failed",
        description: error instanceof Error ? error.message : "Unable to update subscription.",
        variant: "danger",
      });
    } finally {
      setAttaching(false);
    }
  };

  const handlePreparePlanAssignment = (child: Child) => {
    const activePlan = plans.find((entry) => entry.active) ?? plans[0];
    setAttachForm((current) => ({
      ...current,
      child_id: child.id,
      plan_id: current.plan_id || activePlan?.id || "",
      target_status: "ACTIVE",
    }));
    const target = document.getElementById("assign-child-plan-card");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleResetMealScanForTest = async () => {
    if (!attachForm.child_id) {
      push({ title: "Child required", description: "Select a child first.", variant: "danger" });
      return;
    }

    const selectedChild = children.find((child) => child.id === attachForm.child_id);
    const confirmed = window.confirm(
      `Reset today's served meal record for ${selectedChild?.full_name || "this child"} for testing?`
    );
    if (!confirmed) {
      return;
    }

    try {
      setResettingMealService(true);
      const result = await resetBackendChildMealServiceForTest({ childId: attachForm.child_id });
      const refreshed = await getBackendChildren();
      setChildren(refreshed.children);
      setGuardians(refreshed.guardians);
      push({
        title: "Today's meal scan reset",
        description:
          result.resetCount > 0
            ? `Cleared ${result.resetCount} served meal record(s) and restored ${result.restoredMeals} meal(s).`
            : "No approved meal scan was found for today.",
        variant: "success",
      });
    } catch (error) {
      push({
        title: "Reset failed",
        description: error instanceof Error ? error.message : "Unable to reset today's meal scan.",
        variant: "danger",
      });
    } finally {
      setResettingMealService(false);
    }
  };

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      setManualForm((current) => ({ ...current, profile_image_url: "" }));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setManualForm((current) => ({
        ...current,
        profile_image_url: typeof reader.result === "string" ? reader.result : "",
      }));
    };
    reader.readAsDataURL(file);
  };

  const selectClassName =
    "flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300";

  const getGraceSummary = (childId: string) => {
    const grace = gracePeriods.find((entry) => entry.child_id === childId);
    if (!grace) {
      return null;
    }

    const start = new Date(grace.start_date);
    const today = new Date();
    const diffDays = Math.floor((today.getTime() - start.getTime()) / 86400000);
    const daysRemaining = Math.max(0, 7 - Math.max(diffDays, 0));

    return {
      ...grace,
      daysRemaining,
      active: diffDays >= 0 && diffDays < 7 && grace.days_used < 7,
    };
  };

  const getInlineGraceFromChild = (child: Child) => {
    if (!child.grace_period_ends_at) {
      return null;
    }

    const endsAt = new Date(child.grace_period_ends_at);
    if (Number.isNaN(endsAt.getTime())) {
      return null;
    }

    const msRemaining = endsAt.getTime() - Date.now();
    if (msRemaining <= 0) {
      return null;
    }

    return {
      active: true,
      daysRemaining: Math.max(0, Math.ceil(msRemaining / 86400000)),
    };
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Children"
        description="Student registry plus CSV import flow with validation and reject reporting."
      />

      <div className="grid gap-4 lg:grid-cols-[2fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>All children</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name or ID" />
            {loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 rounded-2xl bg-slate-100 animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <EmptyState
                title="No children found"
                description="Import a CSV to add students to the system."
                action={
                  <Button
                    variant="outline"
                    onClick={() =>
                      push({
                        title: "CSV import",
                        description: "Paste CSV data in the import panel on the right.",
                      })
                    }
                  >
                    Go to import
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={[
                  { header: "Student ID", render: (row: Child) => row.student_id },
                  { header: "Name", render: (row: Child) => row.full_name },
                  {
                    header: "Class",
                    render: (row: Child) => classes.find((cls) => cls.id === row.class_id)?.name ?? "-",
                  },
                  {
                    header: "School",
                    render: (row: Child) => schools.find((school) => school.id === row.school_id)?.name ?? "-",
                  },
                  {
                    header: "Guardian phone",
                    render: (row: Child) =>
                      guardians.find((guardian) => guardian.id === row.guardian_id)?.phone ?? "-",
                  },
                  {
                    header: "Guardian name",
                    render: (row: Child) =>
                      guardians.find((guardian) => guardian.id === row.guardian_id)?.name ?? "-",
                  },
                  {
                    header: "Status",
                    render: (row: Child) => (row.active ? "Active" : "Inactive"),
                  },
                  {
                    header: "Subscription",
                    render: (row: Child) => {
                      const subscription = subscriptions.find((sub) => sub.child_id === row.id);
                      const grace = getGraceSummary(row.id) ?? getInlineGraceFromChild(row);
                      if (subscription?.status && subscription.status !== "NONE") {
                        return subscription.status;
                      }
                      if (grace?.active) {
                        return `GRACE PERIOD (${grace.daysRemaining} days left)`;
                      }
                      if (row.subscription_status === "GRACE_PERIOD") {
                        return "GRACE PERIOD";
                      }
                      if (row.subscription_status && row.subscription_status !== "NONE") {
                        return row.subscription_status;
                      }
                      return "NONE";
                    },
                  },
                  {
                    header: "Meals remaining",
                    render: (row: Child) => {
                      const subscription = subscriptions.find((sub) => sub.child_id === row.id);
                      const grace = getGraceSummary(row.id) ?? getInlineGraceFromChild(row);
                      if (subscription && subscription.status === "ACTIVE") {
                        return subscription.meals_remaining;
                      }
                      if (grace?.active) {
                        return `Free meal window`;
                      }
                      if (row.subscription_status === "GRACE_PERIOD") {
                        return "Free meal window";
                      }
                      return 0;
                    },
                  },
                  {
                    header: "Actions",
                    render: (row: Child) => (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/app/admin/children/${row.id}`}>View child</Link>
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handlePreparePlanAssignment(row)}>
                          Assign plan
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSendPaymentLink(row)}
                        >
                          Send payment link
                        </Button>
                      </div>
                    ),
                  },
                ]}
                data={filtered}
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Manual enrollment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                placeholder="Student ID"
                value={manualForm.student_id}
                onChange={(event) =>
                  setManualForm((current) => ({ ...current, student_id: event.target.value }))
                }
              />
              <Input
                placeholder="Child full name"
                value={manualForm.full_name}
                onChange={(event) =>
                  setManualForm((current) => ({ ...current, full_name: event.target.value }))
                }
              />
              <select
                className={selectClassName}
                value={manualForm.school_id}
                onChange={(event) =>
                  setManualForm((current) => ({
                    ...current,
                    school_id: event.target.value,
                    class_id: "",
                  }))
                }
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={manualForm.class_id}
                onChange={(event) => {
                  const value = event.target.value;
                  const selectedClass = classes.find((entry) => entry.id === value);
                  setManualForm((current) => ({
                    ...current,
                    class_id: value,
                    school_id: current.school_id || selectedClass?.school_id || "",
                  }));
                }}
              >
                <option value="">Select class</option>
                {manualClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
              {!manualForm.school_id && (
                <p className="text-xs text-slate-500">
                  Choose a class first or select a school to narrow the list.
                </p>
              )}
              <Input
                placeholder="Guardian name"
                value={manualForm.guardian_name}
                onChange={(event) =>
                  setManualForm((current) => ({ ...current, guardian_name: event.target.value }))
                }
              />
              <Input
                placeholder="Guardian phone"
                value={manualForm.guardian_phone}
                onChange={(event) =>
                  setManualForm((current) => ({ ...current, guardian_phone: event.target.value }))
                }
              />
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="child-profile-image">
                  Child profile image
                </label>
                <input
                  id="child-profile-image"
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                  onChange={handleProfileImageChange}
                />
                {manualForm.profile_image_url ? (
                  <div
                    className="h-24 w-24 rounded-2xl border border-slate-200 bg-cover bg-center"
                    style={{ backgroundImage: `url(${manualForm.profile_image_url})` }}
                  />
                ) : null}
              </div>
              <Button onClick={handleManualEnrollment}>Enroll child</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>CSV import</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className={selectClassName}
                value={importSchool}
                onChange={(event) => {
                  setImportSchool(event.target.value);
                  setImportClass("");
                }}
              >
                <option value="">Select school</option>
                {schools.map((school) => (
                  <option key={school.id} value={school.id}>
                    {school.name}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={importClass}
                onChange={(event) => setImportClass(event.target.value)}
              >
                <option value="">Select class</option>
                {importClasses.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
              <Textarea
                placeholder="student_id, full_name, guardian_name, guardian_phone"
                value={csvText}
                onChange={(event) => setCsvText(event.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleDownloadTemplate}>
                  Download template
                </Button>
                <Button variant="outline" onClick={parsePreview}>
                  Parse preview
                </Button>
                <Button onClick={handleImport}>Import</Button>
              </div>
              {preview.length > 0 && (
                <div className="rounded-2xl border border-slate-200 p-3 text-xs text-slate-500">
                  <p className="font-semibold text-slate-700">Preview</p>
                  {preview.map((row, index) => (
                    <div key={index} className="mt-1 flex flex-wrap gap-2">
                      {row.map((cell, cellIndex) => (
                        <span key={cellIndex} className="rounded-full bg-slate-100 px-2 py-1">
                          {cell}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="assign-child-plan-card">
            <CardHeader>
              <CardTitle>Assign plan to enrolled child</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <select
                className={selectClassName}
                value={attachForm.child_id}
                onChange={(event) => setAttachForm((current) => ({ ...current, child_id: event.target.value }))}
              >
                <option value="">Select child</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.full_name} · {child.student_id}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={attachForm.plan_id}
                onChange={(event) => setAttachForm((current) => ({ ...current, plan_id: event.target.value }))}
                disabled={attachForm.target_status !== "ACTIVE"}
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {plan.meal_type} · ${plan.price}
                  </option>
                ))}
              </select>
              <select
                className={selectClassName}
                value={attachForm.target_status}
                onChange={(event) =>
                  setAttachForm((current) => ({
                    ...current,
                    target_status: event.target.value as "ACTIVE" | "GRACE_PERIOD" | "CANCELLED",
                  }))
                }
              >
                <option value="ACTIVE">Active subscription</option>
                <option value="GRACE_PERIOD">Grace period</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              {attachForm.target_status !== "ACTIVE" ? (
                <p className="text-xs text-slate-500">
                  Plan selection is only required when assigning an active subscription.
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleManualAttachSubscription} disabled={attaching}>
                  {attaching
                    ? "Saving..."
                    : attachForm.target_status === "ACTIVE"
                      ? "Assign plan"
                      : attachForm.target_status === "GRACE_PERIOD"
                        ? "Move child to grace period"
                        : "Cancel child subscription"}
                </Button>
                <Button variant="outline" onClick={handleResetMealScanForTest} disabled={resettingMealService}>
                  {resettingMealService ? "Resetting..." : "Reset today's meal scan (test)"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
