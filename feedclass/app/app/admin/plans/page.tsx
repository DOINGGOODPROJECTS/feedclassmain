"use client";

import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBackendSubscriptionPlan,
  deleteBackendSubscriptionPlan,
  getBackendSubscriptionPlans,
  updateBackendSubscriptionPlan,
} from "@/lib/backendApi";
import { SubscriptionPlan } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { DataTable } from "@/components/data-table";
import { formatCurrency, formatDate } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2),
  meal_type: z.enum(["BREAKFAST", "LUNCH", "DINNER"]),
  meals_per_cycle: z.coerce.number().min(1),
  price: z.coerce.number().min(0),
  active: z.boolean(),
  effective_start_date: z.string().optional().or(z.literal("")),
  effective_end_date: z.string().optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export default function AdminPlansPage() {
  const { push } = useToast();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [open, setOpen] = useState(false);
  const selectClassName =
    "flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300";

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      meal_type: "LUNCH",
      meals_per_cycle: 0,
      price: 0,
      active: true,
      effective_start_date: "",
      effective_end_date: "",
    },
  });
  const selectedMealType = useWatch({ control: form.control, name: "meal_type" });
  const isActive = useWatch({ control: form.control, name: "active" });

  useEffect(() => {
    getBackendSubscriptionPlans().then(setPlans);
  }, []);

  const handleSubmit = form.handleSubmit(async (values) => {
    const payload = {
      ...values,
      effective_start_date: values.effective_start_date || null,
      effective_end_date: values.effective_end_date || null,
    };
    const saved = editing
      ? await updateBackendSubscriptionPlan(editing.id, payload)
      : await createBackendSubscriptionPlan(payload);
    setPlans((prev) => {
      const exists = prev.find((plan) => plan.id === saved.id);
      return exists ? prev.map((plan) => (plan.id === saved.id ? saved : plan)) : [...prev, saved];
    });
    push({ title: "Plan saved", description: saved.name, variant: "success" });
    setOpen(false);
    setEditing(null);
  });

  const startEdit = (plan: SubscriptionPlan) => {
    setEditing(plan);
    form.reset({
      name: plan.name,
      meal_type: plan.meal_type,
      meals_per_cycle: plan.meals_per_cycle,
      price: plan.price,
      active: plan.active,
      effective_start_date: plan.effective_start_date || "",
      effective_end_date: plan.effective_end_date || "",
    });
    setOpen(true);
  };

  const handleDelete = async (plan: SubscriptionPlan) => {
    try {
      await deleteBackendSubscriptionPlan(plan.id);
      setPlans((prev) => prev.filter((entry) => entry.id !== plan.id));
      push({ title: "Plan deleted", description: plan.name, variant: "success" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete plan.";

      if (message.includes("already linked to subscriptions or payments")) {
        const archived = await updateBackendSubscriptionPlan(plan.id, {
          name: plan.name,
          meal_type: plan.meal_type,
          meals_per_cycle: plan.meals_per_cycle,
          price: plan.price,
          active: false,
          effective_start_date: plan.effective_start_date,
          effective_end_date: plan.effective_end_date,
        });
        setPlans((prev) => prev.map((entry) => (entry.id === archived.id ? archived : entry)));
        push({
          title: "Plan archived",
          description: `${plan.name} is already in use, so it was marked inactive instead.`,
          variant: "success",
        });
        return;
      }

      push({
        title: "Delete failed",
        description: message,
        variant: "danger",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Subscription Plans"
        description="Configure pricing, meal counts, and plan availability."
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
              <Button>Add plan</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit plan" : "Create plan"}</DialogTitle>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="plan-name">Plan name</Label>
                  <Input id="plan-name" placeholder="Plan name" {...form.register("name")} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plan-meal-type">Meal type</Label>
                    <select
                      id="plan-meal-type"
                      className={selectClassName}
                      value={selectedMealType}
                      onChange={(event) =>
                        form.setValue("meal_type", event.target.value as FormValues["meal_type"])
                      }
                    >
                      <option value="BREAKFAST">BREAKFAST</option>
                      <option value="LUNCH">LUNCH</option>
                      <option value="DINNER">DINNER</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-meals-per-cycle">Meals per cycle</Label>
                    <Input id="plan-meals-per-cycle" type="number" placeholder="Meals per cycle" {...form.register("meals_per_cycle")} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan-price">Price</Label>
                  <Input id="plan-price" type="number" placeholder="Price" {...form.register("price")} />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plan-effective-start-date">Effective start date</Label>
                    <Input id="plan-effective-start-date" type="date" placeholder="Effective start date" {...form.register("effective_start_date")} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="plan-effective-end-date">Effective end date</Label>
                    <Input id="plan-effective-end-date" type="date" placeholder="Effective end date" {...form.register("effective_end_date")} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={isActive} onCheckedChange={(value) => form.setValue("active", value)} />
                  <Label>Active</Label>
                </div>
                <Button type="submit" className="w-full">
                  Save plan
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <DataTable
          columns={[
            { header: "Plan", render: (row: SubscriptionPlan) => row.name },
            { header: "Meal type", render: (row: SubscriptionPlan) => row.meal_type },
            { header: "Meals", render: (row: SubscriptionPlan) => row.meals_per_cycle },
            { header: "Price", render: (row: SubscriptionPlan) => formatCurrency(row.price) },
            {
              header: "Effective dates",
              render: (row: SubscriptionPlan) =>
                row.effective_start_date || row.effective_end_date
                  ? `${row.effective_start_date ? formatDate(row.effective_start_date) : "Open"} - ${
                      row.effective_end_date ? formatDate(row.effective_end_date) : "Open"
                    }`
                  : "Open-ended",
            },
            {
              header: "Status",
              render: (row: SubscriptionPlan) => (row.active ? "Active" : "Paused"),
            },
            {
              header: "Actions",
              render: (row: SubscriptionPlan) => (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleDelete(row)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={plans}
        />
      </div>
    </div>
  );
}
