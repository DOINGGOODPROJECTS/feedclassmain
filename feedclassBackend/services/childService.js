const crypto = require("crypto");
const { getState, getUserRole } = require("../lib/state");
const { appendActivityLog } = require("./auditService");
const { ensureChildQrRecordForChild } = require("./qrService");

function sanitizeGuardian(guardian) {
  if (!guardian) {
    return null;
  }

  return {
    id: guardian.id,
    childId: guardian.childId,
    name: guardian.name,
    phone: guardian.phone,
    notificationsOptOut: guardian.notificationsOptOut === true,
    createdAt: guardian.createdAt,
    updatedAt: guardian.updatedAt,
  };
}

function sanitizeChild(child) {
  if (!child) {
    return null;
  }

  const guardian = getState().guardians.find((entry) => entry.childId === child.id) || null;

  return {
    id: child.id,
    schoolId: child.schoolId,
    classId: child.classId,
    studentId: child.studentId,
    fullName: child.fullName,
    profileImageUrl: child.profileImageUrl || null,
    subscriptionStatus: child.subscriptionStatus || "NONE",
    gracePeriodEndsAt: child.gracePeriodEndsAt || null,
    active: child.active,
    guardian: sanitizeGuardian(guardian),
    createdAt: child.createdAt,
    updatedAt: child.updatedAt,
  };
}

function getSchoolOrThrow(schoolId) {
  const school = getState().schools.find((entry) => entry.id === schoolId);
  if (!school) {
    throw new Error("School not found");
  }
  return school;
}

function getClassOrThrow(classId) {
  const classEntry = getState().classes.find((entry) => entry.id === classId);
  if (!classEntry) {
    throw new Error("Class not found");
  }
  return classEntry;
}

function assertChildOwnership(actor, schoolId) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN") {
    return;
  }
  if (role === "SUPERVISOR" && actor.assignedSchoolId === schoolId) {
    return;
  }
  throw new Error("You can only manage children for your assigned school");
}

function listChildren(actor, filters = {}) {
  const role = getUserRole(actor.id);
  let scopedSchoolId = filters.schoolId || null;

  if (role === "SUPERVISOR") {
    scopedSchoolId = actor.assignedSchoolId;
  } else if (role !== "ADMIN" && role !== "OPERATOR") {
    return [];
  }

  return getState().children
    .filter((entry) => {
      if (scopedSchoolId && entry.schoolId !== scopedSchoolId) {
        return false;
      }
      if (filters.classId && entry.classId !== filters.classId) {
        return false;
      }
      return true;
    })
    .map(sanitizeChild);
}

function createChild(actor, input) {
  const schoolId = String(input.schoolId || "").trim();
  const classId = String(input.classId || "").trim();
  const studentId = String(input.studentId || "").trim().toUpperCase();
  const fullName = String(input.fullName || "").trim();
  const guardianName = String(input.guardianName || "").trim();
  const guardianPhone = String(input.guardianPhone || "").trim();

  if (!schoolId || !classId || !studentId || !fullName || !guardianName || !guardianPhone) {
    throw new Error("schoolId, classId, studentId, fullName, guardianName, and guardianPhone are required");
  }

  const school = getSchoolOrThrow(schoolId);
  assertChildOwnership(actor, school.id);
  const classEntry = getClassOrThrow(classId);
  if (classEntry.schoolId !== school.id) {
    throw new Error("Class does not belong to the selected school");
  }

  const existing = getState().children.find((entry) => entry.studentId === studentId);
  if (existing) {
    throw new Error("studentId already exists");
  }

  const now = new Date().toISOString();
  const gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const child = {
    id: crypto.randomUUID(),
    schoolId: school.id,
    classId: classEntry.id,
    studentId,
    fullName,
    profileImageUrl: String(input.profileImageUrl || "").trim() || null,
    subscriptionStatus: "GRACE_PERIOD",
    gracePeriodEndsAt,
    active: input.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  const guardian = {
    id: crypto.randomUUID(),
    childId: child.id,
    name: guardianName,
    phone: guardianPhone,
    notificationsOptOut: Boolean(input.guardianNotificationsOptOut),
    createdAt: now,
    updatedAt: now,
  };

  getState().children.push(child);
  getState().guardians.push(guardian);
  getState().enrollmentHistory.push({
    id: crypto.randomUUID(),
    childId: child.id,
    schoolId: school.id,
    classId: classEntry.id,
    changeType: "MANUAL_CREATE",
    actorUserId: actor.id,
    createdAt: now,
  });
  ensureChildQrRecordForChild(child);

  const sanitized = sanitizeChild(child);
  appendActivityLog(actor.id, {
    entityType: "child",
    entityId: child.id,
    action: "child.create",
    detail: `Created child ${studentId} for school ${school.code}`,
    before: null,
    after: sanitized,
    metadata: {
      schoolId: school.id,
      classId: classEntry.id,
    },
  });

  return sanitized;
}

function updateChild(actor, childId, input) {
  const child = getState().children.find((entry) => entry.id === childId);
  if (!child) {
    return null;
  }

  const before = sanitizeChild(child);
  assertChildOwnership(actor, child.schoolId);

  const nextSchoolId = input.schoolId !== undefined ? String(input.schoolId || "").trim() : child.schoolId;
  const nextClassId = input.classId !== undefined ? String(input.classId || "").trim() : child.classId;
  const nextStudentId =
    input.studentId !== undefined ? String(input.studentId || "").trim().toUpperCase() : child.studentId;
  const nextFullName = input.fullName !== undefined ? String(input.fullName || "").trim() : child.fullName;

  if (!nextSchoolId || !nextClassId || !nextStudentId || !nextFullName) {
    throw new Error("schoolId, classId, studentId, and fullName are required");
  }

  const school = getSchoolOrThrow(nextSchoolId);
  assertChildOwnership(actor, school.id);
  const classEntry = getClassOrThrow(nextClassId);
  if (classEntry.schoolId !== school.id) {
    throw new Error("Class does not belong to the selected school");
  }

  const duplicate = getState().children.find(
    (entry) => entry.id !== child.id && entry.studentId === nextStudentId
  );
  if (duplicate) {
    throw new Error("studentId already exists");
  }

  child.schoolId = school.id;
  child.classId = classEntry.id;
  child.studentId = nextStudentId;
  child.fullName = nextFullName;

  if (input.profileImageUrl !== undefined) {
    child.profileImageUrl = String(input.profileImageUrl || "").trim() || null;
  }
  if (input.active !== undefined) {
    child.active = Boolean(input.active);
  }
  child.updatedAt = new Date().toISOString();

  const guardian = getState().guardians.find((entry) => entry.childId === child.id) || null;
  if (guardian) {
    if (input.guardianName !== undefined) {
      guardian.name = String(input.guardianName || "").trim();
    }
    if (input.guardianPhone !== undefined) {
      guardian.phone = String(input.guardianPhone || "").trim();
    }
    if (input.guardianNotificationsOptOut !== undefined) {
      guardian.notificationsOptOut = Boolean(input.guardianNotificationsOptOut);
    }
    guardian.updatedAt = new Date().toISOString();
  }

  ensureChildQrRecordForChild(child);

  const after = sanitizeChild(child);
  appendActivityLog(actor.id, {
    entityType: "child",
    entityId: child.id,
    action: "child.update",
    detail: `Updated child ${child.studentId}`,
    before,
    after,
    metadata: {
      fieldsChanged: Object.keys(input),
      schoolId: school.id,
      classId: classEntry.id,
    },
  });

  return after;
}

function deleteChild(actor, childId) {
  const childIndex = getState().children.findIndex((entry) => entry.id === childId);
  if (childIndex === -1) {
    return null;
  }

  const child = getState().children[childIndex];
  assertChildOwnership(actor, child.schoolId);
  const before = sanitizeChild(child);

  getState().children.splice(childIndex, 1);
  getState().guardians = getState().guardians.filter((entry) => entry.childId !== childId);
  getState().childQr = getState().childQr.filter((entry) => entry.childId !== childId);
  getState().enrollmentHistory = getState().enrollmentHistory.filter((entry) => entry.childId !== childId);

  appendActivityLog(actor.id, {
    entityType: "child",
    entityId: childId,
    action: "child.delete",
    detail: `Deleted child ${child.studentId}`,
    before,
    after: null,
    metadata: {
      schoolId: child.schoolId,
      classId: child.classId,
    },
  });

  return before;
}

module.exports = {
  listChildren,
  createChild,
  updateChild,
  deleteChild,
  sanitizeChild,
};
