"use client";

import { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription, ToastClose } from "./toast";
import { useToast } from "./use-toast";

function ToastRenderer() {
  const { toasts, remove } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          variant={toast.variant}
          duration={4000}
          onOpenChange={(open) => {
            if (!open) remove(toast.id);
          }}
        >
          <div className="grid gap-1">
            {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
            {toast.description && <ToastDescription>{toast.description}</ToastDescription>}
          </div>
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}

export function Toaster() {
  return <ToastRenderer />;
}
