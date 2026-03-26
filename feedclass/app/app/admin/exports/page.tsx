"use client";

import { useEffect, useState } from "react";
import { getSchools } from "@/lib/mockApi";
import { School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/use-toast";

export default function AdminExportsPage() {
  const { push } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [month, setMonth] = useState("2026-03");
  const [schoolId, setSchoolId] = useState("");

  useEffect(() => {
    getSchools().then(setSchools);
  }, []);

  const handleDownload = () => {
    if (!schoolId) {
      push({ title: "Select a school", description: "Choose a school before exporting.", variant: "danger" });
      return;
    }
    push({ title: "Export ready", description: `${month}/monthly.csv`, variant: "success" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Exports"
        description="Monthly export placeholders for finance and reporting."
      />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger>
                <SelectValue placeholder="Select month" />
              </SelectTrigger>
              <SelectContent>
                {[
                  "2026-03",
                  "2026-02",
                  "2026-01",
                  "2025-12",
                ].map((entry) => (
                  <SelectItem key={entry} value={entry}>
                    {entry}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={schoolId} onValueChange={setSchoolId}>
              <SelectTrigger>
                <SelectValue placeholder="Select school" />
              </SelectTrigger>
              <SelectContent>
                {schools.map((school) => (
                  <SelectItem key={school.id} value={school.id}>
                    {school.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleDownload}>Download monthly.csv</Button>
        </CardContent>
      </Card>
    </div>
  );
}
