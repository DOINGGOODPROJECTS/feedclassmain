const { getPool } = require("../db/pool");

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

async function resolvePersistentUserId(connection, actorUser) {
  const [rows] = await connection.execute(
    `SELECT id
     FROM users
     WHERE email = ?
     LIMIT 1`,
    [actorUser.email]
  );

  if (rows[0]?.id) {
    return rows[0].id;
  }

  return actorUser.id;
}

async function persistManualChildEnrollment({
  child,
  guardian,
  qrRecord,
  actorUser,
  school,
  classEntry,
  assignedSchool,
}) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const actorUserId = actorUser ? await resolvePersistentUserId(connection, actorUser) : null;

    if (school) {
      await connection.execute(
        `INSERT INTO schools
          (id, code, name, location, address, contact_name, contact_email, contact_phone, timezone, messaging_enabled, active, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           code = VALUES(code),
           name = VALUES(name),
           location = VALUES(location),
           address = VALUES(address),
           contact_name = VALUES(contact_name),
           contact_email = VALUES(contact_email),
           contact_phone = VALUES(contact_phone),
           timezone = VALUES(timezone),
           messaging_enabled = VALUES(messaging_enabled),
           active = VALUES(active),
           deleted_at = VALUES(deleted_at),
           updated_at = VALUES(updated_at)`,
        [
          school.id,
          school.code,
          school.name,
          school.location || null,
          school.address,
          school.contactName || null,
          school.contactEmail || null,
          school.contactPhone || null,
          school.timezone,
          school.messagingEnabled !== false,
          school.active,
          toMysqlDateTime(school.deletedAt),
          toMysqlDateTime(school.createdAt),
          toMysqlDateTime(school.updatedAt),
        ]
      );
    }

    if (assignedSchool && assignedSchool.id !== school?.id) {
      await connection.execute(
        `INSERT INTO schools
          (id, code, name, location, address, contact_name, contact_email, contact_phone, timezone, messaging_enabled, active, deleted_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           code = VALUES(code),
           name = VALUES(name),
           location = VALUES(location),
           address = VALUES(address),
           contact_name = VALUES(contact_name),
           contact_email = VALUES(contact_email),
           contact_phone = VALUES(contact_phone),
           timezone = VALUES(timezone),
           messaging_enabled = VALUES(messaging_enabled),
           active = VALUES(active),
           deleted_at = VALUES(deleted_at),
           updated_at = VALUES(updated_at)`,
        [
          assignedSchool.id,
          assignedSchool.code,
          assignedSchool.name,
          assignedSchool.location || null,
          assignedSchool.address,
          assignedSchool.contactName || null,
          assignedSchool.contactEmail || null,
          assignedSchool.contactPhone || null,
          assignedSchool.timezone,
          assignedSchool.messagingEnabled !== false,
          assignedSchool.active,
          toMysqlDateTime(assignedSchool.deletedAt),
          toMysqlDateTime(assignedSchool.createdAt),
          toMysqlDateTime(assignedSchool.updatedAt),
        ]
      );
    }

    if (classEntry) {
      await connection.execute(
        `INSERT INTO classes
          (id, school_id, name, grade, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           school_id = VALUES(school_id),
           name = VALUES(name),
           grade = VALUES(grade),
           active = VALUES(active),
           updated_at = VALUES(updated_at)`,
        [
          classEntry.id,
          classEntry.schoolId,
          classEntry.name,
          classEntry.grade || null,
          classEntry.active,
          toMysqlDateTime(classEntry.createdAt),
          toMysqlDateTime(classEntry.updatedAt),
        ]
      );
    }

    if (actorUser) {
      await connection.execute(
        `INSERT INTO users
          (id, name, email, password_hash, active, assigned_school_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           email = VALUES(email),
           password_hash = VALUES(password_hash),
           active = VALUES(active),
           assigned_school_id = VALUES(assigned_school_id),
           updated_at = VALUES(updated_at)`,
        [
          actorUserId,
          actorUser.name,
          actorUser.email,
          actorUser.passwordHash,
          actorUser.active,
          actorUser.assignedSchoolId || null,
          toMysqlDateTime(actorUser.createdAt),
          toMysqlDateTime(actorUser.updatedAt),
        ]
      );
    }

    await connection.execute(
      `INSERT INTO children
        (id, school_id, class_id, student_id, full_name, profile_image_url, subscription_status, grace_period_ends_at, active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        child.id,
        child.schoolId,
        child.classId,
        child.studentId,
        child.fullName,
        child.profileImageUrl,
        child.subscriptionStatus || "NONE",
        toMysqlDateTime(child.gracePeriodEndsAt),
        child.active,
        toMysqlDateTime(child.createdAt),
        toMysqlDateTime(child.updatedAt),
      ]
    );

    await connection.execute(
      `INSERT INTO guardians
        (id, child_id, name, phone, preferred_channel, notifications_opt_out, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'SMS', ?, ?, ?)`,
      [
        guardian.id,
        guardian.childId,
        guardian.name,
        guardian.phone,
        guardian.notificationsOptOut === true,
        toMysqlDateTime(guardian.createdAt),
        toMysqlDateTime(guardian.updatedAt),
      ]
    );

    await connection.execute(
      `INSERT INTO enrollment_history
        (id, child_id, school_id, class_id, change_type, actor_user_id, created_at)
       VALUES (?, ?, ?, ?, 'MANUAL_CREATE', ?, ?)`,
      [
        child.id,
        child.id,
        child.schoolId,
        child.classId,
        actorUserId,
        toMysqlDateTime(child.createdAt),
      ]
    );

    await connection.execute(
      `INSERT INTO child_qr
        (child_id, qr_payload, qr_image_url, verification_link, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         qr_payload = VALUES(qr_payload),
         qr_image_url = VALUES(qr_image_url),
         verification_link = VALUES(verification_link)`,
      [
        qrRecord.childId,
        qrRecord.qrPayload,
        qrRecord.qrImageUrl,
        qrRecord.qrPayload,
        toMysqlDateTime(qrRecord.createdAt),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function persistChildProfileUpdate({ child, guardian, qrRecord }) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `UPDATE children
       SET school_id = ?,
           class_id = ?,
           student_id = ?,
           full_name = ?,
           profile_image_url = ?,
           subscription_status = ?,
           grace_period_ends_at = ?,
           active = ?,
           updated_at = ?
       WHERE id = ?`,
      [
        child.schoolId,
        child.classId,
        child.studentId,
        child.fullName,
        child.profileImageUrl,
        child.subscriptionStatus || "NONE",
        toMysqlDateTime(child.gracePeriodEndsAt),
        child.active,
        toMysqlDateTime(child.updatedAt),
        child.id,
      ]
    );

    if (guardian) {
      await connection.execute(
      `UPDATE guardians
       SET name = ?,
           phone = ?,
           notifications_opt_out = ?,
           updated_at = ?
       WHERE child_id = ?`,
        [
          guardian.name,
          guardian.phone,
          guardian.notificationsOptOut === true,
          toMysqlDateTime(guardian.updatedAt),
          child.id,
        ]
      );
    }

    await connection.execute(
      `UPDATE enrollment_history
       SET school_id = ?,
           class_id = ?
       WHERE child_id = ?`,
      [child.schoolId, child.classId, child.id]
    );

    await connection.execute(
      `INSERT INTO child_qr
        (child_id, qr_payload, qr_image_url, verification_link, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         qr_payload = VALUES(qr_payload),
         qr_image_url = VALUES(qr_image_url),
         verification_link = VALUES(verification_link)`,
      [
        qrRecord.childId,
        qrRecord.qrPayload,
        qrRecord.qrImageUrl,
        qrRecord.qrPayload,
        toMysqlDateTime(qrRecord.createdAt),
      ]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function deleteChildRecord(childId) {
  const pool = getPool();
  await pool.execute("DELETE FROM children WHERE id = ?", [childId]);
}

module.exports = {
  persistManualChildEnrollment,
  persistChildProfileUpdate,
  deleteChildRecord,
};
