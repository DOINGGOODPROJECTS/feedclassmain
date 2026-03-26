"use client";

import { useEffect, useMemo, useState } from "react";
import {
  getBackendChildQr,
  getBackendChildSubscription,
  getBackendChildren,
  getBackendClasses,
  getBackendPaymentIntents,
  getBackendSchools,
  sendBackendPaymentLink,
} from "@/lib/backendApi";
import { PaymentIntent, School, SupervisorChildLookupItem } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { QrCanvas } from "@/components/qr-canvas";
import { Input } from "@/components/ui/input";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";

export function ChildLookupPanel() {
  const { push } = useToast();
  const schoolId = useAppStore((state) => state.supervisorSchoolId);
  const [school, setSchool] = useState<School | null>(null);
  const [lookupItems, setLookupItems] = useState<SupervisorChildLookupItem[]>([]);
  const [paymentIntents, setPaymentIntents] = useState<PaymentIntent[]>([]);
  const [classOptions, setClassOptions] = useState<Array<{ id: string; label: string }>>([{ id: "ALL", label: "All classes" }]);
  const [selectedClassId, setSelectedClassId] = useState<string>("ALL");
  const [query, setQuery] = useState("");
  const [selectedChildId, setSelectedChildId] = useState<string>("");

  useEffect(() => {
    void getBackendSchools().then(async (schoolData) => {
      const effectiveSchool =
        schoolData.find((entry) => entry.id === schoolId) ??
        (schoolData.length === 1 ? schoolData[0] : null);
      const effectiveSchoolId = effectiveSchool?.id;

      const [classData, intentData, childData] = await Promise.all([
        getBackendClasses(effectiveSchoolId),
        getBackendPaymentIntents(effectiveSchoolId),
        getBackendChildren(effectiveSchoolId),
      ]);

      setSchool(effectiveSchool);
      setClassOptions([{ id: "ALL", label: "All classes" }].concat(classData.map((item) => ({ id: item.id, label: item.name }))));
      setPaymentIntents(intentData);

      const lookupData = await Promise.all(
        childData.children.map(async (child) => {
          const guardian = childData.guardians.find((entry) => entry.id === child.guardian_id);
          const classMeta = childData.classMetaByChildId?.[child.id];
          const classEntry = classData.find((entry) => entry.id === child.class_id);
          const qr = await getBackendChildQr(child.id).catch(() => null);
          const subscription = await getBackendChildSubscription(child.id).catch(() => null);
          return {
            child,
            class_name: classMeta?.class_name || classEntry?.name || "-",
            grade: classMeta?.class_grade || classEntry?.grade || "",
            guardian,
            subscription,
            qr,
          } satisfies SupervisorChildLookupItem;
        })
      );

      setLookupItems(lookupData);
      setSelectedChildId((current) => current || lookupData[0]?.child.id || "");
    });
  }, [schoolId]);

  const filteredLookupItems = useMemo(
    () =>
      lookupItems.filter((item) => {
        const matchesClass = selectedClassId === "ALL" || item.child.class_id === selectedClassId;
        const haystack = [
          item.child.full_name,
          item.child.student_id,
          item.guardian?.name ?? "",
          item.guardian?.phone ?? "",
        ]
          .join(" ")
          .toLowerCase();
        return matchesClass && haystack.includes(query.toLowerCase());
      }),
    [lookupItems, query, selectedClassId]
  );

  const latestIntentByChildId = useMemo(() => {
    const map = new Map<string, PaymentIntent>();
    paymentIntents.forEach((intent) => {
      map.set(intent.child_id, intent);
    });
    return map;
  }, [paymentIntents]);

  const selectedLookupItem =
    filteredLookupItems.find((item) => item.child.id === selectedChildId) ?? filteredLookupItems[0] ?? null;
  const selectedPaymentIntent = selectedLookupItem ? latestIntentByChildId.get(selectedLookupItem.child.id) ?? null : null;

  const handleSendPaymentLink = async (childId: string, childName: string) => {
    const intent = latestIntentByChildId.get(childId);
    if (!intent) {
      push({
        title: "Payment link failed",
        description: `No payment intent exists yet for ${childName}.`,
        variant: "danger",
      });
      return;
    }

    void sendBackendPaymentLink(intent.id)
      .then((result) => {
        setPaymentIntents((prev) => {
          const remaining = prev.filter((entry) => entry.id !== result.intent.id);
          return [...remaining, result.intent];
        });
        push({
          title: "Payment link sent",
          description: `${childName} guardian notified via ${result.channel}.`,
          variant: "success",
        });
      })
      .catch((error) => {
        push({
          title: "Payment link failed",
          description: error instanceof Error ? error.message : `Could not send a payment link for ${childName}.`,
          variant: "danger",
        });
      });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle>All children</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-500">
            Review children in your school, open the child profile, and send payment links to parents when a
            subscription needs renewal.
          </p>
          <div className="grid gap-3 md:grid-cols-[220px,1fr]">
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              {classOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by child, ID, guardian, or phone"
            />
          </div>
          {filteredLookupItems.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
              No children found for this class filter and search.
            </p>
          ) : (
            <DataTable
              columns={[
                { header: "Student ID", render: (row: SupervisorChildLookupItem) => row.child.student_id },
                { header: "Name", render: (row: SupervisorChildLookupItem) => row.child.full_name },
                { header: "Class", render: (row: SupervisorChildLookupItem) => row.class_name },
                { header: "Guardian phone", render: (row: SupervisorChildLookupItem) => row.guardian?.phone ?? "-" },
                { header: "Guardian name", render: (row: SupervisorChildLookupItem) => row.guardian?.name ?? "-" },
                { header: "Status", render: (row: SupervisorChildLookupItem) => (row.child.active ? "Active" : "Inactive") },
                { header: "Subscription", render: (row: SupervisorChildLookupItem) => row.subscription?.status ?? "NONE" },
                {
                  header: "Meals remaining",
                  render: (row: SupervisorChildLookupItem) => row.subscription?.meals_remaining ?? 0,
                },
                {
                  header: "Actions",
                  render: (row: SupervisorChildLookupItem) => (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedChildId(row.child.id)}>
                        View child
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleSendPaymentLink(row.child.id, row.child.full_name)}
                      >
                        Send payment link
                      </Button>
                    </div>
                  ),
                },
              ]}
              data={filteredLookupItems}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Selected child profile</CardTitle>
        </CardHeader>
        <CardContent>
          {!selectedLookupItem ? (
            <p className="text-sm text-slate-500">Select a child to view the profile, image, QR badge, and details.</p>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start gap-6">
                <div
                  role="img"
                  aria-label={selectedLookupItem.child.full_name}
                  className="h-56 w-56 shrink-0 rounded-3xl bg-cover bg-center ring-1 ring-slate-200"
                  style={{ backgroundImage: `url(${selectedLookupItem.child.profile_image_url ?? "/qr-placeholder.svg"})` }}
                />
                <div className="space-y-3 pt-1">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">{selectedLookupItem.child.full_name}</p>
                    <p className="text-sm text-slate-500">
                      {selectedLookupItem.grade} · {selectedLookupItem.class_name}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={selectedLookupItem.child.active ? "success" : "danger"}>
                      {selectedLookupItem.child.active ? "Active" : "Inactive"}
                    </Badge>
                    <Badge variant="secondary">{selectedLookupItem.child.student_id}</Badge>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">QR badge</p>
                  <div className="mt-3 flex items-center gap-4">
                    <div
                      role="img"
                      aria-label={`${selectedLookupItem.child.full_name} QR badge`}
                      className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2"
                    >
                      {selectedLookupItem.qr?.qr_payload ? (
                        <QrCanvas value={selectedLookupItem.qr.qr_payload} size={64} className="h-16 w-16" />
                      ) : null}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {selectedLookupItem.qr?.qr_payload ?? "QR not generated"}
                      </p>
                      <p className="text-xs text-slate-500">Use this badge value as the scan fallback reference.</p>
                    </div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Guardian</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedLookupItem.guardian?.name ?? "No guardian"}
                    </p>
                    <p className="text-sm text-slate-500">{selectedLookupItem.guardian?.phone ?? "No phone"}</p>
                  </div>
                  <div className="rounded-2xl border border-slate-200 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Subscription</p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {selectedLookupItem.subscription?.status ?? "NONE"}
                    </p>
                    <p className="text-sm text-slate-500">
                      Meals remaining: {selectedLookupItem.subscription?.meals_remaining ?? 0}
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Enrollment</p>
                  <div className="mt-2 grid gap-2 text-sm text-slate-600">
                    <p>School: {school?.name ?? "Unknown school"}</p>
                    <p>Class: {selectedLookupItem.class_name}</p>
                    <p>Grade: {selectedLookupItem.grade}</p>
                    <p>Student ID: {selectedLookupItem.child.student_id}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Payments</p>
                      <p className="mt-2 text-sm font-semibold text-slate-900">
                        {selectedPaymentIntent?.reference ?? "No payment intent yet"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {selectedPaymentIntent
                          ? `${formatCurrency(selectedPaymentIntent.amount)} · ${selectedPaymentIntent.status}`
                          : "Send a payment link to create a payable request for the parent."}
                      </p>
                      {selectedPaymentIntent && (
                        <p className="mt-2 break-all text-xs text-slate-500">{selectedPaymentIntent.payment_url}</p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() =>
                        handleSendPaymentLink(selectedLookupItem.child.id, selectedLookupItem.child.full_name)
                      }
                    >
                      Send link
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
