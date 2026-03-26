import {
  ActivityLog,
  AiReport,
  AnomalyAlert,
  Child,
  ChildQr,
  ClassRoom,
  Guardian,
  MealServe,
  MessageOutbox,
  PaymentIntent,
  ReasonCode,
  School,
  SubscriptionPlan,
  Supplier,
  ValidationLog,
  GracePeriod,
  PaymentTransactionRecord,
  SchoolStaff,
  SchoolStaffRole,
  SupervisorChildLookupItem,
} from "./types";
import {
  activity_logs,
  ai_reports,
  anomaly_alerts,
  child_qr,
  child_subscriptions,
  children,
  classes,
  message_logs,
  message_outbox,
  payment_events,
  payment_intents,
  schools,
  school_staff,
  subscription_plans,
  supplier_invoices,
  suppliers,
  transactions,
  validation_logs,
  meal_serves,
  guardians,
  grace_periods,
} from "./mockData";
import { buildChildQrPayload, buildVerificationLink } from "./qr";
import { todayISO } from "./utils";

const latency = () => 400 + Math.floor(Math.random() * 400);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

function getActiveGracePeriod(childId: string) {
  const grace = grace_periods.find((entry) => entry.child_id === childId);
  if (!grace) {
    return null;
  }

  const start = new Date(grace.start_date);
  const diffDays = Math.floor((new Date(todayISO()).getTime() - start.getTime()) / 86400000);
  const active = diffDays >= 0 && diffDays < 7 && grace.days_used < 7;

  return active ? grace : null;
}

function escapeSvgText(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildChildBadgeDataUrl(child: Child) {
  const school = schools.find((entry) => entry.id === child.school_id);
  const classRoom = classes.find((entry) => entry.id === child.class_id);
  const payload = buildChildQrPayload(child);
  const profileImage = child.profile_image_url || "/qr-placeholder.svg";
  const schoolName = school?.name ?? "FeedClass School";
  const className = classRoom?.name ?? "Class";
  const safeName = escapeSvgText(child.full_name);
  const safeStudentId = escapeSvgText(child.student_id);
  const safeSchool = escapeSvgText(schoolName);
  const safeClass = escapeSvgText(className);
  const safePayload = escapeSvgText(payload);
  const safeProfileImage = escapeSvgText(profileImage);

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="1080" viewBox="0 0 720 1080">
      <defs>
        <linearGradient id="badgeBg" x1="0%" x2="100%" y1="0%" y2="100%">
          <stop offset="0%" stop-color="#f8fafc" />
          <stop offset="100%" stop-color="#e2e8f0" />
        </linearGradient>
      </defs>
      <rect width="720" height="1080" rx="44" fill="url(#badgeBg)" />
      <rect x="36" y="36" width="648" height="1008" rx="36" fill="#ffffff" stroke="#cbd5e1" stroke-width="4" />
      <text x="72" y="110" font-family="Arial, sans-serif" font-size="28" fill="#64748b" letter-spacing="3">FEEDCLASS QR BADGE</text>
      <text x="72" y="160" font-family="Arial, sans-serif" font-size="38" font-weight="700" fill="#0f172a">${safeSchool}</text>
      <image x="72" y="205" width="576" height="420" href="${safeProfileImage}" preserveAspectRatio="xMidYMid slice" />
      <text x="72" y="695" font-family="Arial, sans-serif" font-size="46" font-weight="700" fill="#0f172a">${safeName}</text>
      <text x="72" y="748" font-family="Arial, sans-serif" font-size="28" fill="#334155">Student ID: ${safeStudentId}</text>
      <text x="72" y="790" font-family="Arial, sans-serif" font-size="24" fill="#64748b">Class: ${safeClass}</text>
      <rect x="72" y="836" width="576" height="140" rx="28" fill="#0f172a" />
      <text x="360" y="893" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" fill="#cbd5e1">SCAN POINTER</text>
      <text x="360" y="940" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="700" fill="#ffffff">${safePayload}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function ensureChildQrBadge(child: Child): ChildQr {
  const payload = buildChildQrPayload(child);
  const badgeUrl = buildChildBadgeDataUrl(child);
  const verificationLink = buildVerificationLink(payload);
  const existing = child_qr.find((entry) => entry.child_id === child.id);

  if (existing) {
    existing.qr_payload = payload;
    existing.qr_image_url = badgeUrl;
    existing.verification_link = verificationLink;
    return existing;
  }

  const nextQr = {
    child_id: child.id,
    qr_payload: payload,
    qr_image_url: badgeUrl,
    verification_link: verificationLink,
  };
  child_qr.push(nextQr);
  return nextQr;
}

function syncChildQrBadges() {
  children.forEach((child) => {
    ensureChildQrBadge(child);
  });
}

function syncExpiredSubscriptionPaymentIntents() {
  child_subscriptions
    .filter((subscription) => subscription.status === "EXPIRED")
    .forEach((subscription) => {
      const existingIntent = payment_intents.find(
        (intent) => intent.child_id === subscription.child_id && intent.plan_id === subscription.plan_id
      );
      if (existingIntent) {
        return;
      }

      const plan = subscription_plans.find((entry) => entry.id === subscription.plan_id);
      payment_intents.push({
        id: uid("pi"),
        child_id: subscription.child_id,
        plan_id: subscription.plan_id,
        amount: plan?.price ?? 0,
        reference: `INV-${Math.floor(2000 + Math.random() * 8000)}`,
        status: "PENDING",
        payment_url: `https://pay.mock/expired-${subscription.child_id}`,
        created_at: new Date().toISOString(),
      });
    });
}

export async function getSchools() {
  await wait(latency());
  return [...schools];
}

export async function getSchoolStaff(schoolId: string): Promise<SchoolStaff[]> {
  await wait(latency());
  return school_staff.filter((entry) => entry.school_id === schoolId);
}

export async function createSchoolStaff(input: {
  school_id: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
}) {
  await wait(latency());
  const staff: SchoolStaff = {
    id: uid("st"),
    school_id: input.school_id,
    name: input.name,
    email: input.email,
    role: input.role,
    access_active: true,
  };
  school_staff.push(staff);
  return staff;
}

export async function removeSchoolStaff(staffId: string) {
  await wait(latency());
  const index = school_staff.findIndex((entry) => entry.id === staffId);
  if (index === -1) return false;
  school_staff.splice(index, 1);
  return true;
}

export async function toggleSchoolStaffAccess(staffId: string) {
  await wait(latency());
  const staff = school_staff.find((entry) => entry.id === staffId);
  if (!staff) return null;
  staff.access_active = !staff.access_active;
  return staff;
}

export async function createSchool(input: Omit<School, "id">) {
  await wait(latency());
  const school = { ...input, id: uid("s") };
  schools.push(school);
  return school;
}

export async function updateSchool(id: string, input: Omit<School, "id">) {
  await wait(latency());
  const index = schools.findIndex((school) => school.id === id);
  if (index >= 0) {
    schools[index] = { ...schools[index], ...input };
    return schools[index];
  }
  return null;
}

export async function getClasses() {
  await wait(latency());
  return [...classes];
}

export async function createClass(input: Omit<ClassRoom, "id">) {
  await wait(latency());
  const entry = { ...input, id: uid("c") };
  classes.push(entry);
  return entry;
}

export async function updateClass(id: string, input: Omit<ClassRoom, "id">) {
  await wait(latency());
  const index = classes.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    classes[index] = { ...classes[index], ...input };
    return classes[index];
  }
  return null;
}

export async function getChildren() {
  await wait(latency());
  return [...children];
}

export async function updateChild(id: string, input: Partial<Child>) {
  await wait(latency());
  const index = children.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    children[index] = { ...children[index], ...input } as Child;
    ensureChildQrBadge(children[index]);
    return children[index];
  }
  return null;
}

export async function updateGuardian(id: string, input: Partial<Guardian>) {
  await wait(latency());
  const index = guardians.findIndex((entry) => entry.id === id);
  if (index >= 0) {
    guardians[index] = { ...guardians[index], ...input } as Guardian;
    return guardians[index];
  }
  return null;
}

export async function deleteChild(id: string) {
  await wait(latency());
  const childIndex = children.findIndex((entry) => entry.id === id);
  if (childIndex === -1) {
    return false;
  }

  const child = children[childIndex];
  children.splice(childIndex, 1);

  const guardianIndex = guardians.findIndex((entry) => entry.id === child.guardian_id);
  if (guardianIndex >= 0) {
    guardians.splice(guardianIndex, 1);
  }

  const qrIndex = child_qr.findIndex((entry) => entry.child_id === id);
  if (qrIndex >= 0) {
    child_qr.splice(qrIndex, 1);
  }

  for (let index = child_subscriptions.length - 1; index >= 0; index -= 1) {
    if (child_subscriptions[index].child_id === id) {
      child_subscriptions.splice(index, 1);
    }
  }

  for (let index = payment_intents.length - 1; index >= 0; index -= 1) {
    if (payment_intents[index].child_id === id) {
      payment_intents.splice(index, 1);
    }
  }

  for (let index = transactions.length - 1; index >= 0; index -= 1) {
    if (transactions[index].child_id === id) {
      transactions.splice(index, 1);
    }
  }

  activity_logs.push({
    id: uid("al"),
    type: "DELETE",
    message: `Deleted child ${child.full_name}`,
    created_at: new Date().toISOString(),
  });

  return true;
}

export async function getChildById(id: string) {
  await wait(latency());
  return children.find((child) => child.id === id) || null;
}

export async function getChildQr(childId: string) {
  await wait(latency());
  const child = children.find((entry) => entry.id === childId);
  if (!child) {
    return null;
  }
  return ensureChildQrBadge(child);
}

export async function importChildrenCsv(csvText: string, schoolId: string, classId: string) {
  await wait(latency());
  const lines = csvText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const parsed = lines.map((line, index) => {
    const [student_id, full_name, guardian_name, guardian_phone] = line
      .split(",")
      .map((item) => item.trim());

    const guardianId = uid("g");
    guardians.push({
      id: guardianId,
      name: guardian_name || `Guardian ${index + 1}`,
      phone: guardian_phone || "+233-555-000-000",
      preferred_channel: "SMS",
    });

    const child: Child = {
      id: uid("ch"),
      student_id: student_id || `AUTO-${index + 1000}`,
      school_id: schoolId,
      class_id: classId,
      full_name: full_name || `Student ${index + 1}`,
      guardian_id: guardianId,
      active: true,
    };

    children.push(child);
    ensureChildQrBadge(child);

    return child;
  });

  activity_logs.push({
    id: uid("al"),
    type: "IMPORT",
    message: `Imported ${parsed.length} children`,
    created_at: new Date().toISOString(),
  });

  return parsed;
}

export async function createChildEnrollment(input: {
  student_id: string;
  full_name: string;
  school_id: string;
  class_id: string;
  guardian_name: string;
  guardian_phone: string;
  preferred_channel?: "SMS" | "WHATSAPP" | "EMAIL";
  profile_image_url?: string;
  active?: boolean;
}) {
  await wait(latency());

  const normalizedStudentId = input.student_id.trim().toUpperCase();
  if (!normalizedStudentId || !input.full_name.trim() || !input.guardian_name.trim() || !input.guardian_phone.trim()) {
    throw new Error("Student, guardian, and class details are required.");
  }

  const school = schools.find((entry) => entry.id === input.school_id);
  if (!school) {
    throw new Error("Select a valid school.");
  }

  const classRoom = classes.find(
    (entry) => entry.id === input.class_id && entry.school_id === input.school_id
  );
  if (!classRoom) {
    throw new Error("Select a valid class for the selected school.");
  }

  if (children.some((entry) => entry.student_id.toUpperCase() === normalizedStudentId)) {
    throw new Error("Student ID already exists.");
  }

  const guardianId = uid("g");
  const childId = uid("ch");

  guardians.push({
    id: guardianId,
    name: input.guardian_name.trim(),
    phone: input.guardian_phone.trim(),
    preferred_channel: input.preferred_channel ?? "SMS",
  });

  const child: Child = {
    id: childId,
    student_id: normalizedStudentId,
    school_id: input.school_id,
    class_id: input.class_id,
    full_name: input.full_name.trim(),
    guardian_id: guardianId,
    profile_image_url: input.profile_image_url?.trim() || undefined,
    active: input.active !== false,
  };

  children.push(child);
  ensureChildQrBadge(child);
  child_subscriptions.push({
    child_id: child.id,
    status: "NONE",
    start_date: todayISO(),
    end_date: todayISO(),
    meals_remaining: 0,
    plan_id: subscription_plans[0]?.id ?? "plan-unassigned",
  });
  grace_periods.push({
    child_id: child.id,
    start_date: todayISO(),
    days_used: 0,
    notified: false,
  });
  activity_logs.push({
    id: uid("al"),
    type: "CREATE",
    message: `Manually enrolled ${child.full_name} at ${school.name} / ${classRoom.name} with a 7-day grace period`,
    created_at: new Date().toISOString(),
  });

  return child;
}

export async function getSubscriptionPlans() {
  await wait(latency());
  return [...subscription_plans];
}

export async function upsertPlan(input: Omit<SubscriptionPlan, "id"> & { id?: string }) {
  await wait(latency());
  if (input.id) {
    const index = subscription_plans.findIndex((plan) => plan.id === input.id);
    if (index >= 0) {
      subscription_plans[index] = { ...subscription_plans[index], ...input };
      return subscription_plans[index];
    }
  }
  const plan: SubscriptionPlan = { ...input, id: uid("p") } as SubscriptionPlan;
  subscription_plans.push(plan);
  return plan;
}

export async function getLedger() {
  await wait(latency());
  return [...transactions];
}

export async function getPaymentIntents() {
  await wait(latency());
  syncExpiredSubscriptionPaymentIntents();
  return [...payment_intents];
}

export async function getPaymentIntentsForSchool(schoolId: string) {
  await wait(latency());
  syncExpiredSubscriptionPaymentIntents();
  const schoolChildIds = new Set(
    children.filter((child) => child.school_id === schoolId).map((child) => child.id)
  );
  return payment_intents.filter((intent) => schoolChildIds.has(intent.child_id));
}

export async function createPaymentIntent(childId: string, planId: string) {
  await wait(latency());
  const plan = subscription_plans.find((entry) => entry.id === planId);
  const intent: PaymentIntent = {
    id: uid("pi"),
    child_id: childId,
    plan_id: planId,
    amount: plan?.price ?? 0,
    reference: `INV-${Math.floor(2000 + Math.random() * 8000)}`,
    status: "PENDING",
    payment_url: "https://pay.mock/new",
    created_at: new Date().toISOString(),
  };
  payment_intents.push(intent);
  return intent;
}

export async function updatePaymentIntentStatus(
  intentId: string,
  status: "PENDING" | "PAID" | "FAILED"
) {
  await wait(latency());
  const intent = payment_intents.find((entry) => entry.id === intentId);
  if (!intent) {
    return null;
  }
  intent.status = status;
  return intent;
}

export async function deletePaymentIntent(intentId: string) {
  await wait(latency());
  const index = payment_intents.findIndex((entry) => entry.id === intentId);
  if (index === -1) {
    return false;
  }
  payment_intents.splice(index, 1);
  return true;
}

export async function sendPaymentLinkToGuardian(childId: string, planId?: string) {
  await wait(latency());

  const child = children.find((entry) => entry.id === childId);
  if (!child) {
    return null;
  }

  const guardian = guardians.find((entry) => entry.id === child.guardian_id);
  const subscription = child_subscriptions.find((entry) => entry.child_id === childId);
  const resolvedPlanId =
    planId ?? subscription?.plan_id ?? subscription_plans.find((entry) => entry.active)?.id ?? subscription_plans[0]?.id;

  if (!resolvedPlanId) {
    return null;
  }

  const existingPendingIntent = payment_intents.find(
    (entry) => entry.child_id === childId && entry.plan_id === resolvedPlanId && entry.status === "PENDING"
  );
  const intent = existingPendingIntent ?? (await createPaymentIntent(childId, resolvedPlanId));
  const plan = subscription_plans.find((entry) => entry.id === intent.plan_id);
  const channel = guardian?.preferred_channel ?? "SMS";
  const recipient = guardian?.phone ?? "unknown";
  const payload = `Payment link for ${child.full_name}: ${intent.payment_url} (${plan?.name ?? "Meal plan"})`;

  message_outbox.push({
    id: uid("msg"),
    channel,
    recipient,
    status: "SENT",
    payload,
    created_at: new Date().toISOString(),
  });
  message_logs.push({
    id: uid("ml"),
    status: "SENT",
    source: "Payment link SMS",
    child_name: child.full_name,
    guardian_name: guardian?.name ?? "Unknown guardian",
    guardian_phone: recipient,
    detail: `Payment link sent to ${recipient}`,
    failure_reason: null,
    created_at: new Date().toISOString(),
  });

  return { intent, recipient, channel };
}

export async function simulateWebhookSuccess(externalTxId: string, intentId: string) {
  await wait(latency());
  if (payment_events.find((event) => event.external_tx_id === externalTxId)) {
    return { status: "ignored" } as const;
  }

  const intent = payment_intents.find((entry) => entry.id === intentId);
  if (!intent) {
    return { status: "missing" } as const;
  }

  intent.status = "PAID";
  const plan = subscription_plans.find((entry) => entry.id === intent.plan_id);

  payment_events.push({
    id: uid("pe"),
    external_tx_id: externalTxId,
    intent_id: intentId,
    status: "PAID",
    created_at: new Date().toISOString(),
  });

  const existing = child_subscriptions.find((sub) => sub.child_id === intent.child_id);
  const child = children.find((entry) => entry.id === intent.child_id);
  const start = todayISO();
  const end = new Date();
  end.setDate(end.getDate() + 30);

  if (existing) {
    existing.status = "ACTIVE";
    existing.start_date = start;
    existing.end_date = end.toISOString().slice(0, 10);
    existing.meals_remaining = plan?.meals_per_cycle ?? 0;
    existing.plan_id = intent.plan_id;
  } else {
    child_subscriptions.push({
      child_id: intent.child_id,
      status: "ACTIVE",
      start_date: start,
      end_date: end.toISOString().slice(0, 10),
      meals_remaining: plan?.meals_per_cycle ?? 0,
      plan_id: intent.plan_id,
    });
  }

  if (child) {
    child.subscription_status = "ACTIVE";
    child.grace_period_ends_at = undefined;
  }

  const graceIndex = grace_periods.findIndex((entry) => entry.child_id === intent.child_id);
  if (graceIndex >= 0) {
    grace_periods.splice(graceIndex, 1);
  }

  transactions.push({
    id: uid("t"),
    child_id: intent.child_id,
    type: "SUBSCRIPTION_PURCHASE",
    amount: plan?.price ?? intent.amount,
    metadata: { plan: plan?.name ?? "Plan" },
    created_at: new Date().toISOString(),
  });

  return { status: "processed" } as const;
}

function buildPaymentTransactionRecords(paymentRows: PaymentIntent[]) {
  return paymentRows.map((intent) => {
    const child = children.find((entry) => entry.id === intent.child_id);
    const guardian = guardians.find((entry) => entry.id === child?.guardian_id);
    const school = schools.find((entry) => entry.id === child?.school_id);
    const classRoom = classes.find((entry) => entry.id === child?.class_id);
    const plan = subscription_plans.find((entry) => entry.id === intent.plan_id);

    return {
      intent_id: intent.id,
      reference: intent.reference,
      status: intent.status,
      amount: intent.amount,
      payment_url: intent.payment_url,
      created_at: intent.created_at,
      child_id: intent.child_id,
      child_name: child?.full_name ?? intent.child_id,
      school_id: school?.id ?? "",
      school_name: school?.name ?? "-",
      class_id: classRoom?.id ?? "",
      class_name: classRoom?.name ?? "-",
      guardian_name: guardian?.name ?? "-",
      guardian_phone: guardian?.phone ?? "-",
      plan_id: intent.plan_id,
      plan_name: plan?.name ?? intent.plan_id,
    } satisfies PaymentTransactionRecord;
  });
}

export async function getPaymentTransactions() {
  const intents = await getPaymentIntents();
  return buildPaymentTransactionRecords(intents);
}

export async function getPaymentTransactionsForSchool(schoolId: string) {
  const intents = await getPaymentIntentsForSchool(schoolId);
  return buildPaymentTransactionRecords(intents);
}

export async function getMessageHealth() {
  await wait(latency());
  const pending = message_outbox.filter((msg) => msg.status === "PENDING").length;
  const sent = message_logs.filter((msg) => msg.status === "SENT").length;
  const failed = message_logs.filter((msg) => msg.status === "FAILED").length;
  return { pending, sent, failed };
}

export async function getMessageLogs() {
  await wait(latency());
  return [...message_logs];
}

export async function resendFailedMessages() {
  await wait(latency());
  message_logs
    .filter((msg) => msg.status === "FAILED")
    .forEach((msg) => {
      msg.status = "SENT";
      msg.detail = `${msg.source ?? "SMS"} delivered after retry`;
      msg.failure_reason = null;
    });
  return true;
}

export async function getSuppliers() {
  await wait(latency());
  return [...suppliers];
}

export async function upsertSupplier(input: Omit<Supplier, "id"> & { id?: string }) {
  await wait(latency());
  if (input.id) {
    const index = suppliers.findIndex((entry) => entry.id === input.id);
    if (index >= 0) {
      suppliers[index] = { ...suppliers[index], ...input };
      return suppliers[index];
    }
  }
  const supplier: Supplier = { ...input, id: uid("sup") } as Supplier;
  suppliers.push(supplier);
  return supplier;
}

export async function getSupplierInvoices() {
  await wait(latency());
  return [...supplier_invoices];
}

export async function markInvoicePaid(invoiceId: string) {
  await wait(latency());
  const invoice = supplier_invoices.find((entry) => entry.id === invoiceId);
  if (invoice) {
    invoice.status = "PAID";
  }
  return invoice ?? null;
}

export async function getAiReports(): Promise<{ alerts: AnomalyAlert[]; reports: AiReport[] }> {
  await wait(latency());
  return { alerts: [...anomaly_alerts], reports: [...ai_reports] };
}

export async function getDashboardKpis() {
  await wait(latency());
  const mealsToday = meal_serves.filter((serve) => serve.serve_date === todayISO()).length;
  const graceMealsToday = meal_serves.filter(
    (serve) => serve.serve_date === todayISO() && serve.is_grace
  ).length;
  const mealsMonth = meal_serves.length;
  const activeSubscriptions = child_subscriptions.filter((sub) => sub.status === "ACTIVE").length;
  const expiringSoon = child_subscriptions.filter((sub) => sub.status === "ACTIVE").length;
  const revenueMonth = transactions
    .filter((tx) => tx.type === "SUBSCRIPTION_PURCHASE")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const supplierCostMonth = supplier_invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const costPerMeal = supplierCostMonth / Math.max(meal_serves.length, 1);

  const graceActive = grace_periods.filter((entry) => {
    const start = new Date(entry.start_date);
    const diffDays = Math.floor((new Date(todayISO()).getTime() - start.getTime()) / 86400000);
    return diffDays >= 0 && diffDays < 7 && entry.days_used < 7;
  }).length;

  return {
    mealsToday,
    mealsMonth,
    activeSubscriptions,
    expiringSoon,
    graceMealsToday,
    graceActive,
    revenueMonth,
    supplierCostMonth,
    costPerMeal,
  };
}

export async function getDonorKpis() {
  await wait(latency());
  const totalMeals = meal_serves.length;
  const totalChildren = children.length;
  const fundsReceived = transactions
    .filter((tx) => tx.type === "SUBSCRIPTION_PURCHASE")
    .reduce((sum, tx) => sum + tx.amount, 0);
  const costPerMeal = supplier_invoices.reduce((sum, inv) => sum + inv.amount, 0) / Math.max(totalMeals, 1);
  return { totalMeals, totalChildren, fundsReceived, costPerMeal };
}

export async function getSupervisorOverview(schoolId: string) {
  await wait(latency());
  const schoolMeals = meal_serves.filter((serve) => serve.school_id === schoolId);
  const todayMeals = schoolMeals.filter((serve) => serve.serve_date === todayISO());
  const byClass = classes
    .filter((cls) => cls.school_id === schoolId)
    .map((cls) => ({
      class_id: cls.id,
      class_name: cls.name,
      total: schoolMeals.filter((serve) =>
        children.find((child) => child.id === serve.child_id)?.class_id === cls.id
      ).length,
    }));

  const problems = children.filter((child) => child.school_id === schoolId).filter((child) => {
    const sub = child_subscriptions.find((entry) => entry.child_id === child.id);
    const activeGrace = getActiveGracePeriod(child.id);
    return !child.active || (!activeGrace && (!sub || sub.status !== "ACTIVE"));
  });

  return { todayMeals: todayMeals.length, byClass, problems };
}

export async function getSupervisorChildrenLookup(schoolId: string): Promise<SupervisorChildLookupItem[]> {
  await wait(latency());
  return children
    .filter((child) => child.school_id === schoolId)
    .map((child) => {
      const classRoom = classes.find((entry) => entry.id === child.class_id);
      return {
        child,
        class_name: classRoom?.name ?? "Unknown class",
        grade: classRoom?.grade ?? "Unknown grade",
        guardian: guardians.find((entry) => entry.id === child.guardian_id),
        subscription: child_subscriptions.find((entry) => entry.child_id === child.id) ?? null,
        qr: child_qr.find((entry) => entry.child_id === child.id) ?? null,
      };
    });
}

export async function getMealHistory(schoolId: string) {
  await wait(latency());
  return meal_serves.filter((serve) => serve.school_id === schoolId);
}

export async function getProblemsForSchool(schoolId: string) {
  await wait(latency());
  return children
    .filter((child) => child.school_id === schoolId)
    .map((child) => {
      const sub = child_subscriptions.find((entry) => entry.child_id === child.id);
      const activeGrace = getActiveGracePeriod(child.id);
      if (!child.active) {
        return { child, reason: "Inactive child" };
      }
      if (activeGrace) {
        return null;
      }
      if (!sub) {
        return { child, reason: "No subscription" };
      }
      if (sub.status !== "ACTIVE") {
        return { child, reason: "Expired subscription" };
      }
      return null;
    })
    .filter(Boolean);
}

export async function validateMeal(
  qr_payload: string,
  school_id: string,
  meal_type: "BREAKFAST" | "LUNCH" | "DINNER"
) {
  await wait(latency());
  const log: ValidationLog = {
    id: uid("vl"),
    school_id,
    qr_payload,
    result: "FAILED",
    reason_code: "NO_SUBSCRIPTION",
    created_at: new Date().toISOString(),
  };

  const childQr = child_qr.find((qr) => qr.qr_payload === qr_payload);
  const child = childQr ? children.find((entry) => entry.id === childQr.child_id) : undefined;

  let reason: ReasonCode = "NO_SUBSCRIPTION";

  if (!child) {
    reason = "NO_SUBSCRIPTION";
  } else if (!child.active) {
    reason = "INACTIVE_CHILD";
  } else if (child.school_id !== school_id) {
    reason = "WRONG_SCHOOL";
  } else {
    const subscription = child_subscriptions.find((entry) => entry.child_id === child.id);
    const today = todayISO();
    const alreadyServedSameMealToday = meal_serves.some(
      (serve) =>
        serve.child_id === child.id &&
        serve.serve_date === today &&
        serve.meal_type === meal_type
    );
    const alreadyServedAnyMealToday = meal_serves.some(
      (serve) => serve.child_id === child.id && serve.serve_date === today
    );

    if (alreadyServedSameMealToday) {
      reason = "ALREADY_SERVED";
    } else if (!subscription || subscription.status !== "ACTIVE" || subscription.end_date < today) {
      // Grace model: 7-day free meals from first serve
      const grace = grace_periods.find((entry) => entry.child_id === child.id) as GracePeriod | undefined;
      const startDate = grace?.start_date ?? today;
      const start = new Date(startDate);
      const diffDays = Math.floor((new Date(today).getTime() - start.getTime()) / 86400000);
      const withinGrace = diffDays >= 0 && diffDays < 7;

      if (alreadyServedAnyMealToday) {
        reason = "ALREADY_SERVED";
      } else if (!withinGrace || (grace && grace.days_used >= 7)) {
        reason = "GRACE_EXPIRED";
      } else {
        const serve: MealServe = {
          id: uid("ms"),
          child_id: child.id,
          school_id,
          meal_type,
          serve_date: today,
          created_at: new Date().toISOString(),
          is_grace: true,
        };
        meal_serves.push(serve);

        if (grace) {
          grace.days_used += 1;
          grace.last_served_date = today;
        } else {
          grace_periods.push({
            child_id: child.id,
            start_date: today,
            days_used: 1,
            last_served_date: today,
            notified: false,
          });
        }

        const activeGrace = grace_periods.find((entry) => entry.child_id === child.id);
        if (activeGrace && !activeGrace.notified) {
          const guardian = guardians.find((entry) => entry.id === child.guardian_id);
          const graceEndDate = new Date(today);
          graceEndDate.setDate(graceEndDate.getDate() + 6);
          const message = `FeedClass notice: ${child.full_name} started a 7-day free meal grace period today. Meals will stop after ${graceEndDate.toISOString().slice(0, 10)} if payment is not completed.`;
          message_outbox.push({
            id: uid("msg"),
            channel: guardian?.preferred_channel ?? "SMS",
            recipient: guardian?.phone ?? "unknown",
            status: "SENT",
            payload: message,
            created_at: new Date().toISOString(),
          });
          message_logs.push({
            id: uid("ml"),
            status: "SENT",
            source: "Grace period SMS",
            child_name: child.full_name,
            guardian_name: guardian?.name ?? "Unknown guardian",
            guardian_phone: guardian?.phone ?? "unknown",
            detail: message,
            failure_reason: null,
            created_at: new Date().toISOString(),
          });
          activeGrace.notified = true;
        }

        child.subscription_status = "GRACE_PERIOD";
        const graceEndDate = new Date(today);
        graceEndDate.setDate(graceEndDate.getDate() + 6);
        child.grace_period_ends_at = graceEndDate.toISOString().slice(0, 10);

        transactions.push({
          id: uid("t"),
          child_id: child.id,
          type: "GRACE_MEAL",
          amount: 0,
          metadata: { meal_type, grace: "true" },
          created_at: new Date().toISOString(),
        });

        reason = "OK";
        log.result = "SUCCESS";
        log.reason_code = "OK";
      }
    } else if (subscription.meals_remaining <= 0) {
      reason = "INSUFFICIENT_MEALS";
    } else {
      const serve: MealServe = {
        id: uid("ms"),
        child_id: child.id,
        school_id,
        meal_type,
        serve_date: today,
        created_at: new Date().toISOString(),
      };
      meal_serves.push(serve);
      subscription.meals_remaining -= 1;
      transactions.push({
        id: uid("t"),
        child_id: child.id,
        type: "DEBIT_MEAL",
        amount: -1,
        metadata: { meal_type },
        created_at: new Date().toISOString(),
      });
      reason = "OK";
      log.result = "SUCCESS";
      log.reason_code = "OK";
    }
  }

  if (log.result !== "SUCCESS") {
    log.reason_code = reason;
  }
  log.child_id = child?.id;
  validation_logs.push(log);

  return {
    result: log.result,
    reason_code: log.reason_code,
    child,
  };
}

export async function getValidationLogs() {
  await wait(latency());
  return [...validation_logs];
}

export async function getActivityLogs(): Promise<ActivityLog[]> {
  await wait(latency());
  return [...activity_logs];
}

export async function getMessages(): Promise<MessageOutbox[]> {
  await wait(latency());
  return [...message_outbox];
}

export async function getAiSummary(): Promise<AiReport[]> {
  await wait(latency());
  return [...ai_reports];
}

export async function generateBadgesPdf(classId: string) {
  await wait(latency());
  const classRoom = classes.find((entry) => entry.id === classId);
  if (!classRoom) {
    throw new Error("Class not found.");
  }

  const school = schools.find((entry) => entry.id === classRoom.school_id);
  const badgeChildren = children.filter((child) => child.class_id === classId);

  const badgeMarkup = badgeChildren
    .map((child) => {
      const qr = child_qr.find((entry) => entry.child_id === child.id);
      return `
        <article class="badge">
          <div class="badge__school">${school?.name ?? "School"}</div>
          <div class="badge__photo" style="background-image:url('${child.profile_image_url ?? "/qr-placeholder.svg"}')"></div>
          <div class="badge__meta">
            <h2>${child.full_name}</h2>
            <p>${child.student_id}</p>
            <p>${classRoom.name}</p>
          </div>
          <div class="badge__qr">
            <div class="badge__qr-box">${qr?.qr_payload ?? buildChildQrPayload(child)}</div>
            <p>${qr?.qr_payload ?? buildChildQrPayload(child)}</p>
          </div>
        </article>
      `;
    })
    .join("");

  const html = `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>${classRoom.name} badges</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 24px; background: #f8fafc; color: #0f172a; }
        .sheet-title { margin-bottom: 20px; }
        .sheet-title h1 { margin: 0 0 6px; font-size: 24px; }
        .sheet-title p { margin: 0; color: #475569; }
        .sheet { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
        .badge { border: 2px solid #cbd5e1; border-radius: 24px; background: white; padding: 18px; display: grid; gap: 14px; }
        .badge__school { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
        .badge__photo { height: 220px; border-radius: 20px; background-size: cover; background-position: center; background-color: #e2e8f0; }
        .badge__meta h2 { margin: 0 0 6px; font-size: 22px; }
        .badge__meta p { margin: 0 0 4px; font-size: 14px; color: #475569; }
        .badge__qr { border-top: 1px solid #e2e8f0; padding-top: 14px; }
        .badge__qr-box {
          min-height: 96px;
          border: 1px dashed #94a3b8;
          border-radius: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 12px;
          background: #f8fafc;
          font-weight: 700;
          text-align: center;
        }
        .badge__qr p { margin: 10px 0 0; font-size: 12px; color: #64748b; text-align: center; }
        @media print {
          body { margin: 12px; background: white; }
          .sheet { gap: 14px; }
          .badge { break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <header class="sheet-title">
        <h1>${school?.name ?? "School"} · ${classRoom.name}</h1>
        <p>${badgeChildren.length} badge${badgeChildren.length === 1 ? "" : "s"} generated on ${new Date().toLocaleString()}</p>
      </header>
      <section class="sheet">${badgeMarkup || "<p>No children in this class.</p>"}</section>
    </body>
  </html>`;

  const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
  return {
    url,
    created_at: new Date().toISOString(),
    file_name: `${(school?.name ?? "school").replace(/\s+/g, "-").toLowerCase()}-${classRoom.name.replace(/\s+/g, "-").toLowerCase()}-badges.html`,
  };
}

export async function getAllData() {
  await wait(latency());
  syncChildQrBadges();
  return {
    schools,
    classes,
    children,
    guardians,
    school_staff,
    child_subscriptions,
    child_qr,
    grace_periods,
    subscription_plans,
  } as const;
}
