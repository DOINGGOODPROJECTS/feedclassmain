"use client";

import { useEffect, useMemo, useState } from "react";
import { getClasses, getPaymentTransactions, getSchools } from "@/lib/mockApi";
import { ClassRoom, PaymentTransactionRecord, School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatCurrency, formatDateTime } from "@/lib/utils";

type TransactionFilter = "ALL" | "PAID" | "FAILED";

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<PaymentTransactionRecord[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [schoolId, setSchoolId] = useState<string>("ALL");
  const [classId, setClassId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<TransactionFilter>("ALL");

  useEffect(() => {
    getPaymentTransactions().then(setTransactions);
    getSchools().then(setSchools);
    getClasses().then(setClasses);
  }, []);

  const visibleClasses = useMemo(
    () => classes.filter((entry) => schoolId === "ALL" || entry.school_id === schoolId),
    [classes, schoolId]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((entry) => {
        if (schoolId !== "ALL" && entry.school_id !== schoolId) return false;
        if (classId !== "ALL" && entry.class_id !== classId) return false;
        if (statusFilter !== "ALL" && entry.status !== statusFilter) return false;
        return true;
      }),
    [transactions, schoolId, classId, statusFilter]
  );

  const paidCount = filteredTransactions.filter((entry) => entry.status === "PAID").length;
  const failedCount = filteredTransactions.filter((entry) => entry.status === "FAILED").length;
  const totalValue = filteredTransactions.reduce((sum, entry) => sum + entry.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Transactions"
        description="Successful and failed payment transactions with school and class filters."
      />

      <StatCards
        items={[
          { label: "Transactions", value: filteredTransactions.length.toString(), helper: "Current filter" },
          { label: "Successful", value: paidCount.toString(), helper: "Paid payments" },
          { label: "Failed", value: failedCount.toString(), helper: "Needs retry" },
          { label: "Value", value: formatCurrency(totalValue), helper: "Visible records" },
        ]}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[220px,220px,1fr]">
            <Select
              value={schoolId}
              onValueChange={(value) => {
                setSchoolId(value);
                setClassId("ALL");
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="All schools" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All schools</SelectItem>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger>
                <SelectValue placeholder="All classes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All classes</SelectItem>
                {visibleClasses.map((entry) => (
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
              { header: "School", render: (row: PaymentTransactionRecord) => row.school_name },
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
