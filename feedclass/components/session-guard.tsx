"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  clearAuthTokens,
  getAccessToken,
  getAccessTokenExpiryMs,
  getAccessTokenRole,
  getLastActivityAt,
  touchSessionActivity,
} from "@/lib/backendApi";
import { useAppStore } from "@/lib/store";

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;

export function SessionGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const setRole = useAppStore((state) => state.setRole);
  const hasLoggedOutRef = useRef(false);
  const expiryTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const logout = () => {
      if (hasLoggedOutRef.current) {
        return;
      }

      hasLoggedOutRef.current = true;
      if (expiryTimeoutRef.current !== null) {
        window.clearTimeout(expiryTimeoutRef.current);
      }
      clearAuthTokens();
      window.localStorage.removeItem("fc_role");
      document.cookie = "fc_role=; path=/; max-age=0";
      router.replace("/login");
    };

    const recordActivity = () => {
      if (!getAccessToken()) {
        return;
      }
      touchSessionActivity();
    };

    const syncRoleFromToken = () => {
      const role = getAccessTokenRole();
      if (role) {
        setRole(role);
      }
    };

    const syncExpiryTimeout = () => {
      if (expiryTimeoutRef.current !== null) {
        window.clearTimeout(expiryTimeoutRef.current);
        expiryTimeoutRef.current = null;
      }

      const expiryMs = getAccessTokenExpiryMs();
      if (!expiryMs) {
        return;
      }

      const remainingMs = expiryMs - Date.now();
      if (remainingMs <= 0) {
        logout();
        return;
      }

      expiryTimeoutRef.current = window.setTimeout(() => {
        logout();
      }, remainingMs);
    };

    const checkSession = () => {
      const token = getAccessToken();
      if (!token) {
        logout();
        return;
      }

      const expiryMs = getAccessTokenExpiryMs();
      if (expiryMs && Date.now() >= expiryMs) {
        logout();
        return;
      }

      const lastActivityAt = getLastActivityAt();
      if (lastActivityAt && Date.now() - lastActivityAt >= INACTIVITY_LIMIT_MS) {
        logout();
      }
    };

    const events: Array<keyof WindowEventMap> = ["click", "keydown", "mousemove", "scroll", "touchstart"];

    recordActivity();
    syncRoleFromToken();
    syncExpiryTimeout();
    checkSession();
    events.forEach((eventName) => window.addEventListener(eventName, recordActivity, { passive: true }));
    document.addEventListener("visibilitychange", checkSession);
    const intervalId = window.setInterval(checkSession, CHECK_INTERVAL_MS);
    window.addEventListener("storage", checkSession);

    return () => {
      window.clearInterval(intervalId);
      if (expiryTimeoutRef.current !== null) {
        window.clearTimeout(expiryTimeoutRef.current);
      }
      events.forEach((eventName) => window.removeEventListener(eventName, recordActivity));
      document.removeEventListener("visibilitychange", checkSession);
      window.removeEventListener("storage", checkSession);
    };
  }, [router, setRole]);

  return <>{children}</>;
}
