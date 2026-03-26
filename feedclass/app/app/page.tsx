"use client";

import { useEffect } from "react";

function getCookieValue(name: string) {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export default function AppRootRedirect() {
  useEffect(() => {
    const role = getCookieValue("fc_role");

    if (role === "SCHOOL_ADMIN") {
      window.location.replace("/app/supervisor/home");
      return;
    }

    if (role === "DONOR_READONLY") {
      window.location.replace("/app/donor/dashboard");
      return;
    }

    window.location.replace("/app/admin/dashboard");
  }, []);

  return <div className="p-6 text-sm text-slate-500">Loading dashboard...</div>;
}
