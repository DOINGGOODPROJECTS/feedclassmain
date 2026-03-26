"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBackendSupplierInvoice,
  getBackendSchools,
  getBackendSupplierCostPerMeal,
  getBackendSupplierInvoices,
  getBackendSuppliers,
  payBackendSupplierInvoice,
} from "@/lib/backendApi";
import { School, Supplier, SupplierCostPerMeal, SupplierInvoice } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

const schema = z.object({
  supplier_id: z.string().min(1, "Supplier is required"),
  school_id: z.string().min(1, "School is required"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  amount: z.coerce.number().positive("Amount must be greater than zero"),
  due_date: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

function formatMonthLabel(month: string) {
  const [year, monthPart] = month.split("-");
  if (!year || !monthPart) {
    return month;
  }

  return new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

export default function AdminInvoicesPage() {
  const { push } = useToast();
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [cost, setCost] = useState<SupplierCostPerMeal | null>(null);
  const [open, setOpen] = useState(false);
  const [monthFilter, setMonthFilter] = useState("");
  const [schoolFilter, setSchoolFilter] = useState("");

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplier_id: "",
      school_id: "",
      month: new Date().toISOString().slice(0, 7),
      amount: 0,
      due_date: "",
    },
  });

  useEffect(() => {
    void Promise.all([getBackendSupplierInvoices(), getBackendSchools(), getBackendSuppliers()])
      .then(([invoiceData, schoolData, supplierData]) => {
        setInvoices(invoiceData);
        setSchools(schoolData);
        setSuppliers(supplierData);
      })
      .catch((error: Error) => {
        push({ title: "Failed to load invoices", description: error.message, variant: "danger" });
      });
  }, [push]);

  useEffect(() => {
    void getBackendSupplierCostPerMeal({
      school_id: schoolFilter || undefined,
      month: monthFilter || undefined,
    })
      .then(setCost)
      .catch(() => {
        setCost(null);
      });
  }, [monthFilter, schoolFilter]);

  const filteredInvoices = useMemo(() => {
    return invoices.filter((invoice) => {
      if (schoolFilter && invoice.school_id !== schoolFilter) {
        return false;
      }
      if (monthFilter && invoice.month !== monthFilter) {
        return false;
      }
      return true;
    });
  }, [invoices, monthFilter, schoolFilter]);

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      const invoice = await createBackendSupplierInvoice({
        supplier_id: values.supplier_id,
        school_id: values.school_id,
        month: values.month,
        amount: values.amount,
        due_date: values.due_date || null,
      });
      setInvoices((prev) => [invoice, ...prev]);
      push({ title: "Invoice created", description: invoice.id, variant: "success" });
      setOpen(false);
      form.reset({
        supplier_id: "",
        school_id: "",
        month: new Date().toISOString().slice(0, 7),
        amount: 0,
        due_date: "",
      });
    } catch (error) {
      push({
        title: "Failed to create invoice",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "danger",
      });
    }
  });

  const handleMarkPaid = async (invoiceId: string) => {
    try {
      const updated = await payBackendSupplierInvoice(invoiceId);
      setInvoices((prev) => prev.map((inv) => (inv.id === invoiceId ? updated : inv)));
      push({ title: "Invoice marked paid", description: invoiceId, variant: "success" });
    } catch (error) {
      push({
        title: "Failed to mark invoice paid",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "danger",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Supplier Invoices"
        description="Track monthly supplier invoices and cost per meal from the database."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>Add invoice</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add invoice</DialogTitle>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <select
                  {...form.register("supplier_id")}
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
                <select
                  {...form.register("school_id")}
                  className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
                <Input type="month" {...form.register("month")} />
                <Input type="number" min="0" step="0.01" placeholder="Amount" {...form.register("amount")} />
                <Input type="date" {...form.register("due_date")} />
                <Button type="submit" className="w-full">
                  Create invoice
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Supplier cost</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatCurrency(cost?.supplierCost || 0)}
          </p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Meals served</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{cost?.mealsServed || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-500">Cost per meal</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatCurrency(cost?.costPerMeal || 0)}
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <select
            value={schoolFilter}
            onChange={(event) => setSchoolFilter(event.target.value)}
            className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
          >
            <option value="">All schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <Input type="month" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} />
        </div>

        <DataTable
          columns={[
            { header: "Invoice", render: (row: SupplierInvoice) => row.id },
            { header: "Supplier", render: (row: SupplierInvoice) => row.supplier_name || row.supplier_id },
            { header: "School", render: (row: SupplierInvoice) => row.school_name || row.school_id },
            { header: "Month", render: (row: SupplierInvoice) => formatMonthLabel(row.month) },
            { header: "Amount", render: (row: SupplierInvoice) => formatCurrency(row.amount) },
            { header: "Due date", render: (row: SupplierInvoice) => row.due_date || "-" },
            { header: "Status", render: (row: SupplierInvoice) => row.status },
            {
              header: "Actions",
              render: (row: SupplierInvoice) => (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleMarkPaid(row.id)}
                  disabled={row.status === "PAID"}
                >
                  Mark paid
                </Button>
              ),
            },
          ]}
          data={filteredInvoices}
        />
      </div>
    </div>
  );
}
