import {
  Child,
  ChildQr,
  ChildSubscription,
  AiForecastSnapshot,
  ClassRoom,
  Guardian,
  LedgerTransaction,
  MealServe,
  PaymentIntent,
  School,
  Supplier,
  SupplierCostPerMeal,
  SupplierInvoice,
  SubscriptionPlan,
  SchoolDashboardSnapshot,
  DonorDashboardSnapshot,
  AiReport,
  AnomalyAlert,
  User,
  ValidationLog,
} from "./types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

const ACCESS_TOKEN_KEY = "fc_access_token";
const REFRESH_TOKEN_KEY = "fc_refresh_token";
const LAST_ACTIVITY_KEY = "fc_last_activity_at";
const MESSAGING_SETTINGS_KEY = "fc_messaging_settings";

type BackendSchool = {
  id: string;
  code: string;
  name: string;
  address: string;
  timezone: string;
  active: boolean;
};

type BackendClass = {
  id: string;
  school_id?: string;
  schoolId?: string;
  name: string;
  grade?: string;
  active: boolean;
};

type BackendChildRow = {
  id: string;
  school_id: string;
  class_id: string;
  class_name?: string | null;
  class_grade?: string | null;
  student_id: string;
  full_name: string;
  profile_image_url?: string | null;
  subscription_status?: "ACTIVE" | "EXPIRED" | "PAUSED" | "NONE" | "GRACE_PERIOD";
  grace_period_ends_at?: string | null;
  active: boolean;
  guardian_id?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
};

type BackendPlan = {
  id: string;
  name: string;
  mealType?: "BREAKFAST" | "LUNCH" | "DINNER";
  meal_type?: "BREAKFAST" | "LUNCH" | "DINNER";
  mealsPerCycle?: number;
  meals_per_cycle?: number;
  price: number;
  active: boolean;
  effectiveStartDate?: string | null;
  effective_start_date?: string | null;
  effectiveEndDate?: string | null;
  effective_end_date?: string | null;
};

type BackendChildSubscription = {
  childId?: string;
  child_id?: string;
  planId?: string | null;
  plan_id?: string | null;
  planName?: string | null;
  plan_name?: string | null;
  status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAUSED" | "NONE" | "GRACE_PERIOD";
  startDate?: string;
  start_date?: string;
  endDate?: string;
  end_date?: string;
  mealsRemaining?: number;
  meals_remaining?: number;
  mealType?: "BREAKFAST" | "LUNCH" | "DINNER" | null;
  meal_type?: "BREAKFAST" | "LUNCH" | "DINNER" | null;
  cancelledAt?: string | null;
  cancelled_at?: string | null;
  cancellationReason?: string | null;
  cancellation_reason?: string | null;
};

type BackendPaymentIntent = {
  id: string;
  child_id: string;
  plan_id: string;
  plan_name?: string | null;
  amount: number;
  reference: string;
  status: "PENDING" | "PAID" | "FAILED";
  payment_url: string;
  created_at: string;
};

type BackendMessagingSettings = {
  schedule: "DAILY" | "WEEKLY" | "MONTHLY";
  lastRunAt: string | null;
  scheduleOptions?: Array<"DAILY" | "WEEKLY" | "MONTHLY">;
};

type BackendUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  assignedSchoolId?: string | null;
  assigned_school_id?: string | null;
  role?: string | null;
};

type BackendUserRecord = User & {
  email: string;
  active: boolean;
  backend_role: string;
};

type BackendMealServe = {
  id: string;
  child_id: string;
  child_name?: string;
  school_id: string;
  class_id?: string | null;
  class_name?: string | null;
  meal_type: "BREAKFAST" | "LUNCH" | "DINNER";
  serve_date: string;
  created_at: string;
  is_grace?: boolean;
};

type BackendMealScan = {
  id: string;
  child_id?: string | null;
  child_name?: string | null;
  school_id: string;
  class_id?: string | null;
  class_name?: string | null;
  qr_payload: string;
  meal_type: "BREAKFAST" | "LUNCH" | "DINNER";
  service_date: string;
  served_at?: string | null;
  outcome: "APPROVED" | "BLOCKED" | "DUPLICATE";
  reason?: string | null;
  created_at: string;
};

type BackendLedgerTransaction = {
  id: string;
  child_id: string;
  student_id: string;
  child_name: string;
  school_id: string;
  school_name: string;
  class_id?: string | null;
  class_name?: string | null;
  payment_intent_id?: string | null;
  type: "SUBSCRIPTION_PURCHASE" | "DEBIT_MEAL" | "GRACE_MEAL" | "ADJUSTMENT";
  amount: number;
  metadata: Record<string, string>;
  created_at: string;
};

type BackendSupplier = {
  id: string;
  name: string;
  contact: string;
  active: boolean;
};

type BackendSupplierInvoice = {
  id: string;
  supplier_id: string;
  supplier_name?: string;
  school_id: string;
  school_name?: string;
  month: string;
  amount: number;
  due_date?: string | null;
  status: "PAID" | "DUE";
  paid_amount?: number;
  last_paid_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type BackendSchoolDashboard = {
  school: { id: string; name: string };
  serviceDate: string;
  mealsServedToday: number;
  mealsByClass: Array<{ class_id: string; class_name: string; total: number }>;
  failedScans: Array<{
    id: string;
    child_id?: string | null;
    student_id?: string | null;
    child_name: string;
    class_name?: string | null;
    meal_type?: "BREAKFAST" | "LUNCH" | "DINNER" | null;
    reason: string;
    created_at: string;
  }>;
  childrenMissingSubscriptions: Array<{
    child_id: string;
    student_id: string;
    child_name: string;
    class_name?: string | null;
    guardian_name?: string | null;
    guardian_phone?: string | null;
    subscription_status: "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAUSED" | "NONE" | "GRACE_PERIOD";
  }>;
  paymentFollowUps: Array<{
    id: string;
    reference: string;
    status: "PENDING" | "PAID" | "FAILED";
    payment_url: string;
    created_at: string;
    child_id: string;
    student_id: string;
    child_name: string;
    class_name?: string | null;
    guardian_name?: string | null;
    guardian_phone?: string | null;
  }>;
  successfulScans24h: Array<{
    id: string;
    child_id?: string | null;
    student_id?: string | null;
    child_name: string;
    class_name?: string | null;
    meal_type?: "BREAKFAST" | "LUNCH" | "DINNER" | null;
    created_at: string;
  }>;
};

type BackendDonorDashboard = {
  totalMeals: number;
  totalChildren: number;
  fundsReceived: number;
  costPerMeal: number;
  trends: Array<{
    label: string;
    mealsServed: number;
    fundsReceived: number;
    costPerMeal: number;
    schoolsSupported: number;
  }>;
};

type BackendAiForecast = {
  generatedAt: string;
  scope: {
    school_id?: string | null;
    school_name: string;
  };
  history: Array<{ date: string; meals: number }>;
  forecast: Array<{ date: string; baseline: number; predictedMeals: number }>;
};

type BackendAiAlerts = {
  generatedAt: string;
  scope: {
    school_id?: string | null;
    school_name: string;
  };
  alerts: Array<{
    id: string;
    severity: "LOW" | "MEDIUM" | "HIGH";
    type: "MEAL_SPIKE" | "NO_SUBSCRIPTION_SPIKE" | "PAYMENTS_MEALS_MISMATCH";
    title: string;
    message: string;
    metric_value: number;
    baseline_value: number;
    created_at: string;
  }>;
};

type BackendAiReport = {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  window_start: string;
  window_end: string;
  highlights: string[];
};

function getLocalMessagingSettings(): BackendMessagingSettings {
  if (typeof window === "undefined") {
    return {
      schedule: "DAILY",
      lastRunAt: null,
      scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
    };
  }

  try {
    const raw = window.localStorage.getItem(MESSAGING_SETTINGS_KEY);
    if (!raw) {
      return {
        schedule: "DAILY",
        lastRunAt: null,
        scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
      };
    }
    const parsed = JSON.parse(raw) as Partial<BackendMessagingSettings>;
    return {
      schedule:
        parsed.schedule === "WEEKLY" || parsed.schedule === "MONTHLY" || parsed.schedule === "DAILY"
          ? parsed.schedule
          : "DAILY",
      lastRunAt: typeof parsed.lastRunAt === "string" ? parsed.lastRunAt : null,
      scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
    };
  } catch {
    return {
      schedule: "DAILY",
      lastRunAt: null,
      scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
    };
  }
}

function storeLocalMessagingSettings(settings: BackendMessagingSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MESSAGING_SETTINGS_KEY, JSON.stringify(settings));
}

function isValidChildRow(entry: Partial<BackendChildRow>) {
  return Boolean(entry.id && entry.student_id && entry.full_name && entry.school_id && entry.class_id);
}

export function storeAuthTokens(accessToken: string, refreshToken?: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  document.cookie = `${ACCESS_TOKEN_KEY}=${encodeURIComponent(accessToken)}; path=/; max-age=2592000`;
  if (refreshToken) {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
    document.cookie = `${REFRESH_TOKEN_KEY}=${encodeURIComponent(refreshToken)}; path=/; max-age=2592000`;
  }
  touchSessionActivity();
}

export function clearAuthTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  document.cookie = `${ACCESS_TOKEN_KEY}=; path=/; max-age=0`;
  document.cookie = `${REFRESH_TOKEN_KEY}=; path=/; max-age=0`;
}

export function getAccessToken() {
  if (typeof window === "undefined") return "";
  const localToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  if (localToken) {
    return localToken;
  }

  const cookieToken = document.cookie.match(
    new RegExp(`(?:^|; )${ACCESS_TOKEN_KEY}=([^;]*)`)
  )?.[1];

  return cookieToken ? decodeURIComponent(cookieToken) : "";
}

function decodeJwtPayload(token: string) {
  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = window.atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    return JSON.parse(decoded) as { exp?: number };
  } catch {
    return null;
  }
}

export function getAccessTokenRole() {
  if (typeof window === "undefined") return null;
  const token = getAccessToken();
  if (!token) {
    return null;
  }

  const payload = decodeJwtPayload(token) as { role?: string } | null;
  if (!payload?.role) {
    return null;
  }

  if (payload.role === "ADMIN" || payload.role === "DONOR_READONLY") {
    return payload.role;
  }

  if (payload.role === "SUPERVISOR" || payload.role === "SCHOOL_ADMIN") {
    return "SCHOOL_ADMIN";
  }

  return null;
}

export function getAccessTokenExpiryMs() {
  if (typeof window === "undefined") return 0;
  const token = getAccessToken();
  if (!token) {
    return 0;
  }

  const payload = decodeJwtPayload(token);
  return payload?.exp ? payload.exp * 1000 : 0;
}

export function touchSessionActivity() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function getLastActivityAt() {
  if (typeof window === "undefined") return 0;
  const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY) || "0");
  return Number.isFinite(value) ? value : 0;
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers || {});

  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
  });

  const raw = await response.text();
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") && raw ? JSON.parse(raw) : null;

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : null) ||
      raw.trim() ||
      "Request failed.";
    throw new Error(message);
  }

  if (!contentType.includes("application/json")) {
    throw new Error(`Expected JSON response from ${path} but received ${contentType || "unknown content type"}.`);
  }

  return payload as T;
}

function buildSchoolCode(name: string) {
  const normalized = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);

  return `${normalized || "SCHOOL"}-${Date.now().toString().slice(-4)}`;
}

function mapSchool(entry: BackendSchool): School {
  return {
    id: entry.id,
    name: entry.name,
    location: entry.address,
  };
}

function mapUser(entry: BackendUser): BackendUserRecord {
  const backendRole = String(entry.role || "SUPERVISOR").toUpperCase();
  return {
    id: entry.id,
    name: entry.name,
    role:
      backendRole === "ADMIN"
        ? "ADMIN"
        : backendRole === "DONOR_READONLY"
          ? "DONOR_READONLY"
          : "SCHOOL_ADMIN",
    assigned_school_id: entry.assigned_school_id || entry.assignedSchoolId || undefined,
    email: entry.email,
    active: Boolean(entry.active),
    backend_role: backendRole,
  };
}

function mapClass(entry: BackendClass): ClassRoom {
  return {
    id: entry.id,
    school_id: entry.school_id || entry.schoolId || "",
    name: entry.name,
    grade: entry.grade || "",
  };
}

function mapChild(entry: BackendChildRow): Child {
  return {
    id: entry.id,
    student_id: entry.student_id,
    school_id: entry.school_id,
    class_id: entry.class_id,
    full_name: entry.full_name,
    guardian_id: entry.guardian_id || "",
    profile_image_url: entry.profile_image_url || undefined,
    active: entry.active,
    subscription_status: entry.subscription_status || "NONE",
    grace_period_ends_at: entry.grace_period_ends_at || undefined,
  };
}

function mapGuardian(entry: BackendChildRow): Guardian | null {
  if (!entry.guardian_id) {
    return null;
  }

  return {
    id: entry.guardian_id,
    name: entry.guardian_name || "",
    phone: entry.guardian_phone || "",
    preferred_channel: "SMS",
  };
}

function mapPlan(entry: BackendPlan): SubscriptionPlan {
  return {
    id: entry.id,
    name: entry.name,
    meal_type: entry.meal_type || entry.mealType || "LUNCH",
    meals_per_cycle: Number(entry.meals_per_cycle ?? entry.mealsPerCycle ?? 0),
    price: Number(entry.price || 0),
    active: Boolean(entry.active),
    effective_start_date: entry.effective_start_date || entry.effectiveStartDate || null,
    effective_end_date: entry.effective_end_date || entry.effectiveEndDate || null,
  };
}

function mapChildSubscription(entry: BackendChildSubscription): ChildSubscription {
  return {
    child_id: entry.child_id || entry.childId || "",
    plan_id: entry.plan_id || entry.planId || null,
    plan_name: entry.plan_name || entry.planName || null,
    status: entry.status,
    start_date: entry.start_date || entry.startDate || "",
    end_date: entry.end_date || entry.endDate || "",
    meals_remaining: Number(entry.meals_remaining ?? entry.mealsRemaining ?? 0),
    meal_type: entry.meal_type || entry.mealType || null,
    cancelled_at: entry.cancelled_at || entry.cancelledAt || null,
    cancellation_reason: entry.cancellation_reason || entry.cancellationReason || null,
  };
}

function mapPaymentIntent(entry: BackendPaymentIntent): PaymentIntent {
  return {
    id: entry.id,
    child_id: entry.child_id,
    plan_id: entry.plan_id,
    plan_name: entry.plan_name || null,
    amount: Number(entry.amount || 0),
    reference: entry.reference,
    status: entry.status,
    payment_url: entry.payment_url,
    created_at: entry.created_at,
  };
}

function mapSupplier(entry: BackendSupplier): Supplier {
  return {
    id: entry.id,
    name: entry.name,
    contact: entry.contact,
    active: Boolean(entry.active),
  };
}

function mapSupplierInvoice(entry: BackendSupplierInvoice): SupplierInvoice {
  return {
    id: entry.id,
    supplier_id: entry.supplier_id,
    supplier_name: entry.supplier_name,
    school_id: entry.school_id,
    school_name: entry.school_name,
    month: entry.month,
    amount: Number(entry.amount || 0),
    due_date: entry.due_date || null,
    status: entry.status,
    paid_amount: Number(entry.paid_amount || 0),
    last_paid_at: entry.last_paid_at || null,
    created_at: entry.created_at || null,
    updated_at: entry.updated_at || null,
  };
}

export async function getBackendSchools() {
  const payload = await fetchJson<{ schools: BackendSchool[] }>("/schools");
  return payload.schools.map(mapSchool);
}

export async function getBackendSuppliers() {
  const payload = await fetchJson<{ suppliers: BackendSupplier[] }>("/suppliers");
  return payload.suppliers.map(mapSupplier);
}

export async function upsertBackendSupplier(input: Omit<Supplier, "id"> & { id?: string }) {
  const path = input.id ? `/suppliers/${encodeURIComponent(input.id)}` : "/suppliers";
  const method = input.id ? "PATCH" : "POST";
  const payload = await fetchJson<{ supplier: BackendSupplier }>(path, {
    method,
    body: JSON.stringify({
      name: input.name,
      contact: input.contact,
      active: input.active,
    }),
  });

  return mapSupplier(payload.supplier);
}

export async function getBackendSupplierInvoices(filters?: {
  school_id?: string;
  month?: string;
  status?: "PAID" | "DUE";
}) {
  const params = new URLSearchParams();
  if (filters?.school_id) params.set("school_id", filters.school_id);
  if (filters?.month) params.set("month", filters.month);
  if (filters?.status) params.set("status", filters.status);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ invoices: BackendSupplierInvoice[] }>(`/invoices${query}`);
  return payload.invoices.map(mapSupplierInvoice);
}

export async function createBackendSupplierInvoice(input: {
  supplier_id: string;
  school_id: string;
  month: string;
  amount: number;
  due_date?: string | null;
}) {
  const payload = await fetchJson<{ invoice: BackendSupplierInvoice }>("/invoices", {
    method: "POST",
    body: JSON.stringify({
      supplierId: input.supplier_id,
      schoolId: input.school_id,
      month: input.month,
      amount: input.amount,
      dueDate: input.due_date || null,
    }),
  });
  return mapSupplierInvoice(payload.invoice);
}

export async function payBackendSupplierInvoice(invoiceId: string, amount?: number) {
  const payload = await fetchJson<{ invoice: BackendSupplierInvoice }>(`/invoices/${encodeURIComponent(invoiceId)}/pay`, {
    method: "POST",
    body: JSON.stringify(amount ? { amount } : {}),
  });
  return mapSupplierInvoice(payload.invoice);
}

export async function getBackendSupplierCostPerMeal(filters?: { school_id?: string; month?: string }) {
  const params = new URLSearchParams();
  if (filters?.school_id) params.set("school_id", filters.school_id);
  if (filters?.month) params.set("month", filters.month);
  const query = params.toString() ? `?${params.toString()}` : "";
  return fetchJson<SupplierCostPerMeal>(`/invoices/cost-per-meal${query}`);
}

export async function getBackendUsers() {
  const payload = await fetchJson<{ users: BackendUser[]; roles?: Array<{ name: string }> }>("/users");
  return payload.users.map(mapUser);
}

export async function createBackendSupervisor(input: {
  name: string;
  email: string;
  password: string;
  school_id: string;
}) {
  const payload = await fetchJson<{ user: BackendUser }>("/users", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
      role: "SUPERVISOR",
      assignedSchoolId: input.school_id,
    }),
  });

  return mapUser(payload.user);
}

export async function createBackendDonor(input: { name: string; email: string; password: string }) {
  const payload = await fetchJson<{ user: BackendUser }>("/users", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password,
      role: "DONOR_READONLY",
    }),
  });

  return mapUser(payload.user);
}

export async function updateBackendSupervisor(
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    active?: boolean;
    school_id?: string;
  }
) {
  const payload = await fetchJson<{ user: BackendUser }>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password || undefined,
      active: input.active,
    }),
  });

  const updatedUser = mapUser(payload.user);
  if (input.school_id) {
    const assigned = await fetchJson<{ user: BackendUser }>(`/users/${encodeURIComponent(id)}/assign-school`, {
      method: "PATCH",
      body: JSON.stringify({
        schoolId: input.school_id,
      }),
    });
    return mapUser(assigned.user);
  }

  return updatedUser;
}

export async function updateBackendDonor(
  id: string,
  input: {
    name?: string;
    email?: string;
    password?: string;
    active?: boolean;
  }
) {
  const payload = await fetchJson<{ user: BackendUser }>(`/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      email: input.email,
      password: input.password || undefined,
      active: input.active,
    }),
  });

  return mapUser(payload.user);
}

export async function deleteBackendSupervisor(id: string) {
  const encodedId = encodeURIComponent(id);
  try {
    const payload = await fetchJson<{ user: BackendUser }>(`/users/${encodedId}`, {
      method: "DELETE",
    });
    return mapUser(payload.user);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Cannot DELETE /users/")) {
      throw error;
    }

    const payload = await fetchJson<{ user: BackendUser }>(`/api/users/${encodedId}`, {
      method: "DELETE",
    });
    return mapUser(payload.user);
  }
}

export async function deleteBackendDonor(id: string) {
  return deleteBackendSupervisor(id);
}

export async function createBackendSchool(input: { name: string; location: string }) {
  const payload = await fetchJson<{ school: BackendSchool }>("/schools", {
    method: "POST",
    body: JSON.stringify({
      code: buildSchoolCode(input.name),
      name: input.name,
      address: input.location,
      timezone: "Africa/Accra",
      active: true,
    }),
  });

  return mapSchool(payload.school);
}

export async function updateBackendSchool(id: string, input: { name: string; location: string }) {
  const payload = await fetchJson<{ school: BackendSchool }>(`/schools/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      address: input.location,
    }),
  });

  return mapSchool(payload.school);
}

export async function getBackendClasses(schoolId?: string) {
  const query = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : "";
  const payload = await fetchJson<{ classes: BackendClass[] }>(`/classes${query}`);
  return payload.classes.map(mapClass);
}

function mapMealServe(entry: BackendMealServe): MealServe & { child_name?: string; class_id?: string; class_name?: string } {
  return {
    id: entry.id,
    child_id: entry.child_id,
    school_id: entry.school_id,
    meal_type: entry.meal_type,
    serve_date: entry.serve_date,
    created_at: entry.created_at,
    is_grace: Boolean(entry.is_grace),
    child_name: entry.child_name || undefined,
    class_id: entry.class_id || undefined,
    class_name: entry.class_name || undefined,
  };
}

function mapMealScanToValidationLog(entry: BackendMealScan): ValidationLog & { child_name?: string; reason?: string | null; meal_type?: string } {
  const reasonCodeMap: Record<string, ValidationLog["reason_code"]> = {
    "Subscription expired": "EXPIRED",
    "No active subscription": "NO_SUBSCRIPTION",
    "Child is inactive": "INACTIVE_CHILD",
    "Insufficient meals remaining": "INSUFFICIENT_MEALS",
    "Meal already served for this child and meal type today": "ALREADY_SERVED",
  };

  return {
    id: entry.id,
    child_id: entry.child_id || undefined,
    school_id: entry.school_id,
    qr_payload: entry.qr_payload,
    result: entry.outcome === "APPROVED" ? "SUCCESS" : "FAILED",
    reason_code: reasonCodeMap[entry.reason || ""] || (entry.outcome === "APPROVED" ? "OK" : "NO_SUBSCRIPTION"),
    created_at: entry.served_at || entry.created_at,
    child_name: entry.child_name || undefined,
    reason: entry.reason || null,
    meal_type: entry.meal_type,
  };
}

function mapLedgerTransaction(entry: BackendLedgerTransaction): LedgerTransaction {
  return {
    id: entry.id,
    child_id: entry.child_id,
    student_id: entry.student_id,
    child_name: entry.child_name,
    school_id: entry.school_id,
    school_name: entry.school_name,
    class_id: entry.class_id || "",
    class_name: entry.class_name || "-",
    payment_intent_id: entry.payment_intent_id || null,
    type: entry.type,
    amount: Number(entry.amount || 0),
    metadata: entry.metadata || {},
    created_at: entry.created_at,
  };
}

export async function createBackendClass(input: { name: string; grade: string; school_id: string }) {
  const payload = await fetchJson<{ class: BackendClass }>(`/schools/${input.school_id}/classes`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      grade: input.grade,
      active: true,
    }),
  });

  return mapClass(payload.class);
}

export async function updateBackendClass(id: string, input: { name: string; grade: string; school_id: string }) {
  const payload = await fetchJson<{ class: BackendClass }>(`/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      schoolId: input.school_id,
      name: input.name,
      grade: input.grade,
    }),
  });

  return mapClass(payload.class);
}

export async function getBackendChildren(schoolId?: string, classId?: string) {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  if (classId) params.set("class_id", classId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ children: BackendChildRow[] }>(`/children${query}`);
  const validRows = payload.children.filter(isValidChildRow);
  const children = validRows.map(mapChild);
  const guardians = validRows
    .map(mapGuardian)
    .filter((entry): entry is Guardian => entry !== null);

  return {
    children,
    guardians,
    classMetaByChildId: Object.fromEntries(
      validRows.map((entry) => [
        entry.id,
        {
          class_name: entry.class_name || null,
          class_grade: entry.class_grade || null,
        },
      ])
    ),
  };
}

export async function getBackendMealServes(schoolId?: string, serveDate?: string) {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  if (serveDate) params.set("serve_date", serveDate);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ mealServes: BackendMealServe[] }>(`/meal-serves${query}`);
  return payload.mealServes.map(mapMealServe);
}

export async function getBackendValidationLogs(schoolId?: string, serviceDate?: string) {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  if (serviceDate) params.set("service_date", serviceDate);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ mealScans: BackendMealScan[] }>(`/meal-scans${query}`);
  return payload.mealScans.map(mapMealScanToValidationLog);
}

export async function getBackendLedgerTransactions(filters: {
  child_id?: string;
  school_id?: string;
  type?: string;
  date_from?: string;
  date_to?: string;
} = {}) {
  const params = new URLSearchParams();
  if (filters.child_id) params.set("child_id", filters.child_id);
  if (filters.school_id) params.set("school_id", filters.school_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.date_from) params.set("date_from", filters.date_from);
  if (filters.date_to) params.set("date_to", filters.date_to);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{
    transactions: BackendLedgerTransaction[];
    aggregates: Array<{ type: string; total_count: number; total_amount: number }>;
    scope: "full" | "aggregate_only";
  }>(`/ledger/transactions${query}`);

  return {
    transactions: payload.transactions.map(mapLedgerTransaction),
    aggregates: payload.aggregates,
    scope: payload.scope,
  };
}

export async function createBackendChildEnrollment(input: {
  student_id: string;
  full_name: string;
  school_id: string;
  class_id: string;
  guardian_name: string;
  guardian_phone: string;
  profile_image_url?: string;
}) {
  const payload = await fetchJson<{
    child: {
      id: string;
      schoolId: string;
      classId: string;
      studentId: string;
      fullName: string;
      profileImageUrl?: string | null;
      active: boolean;
      guardian?: { id: string; name: string; phone: string } | null;
    };
  }>("/children", {
    method: "POST",
    body: JSON.stringify({
      schoolId: input.school_id,
      classId: input.class_id,
      studentId: input.student_id,
      fullName: input.full_name,
      guardianName: input.guardian_name,
      guardianPhone: input.guardian_phone,
      profileImageUrl: input.profile_image_url || "",
    }),
  });

  return {
    child: {
      id: payload.child.id,
      student_id: payload.child.studentId,
      school_id: payload.child.schoolId,
      class_id: payload.child.classId,
      full_name: payload.child.fullName,
      guardian_id: payload.child.guardian?.id || "",
      profile_image_url: payload.child.profileImageUrl || undefined,
      active: payload.child.active,
    } as Child,
    guardian: payload.child.guardian
      ? ({
          id: payload.child.guardian.id,
          name: payload.child.guardian.name,
          phone: payload.child.guardian.phone,
          preferred_channel: "SMS",
        } as Guardian)
      : null,
  };
}

export async function getBackendChildQr(childId: string) {
  const payload = await fetchJson<{
    childQr: {
      childId: string;
      qrPayload: string;
      qrImageUrl: string;
      verificationLink?: string;
    };
  }>(`/children/${encodeURIComponent(childId)}/qr`);

  return {
    child_id: payload.childQr.childId,
    qr_payload: payload.childQr.qrPayload,
    qr_image_url: payload.childQr.qrImageUrl,
    verification_link: payload.childQr.verificationLink || payload.childQr.qrPayload,
  } as ChildQr;
}

export async function getBackendChildSubscription(childId: string) {
  const payload = await fetchJson<{ subscription: BackendChildSubscription | null }>(
    `/children/${encodeURIComponent(childId)}/subscription`
  );

  return payload.subscription ? mapChildSubscription(payload.subscription) : null;
}

export async function manuallyAttachBackendChildSubscription(input: {
  childId: string;
  planId: string;
  reason: string;
  startDate?: string;
}) {
  const body = JSON.stringify({
    planId: input.planId,
    reason: input.reason,
    startDate: input.startDate || undefined,
  });

  try {
    const payload = await fetchJson<{ subscription: BackendChildSubscription }>(
      `/children/${encodeURIComponent(input.childId)}/subscription/manual`,
      {
        method: "POST",
        body,
      }
    );

    return mapChildSubscription(payload.subscription);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Cannot POST")) {
      throw error;
    }

    const payload = await fetchJson<{ subscription: BackendChildSubscription }>(
      `/children/${encodeURIComponent(input.childId)}/subscription/renew`,
      {
        method: "POST",
        body,
      }
    );

    return mapChildSubscription(payload.subscription);
  }
}

export async function cancelBackendChildSubscription(input: {
  childId: string;
  reason?: string;
  effectiveDate?: string;
  nextStatus?: "GRACE_PERIOD" | "CANCELLED";
}) {
  const body = JSON.stringify({
    reason: input.reason || "Admin removed subscription",
    effectiveDate: input.effectiveDate || undefined,
    nextStatus: input.nextStatus || undefined,
  });

  try {
    const payload = await fetchJson<{ subscription: BackendChildSubscription }>(
      `/children/${encodeURIComponent(input.childId)}/subscription/cancel`,
      {
        method: "POST",
        body,
      }
    );

    return mapChildSubscription(payload.subscription);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Cannot POST")) {
      throw error;
    }

    const payload = await fetchJson<{ subscription: BackendChildSubscription }>(
      `/api/children/${encodeURIComponent(input.childId)}/subscription/cancel`,
      {
        method: "POST",
        body,
      }
    );

    return mapChildSubscription(payload.subscription);
  }
}

export async function resetBackendChildMealServiceForTest(input: {
  childId: string;
  serviceDate?: string;
  mealType?: "BREAKFAST" | "LUNCH" | "DINNER";
}) {
  const body = JSON.stringify({
    serviceDate: input.serviceDate || undefined,
    mealType: input.mealType || undefined,
  });

  try {
    const payload = await fetchJson<{
      resetCount: number;
      restoredMeals: number;
      serviceDate: string;
      mealType: string | null;
      subscription: BackendChildSubscription | null;
    }>(`/children/${encodeURIComponent(input.childId)}/meal-service/reset-today`, {
      method: "POST",
      body,
    });

    return {
      resetCount: payload.resetCount,
      restoredMeals: payload.restoredMeals,
      serviceDate: payload.serviceDate,
      mealType: payload.mealType,
      subscription: payload.subscription ? mapChildSubscription(payload.subscription) : null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Cannot POST")) {
      throw error;
    }

    const payload = await fetchJson<{
      resetCount: number;
      restoredMeals: number;
      serviceDate: string;
      mealType: string | null;
      subscription: BackendChildSubscription | null;
    }>(`/api/children/${encodeURIComponent(input.childId)}/meal-service/reset-today`, {
      method: "POST",
      body,
    });

    return {
      resetCount: payload.resetCount,
      restoredMeals: payload.restoredMeals,
      serviceDate: payload.serviceDate,
      mealType: payload.mealType,
      subscription: payload.subscription ? mapChildSubscription(payload.subscription) : null,
    };
  }
}

export async function getBackendDashboardKpis() {
  return fetchJson<{
    mealsToday: number;
    graceMealsToday: number;
    mealsMonth: number;
    activeSubscriptions: number;
    expiringSoon: number;
    graceActive: number;
    revenueMonth: number;
    supplierCostMonth: number;
    costPerMeal: number;
    trends: {
      mealUtilization: { label: string; value: number }[];
      subscriptionRenewals: { label: string; value: number }[];
      costPerMeal: { label: string; value: number }[];
      paymentSuccessRate: { label: string; value: number }[];
    };
  }>("/dashboard/kpis");
}

export async function getBackendSchoolDashboard(schoolId?: string, asOfDate?: string): Promise<SchoolDashboardSnapshot> {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  if (asOfDate) params.set("as_of_date", asOfDate);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ dashboard: BackendSchoolDashboard }>(`/dash/school${query}`);
  return payload.dashboard;
}

export async function getBackendDonorDashboard(): Promise<DonorDashboardSnapshot> {
  const payload = await fetchJson<{ dashboard: BackendDonorDashboard }>("/dash/donor");
  return payload.dashboard;
}

export async function getBackendAiForecast(schoolId?: string): Promise<AiForecastSnapshot> {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ forecast: BackendAiForecast }>(`/ai/forecast${query}`);
  return payload.forecast;
}

export async function getBackendAiAlerts(schoolId?: string): Promise<AnomalyAlert[]> {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<BackendAiAlerts>(`/ai/alerts${query}`);
  return payload.alerts;
}

export async function getBackendAiWeeklyReport(schoolId?: string): Promise<AiReport> {
  const params = new URLSearchParams();
  if (schoolId) params.set("school_id", schoolId);
  const query = params.toString() ? `?${params.toString()}` : "";
  const payload = await fetchJson<{ report: BackendAiReport }>(`/ai/reports/weekly${query}`);
  return payload.report;
}

export async function getBackendSubscriptionPlans() {
  const payload = await fetchJson<{ plans: BackendPlan[] }>("/plans");
  return payload.plans.map(mapPlan);
}

export async function getBackendPaymentIntents(schoolId?: string) {
  const query = schoolId ? `?school_id=${encodeURIComponent(schoolId)}` : "";
  const payload = await fetchJson<{ intents: BackendPaymentIntent[] }>(`/payment-intents${query}`);
  return payload.intents.map(mapPaymentIntent);
}

export async function createBackendPaymentIntent(input: { child_id: string; plan_id: string }) {
  const payload = await fetchJson<{ intent: BackendPaymentIntent }>(`/payment-intents`, {
    method: "POST",
    body: JSON.stringify({
      childId: input.child_id,
      planId: input.plan_id,
    }),
  });

  return mapPaymentIntent(payload.intent);
}

export async function sendBackendPaymentLink(intentId: string) {
  const payload = await fetchJson<{
    intent: BackendPaymentIntent;
    channel: "SMS";
    recipient: string;
    providerReference?: string | null;
  }>(`/payment-intents/${encodeURIComponent(intentId)}/send-link`, {
    method: "POST",
  });

  return {
    intent: mapPaymentIntent(payload.intent),
    channel: payload.channel,
    recipient: payload.recipient,
    providerReference: payload.providerReference || null,
  };
}

export async function getBackendMessagingSettings() {
  try {
    const payload = await fetchJson<{ settings: BackendMessagingSettings }>("/messaging/settings");
    const normalized = {
      ...payload.settings,
      scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"] as Array<"DAILY" | "WEEKLY" | "MONTHLY">,
    };
    storeLocalMessagingSettings(normalized);
    return normalized;
  } catch {
    return getLocalMessagingSettings();
  }
}

export async function updateBackendMessagingSettings(schedule: "DAILY" | "WEEKLY" | "MONTHLY") {
  const body = JSON.stringify({ schedule });

  try {
    const payload = await fetchJson<{ settings: BackendMessagingSettings }>("/messaging/settings", {
      method: "PATCH",
      body,
    });
    const normalized = {
      ...payload.settings,
      scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"] as Array<"DAILY" | "WEEKLY" | "MONTHLY">,
    };
    storeLocalMessagingSettings(normalized);
    return normalized;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (!message.includes("Cannot PATCH")) {
      const fallbackSettings: BackendMessagingSettings = {
        schedule,
        lastRunAt: getLocalMessagingSettings().lastRunAt,
        scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
      };
      storeLocalMessagingSettings(fallbackSettings);
      return fallbackSettings;
    }
    try {
      const payload = await fetchJson<{ settings: BackendMessagingSettings }>("/messaging/settings", {
        method: "POST",
        body,
      });
      const normalized = {
        ...payload.settings,
        scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"] as Array<"DAILY" | "WEEKLY" | "MONTHLY">,
      };
      storeLocalMessagingSettings(normalized);
      return normalized;
    } catch {
      const fallbackSettings: BackendMessagingSettings = {
        schedule,
        lastRunAt: getLocalMessagingSettings().lastRunAt,
        scheduleOptions: ["DAILY", "WEEKLY", "MONTHLY"],
      };
      storeLocalMessagingSettings(fallbackSettings);
      return fallbackSettings;
    }
  }
}

export async function createBackendSubscriptionPlan(input: Omit<SubscriptionPlan, "id">) {
  const payload = await fetchJson<{ plan: BackendPlan }>("/plans", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      meal_type: input.meal_type,
      meals_per_cycle: input.meals_per_cycle,
      price: input.price,
      active: input.active,
      effective_start_date: input.effective_start_date || null,
      effective_end_date: input.effective_end_date || null,
    }),
  });

  return mapPlan(payload.plan);
}

export async function updateBackendSubscriptionPlan(id: string, input: Omit<SubscriptionPlan, "id">) {
  const payload = await fetchJson<{ plan: BackendPlan }>(`/plans/${id}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: input.name,
      meal_type: input.meal_type,
      meals_per_cycle: input.meals_per_cycle,
      price: input.price,
      active: input.active,
      effective_start_date: input.effective_start_date || null,
      effective_end_date: input.effective_end_date || null,
    }),
  });

  return mapPlan(payload.plan);
}

export async function deleteBackendSubscriptionPlan(id: string) {
  const encodedId = encodeURIComponent(id);

  try {
    const payload = await fetchJson<{ plan: BackendPlan }>(`/plans/${encodedId}`, {
      method: "DELETE",
    });

    return mapPlan(payload.plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "");

    if (message.includes(`Cannot DELETE /plans/${encodedId}`) || message.includes("Cannot DELETE /plans/")) {
      const payload = await fetchJson<{ plan: BackendPlan }>(`/api/plans/${encodedId}`, {
        method: "DELETE",
      });

      return mapPlan(payload.plan);
    }

    throw error;
  }
}

export async function updateBackendChildProfile(
  id: string,
  input: {
    student_id: string;
    full_name: string;
    school_id: string;
    class_id: string;
    guardian_name: string;
    guardian_phone: string;
    profile_image_url?: string;
    active: boolean;
  }
) {
  const payload = await fetchJson<{
    child: {
      id: string;
      schoolId: string;
      classId: string;
      studentId: string;
      fullName: string;
      profileImageUrl?: string | null;
      subscriptionStatus?: "ACTIVE" | "EXPIRED" | "PAUSED" | "NONE" | "GRACE_PERIOD";
      gracePeriodEndsAt?: string | null;
      active: boolean;
      guardian?: { id: string; name: string; phone: string } | null;
    };
  }>(`/children/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      schoolId: input.school_id,
      classId: input.class_id,
      studentId: input.student_id,
      fullName: input.full_name,
      guardianName: input.guardian_name,
      guardianPhone: input.guardian_phone,
      profileImageUrl: input.profile_image_url || "",
      active: input.active,
    }),
  });

  return {
    child: {
      id: payload.child.id,
      student_id: payload.child.studentId,
      school_id: payload.child.schoolId,
      class_id: payload.child.classId,
      full_name: payload.child.fullName,
      guardian_id: payload.child.guardian?.id || "",
      profile_image_url: payload.child.profileImageUrl || undefined,
      active: payload.child.active,
      subscription_status: payload.child.subscriptionStatus || "NONE",
      grace_period_ends_at: payload.child.gracePeriodEndsAt || undefined,
    } as Child,
    guardian: payload.child.guardian
      ? ({
          id: payload.child.guardian.id,
          name: payload.child.guardian.name,
          phone: payload.child.guardian.phone,
          preferred_channel: "SMS",
        } as Guardian)
      : null,
  };
}

export async function deleteBackendChild(id: string) {
  await fetchJson<{ child: Child }>(`/children/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });

  return true;
}
