"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBackendChildren, getBackendClasses, getBackendSchools } from "@/lib/backendApi";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClassRoom, Child, School } from "@/lib/types";
import { useToast } from "@/components/ui/use-toast";

export default function SchoolDetailClient() {
  const { push } = useToast();
  const params = useParams();
  const schoolId = params.id as string;
  const [school, setSchool] = useState<School | null>(null);
  const [schoolClasses, setSchoolClasses] = useState<ClassRoom[]>([]);
  const [schoolChildren, setSchoolChildren] = useState<Child[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBackendSchools(), getBackendClasses(schoolId), getBackendChildren()])
      .then(([schools, classes, childData]) => {
        setSchool(schools.find((entry) => entry.id === schoolId) ?? null);
        setSchoolClasses(classes.filter((entry) => entry.school_id === schoolId));
        setSchoolChildren(childData.children.filter((entry) => entry.school_id === schoolId));
        setLoading(false);
      })
      .catch((error) => {
        push({
          title: "Failed to load school",
          description: error instanceof Error ? error.message : "Unable to load school details.",
          variant: "danger",
        });
        setLoading(false);
      });
  }, [push, schoolId]);

  if (loading) {
    return <div className="text-sm text-slate-500">Loading school...</div>;
  }

  if (!school) {
    return <div className="text-sm text-slate-500">School not found.</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={school.name}
        description={`Program Admin view · School profile · Location: ${school.location}`}
        actions={<Badge variant="secondary">Active</Badge>}
      />

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Classes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{schoolClasses.length}</p>
            <p className="text-sm text-slate-500">Active homerooms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Children Enrolled</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-slate-900">{schoolChildren.length}</p>
            <p className="text-sm text-slate-500">Across all grades</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Supervisors</CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">Backend staff list not wired yet</Badge>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Classes overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {schoolClasses.map((cls) => (
            <div key={cls.id} className="flex items-center justify-between rounded-2xl border border-slate-200 px-4 py-3">
              <div>
                <p className="font-semibold text-slate-800">{cls.name}</p>
                <p className="text-xs text-slate-500">{cls.grade}</p>
              </div>
              <span className="text-sm text-slate-500">
                {schoolChildren.filter((child) => child.class_id === cls.id).length} children
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
