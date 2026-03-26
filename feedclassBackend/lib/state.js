const crypto = require("crypto");
const { hashPassword } = require("./security");

const ROLE_PERMISSIONS = {
  ADMIN: [
    "auth:login",
    "profile:read",
    "aggregate:read",
    "plans:create",
    "plans:list",
    "plans:update",
    "plans:delete",
    "payments:read",
    "payments:create",
    "payments:send-link",
    "payments:update-status",
    "messages:health",
    "jobs:send-expiry-reminders",
    "subscriptions:read",
    "subscriptions:write",
    "jobs:expire-subscriptions",
    "schools:create",
    "schools:list",
    "schools:update",
    "classes:create",
    "classes:list",
    "classes:update",
    "children:create",
    "children:read",
    "children:import",
    "children:import-report",
    "audit:read",
    "users:create",
    "users:update",
    "users:delete",
    "users:list",
    "users:assign-school",
    "blockchain:write",
    "blockchain:read",
    "ledger:read",
    "suppliers:list",
    "suppliers:create",
    "suppliers:update",
    "invoices:list",
    "invoices:create",
    "invoices:pay",
    "cost-per-meal:read",
  ],
  SUPERVISOR: [
    "auth:login",
    "profile:read",
    "school:read",
    "aggregate:read",
    "plans:list",
    "classes:create",
    "classes:list",
    "classes:update",
    "children:create",
    "children:read",
    "payments:read",
    "payments:create",
    "payments:send-link",
    "payments:update-status",
    "jobs:send-expiry-reminders",
    "subscriptions:read",
    "subscriptions:write",
    "jobs:expire-subscriptions",
    "suppliers:list",
    "suppliers:create",
    "suppliers:update",
    "invoices:list",
    "invoices:create",
    "invoices:pay",
    "cost-per-meal:read",
  ],
  OPERATOR: ["auth:login", "profile:read", "school:read", "children:read"],
  DONOR_READONLY: ["auth:login", "profile:read", "aggregate:read", "ledger:read"],
};

function createInitialState() {
  const roles = Object.keys(ROLE_PERMISSIONS).map((name) => ({
    id: `role-${name.toLowerCase()}`,
    name,
    permissions: ROLE_PERMISSIONS[name],
  }));

  const schools = [
    {
      id: "s1",
      code: "RIVERBEND-001",
      name: "Riverbend Primary",
      address: "12 Riverside Road, Accra North",
      contactName: "Grace Mensah",
      contactEmail: "grace.mensah@riverbend.edu",
      contactPhone: "+233-555-181-222",
      timezone: "Africa/Accra",
      messagingEnabled: true,
      active: true,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "s2",
      code: "HILLVIEW-002",
      name: "Hillview Academy",
      address: "44 Central Avenue, Kumasi",
      contactName: "Daniel Owusu",
      contactEmail: "daniel.owusu@hillview.edu",
      contactPhone: "+233-555-444-901",
      timezone: "Africa/Accra",
      messagingEnabled: true,
      active: true,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "s3",
      code: "COASTAL-003",
      name: "Coastal Prep",
      address: "7 Harbor Street, Cape Coast",
      contactName: "Abena Koomson",
      contactEmail: "abena.koomson@coastalprep.edu",
      contactPhone: "+233-555-373-991",
      timezone: "Africa/Accra",
      messagingEnabled: true,
      active: true,
      deletedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const users = [
    {
      id: crypto.randomUUID(),
      name: "Ava Mendez",
      email: "admin@feedclass.test",
      passwordHash: hashPassword("password123"),
      active: true,
      assignedSchoolId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "Jonah Tetteh",
      email: "supervisor@feedclass.test",
      passwordHash: hashPassword("password123"),
      active: true,
      assignedSchoolId: "s1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "Naa Lartey",
      email: "operator@feedclass.test",
      passwordHash: hashPassword("password123"),
      active: true,
      assignedSchoolId: "s1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      name: "Maya Patel",
      email: "donor@feedclass.test",
      passwordHash: hashPassword("password123"),
      active: true,
      assignedSchoolId: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const roleByEmail = {
    "admin@feedclass.test": "ADMIN",
    "supervisor@feedclass.test": "SUPERVISOR",
    "operator@feedclass.test": "OPERATOR",
    "donor@feedclass.test": "DONOR_READONLY",
  };

  const userRoles = users.map((user) => ({
    userId: user.id,
    roleName: roleByEmail[user.email],
  }));

  const classes = [
    {
      id: "c1",
      schoolId: "s1",
      name: "Grade 3A",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "c2",
      schoolId: "s1",
      name: "Grade 4B",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "c3",
      schoolId: "s2",
      name: "Grade 2 Coral",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const children = [
    {
      id: "ch1",
      schoolId: "s1",
      classId: "c1",
      studentId: "RB-1001",
      fullName: "Selena Nyarko",
      profileImageUrl: "/profiles/ch1.jpg",
      subscriptionStatus: "ACTIVE",
      gracePeriodEndsAt: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ch2",
      schoolId: "s1",
      classId: "c2",
      studentId: "RB-1002",
      fullName: "Jordan Bediako",
      profileImageUrl: "/profiles/ch2.jpg",
      subscriptionStatus: "GRACE_PERIOD",
      gracePeriodEndsAt: "2026-03-17T23:59:59.000Z",
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "ch3",
      schoolId: "s2",
      classId: "c3",
      studentId: "HV-2041",
      fullName: "Alina Carver",
      profileImageUrl: "/profiles/ch3.jpg",
      subscriptionStatus: "EXPIRED",
      gracePeriodEndsAt: null,
      active: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const childQr = [];
  const mealScans = [];
  const guardians = [
    {
      id: "g1",
      childId: "ch1",
      name: "Ruth Mensah",
      phone: "+233-555-181-222",
      notificationsOptOut: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "g2",
      childId: "ch2",
      name: "Kwame Boateng",
      phone: "+233-555-373-991",
      notificationsOptOut: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "g3",
      childId: "ch3",
      name: "Lina Osei",
      phone: "+233-555-444-901",
      notificationsOptOut: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
  const enrollmentHistory = [];
  const childImportReports = [];

  return {
    schools,
    classes,
    children,
    childQr,
    mealScans,
    guardians,
    enrollmentHistory,
    childImportReports,
    roles,
    users,
    userRoles,
    sessions: [],
    loginLogs: [],
    activityLogs: [],
  };
}

let state = createInitialState();

function resetState() {
  state = createInitialState();
}

function getState() {
  return state;
}

function getUserRole(userId) {
  return state.userRoles.find((entry) => entry.userId === userId)?.roleName || null;
}

function getRolePermissions(roleName) {
  return ROLE_PERMISSIONS[roleName] || [];
}

function getUserByEmail(email) {
  return state.users.find((user) => user.email === String(email).trim().toLowerCase()) || null;
}

function getUserById(id) {
  return state.users.find((user) => user.id === id) || null;
}

function mapSchoolRow(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    contactName: row.contact_name || "",
    contactEmail: row.contact_email || "",
    contactPhone: row.contact_phone || "",
    timezone: row.timezone,
    messagingEnabled: row.messaging_enabled === undefined ? true : Boolean(row.messaging_enabled),
    active: Boolean(row.active),
    deletedAt: row.deleted_at ? new Date(row.deleted_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapClassRow(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    name: row.name,
    grade: row.grade || "",
    active: Boolean(row.active),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapChildRow(row) {
  return {
    id: row.id,
    schoolId: row.school_id,
    classId: row.class_id,
    studentId: row.student_id,
    fullName: row.full_name,
    profileImageUrl: row.profile_image_url || "",
    subscriptionStatus: row.subscription_status,
    gracePeriodEndsAt: row.grace_period_ends_at ? new Date(row.grace_period_ends_at).toISOString() : null,
    active: Boolean(row.active),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapGuardianRow(row) {
  return {
    id: row.id,
    childId: row.child_id,
    name: row.name,
    phone: row.phone,
    preferredChannel: row.preferred_channel,
    notificationsOptOut: row.notifications_opt_out === undefined ? false : Boolean(row.notifications_opt_out),
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapChildQrRow(row) {
  return {
    childId: row.child_id,
    qrPayload: row.qr_payload,
    qrImageUrl: row.qr_image_url,
    verificationLink: row.verification_link,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapUserRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    active: Boolean(row.active),
    assignedSchoolId: row.assigned_school_id || null,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapUserRoleRow(row) {
  return {
    userId: row.user_id,
    roleName: row.role_name,
  };
}

async function syncStateFromDatabase() {
  const { getPool } = require("../db/pool");
  const pool = getPool();

  const [schoolRows] = await pool.query(
    `SELECT *
     FROM schools
     WHERE deleted_at IS NULL
     ORDER BY name ASC`
  );
  const [classRows] = await pool.query(
    `SELECT id, school_id, name, grade, active, created_at, updated_at
     FROM classes
     ORDER BY name ASC`
  );
  const [childRows] = await pool.query(
    `SELECT id, school_id, class_id, student_id, full_name, profile_image_url, subscription_status, grace_period_ends_at, active, created_at, updated_at
     FROM children
     ORDER BY created_at DESC`
  );
  const [guardianRows] = await pool.query(
    `SELECT *
     FROM guardians
     ORDER BY created_at DESC`
  );
  const [childQrRows] = await pool.query(
    `SELECT child_id, qr_payload, qr_image_url, verification_link, created_at
     FROM child_qr`
  );
  const [userRows] = await pool.query(
    `SELECT id, name, email, password_hash, active, assigned_school_id, created_at, updated_at
     FROM users
     ORDER BY created_at DESC`
  );
  const [userRoleRows] = await pool.query(
    `SELECT ur.user_id, r.name AS role_name
     FROM user_roles ur
     INNER JOIN roles r ON r.id = ur.role_id`
  );

  state.schools = schoolRows.map(mapSchoolRow);
  state.classes = classRows.map(mapClassRow);
  state.children = childRows.map(mapChildRow);
  state.guardians = guardianRows.map(mapGuardianRow);
  state.childQr = childQrRows.map(mapChildQrRow);
  state.users = userRows.map(mapUserRow);
  state.userRoles = userRoleRows.map(mapUserRoleRow);
}

function sanitizeUser(user) {
  if (!user) {
    return null;
  }
  const role = getUserRole(user.id);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    active: user.active,
    assignedSchoolId: user.assignedSchoolId,
    role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

module.exports = {
  getState,
  resetState,
  syncStateFromDatabase,
  getUserRole,
  getRolePermissions,
  getUserByEmail,
  getUserById,
  sanitizeUser,
  ROLE_PERMISSIONS,
};
