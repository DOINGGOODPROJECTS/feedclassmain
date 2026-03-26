"use client";

import * as React from "react";

export type ToastVariant = "default" | "success" | "danger";

export interface ToastMessage {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
}

interface ToastContextType {
  toasts: ToastMessage[];
  push: (toast: Omit<ToastMessage, "id">) => void;
  remove: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export function ToastProviderClient({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastMessage[]>([]);

  const push = React.useCallback((toast: Omit<ToastMessage, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
  }, []);

  const remove = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, push, remove }}>{children}</ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProviderClient");
  }
  return context;
}
