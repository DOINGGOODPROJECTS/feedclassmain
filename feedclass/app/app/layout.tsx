"use client";

import { AppShell } from "@/components/app-shell";
import { RouteGuard } from "@/components/route-guard";
import { SessionGuard } from "@/components/session-guard";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppShell>
      <SessionGuard>
        <RouteGuard>{children}</RouteGuard>
      </SessionGuard>
    </AppShell>
  );
}
