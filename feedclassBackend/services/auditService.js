const crypto = require("crypto");
const { getState, getUserById, sanitizeUser } = require("../lib/state");

function cloneSnapshot(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.parse(JSON.stringify(value));
}

function appendActivityLog(actorUserId, entry) {
  const log = {
    id: crypto.randomUUID(),
    actorUserId,
    targetUserId: entry.targetUserId || null,
    entityType: entry.entityType || null,
    entityId: entry.entityId || null,
    action: entry.action,
    detail: entry.detail || null,
    before: cloneSnapshot(entry.before),
    after: cloneSnapshot(entry.after),
    metadata: cloneSnapshot(entry.metadata) || {},
    createdAt: new Date().toISOString(),
  };

  getState().activityLogs.push(log);
  return log;
}

function sanitizeActivityLog(log) {
  if (!log) {
    return null;
  }

  return {
    id: log.id,
    actorUserId: log.actorUserId,
    actor: sanitizeUser(getUserById(log.actorUserId)),
    targetUserId: log.targetUserId || null,
    entityType: log.entityType || null,
    entityId: log.entityId || null,
    action: log.action,
    detail: log.detail || null,
    before: cloneSnapshot(log.before),
    after: cloneSnapshot(log.after),
    metadata: cloneSnapshot(log.metadata) || {},
    createdAt: log.createdAt,
  };
}

function listActivityLogs(filters = {}) {
  const actorId = filters.actorId ? String(filters.actorId).trim() : null;
  const entity = filters.entity ? String(filters.entity).trim().toLowerCase() : null;
  const dateFrom = filters.dateFrom ? new Date(filters.dateFrom) : null;
  const dateTo = filters.dateTo ? new Date(filters.dateTo) : null;

  if (dateFrom && Number.isNaN(dateFrom.getTime())) {
    throw new Error("Invalid date_from");
  }
  if (dateTo && Number.isNaN(dateTo.getTime())) {
    throw new Error("Invalid date_to");
  }

  return getState().activityLogs
    .filter((entry) => {
      if (actorId && entry.actorUserId !== actorId) {
        return false;
      }
      if (entity) {
        const entityType = String(entry.entityType || "").toLowerCase();
        const entityId = String(entry.entityId || "").toLowerCase();
        if (entityType !== entity && entityId !== entity) {
          return false;
        }
      }
      const createdAt = new Date(entry.createdAt);
      if (dateFrom && createdAt < dateFrom) {
        return false;
      }
      if (dateTo && createdAt > dateTo) {
        return false;
      }
      return true;
    })
    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
    .map(sanitizeActivityLog);
}

module.exports = {
  appendActivityLog,
  listActivityLogs,
  sanitizeActivityLog,
};
