"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { storeAuthTokens } from "@/lib/backendApi";
import { useAppStore } from "@/lib/store";
import { Role } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const demoAccounts = [
  { label: "Program Admin", email: "admin@feedclass.test", password: "password123" },
  { label: "School Admin / Supervisor", email: "supervisor@sherpherdhill.com", password: "Dev5555!" },
  { label: "Donor", email: "donor@feedclass.test", password: "password123" },
];

function mapBackendRole(role: string): Role {
  if (role === "SUPERVISOR") {
    return "SCHOOL_ADMIN";
  }

  if (role === "ADMIN" || role === "DONOR_READONLY" || role === "SCHOOL_ADMIN") {
    return role;
  }

  return "ADMIN";
}

export default function LoginPage() {
  const router = useRouter();
  const { push } = useToast();
  const setRole = useAppStore((state) => state.setRole);
  const [email, setEmail] = useState(demoAccounts[0].email);
  const [password, setPassword] = useState(demoAccounts[0].password);
  const [submitting, setSubmitting] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#ffffff_55%)] px-6 py-12 text-slate-900">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[0.9fr,1.1fr]">
        <div className="space-y-6">
          <Link href="/" className="inline-flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white">FC</div>
            <div>
              <p className="text-lg font-semibold">FeedClass</p>
              <p className="text-xs text-slate-500">School Meal Management Software</p>
            </div>
          </Link>

          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Secure access</p>
            <h1 className="text-4xl font-semibold leading-tight text-slate-900">
              Sign in to the FeedClass operations workspace.
            </h1>
            <p className="max-w-xl text-sm text-slate-600">
              Use your backend login to access the correct dashboard for program administration, school operations, or
              donor reporting.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {demoAccounts.map((entry) => (
              <div key={entry.email} className="rounded-3xl border border-amber-100 bg-white/80 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.2em] text-amber-700">{entry.label}</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{entry.email}</p>
                <p className="text-xs text-slate-500">Temporary password: {entry.password}</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  onClick={() => {
                    setEmail(entry.email);
                    setPassword(entry.password);
                  }}
                >
                  Use these details
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Card className="border-amber-100 bg-white/90 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle>Login</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter your password"
              />
            </div>

            <Button
              className="w-full"
              disabled={submitting}
              onClick={async () => {
                if (!email.trim() || !password.trim()) {
                  push({ title: "Missing credentials", description: "Enter email and password.", variant: "danger" });
                  return;
                }

                setSubmitting(true);

                try {
                  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email, password }),
                  });

                  const payload = await response.json();

                  if (!response.ok) {
                    push({
                      title: "Login failed",
                      description: payload.message || "Unable to sign in.",
                      variant: "danger",
                    });
                    return;
                  }

                  setRole(mapBackendRole(payload.user.role));
                  storeAuthTokens(payload.accessToken, payload.refreshToken);
                  push({
                    title: "Login successful",
                    description: `Signed in as ${payload.user.name}.`,
                    variant: "success",
                  });
                  router.push("/app");
                } catch {
                  push({
                    title: "Backend unavailable",
                    description: "Make sure the backend is running on port 5000.",
                    variant: "danger",
                  });
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? "Signing in..." : "Sign in"}
            </Button>

            <p className="text-xs text-slate-500">
              This screen uses the backend login API at <code>{API_BASE_URL}</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
