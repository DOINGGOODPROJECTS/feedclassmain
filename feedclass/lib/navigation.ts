import { Role } from "./types";

export interface NavItem {
  label: string;
  href: string;
}

export const navByRole: Record<Role, NavItem[]> = {
  ADMIN: [
    { label: "Dashboard", href: "/app/admin/dashboard" },
    { label: "Schools", href: "/app/admin/schools" },
    { label: "Supervisors", href: "/app/admin/supervisors" },
    { label: "Donors", href: "/app/admin/donors" },
    { label: "Classes", href: "/app/admin/classes" },
    { label: "Children", href: "/app/admin/children" },
    { label: "Badges", href: "/app/admin/badges" },
    { label: "Plans", href: "/app/admin/plans" },
    { label: "Ledger", href: "/app/admin/ledger" },
    { label: "Payments", href: "/app/admin/payments" },
    { label: "Transactions", href: "/app/admin/transactions" },
    { label: "Notifications", href: "/app/admin/notifications" },
    { label: "Suppliers", href: "/app/admin/suppliers" },
    { label: "Invoices", href: "/app/admin/invoices" },
    { label: "Exports", href: "/app/admin/exports" },
    { label: "AI", href: "/app/admin/ai" },
  ],
  SCHOOL_ADMIN: [
    { label: "Home", href: "/app/supervisor/home" },
    { label: "Children", href: "/app/supervisor/children" },
    { label: "Payments", href: "/app/supervisor/payments" },
    { label: "Transactions", href: "/app/supervisor/transactions" },
    { label: "History", href: "/app/supervisor/history" },
    { label: "Problems", href: "/app/supervisor/problems" },
    { label: "AI", href: "/app/supervisor/ai" },
  ],
  DONOR_READONLY: [{ label: "Dashboard", href: "/app/donor/dashboard" }],
};
