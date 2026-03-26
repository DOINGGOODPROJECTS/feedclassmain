"use client";

import { create } from "zustand";
import { Role } from "./types";

function getStoredRole(): Role {
  if (typeof window === "undefined") return "ADMIN";

  const localRole = window.localStorage.getItem("fc_role");
  if (localRole === "ADMIN" || localRole === "SCHOOL_ADMIN" || localRole === "DONOR_READONLY") {
    return localRole;
  }

  const cookieRole = document.cookie.match(/(?:^|; )fc_role=([^;]*)/)?.[1];
  if (cookieRole === "ADMIN" || cookieRole === "SCHOOL_ADMIN" || cookieRole === "DONOR_READONLY") {
    return cookieRole;
  }

  return "ADMIN";
}

interface AppState {
  role: Role;
  activeSchoolId: string;
  supervisorSchoolId: string;
  setRole: (role: Role) => void;
  setActiveSchoolId: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  role: getStoredRole(),
  activeSchoolId: "s1",
  supervisorSchoolId: "s1",
  setRole: (role) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("fc_role", role);
      document.cookie = `fc_role=${role}; path=/; max-age=31536000`;
    }
    set({ role });
  },
  setActiveSchoolId: (id) => set({ activeSchoolId: id }),
}));
