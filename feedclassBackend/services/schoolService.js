const crypto = require("crypto");
const { getState } = require("../lib/state");
const { appendActivityLog } = require("./auditService");

function sanitizeSchool(school) {
  if (!school) {
    return null;
  }

  return {
    id: school.id,
    code: school.code,
    name: school.name,
    address: school.address,
    contactName: school.contactName,
    contactEmail: school.contactEmail,
    contactPhone: school.contactPhone,
    timezone: school.timezone,
    messagingEnabled: school.messagingEnabled !== false,
    active: school.active,
    deletedAt: school.deletedAt,
    createdAt: school.createdAt,
    updatedAt: school.updatedAt,
  };
}

function logSchoolActivity(actorUserId, action, schoolId, detail) {
  appendActivityLog(actorUserId, {
    entityType: "school",
    entityId: schoolId,
    action,
    detail,
  });
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase();
}

function ensureUniqueSchoolCode(code, ignoreSchoolId = null) {
  const normalizedCode = normalizeCode(code);
  const existing = getState().schools.find(
    (school) => school.code === normalizedCode && school.id !== ignoreSchoolId
  );
  if (existing) {
    throw new Error("School code already exists");
  }
  return normalizedCode;
}

function listSchools() {
  return getState().schools.map(sanitizeSchool);
}

function createSchool(actor, input) {
  if (!input.name || !input.code || !input.address || !input.timezone) {
    throw new Error("name, code, address, and timezone are required");
  }

  const code = ensureUniqueSchoolCode(input.code);
  const school = {
    id: crypto.randomUUID(),
    code,
    name: String(input.name).trim(),
    address: String(input.address).trim(),
    contactName: String(input.contactName || "").trim(),
    contactEmail: String(input.contactEmail || "").trim().toLowerCase(),
    contactPhone: String(input.contactPhone || "").trim(),
    timezone: String(input.timezone).trim(),
    messagingEnabled: input.messagingEnabled !== false,
    active: input.active !== false,
    deletedAt: input.active === false ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  getState().schools.push(school);
  const sanitized = sanitizeSchool(school);
  appendActivityLog(actor.id, {
    entityType: "school",
    entityId: school.id,
    action: "school.create",
    detail: `Created school ${code}`,
    before: null,
    after: sanitized,
    metadata: {
      schoolCode: code,
    },
  });
  return sanitized;
}

function updateSchool(actor, schoolId, input) {
  const school = getState().schools.find((entry) => entry.id === schoolId);
  if (!school) {
    return null;
  }
  const before = sanitizeSchool(school);

  if (input.code !== undefined) {
    school.code = ensureUniqueSchoolCode(input.code, school.id);
  }
  if (input.name !== undefined) {
    school.name = String(input.name).trim();
  }
  if (input.address !== undefined) {
    school.address = String(input.address).trim();
  }
  if (input.contactName !== undefined) {
    school.contactName = String(input.contactName).trim();
  }
  if (input.contactEmail !== undefined) {
    school.contactEmail = String(input.contactEmail).trim().toLowerCase();
  }
  if (input.contactPhone !== undefined) {
    school.contactPhone = String(input.contactPhone).trim();
  }
  if (input.timezone !== undefined) {
    school.timezone = String(input.timezone).trim();
  }
  if (input.messagingEnabled !== undefined) {
    school.messagingEnabled = Boolean(input.messagingEnabled);
  }
  if (input.active !== undefined) {
    school.active = Boolean(input.active);
    school.deletedAt = school.active ? null : school.deletedAt || new Date().toISOString();
  }
  school.updatedAt = new Date().toISOString();

  const after = sanitizeSchool(school);
  appendActivityLog(actor.id, {
    entityType: "school",
    entityId: school.id,
    action: "school.update",
    detail: `Updated school ${school.code}`,
    before,
    after,
    metadata: {
      fieldsChanged: Object.keys(input),
    },
  });
  return after;
}

module.exports = {
  listSchools,
  createSchool,
  updateSchool,
  sanitizeSchool,
};
