"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAuthTokens, getBackendSchools } from "@/lib/backendApi";
import { School } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

export function Navbar() {
  const router = useRouter();
  const role = useAppStore((state) => state.role);
  const activeSchoolId = useAppStore((state) => state.activeSchoolId);
  const supervisorSchoolId = useAppStore((state) => state.supervisorSchoolId);
  const setActiveSchoolId = useAppStore((state) => state.setActiveSchoolId);
  const [schools, setSchools] = useState<School[]>([]);

  useEffect(() => {
    getBackendSchools().then(setSchools).catch(() => setSchools([]));
  }, []);

  const supervisorSchool = schools.find((school) => school.id === supervisorSchoolId);
  const roleLabels: Record<"ADMIN" | "SCHOOL_ADMIN" | "DONOR_READONLY", string> = {
    ADMIN: "Program Admin",
    SCHOOL_ADMIN: "School Admin",
    DONOR_READONLY: "Donor",
  };

  return (
    <header className="border-b border-slate-200/60 bg-white/80 backdrop-blur">
      <div className="flex w-full max-w-none items-center justify-between gap-4 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
            FC
          </div>
          <div>
            <Link href="/app" className="text-lg font-semibold text-slate-900">
              FeedClass
            </Link>
            <p className="text-xs text-slate-500">School Meal Management Software</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" className="hidden md:inline-flex">
            <Link href="/">Back to Frontpage</Link>
          </Button>
          {role === "ADMIN" && (
            <div className="hidden items-center gap-2 md:flex">
              <span className="text-xs uppercase text-slate-400">School Context</span>
              <Select value={activeSchoolId} onValueChange={setActiveSchoolId}>
                <SelectTrigger className="w-[200px]">
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
          )}

          {role === "SCHOOL_ADMIN" && supervisorSchool && (
            <Badge variant="secondary">My School: {supervisorSchool.name}</Badge>
          )}

          <Button variant="outline" className="gap-2" disabled>
            Role: {roleLabels[role]}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              clearAuthTokens();
              window.localStorage.removeItem("fc_role");
              document.cookie = "fc_role=; path=/; max-age=0";
              router.push("/login");
            }}
          >
            Logout
          </Button>
        </div>
      </div>
    </header>
  );
}
