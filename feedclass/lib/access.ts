import { Role } from "./types";

export function hasRouteAccess(role: Role, pathname: string) {
  if (pathname.startsWith("/app/admin")) {
    return role === "ADMIN";
  }
  if (pathname.startsWith("/app/supervisor")) {
    return role === "SCHOOL_ADMIN";
  }
  if (pathname.startsWith("/app/donor")) {
    return role === "DONOR_READONLY";
  }
  return true;
}
