"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { createBackendSchool, getBackendSchools, updateBackendSchool } from "@/lib/backendApi";
import { School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  location: z.string().min(2, "Location is required"),
});

type FormValues = z.infer<typeof schema>;

export default function AdminSchoolsPage() {
  const { push } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<School | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", location: "" },
  });

  useEffect(() => {
    getBackendSchools()
      .then((data) => {
        setSchools(data);
        setLoading(false);
      })
      .catch((error) => {
        push({ title: "Failed to load schools", description: error.message, variant: "danger" });
        setLoading(false);
      });
  }, [push]);

  const filtered = useMemo(() => {
    return schools.filter((school) =>
      `${school.name} ${school.location}`.toLowerCase().includes(query.toLowerCase())
    );
  }, [schools, query]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (editing) {
      const updated = await updateBackendSchool(editing.id, values);
      if (updated) {
        setSchools((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        push({ title: "School updated", description: updated.name, variant: "success" });
      }
    } else {
      const created = await createBackendSchool(values);
      setSchools((prev) => [...prev, created]);
      push({ title: "School created", description: created.name, variant: "success" });
    }
    setOpen(false);
    setEditing(null);
    form.reset();
  });

  const startEdit = (school: School) => {
    setEditing(school);
    form.reset({ name: school.name, location: school.location });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Schools"
        description="Registry of participating schools, locations, and contacts."
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
              <Button>Add school</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit school" : "Add school"}</DialogTitle>
                <DialogDescription>Keep location and name up to date.</DialogDescription>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <Input placeholder="School name" {...form.register("name")} />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Input placeholder="Location" {...form.register("location")} />
                  {form.formState.errors.location && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.location.message}
                    </p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  {editing ? "Save changes" : "Create school"}
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
            placeholder="Search schools"
            className="max-w-sm"
          />
          <span className="text-sm text-slate-500">{filtered.length} schools</span>
        </div>
        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No schools yet"
            description="Add your first school to begin onboarding."
            action={
              <Button onClick={() => setOpen(true)} variant="outline">
                Add school
              </Button>
            }
          />
        ) : (
          <DataTable
            columns={[
              { header: "School", render: (row: School) => row.name },
              { header: "Location", render: (row: School) => row.location },
              {
                header: "Actions",
                render: (row: School) => (
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                      Edit
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/app/admin/schools/${row.id}`}>View</Link>
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
