const crypto = require("crypto");
const { getPool } = require("../db/pool");
const { getState, getUserById, getUserRole, sanitizeUser } = require("../lib/state");
const { hashPassword } = require("../lib/security");
const { appendActivityLog } = require("./auditService");

const ALLOWED_ROLES = new Set(["ADMIN", "SUPERVISOR", "OPERATOR", "DONOR_READONLY"]);
const SCHOOL_SCOPED_ROLES = new Set(["SUPERVISOR", "OPERATOR"]);

function toMysqlDateTime(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 19).replace("T", " ");
}

async function ensureRoleId(connection, roleName) {
  const [rows] = await connection.execute("SELECT id FROM roles WHERE name = ? LIMIT 1", [roleName]);
  if (rows[0]?.id) {
    return rows[0].id;
  }

  const roleId = crypto.randomUUID();
  await connection.execute("INSERT INTO roles (id, name) VALUES (?, ?)", [roleId, roleName]);
  return roleId;
}

async function loadUsersFromDatabase() {
  const [rows] = await getPool().query(
    `SELECT u.id,
            u.name,
            u.email,
            u.password_hash,
            u.active,
            u.assigned_school_id,
            u.created_at,
            u.updated_at,
            r.name AS role
     FROM users u
     LEFT JOIN user_roles ur ON ur.user_id = u.id
     LEFT JOIN roles r ON r.id = ur.role_id
     ORDER BY u.created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    active: Boolean(row.active),
    assignedSchoolId: row.assigned_school_id || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    role: row.role || null,
  }));
}

async function syncRuntimeUsers() {
  const users = await loadUsersFromDatabase();
  const state = getState();
  state.users = users.map(({ role: _role, ...user }) => user);
  state.userRoles = users
    .filter((user) => user.role)
    .map((user) => ({
      userId: user.id,
      roleName: user.role,
    }));

  return users.map(({ passwordHash: _passwordHash, ...user }) => sanitizeUser(user));
}

async function listUsers(viewer) {
  const viewerRole = getUserRole(viewer.id);
  const users = await syncRuntimeUsers();

  if (viewerRole === "ADMIN") {
    return users;
  }
  if (viewerRole === "SUPERVISOR" || viewerRole === "OPERATOR") {
    return users.filter((user) => user.assignedSchoolId === viewer.assignedSchoolId);
  }
  if (viewerRole === "DONOR_READONLY") {
    return [];
  }
  return [];
}

async function createUser(actor, input) {
  const role = String(input.role || "").toUpperCase();
  if (!ALLOWED_ROLES.has(role)) {
    throw new Error("Invalid role");
  }

  const email = String(input.email || "").trim().toLowerCase();
  if (!email || !input.name || !input.password) {
    throw new Error("name, email, password, and role are required");
  }

  const assignedSchoolId = SCHOOL_SCOPED_ROLES.has(role) ? input.assignedSchoolId || null : null;
  if (SCHOOL_SCOPED_ROLES.has(role) && !assignedSchoolId) {
    throw new Error("SUPERVISOR and OPERATOR must be assigned to a school");
  }

  if (SCHOOL_SCOPED_ROLES.has(role)) {
    const schoolExists = getState().schools.some((school) => school.id === assignedSchoolId);
    if (!schoolExists) {
      throw new Error("School not found");
    }
  }

  const now = new Date();
  const userId = crypto.randomUUID();
  const passwordHash = hashPassword(String(input.password));
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    const [existing] = await connection.execute("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
    if (existing[0]?.id) {
      throw new Error("User already exists");
    }

    await connection.execute(
      `INSERT INTO users
        (id, name, email, password_hash, active, assigned_school_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        String(input.name).trim(),
        email,
        passwordHash,
        input.active !== false,
        assignedSchoolId,
        toMysqlDateTime(now),
        toMysqlDateTime(now),
      ]
    );

    const roleId = await ensureRoleId(connection, role);
    await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  const users = await syncRuntimeUsers();
  const created = users.find((user) => user.id === userId);
  appendActivityLog(actor.id, {
    targetUserId: userId,
    entityType: "user",
    entityId: userId,
    action: "user.create",
    detail: `Created ${role} ${email}`,
    before: null,
    after: created,
    metadata: { role },
  });
  return created;
}

async function updateUser(actor, userId, input) {
  const current = getUserById(userId);
  if (!current) {
    await syncRuntimeUsers();
  }

  const before = sanitizeUser(getUserById(userId));
  if (!before) {
    return null;
  }

  const updates = [];
  const values = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(String(input.name).trim());
  }
  if (input.email !== undefined) {
    updates.push("email = ?");
    values.push(String(input.email).trim().toLowerCase());
  }
  if (input.password !== undefined) {
    updates.push("password_hash = ?");
    values.push(hashPassword(String(input.password)));
  }
  if (input.active !== undefined) {
    updates.push("active = ?");
    values.push(Boolean(input.active));
  }

  if (updates.length === 0) {
    return before;
  }

  updates.push("updated_at = ?");
  values.push(toMysqlDateTime(new Date()), userId);

  const [result] = await getPool().execute(
    `UPDATE users
     SET ${updates.join(", ")}
     WHERE id = ?`,
    values
  );

  if (!result.affectedRows) {
    return null;
  }

  await syncRuntimeUsers();
  const after = sanitizeUser(getUserById(userId));
  appendActivityLog(actor.id, {
    targetUserId: userId,
    entityType: "user",
    entityId: userId,
    action: "user.update",
    detail: "Updated user profile",
    before,
    after,
    metadata: {
      fieldsChanged: Object.keys(input),
    },
  });
  return after;
}

async function assignSchool(actor, userId, schoolId) {
  await syncRuntimeUsers();
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  const role = getUserRole(user.id);
  if (!SCHOOL_SCOPED_ROLES.has(role)) {
    throw new Error("Only SUPERVISOR and OPERATOR can be assigned to a school");
  }

  const schoolExists = getState().schools.some((school) => school.id === schoolId);
  if (!schoolExists) {
    throw new Error("School not found");
  }

  const before = sanitizeUser(user);
  const [result] = await getPool().execute(
    `UPDATE users
     SET assigned_school_id = ?, updated_at = ?
     WHERE id = ?`,
    [schoolId, toMysqlDateTime(new Date()), userId]
  );

  if (!result.affectedRows) {
    return null;
  }

  await syncRuntimeUsers();
  const after = sanitizeUser(getUserById(userId));
  appendActivityLog(actor.id, {
    targetUserId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "user.assign_school",
    detail: `Assigned to school ${schoolId}`,
    before,
    after,
    metadata: {
      assignedSchoolId: schoolId,
    },
  });
  return after;
}

async function deleteUser(actor, userId) {
  await syncRuntimeUsers();
  const user = getUserById(userId);
  if (!user) {
    return null;
  }

  const actorRole = getUserRole(actor.id);
  if (actorRole !== "ADMIN") {
    throw new Error("Only admin can delete users");
  }
  if (actor.id === userId) {
    throw new Error("You cannot delete your own user");
  }

  const before = sanitizeUser(user);
  const connection = await getPool().getConnection();

  try {
    await connection.beginTransaction();
    await connection.execute("DELETE FROM user_roles WHERE user_id = ?", [userId]);
    const [result] = await connection.execute("DELETE FROM users WHERE id = ?", [userId]);
    if (!result.affectedRows) {
      await connection.rollback();
      return null;
    }
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  await syncRuntimeUsers();
  appendActivityLog(actor.id, {
    targetUserId: user.id,
    entityType: "user",
    entityId: user.id,
    action: "user.delete",
    detail: `Deleted user ${user.email}`,
    before,
    after: null,
    metadata: {
      email: user.email,
    },
  });
  return before;
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  assignSchool,
  deleteUser,
};
