"use client";

import { useEffect, useState } from "react";
import { getBackendValidationLogs } from "@/lib/backendApi";
import { useAppStore } from "@/lib/store";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SupervisorProblemsPage() {
  const schoolId = useAppStore((state) => state.supervisorSchoolId);
  const [problems, setProblems] = useState<Array<{ id: string; child_name?: string; reason?: string | null; reason_code: string }>>([]);

  useEffect(() => {
    void getBackendValidationLogs(schoolId).then((data) =>
      setProblems(
        data
          .filter((entry) => entry.result === "FAILED")
          .map((entry) => ({
            id: entry.id,
            child_name: "child_name" in entry ? entry.child_name : undefined,
            reason: "reason" in entry ? entry.reason : null,
            reason_code: entry.reason_code,
          }))
      )
    );
  }, [schoolId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="School Admin · Problems"
        description="Scan failures and blockers pulled from live scan logs."
      />

      <Card>
        <CardContent className="space-y-3 p-6">
          {problems.length === 0 ? (
            <p className="text-sm text-slate-500">No problems detected.</p>
          ) : (
            problems.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
                <span className="text-sm font-semibold text-slate-800">{entry.child_name || "Unknown child"}</span>
                <Badge variant="warning">{entry.reason || entry.reason_code}</Badge>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
