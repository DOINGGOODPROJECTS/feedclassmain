"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { getBackendSuppliers, upsertBackendSupplier } from "@/lib/backendApi";
import { Supplier } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DataTable } from "@/components/data-table";
import { useToast } from "@/components/ui/use-toast";

const schema = z.object({
  name: z.string().min(2),
  contact: z.string().min(2),
  active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

export default function AdminSuppliersPage() {
  const { push } = useToast();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", contact: "", active: true },
  });

  useEffect(() => {
    getBackendSuppliers().then(setSuppliers);
  }, []);

  const handleSubmit = form.handleSubmit(async (values) => {
    const saved = await upsertBackendSupplier(editing ? { ...values, id: editing.id } : values);
    setSuppliers((prev) => {
      const exists = prev.find((entry) => entry.id === saved.id);
      return exists ? prev.map((entry) => (entry.id === saved.id ? saved : entry)) : [...prev, saved];
    });
    push({ title: "Supplier saved", description: saved.name, variant: "success" });
    setOpen(false);
    setEditing(null);
  });

  const startEdit = (supplier: Supplier) => {
    setEditing(supplier);
    form.reset({ name: supplier.name, contact: supplier.contact, active: supplier.active });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Suppliers"
        description="Supplier registry supporting cost-per-meal analytics."
        actions={
          <Dialog
            open={open}
            onOpenChange={(value) => {
              setOpen(value);
              if (!value) {
                setEditing(null);
                form.reset();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>Add supplier</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit supplier" : "Add supplier"}</DialogTitle>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <Input placeholder="Supplier name" {...form.register("name")} />
                <Input placeholder="Contact person" {...form.register("contact")} />
                <div className="flex items-center gap-3">
                  <Switch checked={form.watch("active")} onCheckedChange={(value) => form.setValue("active", value)} />
                  <Label>Active</Label>
                </div>
                <Button type="submit" className="w-full">
                  Save supplier
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <DataTable
          columns={[
            { header: "Supplier", render: (row: Supplier) => row.name },
            { header: "Contact", render: (row: Supplier) => row.contact },
            { header: "Status", render: (row: Supplier) => (row.active ? "Active" : "Inactive") },
            {
              header: "Actions",
              render: (row: Supplier) => (
                <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                  Edit
                </Button>
              ),
            },
          ]}
          data={suppliers}
        />
      </div>
    </div>
  );
}
