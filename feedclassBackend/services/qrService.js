const crypto = require("crypto");
const { getState, getUserRole } = require("../lib/state");

const QR_STORAGE_BASE_URL = process.env.QR_STORAGE_BASE_URL || "/qr-assets";

function buildQrPayload(child) {
  const secret = process.env.QR_PAYLOAD_SECRET || process.env.JWT_SECRET || "feedclass-qr-secret";
  const source = [
    child.id,
    child.schoolId,
    child.classId,
    child.studentId,
    child.fullName,
    child.profileImageUrl || "",
    String(child.active),
  ]
    .map((value) => String(value || "").trim())
    .join("|");
  const digest = crypto.createHmac("sha256", secret).update(source).digest("hex").toUpperCase();
  return `SMMS-${digest.slice(0, 16)}-${digest.slice(16, 32)}-${digest.slice(32, 48)}-${digest.slice(48, 64)}`;
}

function buildQrImageUrl(childId) {
  return `${QR_STORAGE_BASE_URL}/${childId}.png`;
}

function buildVerificationLink(qrPayload) {
  return qrPayload;
}

function sanitizeChildQr(entry) {
  if (!entry) {
    return null;
  }

  return {
    childId: entry.childId,
    qrPayload: entry.qrPayload,
    qrImageUrl: entry.qrImageUrl,
    createdAt: entry.createdAt,
  };
}

function findChildOrThrow(childId) {
  const child = getState().children.find((entry) => entry.id === childId);
  if (!child) {
    throw new Error("Child not found");
  }
  return child;
}

function assertChildAccess(actor, child) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN") {
    return;
  }
  if ((role === "SUPERVISOR" || role === "OPERATOR") && actor.assignedSchoolId === child.schoolId) {
    return;
  }
  throw new Error("You can only access QR data for children in your assigned school");
}

function ensureChildQrRecordForChild(child) {
  const existing = getState().childQr.find((entry) => entry.childId === child.id);
  if (existing) {
    existing.qrPayload = buildQrPayload(child);
    existing.qrImageUrl = buildQrImageUrl(child.id);
    return existing;
  }

  const qrRecord = {
    childId: child.id,
    qrPayload: buildQrPayload(child),
    qrImageUrl: buildQrImageUrl(child.id),
    createdAt: new Date().toISOString(),
  };
  getState().childQr.push(qrRecord);
  return qrRecord;
}

function ensureAllChildQrRecords() {
  getState().children.forEach((child) => {
    ensureChildQrRecordForChild(child);
  });
}

function getChildQr(actor, childId) {
  const child = findChildOrThrow(childId);
  assertChildAccess(actor, child);
  const qr = ensureChildQrRecordForChild(child);
  return sanitizeChildQr(qr);
}

module.exports = {
  buildQrPayload,
  buildVerificationLink,
  ensureChildQrRecordForChild,
  ensureAllChildQrRecords,
  getChildQr,
  sanitizeChildQr,
};
