import {
  ActivityLog,
  AiReport,
  AnomalyAlert,
  Child,
  ChildQr,
  ChildSubscription,
  ClassRoom,
  Guardian,
  MealServe,
  MessageLog,
  MessageOutbox,
  PaymentEvent,
  PaymentIntent,
  School,
  SubscriptionPlan,
  Supplier,
  SupplierInvoice,
  SupplierPayment,
  Transaction,
  User,
  ValidationLog,
  GracePeriod,
  SchoolStaff,
} from "./types";
import { buildChildQrPayload, buildVerificationLink } from "./qr";

export const users: User[] = [
  { id: "u1", name: "Ava Mendez", role: "ADMIN" },
  { id: "u2", name: "Jonah Tetteh", role: "SCHOOL_ADMIN", assigned_school_id: "s1" },
  { id: "u3", name: "Maya Patel", role: "DONOR_READONLY" },
];

export const school_staff: SchoolStaff[] = [
  {
    id: "st1",
    school_id: "s1",
    name: "Kojo Asare",
    email: "kojo.asare@riverbend.edu",
    role: "SUPERVISOR",
    access_active: true,
  },
  {
    id: "st2",
    school_id: "s1",
    name: "Esi Lamptey",
    email: "esi.lamptey@riverbend.edu",
    role: "SUPERVISOR",
    access_active: true,
  },
];

export const schools: School[] = [
  { id: "s1", name: "Riverbend Primary", location: "Accra North" },
  { id: "s2", name: "Hillview Academy", location: "Kumasi Central" },
  { id: "s3", name: "Coastal Prep", location: "Cape Coast" },
];

export const classes: ClassRoom[] = [
  { id: "c1", school_id: "s1", name: "Sunflowers", grade: "Grade 1" },
  { id: "c2", school_id: "s1", name: "Rainforest", grade: "Grade 2" },
  { id: "c3", school_id: "s2", name: "Coral", grade: "Grade 1" },
  { id: "c4", school_id: "s2", name: "Orbit", grade: "Grade 3" },
  { id: "c5", school_id: "s3", name: "Harbor", grade: "Grade 2" },
];

export const guardians: Guardian[] = [
  { id: "g1", name: "Ruth Mensah", phone: "+233-555-181-222", preferred_channel: "SMS" },
  { id: "g2", name: "Kwame Boateng", phone: "+233-555-373-991", preferred_channel: "WHATSAPP" },
  { id: "g3", name: "Lina Osei", phone: "+233-555-444-901", preferred_channel: "EMAIL" },
];

export const children: Child[] = [
  {
    id: "ch1",
    student_id: "RB-1001",
    school_id: "s1",
    class_id: "c1",
    full_name: "Selena Nyarko",
    guardian_id: "g1",
    profile_image_url: "https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=320&q=80",
    active: true,
  },
  {
    id: "ch2",
    student_id: "RB-1002",
    school_id: "s1",
    class_id: "c2",
    full_name: "Jordan Bediako",
    guardian_id: "g2",
    profile_image_url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9?auto=format&fit=crop&w=320&q=80",
    active: true,
  },
  {
    id: "ch3",
    student_id: "HV-2041",
    school_id: "s2",
    class_id: "c3",
    full_name: "Alina Carver",
    guardian_id: "g3",
    profile_image_url: "https://images.unsplash.com/photo-1503919545889-aef636e10ad4?auto=format&fit=crop&w=320&q=80",
    active: false,
  },
  {
    id: "ch4",
    student_id: "HV-2210",
    school_id: "s2",
    class_id: "c4",
    full_name: "Micah Owusu",
    guardian_id: "g1",
    profile_image_url: "https://images.unsplash.com/photo-1545696968-1a5245650b36?auto=format&fit=crop&w=320&q=80",
    active: true,
  },
  {
    id: "ch5",
    student_id: "CP-3301",
    school_id: "s3",
    class_id: "c5",
    full_name: "Ama Dede",
    guardian_id: "g2",
    profile_image_url: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?auto=format&fit=crop&w=320&q=80",
    active: true,
  },
];

export const child_qr: ChildQr[] = children.map((child) => ({
  child_id: child.id,
  qr_payload: buildChildQrPayload(child),
  qr_image_url: "/qr-placeholder.svg",
  verification_link: buildVerificationLink(buildChildQrPayload(child)),
}));

export const subscription_plans: SubscriptionPlan[] = [
  {
    id: "p1",
    name: "Breakfast Flex",
    meal_type: "BREAKFAST",
    meals_per_cycle: 20,
    price: 40,
    active: true,
  },
  {
    id: "p2",
    name: "Lunch Standard",
    meal_type: "LUNCH",
    meals_per_cycle: 22,
    price: 55,
    active: true,
  },
  {
    id: "p3",
    name: "Dinner Plus",
    meal_type: "DINNER",
    meals_per_cycle: 18,
    price: 48,
    active: false,
  },
];

export const child_subscriptions: ChildSubscription[] = [
  {
    child_id: "ch1",
    status: "ACTIVE",
    start_date: "2026-02-15",
    end_date: "2026-03-15",
    meals_remaining: 12,
    plan_id: "p2",
  },
  {
    child_id: "ch2",
    status: "EXPIRED",
    start_date: "2026-01-01",
    end_date: "2026-02-01",
    meals_remaining: 0,
    plan_id: "p2",
  },
  {
    child_id: "ch4",
    status: "ACTIVE",
    start_date: "2026-02-20",
    end_date: "2026-03-20",
    meals_remaining: 5,
    plan_id: "p1",
  },
  {
    child_id: "ch5",
    status: "EXPIRED",
    start_date: "2026-01-12",
    end_date: "2026-02-12",
    meals_remaining: 0,
    plan_id: "p1",
  },
];

export const transactions: Transaction[] = [
  {
    id: "t1",
    child_id: "ch1",
    type: "SUBSCRIPTION_PURCHASE",
    amount: 55,
    metadata: { plan: "Lunch Standard" },
    created_at: "2026-02-15T09:00:00Z",
  },
  {
    id: "t2",
    child_id: "ch1",
    type: "DEBIT_MEAL",
    amount: -1,
    metadata: { meal_type: "LUNCH" },
    created_at: "2026-03-01T12:15:00Z",
  },
  {
    id: "t3",
    child_id: "ch4",
    type: "SUBSCRIPTION_PURCHASE",
    amount: 40,
    metadata: { plan: "Breakfast Flex" },
    created_at: "2026-02-20T08:45:00Z",
  },
];

export const payment_intents: PaymentIntent[] = [
  {
    id: "pi0",
    child_id: "ch1",
    plan_id: "p2",
    amount: 55,
    reference: "INV-1998",
    status: "PAID",
    payment_url: "https://pay.mock/INV-1998",
    created_at: "2026-02-18T09:15:00Z",
  },
  {
    id: "pi1",
    child_id: "ch2",
    plan_id: "p2",
    amount: 55,
    reference: "INV-2001",
    status: "PENDING",
    payment_url: "https://pay.mock/INV-2001",
    created_at: "2026-03-01T08:00:00Z",
  },
  {
    id: "pi2",
    child_id: "ch5",
    plan_id: "p1",
    amount: 40,
    reference: "INV-2002",
    status: "FAILED",
    payment_url: "https://pay.mock/INV-2002",
    created_at: "2026-03-02T10:30:00Z",
  },
  {
    id: "pi3",
    child_id: "ch4",
    plan_id: "p1",
    amount: 40,
    reference: "INV-2003",
    status: "PENDING",
    payment_url: "https://pay.mock/INV-2003",
    created_at: "2026-03-03T07:40:00Z",
  },
  {
    id: "pi4",
    child_id: "ch3",
    plan_id: "p2",
    amount: 55,
    reference: "INV-2004",
    status: "FAILED",
    payment_url: "https://pay.mock/INV-2004",
    created_at: "2026-03-04T11:20:00Z",
  },
  {
    id: "pi5",
    child_id: "ch1",
    plan_id: "p3",
    amount: 48,
    reference: "INV-2005",
    status: "PENDING",
    payment_url: "https://pay.mock/INV-2005",
    created_at: "2026-03-05T14:05:00Z",
  },
];

export const payment_events: PaymentEvent[] = [];

export const meal_serves: MealServe[] = [
  {
    id: "ms1",
    child_id: "ch1",
    school_id: "s1",
    meal_type: "LUNCH",
    serve_date: "2026-03-02",
    created_at: "2026-03-02T12:00:00Z",
  },
];

export const validation_logs: ValidationLog[] = [
  {
    id: "vl1",
    child_id: "ch1",
    school_id: "s1",
    qr_payload: buildChildQrPayload(children[0]),
    result: "SUCCESS",
    reason_code: "OK",
    created_at: "2026-03-02T12:00:00Z",
  },
];

export const grace_periods: GracePeriod[] = [
  {
    child_id: "ch3",
    start_date: "2026-03-01",
    days_used: 2,
    last_served_date: "2026-03-02",
    notified: true,
  },
];

export const activity_logs: ActivityLog[] = [
  {
    id: "al1",
    type: "IMPORT",
    message: "Imported 5 children for Riverbend Primary",
    created_at: "2026-03-01T09:20:00Z",
  },
];

export const message_outbox: MessageOutbox[] = [
  {
    id: "mo1",
    channel: "SMS",
    recipient: "+233-555-181-222",
    status: "PENDING",
    payload: "Your payment is due for Selena Nyarko.",
    created_at: "2026-03-02T08:10:00Z",
  },
  {
    id: "mo2",
    channel: "WHATSAPP",
    recipient: "+233-555-373-991",
    status: "FAILED",
    payload: "Payment link for Jordan Bediako.",
    created_at: "2026-03-01T07:50:00Z",
  },
];

export const message_logs: MessageLog[] = [
  {
    id: "ml1",
    status: "FAILED",
    source: "Payment reminder SMS",
    child_name: "Jordan Bediako",
    guardian_name: "Kwame Boateng",
    guardian_phone: "+233-555-373-991",
    detail: "Parent phone number unreachable",
    failure_reason: "Parent phone number unreachable",
    created_at: "2026-03-01T07:55:00Z",
  },
  {
    id: "ml2",
    status: "SENT",
    source: "Payment reminder SMS",
    child_name: "Selena Nyarko",
    guardian_name: "Ruth Mensah",
    guardian_phone: "+233-555-181-222",
    detail: "Payment reminder delivered",
    failure_reason: null,
    created_at: "2026-03-02T08:12:00Z",
  },
];

export const suppliers: Supplier[] = [
  { id: "sup1", name: "FreshFields Foods", contact: "Grace Li", active: true },
  { id: "sup2", name: "Harvest Kitchen", contact: "Daniel Owusu", active: true },
];

export const supplier_invoices: SupplierInvoice[] = [
  {
    id: "inv1",
    supplier_id: "sup1",
    school_id: "s1",
    month: "2026-03",
    amount: 1200,
    status: "DUE",
  },
  {
    id: "inv2",
    supplier_id: "sup2",
    school_id: "s2",
    month: "2026-03",
    amount: 980,
    status: "PAID",
  },
];

export const supplier_payments: SupplierPayment[] = [
  {
    id: "pay1",
    supplier_id: "sup2",
    invoice_id: "inv2",
    amount: 980,
    paid_at: "2026-03-01T15:30:00Z",
  },
];

export const anomaly_alerts: AnomalyAlert[] = [
  {
    id: "aa1",
    severity: "HIGH",
    message: "Lunch servings down 18% at Hillview Academy",
    created_at: "2026-03-03T06:30:00Z",
  },
  {
    id: "aa2",
    severity: "MEDIUM",
    message: "Repeated QR scan attempts detected for RB-1002",
    created_at: "2026-03-02T12:15:00Z",
  },
];

export const ai_reports: AiReport[] = [
  {
    id: "air1",
    title: "Weekly Executive Summary",
    summary:
      "Meal utilization remained steady. Riverbend increased subscription renewals by 6%, while Hillview reported a slower meal take-up in Grade 1. Recommend a targeted outreach to guardians in Hillview.",
    created_at: "2026-03-03T08:00:00Z",
  },
];
