"use client";

import { ToastProviderClient } from "@/components/ui/use-toast";

export function Providers({ children }: { children: React.ReactNode }) {
  return <ToastProviderClient>{children}</ToastProviderClient>;
}
