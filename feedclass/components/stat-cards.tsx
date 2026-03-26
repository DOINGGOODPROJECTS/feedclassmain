import { ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface StatCard {
  label: string;
  value: string;
  helper?: string;
  trend?: ReactNode;
}

export function StatCards({ items }: { items: StatCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label}>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-slate-500">{item.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-semibold text-slate-900">{item.value}</p>
                {item.helper && <p className="text-xs text-slate-500">{item.helper}</p>}
              </div>
              {item.trend}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
