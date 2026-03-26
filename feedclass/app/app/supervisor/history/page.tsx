"use client";

import { useEffect, useMemo, useState } from "react";
import { getBackendMealServes } from "@/lib/backendApi";
import { MealServe } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

export default function SupervisorHistoryPage() {
  const schoolId = useAppStore((state) => state.supervisorSchoolId);
  const [history, setHistory] = useState<Array<MealServe & { child_name?: string }>>([]);
  const [date, setDate] = useState("");

  useEffect(() => {
    void getBackendMealServes(schoolId).then(setHistory);
  }, [schoolId]);

  const filtered = useMemo(() => {
    if (!date) return history;
    return history.filter((entry) => entry.serve_date === date);
  }, [history, date]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Admin · Meal History"
        description="Review served meals by date with live database records."
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-xs" />
        <DataTable
          columns={[
            { header: "Child", render: (row: MealServe & { child_name?: string }) => row.child_name || row.child_id },
            { header: "Meal", render: (row: MealServe) => row.meal_type },
            { header: "Serve date", render: (row: MealServe) => row.serve_date },
            { header: "Logged at", render: (row: MealServe) => formatDateTime(row.created_at) },
          ]}
          data={filtered}
        />
      </div>
    </div>
  );
}
