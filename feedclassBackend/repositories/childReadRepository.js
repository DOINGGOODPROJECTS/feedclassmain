const { getPool } = require("../db/pool");

async function listChildren({ schoolId, classId } = {}) {
  const pool = getPool();
  const params = [];
  const filters = [];

  if (schoolId) {
    filters.push("c.school_id = ?");
    params.push(schoolId);
  }

  if (classId) {
    filters.push("c.class_id = ?");
    params.push(classId);
  }

  const [rows] = await pool.execute(
    `SELECT
       c.id,
       c.school_id,
       c.class_id,
       cl.name AS class_name,
       cl.grade AS class_grade,
       c.student_id,
       c.full_name,
       c.profile_image_url,
       c.subscription_status,
       c.grace_period_ends_at,
       c.active,
       c.created_at,
       c.updated_at,
       g.id AS guardian_id,
       g.name AS guardian_name,
       g.phone AS guardian_phone,
       g.created_at AS guardian_created_at,
       g.updated_at AS guardian_updated_at
     FROM children c
     LEFT JOIN classes cl ON cl.id = c.class_id
     LEFT JOIN guardians g ON g.child_id = c.id
     ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
     ORDER BY c.created_at DESC`,
    params
  );

  return rows;
}

async function getChildQr(childId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT
       cq.child_id,
       cq.qr_payload,
       cq.qr_image_url,
       cq.verification_link,
       cq.created_at,
       c.school_id
     FROM child_qr cq
     INNER JOIN children c ON c.id = cq.child_id
     WHERE cq.child_id = ?
     LIMIT 1`,
    [childId]
  );

  return rows[0] || null;
}

module.exports = {
  listChildren,
  getChildQr,
};
