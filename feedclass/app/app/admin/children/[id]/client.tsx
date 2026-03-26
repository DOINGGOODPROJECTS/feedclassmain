"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import QRCode from "qrcode";
import { getLedger } from "@/lib/mockApi";
import {
  cancelBackendChildSubscription,
  createBackendPaymentIntent,
  deleteBackendChild,
  getBackendChildQr,
  getBackendChildSubscription,
  getBackendSubscriptionPlans,
  getBackendChildren,
  getBackendClasses,
  getBackendSchools,
  manuallyAttachBackendChildSubscription,
  resetBackendChildMealServiceForTest,
  updateBackendChildProfile,
} from "@/lib/backendApi";
import { Child, ChildQr, ChildSubscription, ClassRoom, Guardian, School, SubscriptionPlan, Transaction } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { QrCanvas } from "@/components/qr-canvas";
import { useToast } from "@/components/ui/use-toast";
import { buildChildQrPayload } from "@/lib/qr";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function ChildDetailClient() {
  const { push } = useToast();
  const router = useRouter();
  const params = useParams();
  const childId = params.id as string;
  const [child, setChild] = useState<Child | null>(null);
  const [qr, setQr] = useState<ChildQr | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [ledger, setLedger] = useState<Transaction[]>([]);
  const [subscription, setSubscription] = useState<ChildSubscription | null>(null);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [, setGuardian] = useState<Guardian | null>(null);
  const [qrRefreshNotice, setQrRefreshNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [manualPlanId, setManualPlanId] = useState("");
  const [manualStatus, setManualStatus] = useState<"ACTIVE" | "GRACE_PERIOD" | "CANCELLED">("ACTIVE");
  const [attachingSubscription, setAttachingSubscription] = useState(false);
  const [resettingMealService, setResettingMealService] = useState(false);
  const [form, setForm] = useState({
    student_id: "",
    full_name: "",
    school_id: "",
    class_id: "",
    guardian_name: "",
    guardian_phone: "",
    profile_image_url: "",
    active: true,
  });

  useEffect(() => {
    getLedger().then((entries) => setLedger(entries.filter((tx) => tx.child_id === childId)));
    Promise.all([
      getBackendChildren(),
      getBackendSchools(),
      getBackendClasses(),
      getBackendSubscriptionPlans(),
      getBackendChildQr(childId).catch(() => null),
      getBackendChildSubscription(childId).catch(() => null),
    ])
      .then(([childData, schoolData, classData, planData, childQr, childSubscription]) => {
        const nextChild = childData.children.find((entry) => entry.id === childId) ?? null;
        const nextGuardian = nextChild
          ? childData.guardians.find((entry) => entry.id === nextChild.guardian_id) ?? null
          : null;

        setChild(nextChild);
        setGuardian(nextGuardian);
        setQr(childQr);
        setSchools(schoolData);
        setClasses(classData);
        setPlans(planData);
        setSubscription(childSubscription);
        setManualPlanId(childSubscription?.plan_id || planData.find((entry) => entry.active)?.id || planData[0]?.id || "");

        if (nextChild) {
          setForm({
            student_id: nextChild.student_id,
            full_name: nextChild.full_name,
            school_id: nextChild.school_id,
            class_id: nextChild.class_id,
            guardian_name: nextGuardian?.name ?? "",
            guardian_phone: nextGuardian?.phone ?? "",
            profile_image_url: nextChild.profile_image_url ?? "",
            active: nextChild.active,
          });
        }
        setLoading(false);
      })
      .catch((error) => {
        push({
          title: "Failed to load child",
          description: error instanceof Error ? error.message : "Unable to load child profile.",
          variant: "danger",
        });
        setLoading(false);
      });
  }, [childId, push]);

  const filteredClasses = useMemo(
    () => classes.filter((entry) => !form.school_id || entry.school_id === form.school_id),
    [classes, form.school_id]
  );

  const handleProfileImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({
        ...current,
        profile_image_url: typeof reader.result === "string" ? reader.result : current.profile_image_url,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!child) {
      return;
    }

    const previousVerificationCode = qr?.qr_payload ?? buildChildQrPayload(child);

    const updated = await updateBackendChildProfile(child.id, {
      student_id: form.student_id.trim().toUpperCase(),
      full_name: form.full_name.trim(),
      school_id: form.school_id,
      class_id: form.class_id,
      guardian_name: form.guardian_name.trim(),
      guardian_phone: form.guardian_phone.trim(),
      profile_image_url: form.profile_image_url,
      active: form.active,
    });
    if (!updated.child) {
      push({ title: "Update failed", description: "Unable to update child.", variant: "danger" });
      return;
    }

    const refreshedQr = await getBackendChildQr(child.id);

    setChild(updated.child);
    setGuardian(updated.guardian);
    setQr(refreshedQr);

    const nextVerificationCode = refreshedQr?.qr_payload ?? buildChildQrPayload(updated.child);
    if (nextVerificationCode !== previousVerificationCode) {
      const message = "Verification code changed. Reprint the QR badge before using it again.";
      setQrRefreshNotice(message);
      push({ title: "Child updated", description: message, variant: "success" });
      return;
    }

    setQrRefreshNotice(null);
    push({ title: "Child updated", description: updated.child.full_name, variant: "success" });
  };

  const handleDelete = async () => {
    if (!child) {
      return;
    }

    const confirmed = window.confirm(`Delete ${child.full_name}? This will remove the child record.`);
    if (!confirmed) {
      return;
    }

    const deleted = await deleteBackendChild(child.id);
    if (!deleted) {
      push({ title: "Delete failed", description: "Unable to delete child.", variant: "danger" });
      return;
    }

    push({ title: "Child deleted", description: child.full_name, variant: "success" });
    router.push("/app/admin/children");
  };

  const handlePrintQrBadge = async () => {
    if (!qr?.qr_payload || !child) {
      push({ title: "QR unavailable", description: "Generate the child QR first.", variant: "danger" });
      return;
    }

    const schoolName =
      schools.find((entry) => entry.id === form.school_id)?.name ||
      schools.find((entry) => entry.id === child.school_id)?.name ||
      "FeedClass";

    try {
      const qrDataUrl = await QRCode.toDataURL(qr.qr_payload, {
        width: 260,
        margin: 2,
      });

      const printWindow = window.open("", "_blank", "width=900,height=900");
      if (!printWindow) {
        push({ title: "Popup blocked", description: "Allow popups to print the QR badge.", variant: "danger" });
        return;
      }

      printWindow.document.write(`
        <!doctype html>
        <html>
          <head>
            <title>${child.full_name} QR badge</title>
            <style>
              body {
                margin: 0;
                font-family: Arial, sans-serif;
                background: #f8fafc;
                color: #0f172a;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 100vh;
              }
              .badge {
                width: 420px;
                background: #ffffff;
                border: 2px solid #cbd5e1;
                border-radius: 28px;
                padding: 24px;
                text-align: center;
              }
              .badge h1 {
                margin: 0 0 8px;
                font-size: 28px;
              }
              .badge p {
                margin: 0 0 6px;
                color: #475569;
              }
              .badge img {
                display: block;
                width: 260px;
                height: 260px;
                margin: 20px auto;
                border-radius: 20px;
                border: 1px solid #cbd5e1;
                background: #fff;
              }
              .badge .school {
                text-transform: uppercase;
                letter-spacing: 0.12em;
                font-size: 12px;
                color: #64748b;
                margin-bottom: 16px;
              }
              .badge .student-id {
                font-weight: 700;
                color: #0f172a;
              }
              @media print {
                body { background: #fff; }
                .badge { box-shadow: none; }
              }
            </style>
          </head>
          <body>
            <article class="badge">
              <div class="school">${schoolName}</div>
              <h1>${child.full_name}</h1>
              <img src="${qrDataUrl}" alt="${child.full_name} QR code" />
              <p>${schoolName}</p>
            </article>
            <script>
              window.onload = () => {
                window.print();
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    } catch (error) {
      push({ title: "Print failed", description: "Unable to render the QR badge.", variant: "danger" });
      console.error(error);
    }
  };

  if (loading) {
    return <div className="text-sm text-slate-500">Loading child profile...</div>;
  }

  if (!child) {
    return <div className="text-sm text-slate-500">Child not found.</div>;
  }

  const activePlan = plans.find((plan) => plan.active) ?? plans[0];
  const verificationCode = qr?.qr_payload ?? buildChildQrPayload(child);
  const graceDaysRemaining = child.grace_period_ends_at
    ? Math.max(0, Math.ceil((new Date(child.grace_period_ends_at).getTime() - Date.now()) / 86400000))
    : 0;
  const hasActiveGracePeriod =
    Boolean(child.grace_period_ends_at) && !Number.isNaN(new Date(child.grace_period_ends_at || "").getTime()) && graceDaysRemaining > 0;
  const effectiveSubscriptionStatus =
    child.subscription_status === "GRACE_PERIOD" || hasActiveGracePeriod
      ? `GRACE PERIOD (${graceDaysRemaining} days left)`
      : subscription?.status || child.subscription_status || "NONE";
  const effectiveMealsRemaining =
    child.subscription_status === "GRACE_PERIOD" || hasActiveGracePeriod
      ? "Free meal window"
      : subscription?.meals_remaining ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={child.full_name}
        description={`Program Admin view · Student ID: ${child.student_id} · QR, subscription, and ledger overview`}
        actions={<Badge variant={child.active ? "success" : "danger"}>{child.active ? "Active" : "Inactive"}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr,1fr]">
        <Card>
          <CardHeader>
            <CardTitle>Child profile</CardTitle>
          </CardHeader>
          <CardContent className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Student ID</label>
                <Input
                  placeholder="Student ID"
                  value={form.student_id}
                  onChange={(event) => setForm((current) => ({ ...current, student_id: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Child Full Name</label>
                <Input
                  placeholder="Child full name"
                  value={form.full_name}
                  onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">School Name</label>
                <select
                  className="flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={form.school_id}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, school_id: event.target.value, class_id: "" }))
                  }
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Class</label>
                <select
                  className="flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  value={form.class_id}
                  onChange={(event) => setForm((current) => ({ ...current, class_id: event.target.value }))}
                >
                  <option value="">Select class</option>
                  {filteredClasses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Guardian Name</label>
                <Input
                  placeholder="Guardian name"
                  value={form.guardian_name}
                  onChange={(event) => setForm((current) => ({ ...current, guardian_name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Guardian Phone Number</label>
                <Input
                  placeholder="Guardian phone"
                  value={form.guardian_phone}
                  onChange={(event) => setForm((current) => ({ ...current, guardian_phone: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700" htmlFor="detail-profile-image">
                  Profile image
                </label>
                <input
                  id="detail-profile-image"
                  type="file"
                  accept="image/*"
                  className="block w-full text-sm text-slate-600 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-700"
                  onChange={handleProfileImageChange}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                />
                Active child
              </label>
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleSave}>Save changes</Button>
                <Button variant="outline" onClick={handleDelete}>
                  Delete child
                </Button>
              </div>
            </div>
            <div className="space-y-4">
              <div
                className="h-72 w-full rounded-3xl border border-slate-200 bg-slate-50 bg-cover bg-center md:h-[360px]"
                style={{ backgroundImage: `url(${form.profile_image_url || child.profile_image_url || "/qr-placeholder.svg"})` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>QR profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {qr?.qr_payload ? (
              <>
                <div className="mx-auto flex h-72 w-72 items-center justify-center rounded-3xl border border-slate-200 bg-white p-4">
                  <QrCanvas value={qr.qr_payload} size={240} className="h-[240px] w-[240px]" />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Verification code
                  </p>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-900">
                    {verificationCode}
                  </p>
                </div>
                {qrRefreshNotice ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {qrRefreshNotice}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    Reprint the QR badge any time you modify the child data.
                  </div>
                )}
                <div className="flex justify-center">
                  <Button variant="outline" onClick={handlePrintQrBadge}>
                    Print QR badge
                  </Button>
                </div>
              </>
            ) : (
              <div className="mx-auto flex h-72 w-72 items-center justify-center rounded-3xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                QR not generated
              </div>
            )}
          </CardContent>
        </Card>

        <Card id="subscription">
          <CardHeader>
            <CardTitle>Subscription</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscription ? (
              <div className="space-y-2">
                <div>
                  <p className="text-sm text-slate-500">Current status</p>
                  <p className="text-lg font-semibold text-slate-900">{effectiveSubscriptionStatus}</p>
                </div>
                {subscription.plan_name ? (
                  <div>
                    <p className="text-sm text-slate-500">Plan</p>
                    <p className="text-base font-semibold text-slate-900">{subscription.plan_name}</p>
                  </div>
                ) : null}
                <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2">
                  <span className="text-xs text-slate-500">Meals remaining</span>
                  <span className="text-sm font-semibold text-slate-800">{effectiveMealsRemaining}</span>
                </div>
                {subscription.meal_type ? (
                  <div className="flex items-center justify-between rounded-2xl border border-slate-200 px-3 py-2">
                    <span className="text-xs text-slate-500">Meal type</span>
                    <span className="text-sm font-semibold text-slate-800">{subscription.meal_type}</span>
                  </div>
                ) : null}
                {hasActiveGracePeriod ? (
                  <div className="text-xs text-slate-500">
                    Grace period ends on {child.grace_period_ends_at?.slice(0, 10)}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">
                    {subscription.start_date} → {subscription.end_date}
                  </div>
                )}
                {subscription.cancellation_reason ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    Cancellation reason: {subscription.cancellation_reason}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No active subscription.</p>
            )}
            {activePlan ? (
              <div className="space-y-2">
                <p className="text-sm text-slate-500">Recommended plan</p>
                <p className="text-lg font-semibold text-slate-900">{activePlan.name}</p>
                <p className="text-sm text-slate-500">{formatCurrency(activePlan.price)} per cycle</p>
              </div>
            ) : null}
            <div className="space-y-3 rounded-2xl border border-slate-200 p-4">
              <p className="text-sm font-semibold text-slate-900">Manual attach subscription</p>
              <select
                className="flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={manualPlanId}
                onChange={(event) => setManualPlanId(event.target.value)}
              >
                <option value="">Select plan</option>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} · {formatCurrency(plan.price)}
                  </option>
                ))}
              </select>
              <select
                className="flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                value={manualStatus}
                onChange={(event) =>
                  setManualStatus(event.target.value as "ACTIVE" | "GRACE_PERIOD" | "CANCELLED")
                }
              >
                <option value="ACTIVE">Active subscription</option>
                <option value="GRACE_PERIOD">Grace period</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={async () => {
                    if (manualStatus === "ACTIVE" && !manualPlanId) {
                      push({ title: "Plan required", description: "Select a plan first.", variant: "danger" });
                      return;
                    }
                    try {
                      setAttachingSubscription(true);
                      if (manualStatus === "ACTIVE") {
                        const nextSubscription = await manuallyAttachBackendChildSubscription({
                          childId,
                          planId: manualPlanId,
                          reason: "Manual admin attach",
                        });
                        setSubscription(nextSubscription);
                        setChild((current) =>
                          current
                            ? {
                                ...current,
                                subscription_status: "ACTIVE",
                                grace_period_ends_at: undefined,
                              }
                            : current
                        );
                        push({
                          title: "Subscription attached",
                          description: `${nextSubscription.plan_name ?? "Selected plan"} activated manually.`,
                          variant: "success",
                        });
                        return;
                      }

                      const nextSubscription = await cancelBackendChildSubscription({
                        childId,
                        reason:
                          manualStatus === "GRACE_PERIOD"
                            ? "Admin restored grace period"
                            : "Admin cancelled subscription",
                        nextStatus: manualStatus,
                      });
                      setSubscription(nextSubscription);
                      setChild((current) =>
                        current
                          ? {
                              ...current,
                              subscription_status: manualStatus,
                              grace_period_ends_at:
                                manualStatus === "GRACE_PERIOD"
                                  ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                                  : undefined,
                            }
                          : current
                      );
                      push({
                        title: "Subscription updated",
                        description:
                          manualStatus === "GRACE_PERIOD"
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
                      setAttachingSubscription(false);
                    }
                  }}
                  disabled={attachingSubscription}
                >
                  {attachingSubscription ? "Updating..." : "Apply subscription status"}
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!activePlan) return;
                    await createBackendPaymentIntent({ child_id: childId, plan_id: activePlan.id });
                    push({ title: "Payment intent created", description: activePlan.name, variant: "success" });
                  }}
                >
                  Create payment intent
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    const confirmed = window.confirm(
                      "Reset today's served meal record for this child for testing? This will allow scanning again today."
                    );
                    if (!confirmed) {
                      return;
                    }

                    try {
                      setResettingMealService(true);
                      const result = await resetBackendChildMealServiceForTest({ childId });
                      if (result.subscription) {
                        setSubscription(result.subscription);
                      }
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
                  }}
                  disabled={resettingMealService}
                >
                  {resettingMealService ? "Resetting..." : "Reset today's meal scan (test)"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ledger snippet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ledger.length === 0 ? (
            <p className="text-sm text-slate-500">No transactions yet.</p>
          ) : (
            ledger.slice(0, 4).map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">{entry.type}</p>
                  <p className="text-xs text-slate-500">{formatDateTime(entry.created_at)}</p>
                </div>
                <span className="text-sm font-semibold text-slate-700">{entry.amount}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
