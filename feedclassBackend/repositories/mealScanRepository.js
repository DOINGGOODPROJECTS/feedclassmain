const crypto = require("crypto");
const { getPool } = require("../db/pool");

function toMysqlDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().slice(0, 10);
}

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

async function persistMealScan(scan, child) {
  const pool = getPool();
  const connection = await pool.getConnection();
  const mealServeId = scan.outcome === "APPROVED" ? crypto.randomUUID() : null;

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO meal_scans
        (id, child_id, school_id, class_id, operator_user_id, qr_payload, meal_type, service_date, served_at, outcome, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scan.id,
        scan.childId,
        scan.schoolId,
        scan.classId,
        scan.operatorUserId,
        scan.qrPayload,
        scan.mealType,
        toMysqlDate(scan.serviceDate),
        toMysqlDateTime(scan.servedAt),
        scan.outcome,
        scan.reason,
        toMysqlDateTime(scan.createdAt),
      ]
    );

    if (mealServeId) {
      await connection.execute(
        `INSERT INTO meal_serves
          (id, child_id, school_id, meal_type, serve_date, created_at, is_grace, meal_scan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mealServeId,
          scan.childId,
          scan.schoolId,
          scan.mealType,
          toMysqlDate(scan.serviceDate),
          toMysqlDateTime(scan.createdAt),
          child.subscriptionStatus === "GRACE_PERIOD",
          scan.id,
        ]
      );
    }

    await connection.commit();
    return { mealServeId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  persistMealScan,
};
