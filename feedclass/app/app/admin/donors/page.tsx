"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBackendDonor, deleteBackendDonor, getBackendUsers, updateBackendDonor } from "@/lib/backendApi";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { User } from "@/lib/types";

type DonorRecord = User & {
  email: string;
  active: boolean;
  backend_role: string;
};

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().optional(),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

export default function AdminDonorsPage() {
  const { push } = useToast();
  const [donors, setDonors] = useState<DonorRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<DonorRecord | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      active: true,
    },
  });

  useEffect(() => {
    void getBackendUsers()
      .then((userData) => {
        setDonors(userData.filter((entry) => entry.backend_role === "DONOR_READONLY") as DonorRecord[]);
        setLoading(false);
      })
      .catch((error) => {
        push({ title: "Failed to load donors", description: error.message, variant: "danger" });
        setLoading(false);
      });
  }, [push]);

  const filtered = useMemo(() => {
    return donors.filter((donor) => `${donor.name} ${donor.email}`.toLowerCase().includes(query.toLowerCase()));
  }, [donors, query]);

  const resetForm = () =>
    form.reset({
      name: "",
      email: "",
      password: "",
      active: true,
    });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        const updated = (await updateBackendDonor(editing.id, {
          name: values.name,
          email: values.email,
          password: values.password || undefined,
          active: values.active,
        })) as DonorRecord;
        setDonors((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        push({ title: "Donor updated", description: updated.name, variant: "success" });
      } else {
        if (!values.password || values.password.length < 6) {
          form.setError("password", { message: "Password must be at least 6 characters" });
          return;
        }
        const created = (await createBackendDonor({
          name: values.name,
          email: values.email,
          password: values.password,
        })) as DonorRecord;
        setDonors((prev) => [created, ...prev]);
        push({ title: "Donor created", description: created.name, variant: "success" });
      }

      setOpen(false);
      setEditing(null);
      resetForm();
    } catch (error) {
      push({
        title: editing ? "Donor update failed" : "Donor creation failed",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "danger",
      });
    }
  });

  const startEdit = (donor: DonorRecord) => {
    setEditing(donor);
    form.reset({
      name: donor.name,
      email: donor.email,
      password: "",
      active: donor.active,
    });
    setOpen(true);
  };

  const handleDelete = async (donor: DonorRecord) => {
    const confirmed = window.confirm(`Delete donor ${donor.email}?`);
    if (!confirmed) return;

    try {
      await deleteBackendDonor(donor.id);
      setDonors((prev) => prev.filter((entry) => entry.id !== donor.id));
      push({ title: "Donor deleted", description: donor.email, variant: "success" });
    } catch (error) {
      push({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete donor.",
        variant: "danger",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Donors"
        description="Create donor accounts and manage read-only access to aggregate dashboards."
        actions={
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (!value) {
                setEditing(null);
                resetForm();
              }
              setOpen(value);
            }}
          >
            <DialogTrigger asChild>
              <Button>Add donor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit donor" : "Add donor"}</DialogTitle>
                <DialogDescription>Create or update a donor account with email and password.</DialogDescription>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <Input placeholder="Full name" {...form.register("name")} />
                  {form.formState.errors.name ? (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
                  ) : null}
                </div>
                <div>
                  <Input placeholder="Email address" {...form.register("email")} />
                  {form.formState.errors.email ? (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.email.message}</p>
                  ) : null}
                </div>
                <div>
                  <Input
                    type="password"
                    placeholder={editing ? "New password (optional)" : "Password"}
                    {...form.register("password")}
                  />
                  {form.formState.errors.password ? (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.password.message}</p>
                  ) : null}
                </div>
                {editing ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" {...form.register("active")} />
                    Access active
                  </label>
                ) : null}
                <Button type="submit" className="w-full">
                  {editing ? "Save changes" : "Create donor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input className="max-w-sm" placeholder="Search donors" value={query} onChange={(event) => setQuery(event.target.value)} />
        <div className="text-xs text-slate-500">{filtered.length} donors</div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No donors yet" description="Create the first donor account to share aggregate reporting." />
      ) : (
        <DataTable
          columns={[
            { header: "Name", render: (row: DonorRecord) => row.name },
            { header: "Email", render: (row: DonorRecord) => row.email },
            { header: "Access", render: (row: DonorRecord) => (row.active ? "Enabled" : "Disabled") },
            {
              header: "Actions",
              render: (row: DonorRecord) => (
                <div className="flex justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(row)}>
                    Delete
                  </Button>
                </div>
              ),
            },
          ]}
          data={filtered}
        />
      )}
    </div>
  );
}
