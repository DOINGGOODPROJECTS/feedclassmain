const crypto = require("crypto");
const { getPool } = require("../db/pool");
const { anchorDailyMealBatch } = require("./mealBatchAnchorService");
const { getMealVerification } = require("./mealProofService");

function parseQrPayload(qrPayload) {
  const normalized = String(qrPayload || "").trim();
  if (!normalized) {
    throw new Error("Invalid QR payload");
  }
  return normalized;
}

function toMysqlDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date value");
  }
  return date.toISOString().slice(0, 10);
}

function toMysqlDateTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid datetime value");
  }
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function assertScannerAccess(actor, child) {
  if (actor.role === "ADMIN" || actor.role === "SUPERVISOR" || actor.role === "OPERATOR") {
    return;
  }
  throw new Error("You are not allowed to scan child badges");
}

function normalizeSubscription(row, servedAt = new Date()) {
  const status = row.subscription_status || row.subscription_row_status || "NONE";
  const graceEndsAt = row.grace_period_ends_at ? new Date(row.grace_period_ends_at) : null;
  const isGracePeriod =
    status === "GRACE_PERIOD" &&
    graceEndsAt &&
    !Number.isNaN(graceEndsAt.getTime()) &&
    graceEndsAt.getTime() >= servedAt.getTime();
  const isSubscribed =
    status === "ACTIVE" &&
    Number(row.meals_remaining || 0) > 0 &&
    (!row.subscription_end_date || new Date(row.subscription_end_date).getTime() >= servedAt.getTime());

  return {
    status: isGracePeriod ? "GRACE_PERIOD" : status,
    isSubscribed,
    isGracePeriod: Boolean(isGracePeriod),
    gracePeriodEndsAt: row.grace_period_ends_at || null,
    eligibleForMeal: Boolean(row.active) && (isSubscribed || isGracePeriod),
    mealsRemaining: Number(row.meals_remaining || 0),
    mealType: row.subscription_meal_type || null,
    planId: row.plan_id || null,
    planName: row.plan_name || null,
  };
}

function sanitizeResolvedChild(row, servedAt = new Date()) {
  return {
    id: row.child_id,
    studentId: row.student_id,
    fullName: row.full_name,
    profileImageUrl: row.profile_image_url || null,
    active: Boolean(row.active),
    school: row.school_id
      ? {
          id: row.school_id,
          name: row.school_name,
          code: row.school_code,
        }
      : null,
    class: row.class_id
      ? {
          id: row.class_id,
          name: row.class_name,
        }
      : null,
    guardian: row.guardian_id
      ? {
          id: row.guardian_id,
          name: row.guardian_name,
          phone: row.guardian_phone,
        }
      : null,
    subscription: normalizeSubscription(row, servedAt),
    qr: {
      childId: row.child_id,
      qrPayload: row.qr_payload,
      qrImageUrl: row.qr_image_url || null,
      verificationLink: row.verification_link || null,
    },
  };
}

async function findChildByQrPayload(qrPayload) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT
       c.id AS child_id,
       c.school_id,
       c.class_id,
       c.student_id,
       c.full_name,
       c.profile_image_url,
       c.subscription_status,
       c.grace_period_ends_at,
       c.active,
       s.name AS school_name,
       s.code AS school_code,
       cl.name AS class_name,
       g.id AS guardian_id,
       g.name AS guardian_name,
       g.phone AS guardian_phone,
       cq.qr_payload,
       cq.qr_image_url,
       cq.verification_link,
       cs.status AS subscription_row_status,
       cs.plan_id,
       cs.meals_remaining,
       cs.meal_type AS subscription_meal_type,
       cs.end_date AS subscription_end_date,
       sp.name AS plan_name
     FROM child_qr cq
     INNER JOIN children c ON c.id = cq.child_id
     LEFT JOIN schools s ON s.id = c.school_id
     LEFT JOIN classes cl ON cl.id = c.class_id
     LEFT JOIN guardians g ON g.child_id = c.id
     LEFT JOIN child_subscriptions cs ON cs.child_id = c.id
     LEFT JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cq.qr_payload = ?
     LIMIT 1`,
    [qrPayload]
  );

  return rows[0] || null;
}

async function resolveOperatorUserId(connection, actor) {
  const actorUserId = actor?.user?.id || actor?.sub || null;
  const actorEmail = String(actor?.user?.email || actor?.email || "").trim();

  if (actorUserId) {
    const [[rowById]] = await connection.execute(
      `SELECT id
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [actorUserId]
    );
    if (rowById?.id) {
      return rowById.id;
    }
  }

  if (actorEmail) {
    const [[rowByEmail]] = await connection.execute(
      `SELECT id
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [actorEmail]
    );
    if (rowByEmail?.id) {
      return rowByEmail.id;
    }
  }

  const [[fallbackAdmin]] = await connection.execute(
    `SELECT id
     FROM users
     WHERE email = 'admin@feedclass.test'
     LIMIT 1`
  );
  if (fallbackAdmin?.id) {
    return fallbackAdmin.id;
  }

  throw new Error("No database-backed scanner user is available");
}

async function resolveBadge(actor, qrPayload) {
  const normalizedPayload = parseQrPayload(qrPayload);
  const row = await findChildByQrPayload(normalizedPayload);
  if (!row) {
    throw new Error("Child not found");
  }

  const child = sanitizeResolvedChild(row);
  assertScannerAccess(actor, child);

  return { child };
}

async function recordMealScan(actor, input) {
  const qrPayload = input.qrPayload ? parseQrPayload(input.qrPayload) : null;
  const mealType = String(input.mealType || "LUNCH").trim().toUpperCase();
  const servedAt = input.servedAt ? new Date(input.servedAt) : new Date();
  if (Number.isNaN(servedAt.getTime())) {
    throw new Error("Invalid servedAt timestamp");
  }

  const childRow = qrPayload ? await findChildByQrPayload(qrPayload) : null;
  if (!childRow) {
    throw new Error("Child not found");
  }

  const child = sanitizeResolvedChild(childRow, servedAt);
  assertScannerAccess(actor, child);

  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const operatorUserId = await resolveOperatorUserId(connection, actor);

    const serviceDate = toMysqlDate(servedAt);
    const [[duplicateRow]] = await connection.execute(
      `SELECT
         ms.id,
         srv.id AS meal_serve_id
       FROM meal_scans ms
       LEFT JOIN meal_serves srv ON srv.meal_scan_id = ms.id
       WHERE ms.child_id = ?
         AND ms.meal_type = ?
         AND ms.service_date = ?
         AND ms.outcome = 'APPROVED'
       LIMIT 1`,
      [child.id, mealType, serviceDate]
    );

    let outcome = "APPROVED";
    let reason = "Meal scan approved";

    if (!child.active) {
      outcome = "BLOCKED";
      reason = "Child is inactive";
    } else if (!child.subscription.eligibleForMeal) {
      outcome = "BLOCKED";
      reason =
        child.subscription.status === "EXPIRED"
          ? "Subscription expired"
          : child.subscription.status === "CANCELLED"
          ? "Subscription cancelled"
          : child.subscription.status === "PAUSED"
          ? "Subscription paused"
          : child.subscription.status === "ACTIVE" && child.subscription.mealsRemaining <= 0
          ? "Insufficient meals remaining"
          : "No active subscription";
    } else if (duplicateRow) {
      outcome = "DUPLICATE";
      reason = "Meal already served for this child and meal type today";
    }

    const scanId = crypto.randomUUID();
    await connection.execute(
      `INSERT INTO meal_scans
        (id, child_id, school_id, class_id, operator_user_id, qr_payload, meal_type, service_date, served_at, outcome, reason, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        scanId,
        child.id,
        child.school?.id,
        child.class?.id,
        operatorUserId,
        qrPayload,
        mealType,
        serviceDate,
        toMysqlDateTime(servedAt),
        outcome,
        reason,
        toMysqlDateTime(new Date()),
      ]
    );

    let mealServeId = duplicateRow?.meal_serve_id || null;
    let nextMealsRemaining = child.subscription.mealsRemaining;

    if (outcome === "APPROVED") {
      mealServeId = crypto.randomUUID();
      await connection.execute(
        `INSERT INTO meal_serves
          (id, child_id, school_id, meal_type, serve_date, created_at, is_grace, meal_scan_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mealServeId,
          child.id,
          child.school?.id,
          mealType,
          serviceDate,
          toMysqlDateTime(new Date()),
          child.subscription.isGracePeriod,
          scanId,
        ]
      );

      if (child.subscription.isSubscribed && child.subscription.planId) {
        nextMealsRemaining = Math.max(0, child.subscription.mealsRemaining - 1);
        await connection.execute(
          `UPDATE child_subscriptions
           SET meals_remaining = ?, updated_at = NOW()
           WHERE child_id = ?`,
          [nextMealsRemaining, child.id]
        );
        await connection.execute(
          `INSERT INTO transactions
            (id, child_id, payment_intent_id, type, amount, metadata_json, created_at)
           VALUES (?, ?, NULL, 'DEBIT_MEAL', 0, ?, ?)`,
          [
            crypto.randomUUID(),
            child.id,
            JSON.stringify({
              mealScanId: scanId,
              mealServeId,
              mealType,
              source: "QR_SCANNER",
            }),
            toMysqlDateTime(new Date()),
          ]
        );
      } else if (child.subscription.isGracePeriod) {
        await connection.execute(
          `INSERT INTO transactions
            (id, child_id, payment_intent_id, type, amount, metadata_json, created_at)
           VALUES (?, ?, NULL, 'GRACE_MEAL', 0, ?, ?)`,
          [
            crypto.randomUUID(),
            child.id,
            JSON.stringify({
              mealScanId: scanId,
              mealServeId,
              mealType,
              source: "QR_SCANNER",
            }),
            toMysqlDateTime(new Date()),
          ]
        );
      }
    }

    await connection.commit();

    const result = {
      scan: {
        id: scanId,
        mealType,
        servedAt: servedAt.toISOString(),
        outcome,
        reason,
      },
      mealServeId,
      child: {
        ...child,
        subscription: {
          ...child.subscription,
          mealsRemaining: nextMealsRemaining,
        },
      },
    };

    if (mealServeId && child.school?.id) {
      try {
        const anchoredBatch = await anchorDailyMealBatch({
          schoolId: child.school.id,
          serveDate: serviceDate,
        });
        result.blockchain = {
          anchored: anchoredBatch.batch.status === "CONFIRMED",
          batchId: anchoredBatch.batch.id,
          batchStatus: anchoredBatch.batch.status,
          txHash: anchoredBatch.batch.tx_hash || null,
          batchRoot: anchoredBatch.batch.merkle_root || null,
        };
      } catch (error) {
        result.blockchain = {
          anchored: false,
          batchStatus: error.details?.batch?.status || "FAILED",
          txHash: error.details?.batch?.tx_hash || null,
          batchRoot: error.details?.batch?.merkle_root || null,
          error: error.message,
        };
      }

      try {
        result.verification = await getMealVerification(mealServeId);
      } catch (_error) {
        result.verification = null;
      }
    }

    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  resolveBadge,
  recordMealScan,
};
