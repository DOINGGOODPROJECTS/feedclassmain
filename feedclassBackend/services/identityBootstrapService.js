const crypto = require("crypto");
const { getPool } = require("../db/pool");
const { ROLE_PERMISSIONS } = require("../lib/state");
const { hashPassword } = require("../lib/security");

const DEFAULT_ROLE_BY_EMAIL = {
  "admin@feedclass.test": "ADMIN",
  "supervisor@feedclass.test": "SUPERVISOR",
  "supervisor@sherpherdhill.com": "SUPERVISOR",
  "operator@feedclass.test": "OPERATOR",
  "donor@feedclass.test": "DONOR_READONLY",
};

const DEFAULT_USER_SPECS = [
  {
    name: "Ava Mendez",
    email: "admin@feedclass.test",
    password: "password123",
    role: "ADMIN",
    schoolName: null,
  },
  {
    name: "Jonah Tetteh",
    email: "supervisor@feedclass.test",
    password: "password123",
    role: "SUPERVISOR",
    schoolName: null,
  },
  {
    name: "Emmanuel TIO",
    email: "supervisor@sherpherdhill.com",
    password: "Dev5555!",
    role: "SUPERVISOR",
    schoolName: "Shepherdhill",
  },
  {
    name: "Naa Lartey",
    email: "operator@feedclass.test",
    password: "password123",
    role: "OPERATOR",
    schoolName: null,
  },
  {
    name: "Maya Patel",
    email: "donor@feedclass.test",
    password: "password123",
    role: "DONOR_READONLY",
    schoolName: null,
  },
];

async function ensureRole(connection, roleName) {
  const [rows] = await connection.execute("SELECT id FROM roles WHERE name = ? LIMIT 1", [roleName]);
  if (rows[0]?.id) {
    return rows[0].id;
  }

  const roleId = crypto.randomUUID();
  await connection.execute("INSERT INTO roles (id, name) VALUES (?, ?)", [roleId, roleName]);
  return roleId;
}

async function loadSchoolsByName(connection) {
  const [rows] = await connection.execute("SELECT id, name FROM schools WHERE deleted_at IS NULL");
  return new Map(rows.map((row) => [String(row.name || "").trim().toLowerCase(), row.id]));
}

async function ensureDefaultUsers(connection, roleIds) {
  const schoolsByName = await loadSchoolsByName(connection);

  for (const spec of DEFAULT_USER_SPECS) {
    const email = spec.email.trim().toLowerCase();
    const [existingUsers] = await connection.execute(
      "SELECT id FROM users WHERE email = ? LIMIT 1",
      [email]
    );

    let userId = existingUsers[0]?.id || null;
    if (!userId) {
      userId = crypto.randomUUID();
      const now = new Date().toISOString().slice(0, 19).replace("T", " ");
      const assignedSchoolId = spec.schoolName
        ? schoolsByName.get(spec.schoolName.trim().toLowerCase()) || null
        : null;

      await connection.execute(
        `INSERT INTO users
          (id, name, email, password_hash, active, assigned_school_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          spec.name,
          email,
          hashPassword(spec.password),
          true,
          assignedSchoolId,
          now,
          now,
        ]
      );
    }

    const roleId = roleIds[spec.role];
    if (!roleId) {
      continue;
    }

    const [existingRoles] = await connection.execute(
      "SELECT 1 FROM user_roles WHERE user_id = ? AND role_id = ? LIMIT 1",
      [userId, roleId]
    );

    if (!existingRoles[0]) {
      await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [userId, roleId]);
    }
  }
}

async function ensureIdentityAccessRegistry() {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const roleIds = {};
    for (const roleName of Object.keys(ROLE_PERMISSIONS)) {
      roleIds[roleName] = await ensureRole(connection, roleName);
    }

    await ensureDefaultUsers(connection, roleIds);

    const [users] = await connection.execute(
      `SELECT u.id, u.email
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE ur.user_id IS NULL`
    );

    for (const user of users) {
      const roleName = DEFAULT_ROLE_BY_EMAIL[String(user.email || "").trim().toLowerCase()];
      if (!roleName || !roleIds[roleName]) {
        continue;
      }

      await connection.execute("INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)", [
        user.id,
        roleIds[roleName],
      ]);
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  ensureIdentityAccessRegistry,
};
