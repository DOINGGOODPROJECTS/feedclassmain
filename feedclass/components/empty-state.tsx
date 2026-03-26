import { ReactNode } from "react";
import { Card } from "@/components/ui/card";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center justify-center gap-2 p-10 text-center">
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </Card>
  );
}
