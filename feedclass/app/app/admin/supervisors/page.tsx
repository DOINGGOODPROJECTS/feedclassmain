"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBackendSupervisor,
  deleteBackendSupervisor,
  getBackendSchools,
  getBackendUsers,
  updateBackendSupervisor,
} from "@/lib/backendApi";
import { School, User } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

type SupervisorRecord = User & {
  email: string;
  active: boolean;
  backend_role: string;
};

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email is required"),
  password: z.string().optional(),
  school_id: z.string().min(1, "School is required"),
  active: z.boolean().default(true),
});

type FormValues = z.infer<typeof schema>;

export default function AdminSupervisorsPage() {
  const { push } = useToast();
  const [supervisors, setSupervisors] = useState<SupervisorRecord[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SupervisorRecord | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      school_id: "",
      active: true,
    },
  });

  const fetchSchools = async () => getBackendSchools();

  const loadSchools = async () => {
    const schoolData = await fetchSchools();
    setSchools(schoolData);
    return schoolData;
  };

  useEffect(() => {
    void Promise.all([getBackendUsers(), fetchSchools()])
      .then(([userData, schoolData]) => {
        setSupervisors(
          userData.filter((entry) => entry.backend_role === "SUPERVISOR") as SupervisorRecord[]
        );
        setSchools(schoolData);
        setLoading(false);
      })
      .catch((error) => {
        push({ title: "Failed to load supervisors", description: error.message, variant: "danger" });
        setLoading(false);
      });
  }, [push]);

  const filtered = useMemo(() => {
    return supervisors.filter((supervisor) => {
      const school = schools.find((entry) => entry.id === supervisor.assigned_school_id);
      return `${supervisor.name} ${supervisor.email} ${school?.name || ""}`
        .toLowerCase()
        .includes(query.toLowerCase());
    });
  }, [supervisors, schools, query]);

  const resetForm = () =>
    form.reset({
      name: "",
      email: "",
      password: "",
      school_id: schools[0]?.id || "",
      active: true,
    });

  const handleSubmit = form.handleSubmit(async (values) => {
    try {
      if (editing) {
        const updated = (await updateBackendSupervisor(editing.id, {
          name: values.name,
          email: values.email,
          password: values.password || undefined,
          school_id: values.school_id,
          active: values.active,
        })) as SupervisorRecord;
        setSupervisors((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        push({ title: "Supervisor updated", description: updated.name, variant: "success" });
      } else {
        if (!values.password || values.password.length < 6) {
          form.setError("password", { message: "Password must be at least 6 characters" });
          return;
        }
        const created = (await createBackendSupervisor({
          name: values.name,
          email: values.email,
          password: values.password,
          school_id: values.school_id,
        })) as SupervisorRecord;
        setSupervisors((prev) => [created, ...prev]);
        push({ title: "Supervisor created", description: created.name, variant: "success" });
      }
      setOpen(false);
      setEditing(null);
      resetForm();
    } catch (error) {
      push({
        title: editing ? "Supervisor update failed" : "Supervisor creation failed",
        description: error instanceof Error ? error.message : "Request failed.",
        variant: "danger",
      });
    }
  });

  const startEdit = (supervisor: SupervisorRecord) => {
    setEditing(supervisor);
    form.reset({
      name: supervisor.name,
      email: supervisor.email,
      password: "",
      school_id: supervisor.assigned_school_id || "",
      active: supervisor.active,
    });
    setOpen(true);
  };

  const handleDelete = async (supervisor: SupervisorRecord) => {
    const confirmed = window.confirm(`Delete ${supervisor.name}?`);
    if (!confirmed) {
      return;
    }

    try {
      await deleteBackendSupervisor(supervisor.id);
      setSupervisors((prev) => prev.filter((entry) => entry.id !== supervisor.id));
      push({ title: "Supervisor deleted", description: supervisor.name, variant: "success" });
    } catch (error) {
      push({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Unable to delete supervisor.",
        variant: "danger",
      });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Supervisors"
        description="Assign new school admin/supervisor accounts to a school and manage their access."
        actions={
          <Dialog
            open={open}
            onOpenChange={(value) => {
              if (value) {
                void loadSchools().catch((error) => {
                  push({
                    title: "Failed to load schools",
                    description: error instanceof Error ? error.message : "Unable to load schools.",
                    variant: "danger",
                  });
                });
              } else {
                setEditing(null);
                resetForm();
              }
              setOpen(value);
            }}
          >
              <DialogTrigger asChild>
              <Button>Add school admin / supervisor</Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit school admin / supervisor" : "Add school admin / supervisor"}</DialogTitle>
                <DialogDescription>
                  Create or update a school admin account with email, password, and school assignment.
                </DialogDescription>
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
                <div>
                  <select
                    className="flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    {...form.register("school_id")}
                  >
                    <option value="">Select school</option>
                    {schools.length === 0 ? (
                      <option value="" disabled>
                        No schools available
                      </option>
                    ) : null}
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.school_id ? (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.school_id.message}</p>
                  ) : null}
                </div>
                {editing ? (
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" {...form.register("active")} />
                    Access active
                  </label>
                ) : null}
                <Button type="submit" className="w-full">
                  {editing ? "Save changes" : "Create supervisor"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search supervisors"
            className="max-w-sm"
          />
          <span className="text-sm text-slate-500">{filtered.length} supervisors</span>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No supervisors yet"
            description="Add the first school admin account to begin school-level access."
            action={
              <Button onClick={() => setOpen(true)} variant="outline">
                Add school admin / supervisor
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={[
              { header: "Name", render: (row: SupervisorRecord) => row.name },
              { header: "Email", render: (row: SupervisorRecord) => row.email },
              {
                header: "School",
                render: (row: SupervisorRecord) =>
                  schools.find((entry) => entry.id === row.assigned_school_id)?.name || "Unassigned",
              },
              {
                header: "Access",
                render: (row: SupervisorRecord) => (row.active ? "Enabled" : "Disabled"),
              },
              {
                header: "Actions",
                render: (row: SupervisorRecord) => (
                  <div className="flex items-center gap-2">
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
    </div>
  );
}
