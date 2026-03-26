"use client";

import Link from "next/link";
import { useState } from "react";

const navItems = [
  { label: "Overview", href: "#platform" },
  { label: "Services", href: "#services" },
  { label: "Functionality", href: "#functionality" },
  { label: "Blockchain", href: "#blockchain" },
  { label: "Key Users", href: "#users" },
];

export default function Home() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-50 border-b border-amber-100 bg-white/80 backdrop-blur">
        <div className="flex w-full items-center justify-between gap-4 px-6 py-4 lg:px-28">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-white">
              FC
            </div>
            <div>
              <p className="text-lg font-semibold">FeedClass</p>
              <p className="text-xs text-slate-500">School Meal Management Software</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex lg:gap-8">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className="hover:text-slate-900">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden items-center justify-center rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white md:inline-flex"
            >
              Launch App
            </Link>
            <button
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-100 bg-white text-slate-700 shadow-sm md:hidden"
            >
              <span className="text-lg font-semibold">{menuOpen ? "✕" : "☰"}</span>
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="border-t border-amber-100 bg-white/95 px-6 py-4 md:hidden">
            <div className="flex flex-col gap-3 text-sm font-medium text-slate-700">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-full px-3 py-2 hover:bg-amber-50"
                  onClick={() => setMenuOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
              <Link
                href="/login"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Launch App
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-16 px-6 pb-16">
        <section id="platform" className="relative scroll-mt-24">
          <div className="absolute left-1/2 top-0 h-full w-screen -translate-x-1/2" aria-hidden="true">
            <div
              className="h-full w-full"
              style={{
                backgroundImage: "url('/banner.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            />
            <div className="absolute inset-0 bg-amber-50/70" />
          </div>
          <div className="relative left-1/2 z-10 w-screen -translate-x-1/2 rounded-[32px] border border-amber-100 bg-amber-50/60 p-8 pt-14 shadow-sm md:p-10 md:pt-16">
            <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
              <div className="space-y-6">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-600">FeedClass Beta</p>
              <h1 className="text-4xl font-semibold leading-tight text-slate-900">
                A role-aware school meal platform designed for admins, supervisors, operators, and donors.
              </h1>
              <p className="text-base text-slate-600">
                FeedClass unifies subscriptions, QR validation, payments, messaging, and reporting into one
                operational system for schools and partners.
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full bg-slate-900 px-6 py-3 text-sm font-semibold text-white"
                >
                  Launch FeedClass App
                </Link>
                <Link
                  href="#services"
                  className="inline-flex items-center justify-center rounded-full border border-slate-200 px-6 py-3 text-sm font-semibold text-slate-700"
                >
                  Explore Services
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[
                  { label: "Schools & Classes", value: "Multi-school registry" },
                  { label: "Meal Validation", value: "Instant QR checks" },
                  { label: "Impact Reporting", value: "Donor-safe aggregates" },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-amber-100 bg-white/80 p-4 text-left shadow-sm"
                  >
                    <p className="text-xs uppercase tracking-[0.2em] text-amber-600">{item.label}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-900">{item.value}</p>
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-amber-100 bg-white/80 p-5 text-sm text-slate-600 shadow-sm">
                <p className="font-semibold text-slate-900">Built for daily operations</p>
                <p className="mt-2">
                  Platform Admins manage plans, payments, ledgers, and dashboards. School Supervisors run daily
                  operations. Meal Servers (Operators) validate QR scans. Donors view aggregate impact only. Support
                  teams monitor quality and reconciliation.
                </p>
              </div>
            </div>
              <div className="grid gap-4">
                {[
                  {
                    title: "Children (Beneficiaries)",
                    description:
                      "Each child has a unique student ID and QR badge. Scans confirm eligibility, record meals, and reduce balance.",
                  },
                  {
                    title: "Parents / Guardians",
                    description:
                      "Pay monthly meal subscriptions via secure WhatsApp/SMS links, receive confirmations and expiry reminders.",
                  },
                  {
                    title: "School Administration (Supervisors / Agents)",
                    description:
                      "Manage daily distribution, scan QR badges, prevent duplicates, and track real-time meal totals and failures.",
                  },
                  {
                    title: "Suppliers",
                    description:
                      "Provide food and services. Invoices and payments are recorded to reconcile costs and calculate cost per meal.",
                  },
                  {
                    title: "Program Administration",
                    description:
                      "Configure plans, payments, suppliers, reports, and dashboards while monitoring finances and compliance.",
                  },
                  {
                    title: "Donors",
                    description:
                      "View aggregate impact metrics: meals served, children reached, funds received, and cost-per-meal trends.",
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    className="rounded-3xl border border-amber-100 bg-white/80 p-5 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-2 text-sm text-slate-500">{item.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section id="services" className="scroll-mt-24 relative left-1/2 w-screen -translate-x-1/2">
          <div className="w-full bg-white py-12">
            <div className="mx-auto w-full max-w-none px-0">
              <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch">
              <div className="space-y-6 px-6 lg:pl-16 lg:pr-10">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">Services</h2>
                  <p className="text-sm text-slate-600">
                    What FeedClass delivers for schools and program partners.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      title: "Meal Subscription Management",
                      description: "Create plans, track entitlements, and manage renewals across schools.",
                    },
                    {
                      title: "QR Meal Validation",
                      description: "Fast scan validation with clear success/fail states and audit trails.",
                    },
                    {
                      title: "Payments & Reconciliation",
                      description: "Generate payment links, track statuses, and reconcile revenue vs meals.",
                    },
                    {
                      title: "Messaging & Reminders",
                      description: "Guardian notifications, payment confirmations, and expiry reminders.",
                    },
                    {
                      title: "Supplier Cost Tracking",
                      description: "Supplier registry, invoices, and cost-per-meal calculations.",
                    },
                    {
                      title: "Dashboards & Exports",
                      description: "Admin, school, and donor dashboards with CSV exports.",
                    },
                  ].map((card) => (
                    <div key={card.title} className="rounded-3xl border border-amber-100 bg-white/90 p-6 shadow-sm">
                      <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                      <p className="mt-2 text-sm text-slate-500">{card.description}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex h-full min-h-[320px] items-stretch pr-6 lg:pr-16">
                <div className="h-full w-full overflow-hidden rounded-[28px] border border-amber-100 shadow-sm">
                  <img
                    src="/services.png"
                    alt="FeedClass services"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
              </div>
            </div>
          </div>
        </section>

        <section id="functionality" className="scroll-mt-24 relative left-1/2 w-screen -translate-x-1/2">
          <div className="w-full bg-white py-12">
            <div className="mx-auto w-full max-w-none px-0">
              <div className="grid gap-8 px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch lg:px-16">
                <div className="space-y-6">
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Core Functionality</h2>
                    <p className="text-sm text-slate-500">End-to-end workflows that power daily meal operations.</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-1">
                    {[
                      {
                        title: "Identity, Enrollment & QR Badges",
                        description:
                          "Schools, classes, children, guardians, CSV import, and printable QR badges tied to each child.",
                      },
                      {
                        title: "Subscriptions, Payments & Ledger",
                        description:
                          "Plan setup, payment links, webhook idempotency, and reconciliation across meals and revenue.",
                      },
                      {
                        title: "Meal Serving & Ops Visibility",
                        description:
                          "Fast scan validation, duplicate prevention, daily totals, failure queues, and donor-safe reporting.",
                      },
                    ].map((card) => (
                      <div key={card.title} className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm">
                        <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                        <p className="mt-2 text-sm text-slate-500">{card.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-start">
                  <div className="w-full overflow-hidden rounded-[28px] border border-amber-100 shadow-sm">
                    <img
                      src="/meal2.png"
                      alt="Core functionality preview"
                      className="h-[360px] w-full object-cover md:h-[420px]"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="blockchain" className="scroll-mt-24 relative left-1/2 w-screen -translate-x-1/2">
          <div className="w-full bg-white py-12">
            <div className="mx-auto w-full max-w-none px-0">
              <div className="grid gap-8 px-6 lg:grid-cols-2 lg:items-center lg:px-16">
                <div className="order-2 lg:order-1">
                  <div className="overflow-hidden rounded-[28px] border border-amber-100 shadow-sm">
                    <img src="/blockchain.png" alt="Blockchain verification" className="h-full w-full object-cover" />
                  </div>
                </div>
                <div className="order-1 space-y-4 lg:order-2">
                  <h2 className="text-2xl font-semibold text-slate-900">Blockchain Impact Verification</h2>
                  <p className="text-sm text-slate-600">
                    FeedClass includes a blockchain verification layer built on CELO, a mobile-first network
                    designed for emerging markets. Each day, meal service records are aggregated and anchored
                    to the blockchain as Merkle-root cryptographic hashes. These records contain no personally
                    identifiable information, but create tamper-proof, independently auditable proof that meals
                    were served at specific schools on specific dates, enabling transparent impact verification
                    for donors and partners.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="users" className="scroll-mt-24 relative left-1/2 w-screen -translate-x-1/2">
          <div
            className="w-full min-h-[640px] py-16"
            style={{
              backgroundImage: "url('/meal.png')",
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div className="absolute inset-0 bg-slate-900/55" aria-hidden="true" />
            <div className="mx-auto w-full max-w-none px-0">
              <div className="relative px-6 lg:px-16 space-y-6">
                <div>
                  <h2 className="text-2xl font-semibold text-white">Key User Experiences</h2>
                  <p className="text-sm text-white/80">
                    Interfaces map to clear responsibilities, keeping role access safe and focused.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: "Children (Beneficiaries)",
                description:
                  "Each child has a unique student ID and QR badge; scans validate eligibility, record meals, and reduce entitlements securely.",
              },
              {
                title: "Parents / Guardians",
                description:
                  "Pay monthly subscriptions via secure WhatsApp/SMS links, receive confirmations, and get expiry reminders.",
              },
              {
                title: "School Administration (Supervisors / Agents)",
                description:
                  "Runs daily distribution, scans QR badges, prevents duplicates, and tracks real-time meal totals and failures.",
              },
              {
                title: "Suppliers",
                description:
                  "Provide food and services; invoices and payments are tracked to reconcile costs and calculate cost per meal.",
              },
              {
                title: "Program Administration",
                description:
                  "Configures plans, payments, suppliers, reports, and dashboards while monitoring finances and compliance.",
              },
              {
                title: "Donors",
                description:
                  "View aggregate impact metrics only: meals served, children reached, funds received, and cost-per-meal trends.",
              },
            ].map((card) => (
              <div key={card.title} className="rounded-3xl border border-amber-100 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">{card.title}</h3>
                <p className="mt-2 text-sm text-slate-500">{card.description}</p>
              </div>
            ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-amber-100 bg-white/80 py-4 text-center text-xs text-slate-500">
        Beta UI — mock data
      </footer>
    </div>
  );
}
