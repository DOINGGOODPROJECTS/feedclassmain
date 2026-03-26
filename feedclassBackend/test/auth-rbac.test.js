const test = require("node:test");
const assert = require("node:assert/strict");

const { resetState, getState, getUserByEmail, getRolePermissions } = require("../lib/state");
const {
  authenticateUser,
  rotateRefreshToken,
  authenticateAccessToken,
} = require("../services/authService");
const { createUser, updateUser, assignSchool, listUsers } = require("../services/userService");
const { createSchool, updateSchool, listSchools } = require("../services/schoolService");
const { createClass, updateClass, listClasses, listClassesForSchool } = require("../services/classService");
const { createChild, updateChild, listChildren } = require("../services/childService");
const { ensureAllChildQrRecords, getChildQr } = require("../services/qrService");
const { resolveBadge, recordMealScan } = require("../services/scannerService");
const { importChildrenFromCsv, getChildImportReport } = require("../services/childImportService");
const { listActivityLogs } = require("../services/auditService");

const reqMeta = {
  ipAddress: "127.0.0.1",
  userAgent: "node-test",
};

test.beforeEach(() => {
  resetState();
});

test("login returns tokens and writes a successful login log", () => {
  const result = authenticateUser("admin@feedclass.test", "password123", reqMeta);

  assert.ok(result);
  assert.ok(result.accessToken);
  assert.ok(result.refreshToken);
  assert.equal(result.user.role, "ADMIN");
  assert.equal(getState().loginLogs.length, 1);
  assert.equal(getState().loginLogs[0].success, true);
});

test("refresh rotates token and rejects reused refresh token", () => {
  const loginResult = authenticateUser("admin@feedclass.test", "password123", reqMeta);

  const rotated = rotateRefreshToken(loginResult.refreshToken, reqMeta);
  assert.ok(rotated);
  assert.notEqual(rotated.refreshToken, loginResult.refreshToken);

  const reused = rotateRefreshToken(loginResult.refreshToken, reqMeta);
  assert.equal(reused, null);
});

test("access token payload can drive /me style profile responses", () => {
  const loginResult = authenticateUser("supervisor@feedclass.test", "password123", reqMeta);
  const auth = authenticateAccessToken(loginResult.accessToken);

  assert.equal(auth.user.email, "supervisor@feedclass.test");
  assert.equal(auth.role, "SUPERVISOR");
  assert.equal(auth.assignedSchoolId, "s1");
  assert.ok(auth.permissions.includes("school:read"));
});

test("admin can create, update, and assign school-scoped users with audit logs", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const created = createUser(admin, {
    name: "New Operator",
    email: "new.operator@feedclass.test",
    password: "password123",
    role: "OPERATOR",
    assignedSchoolId: "s2",
  });

  assert.equal(created.role, "OPERATOR");
  assert.equal(created.assignedSchoolId, "s2");

  const updated = updateUser(admin, created.id, { name: "Updated Operator", active: false });
  assert.equal(updated.name, "Updated Operator");
  assert.equal(updated.active, false);

  const reassigned = assignSchool(admin, created.id, "s3");
  assert.equal(reassigned.assignedSchoolId, "s3");
  assert.equal(getState().activityLogs.length, 3);
});

test("school-scoped listing and role permissions are enforced in service layer", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const supervisor = getUserByEmail("supervisor@feedclass.test");
  const donor = getUserByEmail("donor@feedclass.test");

  const adminVisible = listUsers(admin);
  const supervisorVisible = listUsers(supervisor);
  const donorVisible = listUsers(donor);

  assert.ok(adminVisible.length >= 4);
  assert.ok(supervisorVisible.every((user) => user.assignedSchoolId === "s1"));
  assert.equal(donorVisible.length, 0);
  assert.ok(getRolePermissions("ADMIN").includes("users:create"));
  assert.ok(!getRolePermissions("SUPERVISOR").includes("users:create"));
});

test("admin can create and update schools with unique codes and soft delete behavior", () => {
  const admin = getUserByEmail("admin@feedclass.test");

  const created = createSchool(admin, {
    code: "SUNSHINE-004",
    name: "Sunshine Model School",
    address: "18 Palm Road, Takoradi",
    contactName: "Evelyn Arthur",
    contactEmail: "evelyn.arthur@sunshine.edu",
    contactPhone: "+233-555-555-001",
    timezone: "Africa/Accra",
    active: true,
  });

  assert.equal(created.code, "SUNSHINE-004");
  assert.equal(listSchools().length, 4);

  assert.throws(
    () =>
      createSchool(admin, {
        code: "SUNSHINE-004",
        name: "Duplicate School",
        address: "Other Address",
        timezone: "Africa/Accra",
      }),
    /School code already exists/
  );

  const updated = updateSchool(admin, created.id, {
    active: false,
    contactPhone: "+233-555-555-999",
  });

  assert.equal(updated.active, false);
  assert.ok(updated.deletedAt);
  assert.equal(updated.contactPhone, "+233-555-555-999");
});

test("classes can be created per school and stay linked to the right school", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const supervisor = getUserByEmail("supervisor@feedclass.test");

  const created = createClass(admin, "s2", {
    name: "Grade 3A",
    active: true,
  });

  assert.equal(created.schoolId, "s2");
  assert.equal(created.name, "Grade 3A");

  const supervisorClasses = listClassesForSchool(supervisor, "s1");
  assert.ok(supervisorClasses.every((entry) => entry.schoolId === "s1"));

  assert.throws(
    () =>
      createClass(supervisor, "s2", {
        name: "Unauthorized Class",
      }),
    /assigned school/
  );

  const updated = updateClass(admin, created.id, { active: false });
  assert.equal(updated.active, false);

  assert.throws(
    () =>
      createClass(admin, "s2", {
        name: "Grade 3A",
      }),
    /Class already exists/
  );

  const allAdminClasses = listClasses(admin);
  const schoolTwoClasses = listClasses(admin, { schoolId: "s2" });
  assert.ok(allAdminClasses.length >= 3);
  assert.ok(schoolTwoClasses.every((entry) => entry.schoolId === "s2"));
});

test("manual child creation validates school and class selection", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const supervisor = getUserByEmail("supervisor@feedclass.test");

  const created = createChild(admin, {
    schoolId: "s3",
    classId: createClass(admin, "s3", { name: "Grade 5 Harbor", active: true }).id,
    studentId: "CP-3302",
    fullName: "Bright Aariaiwe",
    guardianName: "Ama Mensima",
    guardianPhone: "+233-555-000-555",
  });

  assert.equal(created.studentId, "CP-3302");
  assert.equal(created.schoolId, "s3");
  assert.equal(created.guardian.name, "Ama Mensima");
  assert.equal(getState().childQr.some((entry) => entry.childId === created.id), true);
  assert.equal(getState().enrollmentHistory.at(-1).changeType, "MANUAL_CREATE");

  assert.throws(
    () =>
      createChild(admin, {
        schoolId: "s1",
        classId: "c3",
        studentId: "RB-2001",
        fullName: "Wrong Mapping",
        guardianName: "Guardian Name",
        guardianPhone: "+233-555-000-556",
      }),
    /Class does not belong/
  );

  assert.throws(
    () =>
      createChild(supervisor, {
        schoolId: "s2",
        classId: "c3",
        studentId: "HV-3000",
        fullName: "Cross School Child",
        guardianName: "Other Guardian",
        guardianPhone: "+233-555-000-557",
      }),
    /assigned school/
  );

  const supervisorVisibleChildren = listChildren(supervisor);
  assert.ok(supervisorVisibleChildren.every((entry) => entry.schoolId === "s1"));
});

test("child profile updates regenerate QR verification codes", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const beforeQr = getChildQr(admin, "ch1").qrPayload;

  const updated = updateChild(admin, "ch1", {
    fullName: "Selena Nyarko Updated",
    guardianName: "Ruth Mensah Updated",
    guardianPhone: "+233-555-181-999",
    profileImageUrl: "/profiles/ch1-updated.jpg",
  });

  const afterQr = getChildQr(admin, "ch1").qrPayload;
  const guardian = getState().guardians.find((entry) => entry.childId === "ch1");

  assert.equal(updated.fullName, "Selena Nyarko Updated");
  assert.equal(guardian.name, "Ruth Mensah Updated");
  assert.equal(guardian.phone, "+233-555-181-999");
  assert.notEqual(beforeQr, afterQr);
});

test("child QR records are auto-generated and remain scoped to the right school", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const supervisor = getUserByEmail("supervisor@feedclass.test");
  const operator = getUserByEmail("operator@feedclass.test");

  ensureAllChildQrRecords();

  const adminQr = getChildQr(admin, "ch1");
  const supervisorQr = getChildQr(supervisor, "ch2");
  const operatorQr = getChildQr(operator, "ch1");

  assert.match(adminQr.qrPayload, /^SMMS-(?:[A-F0-9]{16}-){3}[A-F0-9]{16}$/);
  assert.match(supervisorQr.qrPayload, /^SMMS-(?:[A-F0-9]{16}-){3}[A-F0-9]{16}$/);
  assert.equal(operatorQr.qrImageUrl, "/qr-assets/ch1.png");
  assert.ok(!adminQr.qrPayload.includes("Selena Nyarko"));
  assert.ok(!adminQr.qrPayload.includes("RB-1001"));
  assert.ok(!supervisorQr.qrPayload.includes("RB-1002"));
  assert.equal(getState().childQr.length, getState().children.length);

  assert.throws(() => getChildQr(supervisor, "ch3"), /assigned school/);
});

test("scanner can resolve badge data with subscription and profile details", () => {
  const operator = getUserByEmail("operator@feedclass.test");
  const childTwoPayload = getChildQr(getUserByEmail("admin@feedclass.test"), "ch2").qrPayload;
  const childThreePayload = getChildQr(getUserByEmail("admin@feedclass.test"), "ch3").qrPayload;
  const resolved = resolveBadge(operator, childTwoPayload);

  assert.equal(resolved.child.studentId, "RB-1002");
  assert.equal(resolved.child.fullName, "Jordan Bediako");
  assert.equal(resolved.child.profileImageUrl, "/profiles/ch2.jpg");
  assert.equal(resolved.child.subscription.status, "GRACE_PERIOD");
  assert.equal(resolved.child.subscription.eligibleForMeal, true);
  assert.equal(resolved.child.school.name, "Riverbend Primary");
  assert.equal(resolved.child.class.name, "Grade 4B");

  assert.throws(() => resolveBadge(operator, childThreePayload), /assigned school/);
  assert.throws(() => resolveBadge(operator, "Jordan Bediako"), /Invalid QR payload/);
});

test("scanner meal scan records approved, duplicate, and blocked outcomes", () => {
  const operator = getUserByEmail("operator@feedclass.test");
  const admin = getUserByEmail("admin@feedclass.test");
  const childOnePayload = getChildQr(admin, "ch1").qrPayload;
  const childThreePayload = getChildQr(admin, "ch3").qrPayload;

  const approved = recordMealScan(operator, {
    qrPayload: childOnePayload,
    mealType: "lunch",
    servedAt: "2026-03-10T08:00:00.000Z",
  });
  const duplicate = recordMealScan(operator, {
    qrPayload: childOnePayload,
    mealType: "lunch",
    servedAt: "2026-03-10T09:00:00.000Z",
  });

  assert.equal(approved.scan.outcome, "APPROVED");
  assert.equal(duplicate.scan.outcome, "DUPLICATE");

  const blocked = recordMealScan(admin, {
    qrPayload: childThreePayload,
    mealType: "lunch",
    servedAt: "2026-03-10T10:00:00.000Z",
  });

  assert.equal(blocked.scan.outcome, "BLOCKED");
  assert.match(blocked.scan.reason, /expired/i);
  assert.equal(getState().mealScans.length, 3);
});

test("admin can import children CSV with created, updated, and rejected rows", () => {
  const admin = getUserByEmail("admin@feedclass.test");
  const csvContent = [
    "school_code,class_name,student_id,full_name,guardian_name,guardian_phone,profile_image_url,active",
    "RIVERBEND-001,Grade 3A,RB-1001,Selena Nyarko Updated,Ruth Mensah,+233-555-181-000,/profiles/ch1-new.jpg,true",
    "RIVERBEND-001,Grade 4B,RB-1009,Esi Arthur,Adwoa Arthur,+233-555-900-111,/profiles/ch9.jpg,true",
    "RIVERBEND-001,Unknown Class,RB-1010,Kofi Lamptey,Kwesi Lamptey,+233-555-900-222,,true",
    "RIVERBEND-001,Grade 3A,RB-1009,Duplicate Student,Adwoa Arthur,+233-555-900-333,,true",
  ].join("\n");

  const report = importChildrenFromCsv(admin, csvContent);

  assert.equal(report.totals.processed, 4);
  assert.equal(report.totals.created, 1);
  assert.equal(report.totals.updated, 1);
  assert.equal(report.totals.rejected, 2);

  const updatedChild = getState().children.find((entry) => entry.studentId === "RB-1001");
  const createdChild = getState().children.find((entry) => entry.studentId === "RB-1009");
  const createdGuardian = getState().guardians.find((entry) => entry.childId === createdChild.id);

  assert.equal(updatedChild.fullName, "Selena Nyarko Updated");
  assert.equal(updatedChild.profileImageUrl, "/profiles/ch1-new.jpg");
  assert.equal(createdChild.schoolId, "s1");
  assert.equal(createdChild.classId, "c2");
  assert.equal(createdGuardian.name, "Adwoa Arthur");
  assert.equal(getState().childQr.some((entry) => entry.childId === createdChild.id), true);
  assert.equal(getState().enrollmentHistory.length, 2);
  assert.equal(getState().activityLogs.at(-1).entityType, "children_import");

  const storedReport = getChildImportReport(report.id);
  assert.equal(storedReport.id, report.id);
  assert.equal(storedReport.rejected[0].rowNumber, 4);
});

test("child import rejects malformed files and missing columns", () => {
  const admin = getUserByEmail("admin@feedclass.test");

  assert.throws(
    () => importChildrenFromCsv(admin, "school_code,class_name\nRIVERBEND-001,Grade 3A"),
    /Missing required columns/
  );

  assert.throws(
    () =>
      importChildrenFromCsv(
        admin,
        'school_code,class_name,student_id,full_name,guardian_name,guardian_phone\n"RIVERBEND-001,Grade 3A'
      ),
    /Malformed CSV/
  );
});

test("activity logs capture before/after metadata and can be searched", () => {
  const admin = getUserByEmail("admin@feedclass.test");

  const school = createSchool(admin, {
    code: "NOVA-010",
    name: "Nova Learning Centre",
    address: "1 Cedar Lane",
    timezone: "Africa/Accra",
  });
  updateSchool(admin, school.id, { contactPhone: "+233-555-000-123" });

  const user = createUser(admin, {
    name: "Audit Supervisor",
    email: "audit.supervisor@feedclass.test",
    password: "password123",
    role: "SUPERVISOR",
    assignedSchoolId: "s1",
  });

  const importReport = importChildrenFromCsv(
    admin,
    [
      "school_code,class_name,student_id,full_name,guardian_name,guardian_phone",
      "RIVERBEND-001,Grade 3A,RB-1200,Ama Kusi,Efua Kusi,+233-555-123-000",
    ].join("\n")
  );

  const schoolLogs = listActivityLogs({ entity: "school" });
  const actorLogs = listActivityLogs({ actorId: admin.id });
  const importLogs = listActivityLogs({ entity: "children_import" });
  const dateLogs = listActivityLogs({
    dateFrom: "2026-01-01T00:00:00.000Z",
    dateTo: "2026-12-31T23:59:59.000Z",
  });

  assert.ok(schoolLogs.some((entry) => entry.action === "school.create"));
  assert.ok(schoolLogs.some((entry) => entry.action === "school.update"));
  assert.ok(actorLogs.some((entry) => entry.entityId === user.id && entry.after.email === "audit.supervisor@feedclass.test"));
  assert.ok(importLogs.some((entry) => entry.entityId === importReport.id && entry.metadata.createdCount === 1));
  assert.ok(dateLogs.length >= 4);

  const updateLog = schoolLogs.find((entry) => entry.action === "school.update" && entry.entityId === school.id);
  assert.equal(updateLog.before.contactPhone, "");
  assert.equal(updateLog.after.contactPhone, "+233-555-000-123");
  assert.deepEqual(updateLog.metadata.fieldsChanged, ["contactPhone"]);

  assert.throws(() => listActivityLogs({ dateFrom: "not-a-date" }), /Invalid date_from/);
});
