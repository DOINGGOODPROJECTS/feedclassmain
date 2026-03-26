export type Role = "ADMIN" | "SCHOOL_ADMIN" | "DONOR_READONLY";

export type SchoolStaffRole = "SUPERVISOR";

export type MealType = "BREAKFAST" | "LUNCH" | "DINNER";

export type SubscriptionStatus = "ACTIVE" | "EXPIRED" | "CANCELLED" | "PAUSED" | "NONE" | "GRACE_PERIOD";

export type TransactionType =
  | "SUBSCRIPTION_PURCHASE"
  | "DEBIT_MEAL"
  | "GRACE_MEAL"
  | "ADJUSTMENT";

export type PaymentStatus = "PENDING" | "PAID" | "FAILED";

export type ValidationResult = "SUCCESS" | "FAILED";

export type ReasonCode =
  | "NO_SUBSCRIPTION"
  | "EXPIRED"
  | "ALREADY_SERVED"
  | "WRONG_SCHOOL"
  | "INACTIVE_CHILD"
  | "INSUFFICIENT_MEALS"
  | "GRACE_EXPIRED"
  | "OK";

export interface User {
  id: string;
  name: string;
  role: Role;
  assigned_school_id?: string;
}

export interface SchoolStaff {
  id: string;
  school_id: string;
  name: string;
  email: string;
  role: SchoolStaffRole;
  access_active: boolean;
}

export interface School {
  id: string;
  name: string;
  location: string;
}

export interface ClassRoom {
  id: string;
  school_id: string;
  name: string;
  grade: string;
}

export interface Guardian {
  id: string;
  name: string;
  phone: string;
  preferred_channel: "SMS" | "WHATSAPP" | "EMAIL";
}

export interface Child {
  id: string;
  student_id: string;
  school_id: string;
  class_id: string;
  full_name: string;
  guardian_id: string;
  profile_image_url?: string;
  active: boolean;
  subscription_status?: "ACTIVE" | "EXPIRED" | "PAUSED" | "NONE" | "GRACE_PERIOD" | "CANCELLED";
  grace_period_ends_at?: string;
}

export interface ChildQr {
  child_id: string;
  qr_payload: string;
  qr_image_url: string;
  verification_link: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  meal_type: MealType;
  meals_per_cycle: number;
  price: number;
  active: boolean;
  effective_start_date?: string | null;
  effective_end_date?: string | null;
}

export interface ChildSubscription {
  child_id: string;
  status: SubscriptionStatus;
  start_date: string;
  end_date: string;
  meals_remaining: number;
  meal_type?: MealType | null;
  plan_id: string | null;
  plan_name?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
}

export interface Transaction {
  id: string;
  child_id: string;
  type: TransactionType;
  amount: number;
  metadata: Record<string, string>;
  created_at: string;
}

export interface LedgerTransaction extends Transaction {
  student_id: string;
  child_name: string;
  school_id: string;
  school_name: string;
  class_id: string;
  class_name: string;
  payment_intent_id?: string | null;
}

export interface PaymentIntent {
  id: string;
  child_id: string;
  plan_id: string;
  plan_name?: string | null;
  amount: number;
  reference: string;
  status: PaymentStatus;
  payment_url: string;
  created_at: string;
}

export interface PaymentEvent {
  id: string;
  external_tx_id: string;
  intent_id: string;
  status: PaymentStatus;
  created_at: string;
}

export interface PaymentTransactionRecord {
  intent_id: string;
  reference: string;
  status: PaymentStatus;
  amount: number;
  payment_url: string;
  created_at: string;
  child_id: string;
  child_name: string;
  school_id: string;
  school_name: string;
  class_id: string;
  class_name: string;
  guardian_name: string;
  guardian_phone: string;
  plan_id: string;
  plan_name: string;
}

export interface MealServe {
  id: string;
  child_id: string;
  school_id: string;
  meal_type: MealType;
  serve_date: string;
  created_at: string;
  is_grace?: boolean;
}

export interface ValidationLog {
  id: string;
  child_id?: string;
  school_id: string;
  qr_payload: string;
  result: ValidationResult;
  reason_code: ReasonCode;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  type: string;
  message: string;
  created_at: string;
}

export interface MessageOutbox {
  id: string;
  channel: "SMS" | "WHATSAPP" | "EMAIL";
  recipient: string;
  status: "PENDING" | "SENT" | "FAILED";
  payload: string;
  created_at: string;
}

export interface MessageLog {
  id: string;
  status: "PENDING" | "SENT" | "FAILED";
  source?: string;
  child_name?: string;
  guardian_name?: string;
  guardian_phone?: string;
  detail: string;
  failure_reason?: string | null;
  created_at: string;
}

export interface Supplier {
  id: string;
  name: string;
  contact: string;
  active: boolean;
}

export interface SupplierInvoice {
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
}

export interface SupplierPayment {
  id: string;
  supplier_id: string;
  invoice_id: string;
  amount: number;
  paid_at: string;
}

export interface SupplierCostPerMeal {
  supplierCost: number;
  mealsServed: number;
  costPerMeal: number;
}

export interface GracePeriod {
  child_id: string;
  start_date: string;
  days_used: number;
  last_served_date?: string;
  notified: boolean;
}

export interface SupervisorChildLookupItem {
  child: Child;
  class_name: string;
  grade: string;
  guardian?: Guardian;
  subscription?: ChildSubscription | null;
  qr?: ChildQr | null;
}

export interface AnomalyAlert {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  type?: "MEAL_SPIKE" | "NO_SUBSCRIPTION_SPIKE" | "PAYMENTS_MEALS_MISMATCH";
  title?: string;
  message: string;
  metric_value?: number;
  baseline_value?: number;
  created_at: string;
}

export interface AiReport {
  id: string;
  title: string;
  summary: string;
  created_at: string;
  window_start?: string;
  window_end?: string;
  highlights?: string[];
}

export interface AiForecastHistoryPoint {
  date: string;
  meals: number;
}

export interface AiForecastPoint {
  date: string;
  baseline: number;
  predictedMeals: number;
}

export interface AiForecastSnapshot {
  generatedAt: string;
  scope: {
    school_id?: string | null;
    school_name: string;
  };
  history: AiForecastHistoryPoint[];
  forecast: AiForecastPoint[];
}

export interface SchoolDashboardClassMeals {
  class_id: string;
  class_name: string;
  total: number;
}

export interface SchoolDashboardFailedScan {
  id: string;
  child_id?: string | null;
  student_id?: string | null;
  child_name: string;
  class_name?: string | null;
  meal_type?: MealType | null;
  reason: string;
  created_at: string;
}

export interface SchoolDashboardMissingSubscription {
  child_id: string;
  student_id: string;
  child_name: string;
  class_name?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  subscription_status: SubscriptionStatus | "NONE";
}

export interface SchoolDashboardPaymentFollowUp {
  id: string;
  reference: string;
  status: PaymentStatus;
  payment_url: string;
  created_at: string;
  child_id: string;
  student_id: string;
  child_name: string;
  class_name?: string | null;
  guardian_name?: string | null;
  guardian_phone?: string | null;
}

export interface SchoolDashboardSuccessfulScan {
  id: string;
  child_id?: string | null;
  student_id?: string | null;
  child_name: string;
  class_name?: string | null;
  meal_type?: MealType | null;
  created_at: string;
}

export interface SchoolDashboardSnapshot {
  school: { id: string; name: string };
  serviceDate: string;
  mealsServedToday: number;
  mealsByClass: SchoolDashboardClassMeals[];
  failedScans: SchoolDashboardFailedScan[];
  childrenMissingSubscriptions: SchoolDashboardMissingSubscription[];
  paymentFollowUps: SchoolDashboardPaymentFollowUp[];
  successfulScans24h: SchoolDashboardSuccessfulScan[];
}

export interface DonorDashboardTrendPoint {
  label: string;
  mealsServed: number;
  fundsReceived: number;
  costPerMeal: number;
  schoolsSupported: number;
}

export interface DonorDashboardSnapshot {
  totalMeals: number;
  totalChildren: number;
  fundsReceived: number;
  costPerMeal: number;
  trends: DonorDashboardTrendPoint[];
}
