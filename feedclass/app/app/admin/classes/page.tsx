"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  createBackendClass,
  getBackendClasses,
  getBackendSchools,
  updateBackendClass,
} from "@/lib/backendApi";
import { ClassRoom, School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

const schema = z.object({
  name: z.string().min(2, "Name is required"),
  grade: z.string().min(1, "Grade is required"),
  school_id: z.string().min(1, "School is required"),
});

type FormValues = z.infer<typeof schema>;

export default function AdminClassesPage() {
  const { push } = useToast();
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [schools, setSchools] = useState<School[]>([]);
  const [filterSchool, setFilterSchool] = useState("all");
  const [editing, setEditing] = useState<ClassRoom | null>(null);
  const [open, setOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", grade: "", school_id: "" },
  });
  const selectedSchoolId = useWatch({ control: form.control, name: "school_id" });

  const selectClassName =
    "flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300";

  useEffect(() => {
    Promise.all([getBackendClasses(), getBackendSchools()])
      .then(([classData, schoolData]) => {
        setClasses(classData);
        setSchools(schoolData);
      })
      .catch((error) => {
        push({ title: "Failed to load classes", description: error.message, variant: "danger" });
      });
  }, [push]);

  const filtered = useMemo(() => {
    if (filterSchool === "all") return classes;
    return classes.filter((entry) => entry.school_id === filterSchool);
  }, [classes, filterSchool]);

  const handleSubmit = form.handleSubmit(async (values) => {
    if (editing) {
      const updated = await updateBackendClass(editing.id, values);
      if (updated) {
        setClasses((prev) => prev.map((entry) => (entry.id === updated.id ? updated : entry)));
        push({ title: "Class updated", description: updated.name, variant: "success" });
      }
    } else {
      const created = await createBackendClass(values);
      setClasses((prev) => [...prev, created]);
      push({ title: "Class created", description: created.name, variant: "success" });
    }
    setOpen(false);
    setEditing(null);
    form.reset();
  });

  const startEdit = (entry: ClassRoom) => {
    setEditing(entry);
    form.reset({ name: entry.name, grade: entry.grade, school_id: entry.school_id });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Classes"
        description="Organize homerooms by grade and link them to schools."
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
              <Button>Add class</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit class" : "Create class"}</DialogTitle>
                <DialogDescription>Assign the class to a school and grade.</DialogDescription>
              </DialogHeader>
              <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
                <div>
                  <select
                    className={selectClassName}
                    value={selectedSchoolId}
                    onChange={(event) => form.setValue("school_id", event.target.value, { shouldValidate: true })}
                  >
                    <option value="">Select school</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.school_id && (
                    <p className="mt-1 text-xs text-red-600">
                      {form.formState.errors.school_id.message}
                    </p>
                  )}
                </div>
                <div>
                  <Input placeholder="Class name" {...form.register("name")} />
                  {form.formState.errors.name && (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.name.message}</p>
                  )}
                </div>
                <div>
                  <Input placeholder="Grade" {...form.register("grade")} />
                  {form.formState.errors.grade && (
                    <p className="mt-1 text-xs text-red-600">{form.formState.errors.grade.message}</p>
                  )}
                </div>
                <Button type="submit" className="w-full">
                  {editing ? "Save changes" : "Create class"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-3xl border border-slate-200 bg-white p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={`${selectClassName} w-[220px]`}
            value={filterSchool}
            onChange={(event) => setFilterSchool(event.target.value)}
          >
            <option value="all">All schools</option>
            {schools.map((school) => (
              <option key={school.id} value={school.id}>
                {school.name}
              </option>
            ))}
          </select>
          <span className="text-sm text-slate-500">{filtered.length} classes</span>
        </div>
        <DataTable
          columns={[
            { header: "Class", render: (row: ClassRoom) => row.name },
            { header: "Grade", render: (row: ClassRoom) => row.grade },
            {
              header: "School",
              render: (row: ClassRoom) => schools.find((school) => school.id === row.school_id)?.name ?? "-",
            },
            {
              header: "Actions",
              render: (row: ClassRoom) => (
                <Button variant="outline" size="sm" onClick={() => startEdit(row)}>
                  Edit
                </Button>
              ),
            },
          ]}
          data={filtered}
        />
      </div>
    </div>
  );
}
