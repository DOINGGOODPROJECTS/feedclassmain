const messageRepository = require("../repositories/messageRepository");
const paymentIntentRepository = require("../repositories/paymentIntentRepository");
const planRepository = require("../repositories/planRepository");
const childSubscriptionRepository = require("../repositories/childSubscriptionRepository");
const { getPool } = require("../db/pool");
const { getState } = require("../lib/state");
const { appendActivityLog } = require("./auditService");
const smsService = require("./smsService");

const RETRY_DELAYS_MINUTES = [5, 30, 180];
const TEMPLATE_TYPES = {
  PAYMENT_LINK: "PAYMENT_LINK",
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  DAILY_PAYMENT_REMINDER: "DAILY_PAYMENT_REMINDER",
  SUBSCRIPTION_ACTIVATED: "SUBSCRIPTION_ACTIVATED",
  SUBSCRIPTION_EXPIRING_SOON: "SUBSCRIPTION_EXPIRING_SOON",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",
  MEAL_SERVED: "MEAL_SERVED",
};

function getChildDisplayName(child) {
  return child?.fullName || child?.full_name || child?.studentId || child?.student_id || "Child";
}

function getPaymentBaseUrl() {
  return String(process.env.PAYMENT_LINK_BASE_URL || "http://localhost:3000/pay").replace(/\/+$/, "");
}

function addMinutes(date, minutes) {
  const next = new Date(date);
  next.setUTCMinutes(next.getUTCMinutes() + minutes);
  return next;
}

function formatDay(value = new Date()) {
  return new Date(value).toISOString().slice(0, 10);
}

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

function isHardFailure(message) {
  const lower = String(message || "").toLowerCase();
  return (
    lower.includes("not configured") ||
    lower.includes("authentication") ||
    lower.includes("unauthorized") ||
    lower.includes("permission") ||
    lower.includes("invalid access token") ||
    lower.includes("insufficient") ||
    lower.includes("forbidden")
  );
}

function getGuardianByChildId(childId) {
  return getState().guardians.find((entry) => entry.childId === childId) || null;
}

function getChildById(childId) {
  return getState().children.find((entry) => entry.id === childId) || null;
}

function getSchoolById(schoolId) {
  return getState().schools.find((entry) => entry.id === schoolId) || null;
}

async function hasColumn(tableName, columnName) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT 1
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?
     LIMIT 1`,
    [tableName, columnName]
  );
  return rows.length > 0;
}

async function ensureMessagingPreferenceSchema() {
  const pool = getPool();

  if (!(await hasColumn("schools", "messaging_enabled"))) {
    await pool.query(
      "ALTER TABLE schools ADD COLUMN messaging_enabled BOOLEAN NOT NULL DEFAULT TRUE AFTER timezone"
    );
  }

  if (!(await hasColumn("guardians", "notifications_opt_out"))) {
    await pool.query(
      "ALTER TABLE guardians ADD COLUMN notifications_opt_out BOOLEAN NOT NULL DEFAULT FALSE AFTER preferred_channel"
    );
  }
}

function isGuardianMessageEnabled(child, guardian) {
  if (!guardian?.phone) {
    return { allowed: false, reason: "Guardian phone is required" };
  }

  if (guardian.notificationsOptOut === true) {
    return { allowed: false, reason: "Guardian opted out" };
  }

  const school = child?.schoolId ? getSchoolById(child.schoolId) : null;
  if (school && school.messagingEnabled === false) {
    return { allowed: false, reason: "School messaging disabled" };
  }

  return { allowed: true, reason: null };
}

function renderTemplate(type, context = {}) {
  const childName = getChildDisplayName(context.child);
  const planName = context.plan?.name || context.subscription?.planName || "FeedClass plan";
  const paymentUrl = context.intent?.payment_url || context.intent?.paymentUrl || "";
  const reference = context.intent?.reference ? ` Ref: ${context.intent.reference}.` : "";

  const templates = {
    [TEMPLATE_TYPES.PAYMENT_LINK]: `FeedClass payment link for ${childName}: ${paymentUrl}${context.plan ? ` (${planName})` : ""}`,
    [TEMPLATE_TYPES.PAYMENT_SUCCESS]: `FeedClass payment received for ${childName}.${reference}${context.plan ? ` Plan: ${planName}.` : ""}`,
    [TEMPLATE_TYPES.DAILY_PAYMENT_REMINDER]: `Reminder: payment is still pending for ${childName}. Pay here: ${paymentUrl}${context.plan ? ` (${planName})` : ""}`,
    [TEMPLATE_TYPES.SUBSCRIPTION_ACTIVATED]: `FeedClass subscription is active for ${childName}. ${planName} ends on ${context.subscription?.endDate || "the scheduled date"}.`,
    [TEMPLATE_TYPES.SUBSCRIPTION_EXPIRING_SOON]: `Reminder: ${childName}'s FeedClass subscription ends in ${context.daysLeft || 3} day(s) on ${context.subscription?.endDate}. Renew to avoid interruption.`,
    [TEMPLATE_TYPES.SUBSCRIPTION_EXPIRED]: `FeedClass subscription expired for ${childName} on ${context.subscription?.endDate || "the scheduled date"}. Renew to resume service.`,
    [TEMPLATE_TYPES.MEAL_SERVED]: `FeedClass meal served for ${childName} today.${context.mealType ? ` Meal: ${context.mealType}.` : ""}`,
  };

  return templates[type] || `FeedClass update for ${childName}.`;
}

async function enqueueMessage({
  child,
  guardian,
  messageType,
  payload,
  metadata = {},
  channel = "SMS",
  fallbackChannel = null,
  maxAttempts = 3,
}) {
  if (!guardian?.phone) {
    throw new Error("Guardian phone is required");
  }

  const preferenceCheck = isGuardianMessageEnabled(child, guardian);
  if (!preferenceCheck.allowed) {
    return {
      skipped: true,
      reason: preferenceCheck.reason,
      channel,
    };
  }

  return messageRepository.createOutboxMessage({
    childId: child?.id || null,
    guardianId: guardian?.id || null,
    messageType,
    channel,
    fallbackChannel,
    recipient: guardian.phone,
    payload,
    metadata,
    maxAttempts,
  });
}

async function attemptChannelSend(channel, outbox) {
  if (channel === "SMS") {
    const result = await smsService.sendSms({
      to: outbox.recipient,
      text: outbox.payload,
    });
    return {
      providerChannel: "SMS",
      providerReference: result.providerReference,
      status: result.status,
    };
  }

  throw new Error(`Unsupported message channel: ${channel}`);
}

async function deliverClaimedOutboxMessage(outbox) {
  let primaryError = null;

  try {
    const result = await attemptChannelSend(outbox.channel, outbox);
    await messageRepository.markOutboxSent(
      outbox.id,
      result.providerReference,
      result.providerChannel,
      `${outbox.message_type} sent via ${result.providerChannel} to ${outbox.recipient}`
    );
    return {
      status: "SENT",
      channel: result.providerChannel,
      providerReference: result.providerReference,
    };
  } catch (error) {
    primaryError = error;
  }

  const failureMessage = [primaryError?.message].filter(Boolean).join(" | ");
  const exhausted = outbox.attempts >= outbox.max_attempts;
  const hardFailure = isHardFailure(failureMessage) || exhausted;

  if (hardFailure) {
    await messageRepository.markOutboxFailed(
      outbox.id,
      outbox.channel,
      `${outbox.message_type} permanently failed for ${outbox.recipient}`,
      failureMessage
    );
    return {
      status: "FAILED",
      channel: outbox.channel,
      error: failureMessage,
    };
  }

  const retryDelayMinutes =
    RETRY_DELAYS_MINUTES[Math.min(Math.max(outbox.attempts - 1, 0), RETRY_DELAYS_MINUTES.length - 1)];
  const nextAttemptAt = addMinutes(new Date(), retryDelayMinutes);
  await messageRepository.markOutboxRetry(
    outbox.id,
    outbox.channel,
    `${outbox.message_type} scheduled for retry in ${retryDelayMinutes} minutes`,
    failureMessage,
    nextAttemptAt
  );

  return {
    status: "RETRY",
    channel: outbox.channel,
    error: failureMessage,
    nextAttemptAt: nextAttemptAt.toISOString(),
  };
}

async function processOutboxMessage(outboxId) {
  const claimed = await messageRepository.claimOutboxMessage(outboxId);
  if (!claimed) {
    return null;
  }
  return deliverClaimedOutboxMessage(claimed);
}

async function processDueMessages(limit = 20) {
  const dueMessages = await messageRepository.listDueMessages(limit);
  const results = [];
  for (const outbox of dueMessages) {
    const result = await processOutboxMessage(outbox.id);
    if (result) {
      results.push({ outboxId: outbox.id, ...result });
    }
  }
  return results;
}

async function queuePaymentLinkMessage(actor, intent) {
  const child = getChildById(intent.child_id);
  if (!child) {
    throw new Error("Child not found");
  }

  const guardian = getGuardianByChildId(child.id);
  if (!guardian) {
    throw new Error("Guardian not found");
  }

  const plan = intent.plan_id ? await planRepository.getById(intent.plan_id) : null;
  const outbox = await enqueueMessage({
    child,
    guardian,
    messageType: TEMPLATE_TYPES.PAYMENT_LINK,
    payload: renderTemplate(TEMPLATE_TYPES.PAYMENT_LINK, { child, intent, plan }),
    metadata: {
      intentId: intent.id,
      reference: intent.reference,
      paymentUrl: intent.payment_url,
    },
  });

  if (outbox.skipped) {
    return {
      outbox,
      delivery: {
        status: "SKIPPED",
        reason: outbox.reason,
      },
    };
  }

  const delivery = await processOutboxMessage(outbox.id);

  appendActivityLog(actor.id, {
    entityType: "payment_intent",
    entityId: intent.id,
    action: "payment_link.enqueue",
    detail: `Queued payment link message for ${child.studentId || child.student_id}`,
    before: null,
    after: {
      outboxId: outbox.id,
      deliveryStatus: delivery?.status || "QUEUED",
    },
    metadata: {
      childId: child.id,
      guardianId: guardian.id,
      initialChannel: outbox.channel,
    },
  });

  return {
    outbox,
    delivery,
  };
}

async function queuePaymentSuccessMessage(actor, intent) {
  const child = getChildById(intent.child_id);
  if (!child) {
    throw new Error("Child not found");
  }

  const guardian = getGuardianByChildId(child.id);
  if (!guardian) {
    throw new Error("Guardian not found");
  }

  const plan = intent.plan_id ? await planRepository.getById(intent.plan_id) : null;
  const outbox = await enqueueMessage({
    child,
    guardian,
    messageType: TEMPLATE_TYPES.PAYMENT_SUCCESS,
    payload: renderTemplate(TEMPLATE_TYPES.PAYMENT_SUCCESS, { child, intent, plan }),
    metadata: {
      intentId: intent.id,
      reference: intent.reference,
    },
  });

  if (outbox.skipped) {
    return {
      outbox,
      delivery: {
        status: "SKIPPED",
        reason: outbox.reason,
      },
    };
  }

  const delivery = await processOutboxMessage(outbox.id);

  appendActivityLog(actor.id, {
    entityType: "payment_intent",
    entityId: intent.id,
    action: "payment_success.notify",
    detail: `Queued payment success confirmation for ${child.studentId || child.student_id}`,
    before: null,
    after: {
      outboxId: outbox.id,
      deliveryStatus: delivery?.status || "QUEUED",
    },
    metadata: {
      childId: child.id,
      guardianId: guardian.id,
    },
  });

  return {
    outbox,
    delivery,
  };
}

async function queueSubscriptionActivatedMessage(actor, childId, subscription) {
  const child = getChildById(childId);
  const guardian = getGuardianByChildId(childId);
  if (!child || !guardian || !subscription) {
    return { skipped: true, reason: "Child, guardian, or subscription missing" };
  }

  return enqueueMessage({
    child,
    guardian,
    messageType: TEMPLATE_TYPES.SUBSCRIPTION_ACTIVATED,
    payload: renderTemplate(TEMPLATE_TYPES.SUBSCRIPTION_ACTIVATED, {
      child,
      subscription,
      plan: subscription.planName ? { name: subscription.planName } : null,
    }),
    metadata: {
      childId,
      planId: subscription.planId || null,
      endDate: subscription.endDate || null,
    },
  });
}

async function queueSubscriptionExpiredMessage(actor, childId, subscription) {
  const child = getChildById(childId);
  const guardian = getGuardianByChildId(childId);
  if (!child || !guardian) {
    return { skipped: true, reason: "Child or guardian missing" };
  }

  return enqueueMessage({
    child,
    guardian,
    messageType: TEMPLATE_TYPES.SUBSCRIPTION_EXPIRED,
    payload: renderTemplate(TEMPLATE_TYPES.SUBSCRIPTION_EXPIRED, {
      child,
      subscription,
    }),
    metadata: {
      childId,
      endDate: subscription?.endDate || null,
    },
  });
}

async function queueMealServedMessage(actor, childId, details = {}) {
  const child = getChildById(childId);
  const guardian = getGuardianByChildId(childId);
  if (!child || !guardian) {
    return { skipped: true, reason: "Child or guardian missing" };
  }

  return enqueueMessage({
    child,
    guardian,
    messageType: TEMPLATE_TYPES.MEAL_SERVED,
    payload: renderTemplate(TEMPLATE_TYPES.MEAL_SERVED, {
      child,
      mealType: details.mealType || details.meal_type || null,
    }),
    metadata: {
      childId,
      mealType: details.mealType || details.meal_type || null,
      servedAt: details.servedAt || new Date().toISOString(),
    },
  });
}

async function enqueueDailyPaymentReminders(actor) {
  const pendingIntents = await paymentIntentRepository.listPendingReminderCandidates();
  const dayString = formatDay(new Date());
  let queuedCount = 0;

  for (const intent of pendingIntents) {
    if (!intent.guardian_phone) {
      continue;
    }

    const alreadyQueued = await messageRepository.hasRecentMessageForIntent(
      TEMPLATE_TYPES.DAILY_PAYMENT_REMINDER,
      intent.id,
      dayString
    );
    if (alreadyQueued) {
      continue;
    }

    const child = getChildById(intent.child_id);
    if (!child) {
      continue;
    }

    const guardian = {
      id: intent.guardian_id,
      childId: intent.child_id,
      phone: intent.guardian_phone,
      name: intent.guardian_name,
      notificationsOptOut: intent.notifications_opt_out === 1 || intent.notifications_opt_out === true,
    };
    const plan = intent.plan_id ? await planRepository.getById(intent.plan_id) : null;

    const outbox = await enqueueMessage({
      child,
      guardian,
      messageType: TEMPLATE_TYPES.DAILY_PAYMENT_REMINDER,
      payload: renderTemplate(TEMPLATE_TYPES.DAILY_PAYMENT_REMINDER, { child, intent, plan }),
      metadata: {
        intentId: intent.id,
        reference: intent.reference,
        reminderDate: dayString,
      },
    });
    if (!outbox.skipped) {
      queuedCount += 1;
    }
  }

  if (queuedCount > 0) {
    appendActivityLog(actor.id, {
      entityType: "message_outbox",
      entityId: null,
      action: "messages.daily_reminders.enqueue",
      detail: `Queued ${queuedCount} daily payment reminder message(s)`,
      before: null,
      after: { queuedCount },
      metadata: { day: dayString },
    });
  }

  return { queuedCount };
}

async function enqueueSubscriptionExpiryReminders(actor, options = {}) {
  const daysAhead = Number(options.daysAhead || options.days_ahead || 3);
  const asOfDate = options.asOfDate || options.as_of_date || new Date();
  const subscriptions = await childSubscriptionRepository.listExpiringSubscriptions(asOfDate, daysAhead);
  const dayString = formatDay(asOfDate);
  let queuedCount = 0;
  let skippedCount = 0;

  for (const row of subscriptions) {
    const child = getChildById(row.child_id);
    const guardian = row.guardian_id
      ? {
          id: row.guardian_id,
          childId: row.child_id,
          name: row.guardian_name,
          phone: row.guardian_phone,
          notificationsOptOut: row.notifications_opt_out === 1 || row.notifications_opt_out === true,
        }
      : getGuardianByChildId(row.child_id);

    if (!child || !guardian) {
      skippedCount += 1;
      continue;
    }

    const alreadyQueued = await messageRepository.hasRecentMessageForChild(
      TEMPLATE_TYPES.SUBSCRIPTION_EXPIRING_SOON,
      row.child_id,
      dayString
    );
    if (alreadyQueued) {
      skippedCount += 1;
      continue;
    }

    const subscription = {
      childId: row.child_id,
      planId: row.plan_id,
      planName: row.plan_name,
      status: row.status,
      startDate: toMysqlDate(row.start_date),
      endDate: toMysqlDate(row.end_date),
      mealsRemaining: Number(row.meals_remaining || 0),
      mealType: row.meal_type,
    };
    const outbox = await enqueueMessage({
      child,
      guardian,
      messageType: TEMPLATE_TYPES.SUBSCRIPTION_EXPIRING_SOON,
      payload: renderTemplate(TEMPLATE_TYPES.SUBSCRIPTION_EXPIRING_SOON, {
        child,
        subscription,
        plan: row.plan_name ? { name: row.plan_name } : null,
        daysLeft: daysAhead,
      }),
      metadata: {
        childId: row.child_id,
        planId: row.plan_id,
        reminderDate: dayString,
        daysLeft: daysAhead,
      },
    });

    if (outbox.skipped) {
      skippedCount += 1;
      continue;
    }

    queuedCount += 1;
  }

  if (queuedCount > 0) {
    appendActivityLog(actor.id, {
      entityType: "message_outbox",
      entityId: null,
      action: "subscriptions.expiry_reminders.enqueue",
      detail: `Queued ${queuedCount} subscription expiry reminder(s)`,
      before: null,
      after: { queuedCount, skippedCount },
      metadata: {
        day: dayString,
        daysAhead,
      },
    });
  }

  return { queuedCount, skippedCount, daysAhead };
}

async function getMessagesHealth() {
  const summary = await messageRepository.getMessageHealthSummary();
  return {
    queue: summary.outbox,
    recentLogs: summary.recentLogs,
    dueNow: summary.dueNow,
    providers: {
      sms: {
        provider: smsService.getSmsProvider(),
        configured: smsService.isSmsConfigured(),
      },
    },
  };
}

module.exports = {
  getPaymentBaseUrl,
  ensureMessagingPreferenceSchema,
  TEMPLATE_TYPES,
  processOutboxMessage,
  processDueMessages,
  queuePaymentLinkMessage,
  queuePaymentSuccessMessage,
  queueSubscriptionActivatedMessage,
  queueSubscriptionExpiredMessage,
  queueMealServedMessage,
  enqueueDailyPaymentReminders,
  enqueueSubscriptionExpiryReminders,
  getMessagesHealth,
};
