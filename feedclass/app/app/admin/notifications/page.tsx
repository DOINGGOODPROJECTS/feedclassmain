"use client";

import { useEffect, useState } from "react";
import { getMessageHealth, getMessageLogs, resendFailedMessages } from "@/lib/mockApi";
import { getBackendMessagingSettings, updateBackendMessagingSettings } from "@/lib/backendApi";
import { MessageLog } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { StatCards } from "@/components/stat-cards";
import { DataTable } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { formatDateTime } from "@/lib/utils";

type ReminderSchedule = "DAILY" | "WEEKLY" | "MONTHLY";

export default function AdminNotificationsPage() {
  const { push } = useToast();
  const [health, setHealth] = useState<{ pending: number; sent: number; failed: number } | null>(null);
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [schedule, setSchedule] = useState<ReminderSchedule>("DAILY");
  const [savedSchedule, setSavedSchedule] = useState<ReminderSchedule>("DAILY");
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    getMessageHealth().then(setHealth);
    getMessageLogs().then(setLogs);
    getBackendMessagingSettings()
      .then((settings) => {
        setSchedule(settings.schedule);
        setSavedSchedule(settings.schedule);
        setLastRunAt(settings.lastRunAt);
      })
      .catch((error) => {
        push({
          title: "Could not load SMS schedule",
          description: error instanceof Error ? error.message : "Unable to load SMS schedule.",
          variant: "danger",
        });
      });
  }, [push]);

  const handleResend = async () => {
    await resendFailedMessages();
    const updated = await getMessageLogs();
    setLogs(updated);
    push({ title: "Resent failed messages", description: "Mock resend complete", variant: "success" });
  };

  const handleSaveSchedule = async () => {
    try {
      setSavingSchedule(true);
      const updated = await updateBackendMessagingSettings(schedule);
      setSavedSchedule(updated.schedule);
      setLastRunAt(updated.lastRunAt);
      push({
        title: "SMS schedule updated",
        description: `Payment reminders will now follow the ${updated.schedule.toLowerCase()} schedule.`,
        variant: "success",
      });
    } catch (error) {
      push({
        title: "Could not update SMS schedule",
        description: error instanceof Error ? error.message : "Unable to update SMS schedule.",
        variant: "danger",
      });
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Program Admin · Notifications"
        description="Message health, delivery logs, and resend controls (mocked)."
        actions={
          <Button variant="outline" onClick={handleResend}>
            Resend failed
          </Button>
        }
      />

      {health && (
        <StatCards
          items={[
            { label: "Pending", value: health.pending.toString(), helper: "Queued" },
            { label: "Sent", value: health.sent.toString(), helper: "Delivered" },
            { label: "Failed", value: health.failed.toString(), helper: "Needs retry" },
          ]}
        />
      )}

      <div className="rounded-3xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-900">SMS schedule</h2>
            <p className="text-sm text-slate-500">
              Choose how often payment reminder SMS messages should be sent.
            </p>
            <p className="text-xs text-slate-400">
              Current schedule: {savedSchedule.toLowerCase()}
              {lastRunAt ? ` • Last run: ${formatDateTime(lastRunAt)}` : " • No reminder cycle has run yet"}
            </p>
          </div>
          <Button onClick={handleSaveSchedule} disabled={savingSchedule || schedule === savedSchedule}>
            {savingSchedule ? "Saving..." : "Save SMS schedule"}
          </Button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {(["DAILY", "WEEKLY", "MONTHLY"] as ReminderSchedule[]).map((option) => {
            const selected = schedule === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${
                  selected ? "border-slate-900 bg-slate-50" : "border-slate-200 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name="sms-schedule"
                  className="mt-1"
                  checked={selected}
                  onChange={() => setSchedule(option)}
                />
                <div>
                  <div className="text-sm font-semibold text-slate-900">{option.charAt(0) + option.slice(1).toLowerCase()}</div>
                  <div className="text-sm text-slate-500">
                    {option === "DAILY" && "Send payment reminder SMS every day."}
                    {option === "WEEKLY" && "Send payment reminder SMS once every 7 days."}
                    {option === "MONTHLY" && "Send payment reminder SMS once every 30 days."}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4">
        <DataTable
          columns={[
            { header: "Status", render: (row: MessageLog) => row.status },
            { header: "Source", render: (row: MessageLog) => row.source ?? "SMS notification" },
            { header: "Child", render: (row: MessageLog) => row.child_name ?? "Not attached" },
            { header: "Guardian", render: (row: MessageLog) => row.guardian_name ?? "Unknown guardian" },
            { header: "Phone", render: (row: MessageLog) => row.guardian_phone ?? "Unknown phone" },
            { header: "Detail", render: (row: MessageLog) => row.detail },
            {
              header: "Failure reason",
              render: (row: MessageLog) => (row.status === "FAILED" ? row.failure_reason ?? "Unknown failure" : "Delivered"),
            },
            { header: "Time", render: (row: MessageLog) => formatDateTime(row.created_at) },
          ]}
          data={logs}
        />
      </div>
    </div>
  );
}
