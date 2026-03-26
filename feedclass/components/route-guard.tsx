"use client";

import { usePathname } from "next/navigation";
import { hasRouteAccess } from "@/lib/access";
import { useAppStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const role = useAppStore((state) => state.role);

  if (!hasRouteAccess(role, pathname)) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-slate-900">403</h1>
        <p className="mt-2 text-slate-500">
          Your current role does not have access to this section.
        </p>
        <div className="mt-6 flex justify-center">
          <Button asChild variant="outline">
            <Link href="/app">Return to overview</Link>
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
