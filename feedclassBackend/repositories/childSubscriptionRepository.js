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

async function getChildSubscription(childId) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.child_id,
            cs.plan_id,
            cs.status,
            cs.start_date,
            cs.end_date,
            cs.meals_remaining,
            cs.meal_type,
            cs.cancelled_at,
            cs.cancellation_reason,
            cs.created_at,
            cs.updated_at,
            sp.name AS plan_name,
            sp.price AS plan_price,
            sp.active AS plan_active
     FROM child_subscriptions cs
     INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
     WHERE cs.child_id = ?
     LIMIT 1`,
    [childId]
  );

  return rows[0] || null;
}

async function upsertChildSubscription({
  childId,
  planId,
  status,
  startDate,
  endDate,
  mealsRemaining,
  mealType,
  cancelledAt,
  cancellationReason,
  childStatus,
  gracePeriodEndsAt,
}) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    await connection.execute(
      `INSERT INTO child_subscriptions
        (child_id, plan_id, status, start_date, end_date, meals_remaining, meal_type, cancelled_at, cancellation_reason, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         plan_id = VALUES(plan_id),
         status = VALUES(status),
         start_date = VALUES(start_date),
         end_date = VALUES(end_date),
         meals_remaining = VALUES(meals_remaining),
         meal_type = VALUES(meal_type),
         cancelled_at = VALUES(cancelled_at),
         cancellation_reason = VALUES(cancellation_reason),
         updated_at = NOW()`,
      [
        childId,
        planId,
        status,
        toMysqlDate(startDate),
        toMysqlDate(endDate),
        mealsRemaining,
        mealType,
        toMysqlDateTime(cancelledAt),
        cancellationReason || null,
      ]
    );

    await connection.execute(
      `UPDATE children
       SET subscription_status = ?,
           grace_period_ends_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [childStatus, toMysqlDateTime(gracePeriodEndsAt), childId]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function expireDueSubscriptions(asOfDate) {
  const pool = getPool();
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `SELECT child_id
       FROM child_subscriptions
       WHERE status = 'ACTIVE'
         AND end_date < ?`,
      [toMysqlDate(asOfDate)]
    );

    if (rows.length === 0) {
      await connection.commit();
      return [];
    }

    const childIds = rows.map((row) => row.child_id);
    const placeholders = childIds.map(() => "?").join(", ");

    await connection.execute(
      `UPDATE child_subscriptions
       SET status = 'EXPIRED',
           meals_remaining = 0,
           updated_at = NOW()
       WHERE child_id IN (${placeholders})`,
      childIds
    );

    await connection.execute(
      `UPDATE children
       SET subscription_status = 'EXPIRED',
           grace_period_ends_at = NULL,
           updated_at = NOW()
       WHERE id IN (${placeholders})`,
      childIds
    );

    await connection.commit();
    return childIds;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function listExpiringSubscriptions(asOfDate, daysAhead = 3) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT cs.child_id,
            cs.plan_id,
            cs.status,
            cs.start_date,
            cs.end_date,
            cs.meals_remaining,
            cs.meal_type,
            sp.name AS plan_name,
            g.id AS guardian_id,
            g.name AS guardian_name,
            g.phone AS guardian_phone,
            g.notifications_opt_out
     FROM child_subscriptions cs
     INNER JOIN subscription_plans sp ON sp.id = cs.plan_id
     LEFT JOIN guardians g ON g.child_id = cs.child_id
     WHERE cs.status = 'ACTIVE'
       AND cs.end_date = DATE_ADD(?, INTERVAL ? DAY)`,
    [toMysqlDate(asOfDate), Number(daysAhead || 3)]
  );

  return rows;
}

module.exports = {
  getChildSubscription,
  upsertChildSubscription,
  expireDueSubscriptions,
  listExpiringSubscriptions,
};
