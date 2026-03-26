"use client";

import { useEffect, useMemo, useState } from "react";
import {
  createBackendPaymentIntent,
  getBackendChildren,
  getBackendClasses,
  getBackendPaymentIntents,
  getBackendSchools,
  getBackendSubscriptionPlans,
  sendBackendPaymentLink,
} from "@/lib/backendApi";
import { Child, ClassRoom, Guardian, PaymentIntent, School, SubscriptionPlan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

export default function AdminPaymentsPage() {
  const { push } = useToast();
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [schoolId, setSchoolId] = useState<string>("ALL");
  const [classId, setClassId] = useState<string>("ALL");

  useEffect(() => {
    Promise.all([
      getBackendPaymentIntents(),
      getBackendClasses(),
      getBackendChildren(),
      getBackendSubscriptionPlans(),
      getBackendSchools(),
    ]).then(([intentData, classData, childData, planData, schoolData]) => {
      setIntents(intentData);
      setClasses(classData);
      setChildren(childData.children);
      setGuardians(childData.guardians);
      setPlans(planData);
      setSchools(schoolData);
    });
  }, []);

  const handleSendPaymentLink = async (intent: PaymentIntent) => {
    const child = children.find((entry) => entry.id === intent.child_id);
    if (!child) {
      return;
    }
    try {
      const ensuredIntent = intent.id
        ? intent
        : await createBackendPaymentIntent({ child_id: child.id, plan_id: intent.plan_id });
      const result = await sendBackendPaymentLink(ensuredIntent.id);
      setIntents((prev) => {
        const remaining = prev.filter((entry) => entry.id !== result.intent.id);
        return [...remaining, result.intent];
      });
      push({
        title: "Payment link sent",
        description: `${child.full_name} guardian notified via ${result.channel}.`,
        variant: "success",
      });
    } catch (error) {
      push({
        title: "Send failed",
        description: error instanceof Error ? error.message : "Could not send payment link.",
        variant: "danger",
      });
    }
  };

  const visibleClasses = useMemo(
    () => classes.filter((entry) => schoolId === "ALL" || entry.school_id === schoolId),
    [classes, schoolId]
  );

  const filteredIntents = useMemo(
    () =>
      intents.filter((intent) => {
        const child = children.find((entry) => entry.id === intent.child_id);
        if (!child) {
          return false;
        }
        if (schoolId !== "ALL" && child.school_id !== schoolId) {
          return false;
        }
        if (classId !== "ALL" && child.class_id !== classId) {
          return false;
        }
        return true;
      }),
    [intents, children, schoolId, classId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Payments"
        description="Payment intents, status tracking, link management, and admin-only updates."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <div className="mb-4 grid gap-3 md:grid-cols-2">
          <select
            value={schoolId}
            onChange={(event) => {
              setSchoolId(event.target.value);
              setClassId("ALL");
            }}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="ALL">All schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>

          <select
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="ALL">All classes</option>
            {visibleClasses.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>

        <DataTable
          columns={[
            { header: "Reference", render: (row: PaymentIntent) => row.reference },
            {
              header: "Child",
              render: (row: PaymentIntent) =>
                children.find((entry) => entry.id === row.child_id)?.full_name ?? row.child_id,
            },
            {
              header: "Guardian",
              render: (row: PaymentIntent) => {
                const child = children.find((entry) => entry.id === row.child_id);
                return guardians.find((entry) => entry.id === child?.guardian_id)?.name ?? "-";
              },
            },
            {
              header: "WhatsApp",
              render: (row: PaymentIntent) => {
                const child = children.find((entry) => entry.id === row.child_id);
                return guardians.find((entry) => entry.id === child?.guardian_id)?.phone ?? "-";
              },
            },
            {
              header: "Plan",
              render: (row: PaymentIntent) =>
                plans.find((entry) => entry.id === row.plan_id)?.name ?? row.plan_id,
            },
            { header: "Amount", render: (row: PaymentIntent) => formatCurrency(row.amount) },
            { header: "Status", render: (row: PaymentIntent) => row.status },
            {
              header: "Payment link",
              render: (row: PaymentIntent) => (
                <a
                  href={row.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-slate-600 underline-offset-2 hover:underline"
                >
                  Open payment page
                </a>
              ),
            },
            {
              header: "Actions",
              render: (row: PaymentIntent) => (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleSendPaymentLink(row)}>
                    Send payment link
                  </Button>
                </div>
              ),
            },
          ]}
          data={filteredIntents}
        />
      </div>
    </div>
  );
}
