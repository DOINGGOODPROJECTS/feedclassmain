"use client";

import { useEffect, useMemo, useState } from "react";
import { getBackendLedgerTransactions, getBackendSchools } from "@/lib/backendApi";
import { LedgerTransaction, School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { formatCurrency, formatDateTime } from "@/lib/utils";

export default function AdminLedgerPage() {
  const [ledger, setLedger] = useState<LedgerTransaction[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [childId, setChildId] = useState("");
  const [schoolId, setSchoolId] = useState("");
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  useEffect(() => {
    void getBackendSchools()
      .then(setSchools)
      .catch(() => {
        setSchools([]);
      });
  }, []);

  useEffect(() => {
    void getBackendLedgerTransactions({
      child_id: childId || undefined,
      school_id: schoolId || undefined,
      type: type || undefined,
      date_from: from || undefined,
      date_to: to || undefined,
    })
      .then((ledgerData) => {
        setLedger(ledgerData.transactions);
      })
      .catch(() => {
        setLedger([]);
      });
  }, [childId, schoolId, type, from, to]);

  const filtered = useMemo(() => ledger, [ledger]);
  const availableSchools = useMemo(() => {
    if (schools.length > 0) {
      return schools;
    }

    const seen = new Map<string, School>();
    for (const row of ledger) {
      if (!row.school_id || !row.school_name || seen.has(row.school_id)) {
        continue;
      }

      seen.set(row.school_id, {
        id: row.school_id,
        name: row.school_name,
        location: row.school_name,
      });
    }

    return Array.from(seen.values());
  }, [ledger, schools]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Ledger"
        description="Append-only financial and entitlement transactions from the database."
      />

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <Input placeholder="Child ID" value={childId} onChange={(e) => setChildId(e.target.value)} />
          <select
            value={schoolId}
            onChange={(e) => setSchoolId(e.target.value)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">All schools</option>
            {availableSchools.length === 0 ? <option value="" disabled>No schools available</option> : null}
            {availableSchools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">All types</option>
            <option value="SUBSCRIPTION_PURCHASE">SUBSCRIPTION_PURCHASE</option>
            <option value="DEBIT_MEAL">DEBIT_MEAL</option>
            <option value="GRACE_MEAL">GRACE_MEAL</option>
            <option value="ADJUSTMENT">ADJUSTMENT</option>
          </select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>

        <DataTable
          columns={[
            { header: "Child", render: (row: LedgerTransaction) => `${row.child_name} (${row.student_id})` },
            { header: "School", render: (row: LedgerTransaction) => row.school_name },
            { header: "Class", render: (row: LedgerTransaction) => row.class_name },
            { header: "Type", render: (row: LedgerTransaction) => row.type },
            { header: "Amount", render: (row: LedgerTransaction) => formatCurrency(row.amount) },
            {
              header: "Metadata",
              render: (row: LedgerTransaction) => Object.values(row.metadata || {}).join(" ") || "-",
            },
            { header: "Created", render: (row: LedgerTransaction) => formatDateTime(row.created_at) },
          ]}
          data={filtered}
        />
      </div>
    </div>
  );
}
