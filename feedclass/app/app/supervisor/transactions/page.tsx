"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getBackendChildren,
  getBackendClasses,
  getBackendPaymentIntents,
  getBackendSubscriptionPlans,
} from "@/lib/backendApi";
import { Child, ClassRoom, Guardian, PaymentIntent, PaymentTransactionRecord, SubscriptionPlan } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type TransactionFilter = "ALL" | "PAID" | "FAILED";

export default function SchoolAdminTransactionsPage() {
  const schoolId = useAppStore((state) => state.supervisorSchoolId);
  const [intents, setIntents] = useState<PaymentIntent[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [classId, setClassId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<TransactionFilter>("ALL");

  useEffect(() => {
    void Promise.all([
      getBackendPaymentIntents(schoolId),
      getBackendChildren(schoolId),
      getBackendClasses(schoolId),
      getBackendSubscriptionPlans(),
    ]).then(([intentData, childData, classData, planData]) => {
      setIntents(intentData);
      setChildren(childData.children);
      setGuardians(childData.guardians);
      setClasses(classData);
      setPlans(planData);
    });
  }, [schoolId]);

  const transactions = useMemo<PaymentTransactionRecord[]>(
    () =>
      intents.map((intent) => {
        const child = children.find((entry) => entry.id === intent.child_id);
        const guardian = guardians.find((entry) => entry.id === child?.guardian_id);
        const classRoom = classes.find((entry) => entry.id === child?.class_id);
        const plan = plans.find((entry) => entry.id === intent.plan_id);
        return {
          intent_id: intent.id,
          reference: intent.reference,
          status: intent.status,
          amount: intent.amount,
          payment_url: intent.payment_url,
          created_at: intent.created_at,
          child_id: child?.id || intent.child_id,
          child_name: child?.full_name || intent.child_id,
          school_id: child?.school_id || schoolId,
          school_name: "",
          class_id: classRoom?.id || child?.class_id || "",
          class_name: classRoom?.name || "-",
          guardian_name: guardian?.name || "-",
          guardian_phone: guardian?.phone || "-",
          plan_id: plan?.id || intent.plan_id,
          plan_name: plan?.name || intent.plan_id,
        };
      }),
    [intents, children, guardians, classes, plans, schoolId]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((entry) => {
        if (classId !== "ALL" && entry.class_id !== classId) return false;
        if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
        return true;
      }),
    [transactions, classId, statusFilter]
  );

  const paidCount = filteredTransactions.filter((entry) => entry.status === "PAID").length;
  const failedCount = filteredTransactions.filter((entry) => entry.status === "FAILED").length;
  const totalValue = filteredTransactions.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Admin · Transactions"
        description="Successful and failed payment transactions for your school, filtered by class."
      />

      <StatCards
        items={[
          { label: "Transactions", value: filteredTransactions.length.toString(), helper: "Current class filter" },
          { label: "Successful", value: paidCount.toString(), helper: "Paid payments" },
          { label: "Failed", value: failedCount.toString(), helper: "Needs retry" },
          { label: "Value", value: formatCurrency(totalValue), helper: "Visible records" },
        ]}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 md:grid-cols-[220px,1fr]">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {classes.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex flex-wrap gap-2">
              {(["ALL", "PAID", "FAILED"] as TransactionFilter[]).map((value) => (
                <Button
                  key={value}
                  variant={statusFilter === value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setStatusFilter(value)}
                >
                  {value === "ALL" ? "All" : value === "PAID" ? "Successful" : "Failed"}
                </Button>
              ))}
            </div>
          </div>

          <DataTable
            columns={[
              { header: "Reference", render: (row: PaymentTransactionRecord) => row.reference },
              { header: "Child", render: (row: PaymentTransactionRecord) => row.child_name },
              { header: "Class", render: (row: PaymentTransactionRecord) => row.class_name },
              { header: "Guardian", render: (row: PaymentTransactionRecord) => row.guardian_name },
              { header: "WhatsApp", render: (row: PaymentTransactionRecord) => row.guardian_phone },
              { header: "Plan", render: (row: PaymentTransactionRecord) => row.plan_name },
              { header: "Amount", render: (row: PaymentTransactionRecord) => formatCurrency(row.amount) },
              { header: "Status", render: (row: PaymentTransactionRecord) => row.status },
              { header: "Created", render: (row: PaymentTransactionRecord) => formatDateTime(row.created_at) },
            ]}
            data={filteredTransactions}
          />
        </CardContent>
      </Card>
    </div>
  );
}
