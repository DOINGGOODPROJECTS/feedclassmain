"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import {
  getBackendChildQr,
  getBackendChildren,
  getBackendClasses,
  getBackendSchools,
} from "@/lib/backendApi";
import { Child, ChildQr, ClassRoom, School } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { QrCanvas } from "@/components/qr-canvas";
import { useToast } from "@/components/ui/use-toast";

function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function buildBadgeSheetHtml({
  children,
  classes,
  schools,
  qrByChildId,
}: {
  children: Child[];
  classes: ClassRoom[];
  schools: School[];
  qrByChildId: Record<string, ChildQr>;
}) {
  const badgeMarkup = (
    await Promise.all(
      children.map(async (child) => {
      const school = schools.find((entry) => entry.id === child.school_id);
      const classRoom = classes.find((entry) => entry.id === child.class_id);
      const qr = qrByChildId[child.id];
      const qrDataUrl = qr?.qr_payload
        ? await QRCode.toDataURL(qr.qr_payload, {
            width: 180,
            margin: 1,
          })
        : "";

      return `
        <article class="badge">
          <div class="badge__school">${escapeHtml(school?.name ?? "School")}</div>
          <div class="badge__photo-wrap">
            <div class="badge__photo" style="background-image:url('${escapeHtml(child.profile_image_url ?? "/qr-placeholder.svg")}')"></div>
          </div>
          <div class="badge__meta">
            <h2>${escapeHtml(child.full_name)}</h2>
            <p>${escapeHtml(child.student_id)}</p>
            <p>${escapeHtml(classRoom?.name ?? "Class")}</p>
          </div>
          <div class="badge__qr">
            <div class="badge__qr-box">
              ${
                qrDataUrl
                  ? `<img src="${qrDataUrl}" alt="${escapeHtml(child.full_name)} QR code" />`
                  : `<span>QR not generated</span>`
              }
            </div>
            <p>${escapeHtml(qr?.qr_payload ?? "QR not generated")}</p>
          </div>
        </article>
      `;
      })
    )
  ).join("");

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>FeedClass badges</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 16px; color: #0f172a; background: #f8fafc; }
          h1 { margin: 0 0 8px; }
          p { color: #475569; }
          .sheet {
            display: grid;
            grid-template-columns: repeat(auto-fit, 280px);
            justify-content: center;
            column-gap: 40px;
            row-gap: 28px;
          }
          .badge {
            width: 280px;
            border: 2px solid #cbd5e1;
            border-radius: 22px;
            background: white;
            padding: 14px;
            display: grid;
            gap: 10px;
          }
          .badge__school { font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: #64748b; }
          .badge__photo-wrap { display: flex; justify-content: center; }
          .badge__photo {
            width: 120px;
            height: 150px;
            border-radius: 14px;
            border: 1px solid #cbd5e1;
            background-size: cover;
            background-position: center top;
            background-color: #e2e8f0;
            box-shadow: inset 0 0 0 1px rgba(255,255,255,0.4);
          }
          .badge__meta h2 { margin: 0 0 4px; font-size: 18px; }
          .badge__meta p { margin: 0 0 2px; font-size: 13px; color: #475569; }
          .badge__qr { border-top: 1px solid #e2e8f0; padding-top: 10px; }
          .badge__qr-box {
            border: 1px dashed #cbd5e1;
            border-radius: 14px;
            padding: 12px;
            text-align: center;
            min-height: 160px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fff;
          }
          .badge__qr-box img { width: 130px; height: 130px; display: block; }
          .badge__qr p { margin: 8px 0 0; font-size: 11px; color: #64748b; text-align: center; word-break: break-word; }
          @media print {
            body { margin: 10px; background: white; }
            .badge { break-inside: avoid; }
          }
        </style>
      </head>
      <body>
        <h1>FeedClass QR badges</h1>
        <p>${children.length} badge${children.length === 1 ? "" : "s"} generated on ${new Date().toLocaleString()}</p>
        <section class="sheet">${badgeMarkup || "<p>No children in this class.</p>"}</section>
      </body>
    </html>
  `;
}

export default function AdminBadgesPage() {
  const { push } = useToast();
  const [schools, setSchools] = useState<School[]>([]);
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [children, setChildren] = useState<Child[]>([]);
  const [childQr, setChildQr] = useState<Record<string, ChildQr>>({});
  const [schoolId, setSchoolId] = useState("");
  const [classId, setClassId] = useState("");
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadName, setDownloadName] = useState("class-badges.html");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [schoolData, classData, childData] = await Promise.all([
          getBackendSchools(),
          getBackendClasses(),
          getBackendChildren(),
        ]);

        setSchools(schoolData);
        setClasses(classData);
        setChildren(childData.children);

        const qrEntries = await Promise.all(
          childData.children.map(async (child) => {
            try {
              return await getBackendChildQr(child.id);
            } catch {
              return null;
            }
          })
        );

        setChildQr(
          qrEntries.filter((entry): entry is ChildQr => entry !== null).reduce<Record<string, ChildQr>>((acc, entry) => {
            acc[entry.child_id] = entry;
            return acc;
          }, {})
        );
      } catch (error) {
        push({
          title: "Failed to load badges",
          description: error instanceof Error ? error.message : "Unable to load badge data.",
          variant: "danger",
        });
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [push]);

  const classOptions = useMemo(
    () => classes.filter((cls) => !schoolId || cls.school_id === schoolId),
    [classes, schoolId]
  );

  const badgeChildren = useMemo(
    () => children.filter((child) => (!classId ? true : child.class_id === classId)),
    [children, classId]
  );

  const selectedClass = classes.find((entry) => entry.id === classId) ?? null;
  const selectedSchool = schools.find((entry) => entry.id === (schoolId || selectedClass?.school_id)) ?? null;
  const selectClassName =
    "flex h-10 w-full items-center rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300";

  const handleGenerate = async () => {
    if (!classId) {
      push({ title: "Select a class", description: "Choose a class to generate badges.", variant: "danger" });
      return;
    }

    const html = await buildBadgeSheetHtml({
      children: badgeChildren,
      classes,
      schools,
      qrByChildId: childQr,
    });

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    setDownloadUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return url;
    });
    setDownloadName(
      `${(selectedSchool?.name ?? "school").replace(/\s+/g, "-").toLowerCase()}-${(selectedClass?.name ?? "class")
        .replace(/\s+/g, "-")
        .toLowerCase()}-badges.html`
    );
    push({ title: "Badges generated", description: "Printable badge sheet is ready.", variant: "success" });
  };

  const handleDownload = () => {
    if (!downloadUrl) {
      return;
    }
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = downloadName;
    link.click();
  };

  const handleOpenPrintView = () => {
    if (!downloadUrl) {
      return;
    }
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Badges"
        description="QR preview and badge printing for classes (A4/card layouts)."
      />

      <Card>
        <CardContent className="space-y-4 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <select
              className={selectClassName}
              value={schoolId}
              onChange={(event) => {
                setSchoolId(event.target.value);
                setClassId("");
              }}
            >
              <option value="">Select school</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={classId}
              onChange={(event) => setClassId(event.target.value)}
            >
              <option value="">Select class</option>
              {classOptions.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleGenerate}>Generate badge sheet</Button>
            {downloadUrl && (
              <>
                <Button variant="outline" onClick={handleOpenPrintView}>
                  Open print view
                </Button>
                <Button variant="outline" onClick={handleDownload}>
                  Download badge sheet
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {loading ? null : badgeChildren.length === 0 ? (
        <EmptyState
          title="No badges yet"
          description="Enroll a child first, then select a class to preview or print badges."
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {badgeChildren.map((child) => (
            <Card key={child.id}>
              <CardContent className="space-y-3 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
                  {selectedSchool?.name ?? schools.find((entry) => entry.id === child.school_id)?.name ?? "School"}
                </p>
                <div className="flex justify-center">
                  <div
                    className="h-[180px] w-[170px] rounded-3xl border border-slate-200 bg-slate-50 bg-cover bg-top"
                    style={{ backgroundImage: `url(${child.profile_image_url ?? "/qr-placeholder.svg"})` }}
                  />
                </div>
                <p className="text-sm font-semibold text-slate-800">{child.full_name}</p>
                <p className="text-xs text-slate-500">{child.student_id}</p>
                <p className="text-xs text-slate-500">
                  {classes.find((entry) => entry.id === child.class_id)?.name ?? "-"}
                </p>
                <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white px-3 py-4">
                  {childQr[child.id]?.qr_payload ? (
                    <QrCanvas value={childQr[child.id].qr_payload} size={120} className="h-[120px] w-[120px]" />
                  ) : (
                    <p className="text-xs text-slate-500">QR not generated</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
