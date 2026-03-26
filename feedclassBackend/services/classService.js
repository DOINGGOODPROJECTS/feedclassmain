const crypto = require("crypto");
const { getState, getUserRole } = require("../lib/state");
const { appendActivityLog } = require("./auditService");

function sanitizeClass(entry) {
  if (!entry) {
    return null;
  }

  return {
    id: entry.id,
    schoolId: entry.schoolId,
    name: entry.name,
    grade: entry.grade || "",
    active: entry.active,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  };
}

function logClassActivity(actorUserId, action, classId, detail) {
  appendActivityLog(actorUserId, {
    entityType: "class",
    entityId: classId,
    action,
    detail,
  });
}

function getSchoolOrThrow(schoolId) {
  const school = getState().schools.find((entry) => entry.id === schoolId);
  if (!school) {
    throw new Error("School not found");
  }
  return school;
}

function assertSchoolOwnership(actor, schoolId) {
  const role = getUserRole(actor.id);
  if (role === "ADMIN") {
    return;
  }
  if (role === "SUPERVISOR" && actor.assignedSchoolId === schoolId) {
    return;
  }
  throw new Error("You can only manage classes for your assigned school");
}

function ensureUniqueClassNameWithinSchool(schoolId, name, ignoreClassId = null) {
  const normalizedName = String(name || "").trim().toLowerCase();
  const existing = getState().classes.find(
    (entry) =>
      entry.schoolId === schoolId &&
      entry.id !== ignoreClassId &&
      entry.name.trim().toLowerCase() === normalizedName
  );
  if (existing) {
    throw new Error("Class already exists for this school");
  }
}

function listClassesForSchool(actor, schoolId) {
  getSchoolOrThrow(schoolId);
  assertSchoolOwnership(actor, schoolId);
  return getState().classes
    .filter((entry) => entry.schoolId === schoolId)
    .map(sanitizeClass);
}

function listClasses(actor, filters = {}) {
  const role = getUserRole(actor.id);

  if (role === "ADMIN") {
    return getState().classes
      .filter((entry) => !filters.schoolId || entry.schoolId === filters.schoolId)
      .map(sanitizeClass);
  }

  if (role === "SUPERVISOR") {
    return getState().classes
      .filter((entry) => entry.schoolId === actor.assignedSchoolId)
      .filter((entry) => !filters.schoolId || entry.schoolId === filters.schoolId)
      .map(sanitizeClass);
  }

  throw new Error("You can only view classes for your assigned school");
}

function createClass(actor, schoolId, input) {
  getSchoolOrThrow(schoolId);
  assertSchoolOwnership(actor, schoolId);

  if (!input.name) {
    throw new Error("Class name is required");
  }

  ensureUniqueClassNameWithinSchool(schoolId, input.name);
  const entry = {
    id: crypto.randomUUID(),
    schoolId,
    name: String(input.name).trim(),
    grade: String(input.grade || "").trim(),
    active: input.active !== false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  getState().classes.push(entry);
  const sanitized = sanitizeClass(entry);
  appendActivityLog(actor.id, {
    entityType: "class",
    entityId: entry.id,
    action: "class.create",
    detail: `Created class ${entry.name} for school ${schoolId}`,
    before: null,
    after: sanitized,
    metadata: {
      schoolId,
    },
  });
  return sanitized;
}

function updateClass(actor, classId, input) {
  const entry = getState().classes.find((item) => item.id === classId);
  if (!entry) {
    return null;
  }
  const before = sanitizeClass(entry);

  assertSchoolOwnership(actor, entry.schoolId);
  if (input.schoolId && input.schoolId !== entry.schoolId) {
    throw new Error("Class school_id cannot be changed");
  }
  if (input.name !== undefined) {
    ensureUniqueClassNameWithinSchool(entry.schoolId, input.name, entry.id);
    entry.name = String(input.name).trim();
  }
  if (input.grade !== undefined) {
    entry.grade = String(input.grade || "").trim();
  }
  if (input.active !== undefined) {
    entry.active = Boolean(input.active);
  }
  entry.updatedAt = new Date().toISOString();

  const after = sanitizeClass(entry);
  appendActivityLog(actor.id, {
    entityType: "class",
    entityId: entry.id,
    action: "class.update",
    detail: `Updated class ${entry.name}`,
    before,
    after,
    metadata: {
      fieldsChanged: Object.keys(input),
    },
  });
  return after;
}

module.exports = {
  listClasses,
  listClassesForSchool,
  createClass,
  updateClass,
  sanitizeClass,
};
