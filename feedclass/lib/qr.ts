import { Child } from "./types";

function mixHash(seed: number, value: string) {
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function buildOpaqueHex(source: string, rounds: number) {
  let state = 2166136261;
  const chunks: string[] = [];

  for (let index = 0; index < rounds; index += 1) {
    state = mixHash(state ^ Math.imul(index + 1, 374761393), `${source}|${index}`);
    chunks.push(state.toString(16).toUpperCase().padStart(8, "0"));
  }

  return chunks.join("");
}

export function buildChildQrPayload(
  child: Pick<
    Child,
    "id" | "school_id" | "class_id" | "student_id" | "full_name" | "profile_image_url" | "active"
  >
) {
  const source = [
    child.id,
    child.school_id,
    child.class_id,
    child.student_id,
    child.full_name,
    child.profile_image_url ?? "",
    String(child.active),
  ].join("|");
  const opaqueHex = buildOpaqueHex(source, 8);
  return `SMMS-${opaqueHex.slice(0, 16)}-${opaqueHex.slice(16, 32)}-${opaqueHex.slice(32, 48)}-${opaqueHex.slice(48, 64)}`;
}

export function buildVerificationLink(payload: string) {
  return `https://verify.feedclass.app/qr/${encodeURIComponent(payload)}`;
}
