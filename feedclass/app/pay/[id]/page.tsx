import Link from "next/link";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

async function getPaymentIntentDetails(id: string) {
  const response = await fetch(`${API_BASE_URL}/public/payment-intents/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    return null;
  }

  return response.json() as Promise<{
    intent: {
      id: string;
      reference: string;
      amount: number;
      status: string;
      payment_url: string;
      created_at: string;
    };
    child: {
      id: string;
      studentId: string;
      fullName: string;
    } | null;
    guardian: {
      id: string;
      name: string;
      phone: string;
    } | null;
    plan: {
      id: string;
      name: string;
      mealType: string;
      mealsPerCycle: number;
      price: number;
    } | null;
  }>;
}

export default async function PublicPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const payment = await getPaymentIntentDetails(id);

  if (!payment) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] px-6 py-12">
        <div className="mx-auto max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">FeedClass Payments</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Payment link not found</h1>
          <p className="mt-3 text-sm text-slate-600">
            This payment link is invalid or has been removed. Contact the school administrator if you need a new link.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe_0%,#f8fafc_36%,#e2e8f0_100%)] px-6 py-12">
      <div className="mx-auto max-w-3xl space-y-6">
        <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">FeedClass Payments</p>
          <h1 className="mt-4 text-3xl font-semibold text-slate-900">Meal subscription payment</h1>
          <p className="mt-3 text-sm text-slate-600">
            This payment page was generated for the child below. Review the details before continuing with payment.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Child</p>
              <p className="mt-3 text-xl font-semibold text-slate-900">{payment.child?.fullName ?? "Unknown child"}</p>
              <p className="mt-1 text-sm text-slate-500">{payment.child?.studentId ?? "-"}</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Guardian</p>
              <p className="mt-3 text-xl font-semibold text-slate-900">{payment.guardian?.name ?? "Unknown guardian"}</p>
              <p className="mt-1 text-sm text-slate-500">{payment.guardian?.phone ?? "-"}</p>
            </div>
          </div>

          <div className="mt-4 rounded-3xl border border-slate-200 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Plan</p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{payment.plan?.name ?? "Subscription plan"}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {payment.plan?.mealType ?? "Meal"} · {payment.plan?.mealsPerCycle ?? 0} meals per cycle
                </p>
              </div>
              <div className="rounded-2xl bg-slate-950 px-5 py-4 text-white">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Amount</p>
                <p className="mt-2 text-3xl font-semibold">${Number(payment.intent.amount || 0).toFixed(2)}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Reference</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{payment.intent.reference}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">{payment.intent.status}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Created</p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {new Date(payment.intent.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950">
            Online payment capture is not wired yet. This page now gives guardians a valid public payment reference page
            instead of a localhost-only link.
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-6 py-3 text-sm font-semibold text-white"
            >
              Contact school support
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
