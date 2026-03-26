"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navByRole } from "@/lib/navigation";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Navbar } from "@/components/navbar";
import { PhaseNote } from "@/components/phase-note";

export function AppShell({ children }: { children: React.ReactNode }) {
  const role = useAppStore((state) => state.role);
  const pathname = usePathname();
  const navItems = navByRole[role];

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <div className="flex w-full max-w-none gap-6 px-6 pb-10 pt-6">
        <aside className="hidden w-56 shrink-0 rounded-3xl border border-slate-200 bg-white/80 p-4 lg:block">
          <div className="text-xs font-semibold uppercase text-slate-400">Navigation</div>
          <nav className="mt-4 flex flex-col gap-1">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-2xl px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200",
                  (pathname === item.href || pathname.startsWith(`${item.href}/`)) &&
                    "bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:text-white active:bg-slate-900"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1 space-y-6">
          <PhaseNote />
          {children}
        </main>
      </div>
      <footer className="border-t border-slate-200 bg-white/80 py-4 text-center text-xs text-slate-400">
        Beta UI — mock data
      </footer>
    </div>
  );
}
