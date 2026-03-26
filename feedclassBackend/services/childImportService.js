const crypto = require("crypto");
const { getState } = require("../lib/state");
const { ensureChildQrRecordForChild } = require("./qrService");
const { appendActivityLog } = require("./auditService");

const REQUIRED_COLUMNS = [
  "school_code",
  "class_name",
  "student_id",
  "full_name",
  "guardian_name",
  "guardian_phone",
];

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error("Malformed CSV: unterminated quoted field");
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseCsv(csvContent) {
  const lines = String(csvContent || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((line) => line.trim().length > 0);

  if (lines.length < 2) {
    throw new Error("CSV must include a header row and at least one data row");
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`Missing required columns: ${missingColumns.join(", ")}`);
  }

  const rows = lines.slice(1).map((line, rowIndex) => {
    const values = parseCsvLine(line);
    const record = {};
    headers.forEach((header, columnIndex) => {
      record[header] = values[columnIndex] ? String(values[columnIndex]).trim() : "";
    });
    return {
      rowNumber: rowIndex + 2,
      values: record,
    };
  });

  return { headers, rows };
}

function sanitizeImportReport(report) {
  if (!report) {
    return null;
  }

  return {
    id: report.id,
    status: report.status,
    totals: report.totals,
    created: report.created,
    updated: report.updated,
    rejected: report.rejected,
    createdAt: report.createdAt,
  };
}

function normalizePhone(phone) {
  return String(phone || "").trim();
}

function getSchoolByCode(schoolCode) {
  return (
    getState().schools.find(
      (entry) => entry.code === String(schoolCode || "").trim().toUpperCase()
    ) || null
  );
}

function getClassBySchoolAndName(schoolId, className) {
  return (
    getState().classes.find(
      (entry) =>
        entry.schoolId === schoolId &&
        entry.name.trim().toLowerCase() === String(className || "").trim().toLowerCase()
    ) || null
  );
}

function getChildByStudentId(studentId) {
  return (
    getState().children.find(
      (entry) => entry.studentId.trim().toLowerCase() === String(studentId || "").trim().toLowerCase()
    ) || null
  );
}

function validateRow(row, seenStudentIds) {
  const reasons = [];
  const school = getSchoolByCode(row.values.school_code);
  const normalizedStudentId = String(row.values.student_id || "").trim();

  REQUIRED_COLUMNS.forEach((column) => {
    if (!row.values[column]) {
      reasons.push(`${column} is required`);
    }
  });

  if (normalizedStudentId) {
    const duplicateKey = normalizedStudentId.toLowerCase();
    if (seenStudentIds.has(duplicateKey)) {
      reasons.push("Duplicate student_id in import file");
    } else {
      seenStudentIds.add(duplicateKey);
    }
  }

  if (!school) {
    reasons.push("Invalid school_code");
  }

  let classEntry = null;
  if (school) {
    classEntry = getClassBySchoolAndName(school.id, row.values.class_name);
    if (!classEntry) {
      reasons.push("Invalid class mapping for school");
    }
  }

  return {
    reasons,
    school,
    classEntry,
  };
}

function upsertGuardian(childId, guardianName, guardianPhone) {
  const existing = getState().guardians.find((entry) => entry.childId === childId);
  if (existing) {
    existing.name = String(guardianName).trim();
    existing.phone = normalizePhone(guardianPhone);
    existing.updatedAt = new Date().toISOString();
    return existing;
  }

  const guardian = {
    id: crypto.randomUUID(),
    childId,
    name: String(guardianName).trim(),
    phone: normalizePhone(guardianPhone),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  getState().guardians.push(guardian);
  return guardian;
}

function appendEnrollmentHistory(child, actorUserId, changeType) {
  getState().enrollmentHistory.push({
    id: crypto.randomUUID(),
    childId: child.id,
    schoolId: child.schoolId,
    classId: child.classId,
    changeType,
    actorUserId,
    createdAt: new Date().toISOString(),
  });
}

function createChildFromRow(row, school, classEntry, actorUserId) {
  const child = {
    id: crypto.randomUUID(),
    schoolId: school.id,
    classId: classEntry.id,
    studentId: String(row.values.student_id).trim(),
    fullName: String(row.values.full_name).trim(),
    profileImageUrl: String(row.values.profile_image_url || "").trim() || null,
    subscriptionStatus: "NONE",
    gracePeriodEndsAt: null,
    active: row.values.active ? String(row.values.active).trim().toLowerCase() !== "false" : true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  getState().children.push(child);
  upsertGuardian(child.id, row.values.guardian_name, row.values.guardian_phone);
  appendEnrollmentHistory(child, actorUserId, "IMPORT_CREATE");
  ensureChildQrRecordForChild(child);
  return child;
}

function updateChildFromRow(existing, row, school, classEntry, actorUserId) {
  existing.schoolId = school.id;
  existing.classId = classEntry.id;
  existing.fullName = String(row.values.full_name).trim();
  existing.profileImageUrl = String(row.values.profile_image_url || "").trim() || existing.profileImageUrl || null;
  existing.active = row.values.active ? String(row.values.active).trim().toLowerCase() !== "false" : existing.active;
  existing.updatedAt = new Date().toISOString();

  upsertGuardian(existing.id, row.values.guardian_name, row.values.guardian_phone);
  appendEnrollmentHistory(existing, actorUserId, "IMPORT_UPDATE");
  ensureChildQrRecordForChild(existing);
  return existing;
}

function importChildrenFromCsv(actor, csvContent) {
  const { rows } = parseCsv(csvContent);
  const report = {
    id: crypto.randomUUID(),
    status: "COMPLETED",
    totals: {
      processed: rows.length,
      created: 0,
      updated: 0,
      rejected: 0,
    },
    created: [],
    updated: [],
    rejected: [],
    createdAt: new Date().toISOString(),
  };

  const seenStudentIds = new Set();

  rows.forEach((row) => {
    const { reasons, school, classEntry } = validateRow(row, seenStudentIds);
    if (reasons.length > 0) {
      report.totals.rejected += 1;
      report.rejected.push({
        rowNumber: row.rowNumber,
        studentId: row.values.student_id || null,
        reasons,
      });
      return;
    }

    const existing = getChildByStudentId(row.values.student_id);
    if (existing) {
      const updated = updateChildFromRow(existing, row, school, classEntry, actor.id);
      report.totals.updated += 1;
      report.updated.push({
        rowNumber: row.rowNumber,
        childId: updated.id,
        studentId: updated.studentId,
      });
      return;
    }

    const created = createChildFromRow(row, school, classEntry, actor.id);
    report.totals.created += 1;
    report.created.push({
      rowNumber: row.rowNumber,
      childId: created.id,
      studentId: created.studentId,
    });
  });

  getState().childImportReports.push(report);
  const sanitized = sanitizeImportReport(report);
  appendActivityLog(actor.id, {
    entityType: "children_import",
    entityId: report.id,
    action: "children.import",
    detail: `Imported children CSV: ${report.totals.created} created, ${report.totals.updated} updated, ${report.totals.rejected} rejected`,
    before: null,
    after: sanitized,
    metadata: {
      processedCount: report.totals.processed,
      createdCount: report.totals.created,
      updatedCount: report.totals.updated,
      rejectedCount: report.totals.rejected,
    },
  });

  return sanitized;
}

function getChildImportReport(reportId) {
  return sanitizeImportReport(
    getState().childImportReports.find((entry) => entry.id === reportId) || null
  );
}

module.exports = {
  importChildrenFromCsv,
  getChildImportReport,
  parseCsv,
  sanitizeImportReport,
};
