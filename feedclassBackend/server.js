const express = require("express");
const cors = require("cors");
const { loadEnv } = require("./config/env");
const { getDbConfig, getPool } = require("./db/pool");
const { BlockchainService } = require("./services/blockchainService");
const mealBatchAnchorRepository = require("./repositories/mealBatchAnchorRepository");
const mealServeProofRepository = require("./repositories/mealServeProofRepository");
const childEnrollmentRepository = require("./repositories/childEnrollmentRepository");
const schoolRepository = require("./repositories/schoolRepository");
const classRepository = require("./repositories/classRepository");
const childReadRepository = require("./repositories/childReadRepository");
const planRepository = require("./repositories/planRepository");
const messageRepository = require("./repositories/messageRepository");
const ledgerRepository = require("./repositories/ledgerRepository");
const { createRateLimiter } = require("./lib/rateLimit");
const { getState, syncStateFromDatabase } = require("./lib/state");
const { authenticateUser, rotateRefreshToken } = require("./services/authService");
const { listUsers, createUser, updateUser, assignSchool, deleteUser } = require("./services/userService");
const { listSchools, createSchool, updateSchool } = require("./services/schoolService");
const { listClasses, listClassesForSchool, createClass, updateClass } = require("./services/classService");
const { listChildren, createChild, updateChild, deleteChild } = require("./services/childService");
const { ensureAllChildQrRecords, getChildQr } = require("./services/qrService");
const { resolveBadge, recordMealScan } = require("./services/scannerService");
const { importChildrenFromCsv, getChildImportReport } = require("./services/childImportService");
const { listActivityLogs } = require("./services/auditService");
const { getDashboardSnapshot, getSchoolDashboardSnapshot, getDonorDashboardSnapshot } = require("./services/dashboardService");
const { getMealForecast, getAiAlerts, getWeeklyExecutiveReport } = require("./services/aiService");
const { sanitizePlan, buildCreatePlan, buildUpdatePlan, buildDeletePlan, ensureDefaultPlans } = require("./services/planService");
const {
  listPaymentIntents,
  createPaymentIntent,
  sendPaymentLink,
  getPublicPaymentIntentDetails,
  markPaymentIntentPaid,
} = require("./services/paymentService");
const {
  processDueMessages,
  enqueueDailyPaymentReminders,
  enqueueSubscriptionExpiryReminders,
  getMessagesHealth,
  ensureMessagingPreferenceSchema,
} = require("./services/messagingService");
const {
  getMessagingSettings,
  updateMessagingSettings,
  shouldRunReminderCycle,
  markReminderCycleRun,
} = require("./services/messagingSettingsService");
const { ensureIdentityAccessRegistry } = require("./services/identityBootstrapService");
const { listLedgerTransactions } = require("./services/ledgerService");
const {
  listSuppliers,
  upsertSupplier,
  listInvoices,
  createInvoice,
  payInvoice,
  getCostPerMeal,
} = require("./services/supplierService");
const {
  getChildSubscription,
  renewChildSubscription,
  manuallyAttachSubscription,
  cancelChildSubscription,
  expireSubscriptions,
  resetChildMealServiceForTest,
} = require("./services/childSubscriptionService");
const { requireAuth, requireScannerAuth, requirePermission } = require("./middleware/auth");
const { persistBatchProofs, getMealVerification } = require("./services/mealProofService");
const { anchorDailyMealBatch } = require("./services/mealBatchAnchorService");

loadEnv();

const app = express();
const PORT = process.env.PORT || 5000;
const blockchainService = new BlockchainService();
const authRateLimiter = createRateLimiter({
  windowMs: Number(process.env.AUTH_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  maxAttempts: Number(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS || 10),
});

ensureAllChildQrRecords();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

function getRequestMeta(req) {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || "unknown",
    userAgent: req.headers["user-agent"] || "unknown",
  };
}

function applyAuthRateLimit(req, res, key) {
  const result = authRateLimiter.check(key);
  if (!result.allowed) {
    res.setHeader("Retry-After", Math.ceil((result.resetAt - Date.now()) / 1000));
    res.status(429).json({ message: "Too many authentication attempts. Try again later." });
    return false;
  }
  return true;
}

function rollbackCreatedChildState(childId) {
  const state = getState();
  state.children = state.children.filter((entry) => entry.id !== childId);
  state.guardians = state.guardians.filter((entry) => entry.childId !== childId);
  state.childQr = state.childQr.filter((entry) => entry.childId !== childId);
  state.enrollmentHistory = state.enrollmentHistory.filter((entry) => entry.childId !== childId);
}

function scheduleDailySubscriptionExpiryJob() {
  const runJob = async () => {
    const adminUser = getState().users.find((entry) => entry.email === "admin@feedclass.test");
    if (!adminUser) {
      return;
    }

    try {
      const result = await expireSubscriptions(adminUser, { asOfDate: new Date() });
      if (result.expiredCount > 0) {
        console.log(`Expired ${result.expiredCount} subscriptions`);
      }
    } catch (error) {
      console.error("Subscription expiry job failed:", error.message);
    }
  };

  void runJob();
  setInterval(() => {
    void runJob();
  }, 24 * 60 * 60 * 1000);
}

function scheduleMessageWorker() {
  const runJob = async () => {
    try {
      const results = await processDueMessages(10);
      if (results.length > 0) {
        const counts = results.reduce((accumulator, result) => {
          const key = result.status || "UNKNOWN";
          accumulator[key] = (accumulator[key] || 0) + 1;
          return accumulator;
        }, {});
        console.log(
          `Processed ${results.length} queued message(s): ${Object.entries(counts)
            .map(([status, total]) => `${status}=${total}`)
            .join(", ")}`
        );
      }
    } catch (error) {
      console.error("Message worker failed:", error.message);
    }
  };

  void runJob();
  setInterval(() => {
    void runJob();
  }, 60 * 1000);
}

function scheduleReminderJob() {
  const runJob = async () => {
    const adminUser = getState().users.find((entry) => entry.email === "admin@feedclass.test");
    if (!adminUser) {
      return;
    }

    try {
      const settings = await getMessagingSettings();
      if (!shouldRunReminderCycle(settings, new Date())) {
        return;
      }

      const paymentResult = await enqueueDailyPaymentReminders(adminUser);
      if (paymentResult.queuedCount > 0) {
        console.log(`Queued ${paymentResult.queuedCount} ${settings.schedule.toLowerCase()} payment reminder(s)`);
      }
      const expiryResult = await enqueueSubscriptionExpiryReminders(adminUser, { daysAhead: 3 });
      if (expiryResult.queuedCount > 0) {
        console.log(`Queued ${expiryResult.queuedCount} subscription expiry reminder(s)`);
      }
      await markReminderCycleRun(new Date());
      await processDueMessages(25);
    } catch (error) {
      console.error("Payment reminder job failed:", error.message);
    }
  };

  setInterval(() => {
    void runJob();
  }, 60 * 60 * 1000);
}

app.get("/health", async (_req, res) => {
  const dbConfig = getDbConfig();

  try {
    await getPool().query("SELECT 1 AS ok");

    return res.status(200).json({
      status: "ok",
      database: {
        connected: true,
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "degraded",
      database: {
        connected: false,
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
        error: error.message,
      },
    });
  }
});

app.get("/api", (_req, res) => {
  res.status(200).json({
    name: "FeedClass Backend API",
    status: "ok",
    routes: {
      health: "/health",
      apiHealth: "/api/health",
      login: "/auth/login",
      refresh: "/auth/refresh",
      apiLogin: "/api/auth/login",
      apiRefresh: "/api/auth/refresh",
      me: "/me",
      schools: "/schools",
      classes: "/classes",
      children: "/children",
    },
  });
});

app.get("/api/health", async (_req, res) => {
  const dbConfig = getDbConfig();

  try {
    await getPool().query("SELECT 1 AS ok");

    return res.status(200).json({
      status: "ok",
      database: {
        connected: true,
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
      },
    });
  } catch (error) {
    return res.status(503).json({
      status: "degraded",
      database: {
        connected: false,
        host: dbConfig.host,
        port: dbConfig.port,
        name: dbConfig.database,
        error: error.message,
      },
    });
  }
});

app.get("/health/blockchain", async (_req, res) => {
  const status = blockchainService.getStatus();

  if (!status.valid) {
    return res.status(503).json({
      status: "degraded",
      network: status.config.network,
      missing: status.missing,
    });
  }

  try {
    const provider = blockchainService.getProvider();
    const blockNumber = await provider.getBlockNumber();

    return res.status(200).json({
      status: "ok",
      network: status.config.network,
      contractAddress: status.config.contractAddress,
      blockNumber,
    });
  } catch (error) {
    return res.status(503).json({
      status: "degraded",
      network: status.config.network,
      contractAddress: status.config.contractAddress,
      message: error.message,
    });
  }
});

function loginHandler(req, res) {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: "Email and password are required." });
  }

  const rateLimitKey = `login:${getRequestMeta(req).ipAddress}:${String(email).trim().toLowerCase()}`;
  if (!applyAuthRateLimit(req, res, rateLimitKey)) {
    return undefined;
  }

  const result = authenticateUser(String(email), String(password), getRequestMeta(req));
  if (!result) {
    return res.status(401).json({ message: "Invalid email or password." });
  }

  return res.status(200).json({
    message: "Login successful.",
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    user: result.user,
  });
}

function refreshHandler(req, res) {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: "refreshToken is required." });
  }

  const rateLimitKey = `refresh:${getRequestMeta(req).ipAddress}`;
  if (!applyAuthRateLimit(req, res, rateLimitKey)) {
    return undefined;
  }

  const rotated = rotateRefreshToken(String(refreshToken), getRequestMeta(req));
  if (!rotated) {
    return res.status(401).json({ message: "Invalid or expired refresh token." });
  }

  return res.status(200).json({
    message: "Token refreshed.",
    accessToken: rotated.accessToken,
    refreshToken: rotated.refreshToken,
    expiresIn: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    user: rotated.user,
  });
}

app.post("/auth/login", loginHandler);
app.post("/auth/refresh", refreshHandler);
app.post("/api/auth/login", loginHandler);
app.post("/api/auth/refresh", refreshHandler);

app.get("/me", requireAuth, (req, res) => {
  res.status(200).json({
    user: req.auth.user,
    permissions: req.auth.permissions,
  });
});

app.get("/dashboard/kpis", requireAuth, async (_req, res) => {
  try {
    const dashboard = await getDashboardSnapshot();
    return res.status(200).json(dashboard);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load dashboard.", error: error.message });
  }
});

app.get("/dash/school", requireAuth, async (req, res) => {
  try {
    const dashboard = await getSchoolDashboardSnapshot({
      schoolId: typeof req.query.school_id === "string" ? req.query.school_id : undefined,
      role: req.auth.role,
      assignedSchoolId: req.auth.assignedSchoolId,
      asOfDate: typeof req.query.as_of_date === "string" ? req.query.as_of_date : undefined,
    });
    return res.status(200).json({ dashboard });
  } catch (error) {
    if (error.message === "school_id is required" || error.message === "Invalid as_of_date") {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load school dashboard.", error: error.message });
  }
});

app.get("/dash/donor", requireAuth, requirePermission("aggregate:read"), async (_req, res) => {
  try {
    const dashboard = await getDonorDashboardSnapshot();
    return res.status(200).json({ dashboard });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load donor dashboard.", error: error.message });
  }
});

app.get("/ai/forecast", requireAuth, async (req, res) => {
  try {
    const forecast = await getMealForecast(req.auth, typeof req.query.school_id === "string" ? req.query.school_id : undefined);
    return res.status(200).json({ forecast });
  } catch (error) {
    if (error.message === "school_id is required") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load AI forecast.", error: error.message });
  }
});

app.get("/ai/alerts", requireAuth, async (req, res) => {
  try {
    const result = await getAiAlerts(req.auth, typeof req.query.school_id === "string" ? req.query.school_id : undefined);
    return res.status(200).json(result);
  } catch (error) {
    if (error.message === "school_id is required") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load AI alerts.", error: error.message });
  }
});

app.get("/ai/reports/weekly", requireAuth, async (req, res) => {
  try {
    const report = await getWeeklyExecutiveReport(
      req.auth,
      typeof req.query.school_id === "string" ? req.query.school_id : undefined
    );
    return res.status(200).json({ report });
  } catch (error) {
    if (error.message === "school_id is required") {
      return res.status(400).json({ message: error.message });
    }
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load weekly AI report.", error: error.message });
  }
});

app.get("/messages/health", requireAuth, requirePermission("messages:health"), async (_req, res) => {
  try {
    const health = await getMessagesHealth();
    return res.status(200).json(health);
  } catch (error) {
    return res.status(500).json({ message: "Failed to load message health.", error: error.message });
  }
});

app.get("/messaging/settings", requireAuth, requirePermission("messages:health"), async (_req, res) => {
  try {
    const settings = await getMessagingSettings();
    return res.status(200).json({ settings });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load messaging settings.", error: error.message });
  }
});

app.get("/api/messaging/settings", requireAuth, requirePermission("messages:health"), async (_req, res) => {
  try {
    const settings = await getMessagingSettings();
    return res.status(200).json({ settings });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load messaging settings.", error: error.message });
  }
});

async function updateMessagingSettingsHandler(req, res) {
  try {
    const settings = await updateMessagingSettings(req.body);
    return res.status(200).json({ settings });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
}

app.patch("/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);
app.post("/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);
app.put("/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);
app.patch("/api/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);
app.post("/api/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);
app.put("/api/messaging/settings", requireAuth, requirePermission("messages:health"), updateMessagingSettingsHandler);

app.post(
  "/jobs/send-expiry-reminders",
  requireAuth,
  requirePermission("jobs:send-expiry-reminders"),
  async (req, res) => {
    try {
      const result = await enqueueSubscriptionExpiryReminders(req.auth.user, {
        asOfDate: req.body.as_of_date || req.body.asOfDate || new Date(),
        daysAhead: req.body.days_ahead || req.body.daysAhead || 3,
      });
      await processDueMessages(25);
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.get("/audit/activity", requireAuth, requirePermission("audit:read"), (req, res) => {
  try {
    const logs = listActivityLogs({
      actorId: req.query.actor_id,
      entity: req.query.entity,
      dateFrom: req.query.date_from,
      dateTo: req.query.date_to,
    });
    return res.status(200).json({ logs });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/users", requireAuth, requirePermission("users:list"), async (req, res) => {
  try {
    res.status(200).json({
      users: await listUsers(req.auth.user),
      roles: getState().roles,
    });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load users.", error: error.message });
  }
});

app.get("/schools", requireAuth, async (req, res) => {
  try {
    const schools = await schoolRepository.listAll();
    if (req.auth.role === "ADMIN") {
      return res.status(200).json({ schools });
    }

    if ((req.auth.role === "SUPERVISOR" || req.auth.role === "OPERATOR") && req.auth.assignedSchoolId) {
      return res.status(200).json({
        schools: schools.filter((school) => school.id === req.auth.assignedSchoolId),
      });
    }

    if (req.auth.role === "DONOR_READONLY") {
      return res.status(200).json({ schools: [] });
    }

    return res.status(403).json({ message: "Insufficient permissions." });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load schools.", error: error.message });
  }
});

app.get("/classes", requireAuth, requirePermission("classes:list"), async (req, res) => {
  try {
    const classes = await classRepository.listAll({ schoolId: req.query.school_id });
    return res.status(200).json({ classes });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load classes.", error: error.message });
  }
});

app.get("/ledger/transactions", requireAuth, requirePermission("ledger:read"), async (req, res) => {
  try {
    const result = await listLedgerTransactions(req.auth.user, req.query);
    return res.status(200).json(result);
  } catch (error) {
    if (
      error.message === "Invalid ledger transaction type" ||
      error.message === "Invalid date filter" ||
      error.message === "date_from must be before or equal to date_to" ||
      error.message === "Donor access is limited to aggregate ledger data"
    ) {
      return res.status(400).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load ledger transactions.", error: error.message });
  }
});

app.get("/suppliers", requireAuth, requirePermission("suppliers:list"), async (req, res) => {
  try {
    const suppliers = await listSuppliers(req.auth.user);
    return res.status(200).json({ suppliers });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(500).json({ message: "Failed to load suppliers.", error: error.message });
  }
});

app.post("/suppliers", requireAuth, requirePermission("suppliers:create"), async (req, res) => {
  try {
    const supplier = await upsertSupplier(req.auth.user, req.body);
    return res.status(201).json({ supplier });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/suppliers/:id", requireAuth, requirePermission("suppliers:update"), async (req, res) => {
  try {
    const supplier = await upsertSupplier(req.auth.user, { ...req.body, id: req.params.id });
    return res.status(200).json({ supplier });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.get("/invoices", requireAuth, requirePermission("invoices:list"), async (req, res) => {
  try {
    const invoices = await listInvoices(req.auth.user, req.query);
    return res.status(200).json({ invoices });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post("/invoices", requireAuth, requirePermission("invoices:create"), async (req, res) => {
  try {
    const invoice = await createInvoice(req.auth.user, req.body);
    return res.status(201).json({ invoice });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post("/invoices/:id/pay", requireAuth, requirePermission("invoices:pay"), async (req, res) => {
  try {
    const invoice = await payInvoice(req.auth.user, req.params.id, req.body);
    return res.status(200).json({ invoice });
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    if (error.message === "Invoice not found") {
      return res.status(404).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.get("/invoices/cost-per-meal", requireAuth, requirePermission("cost-per-meal:read"), async (req, res) => {
  try {
    const cost = await getCostPerMeal(req.auth.user, req.query);
    return res.status(200).json(cost);
  } catch (error) {
    if (error.message === "Insufficient permissions.") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.get("/plans", requireAuth, requirePermission("plans:list"), async (_req, res) => {
  try {
    const plans = await ensureDefaultPlans(planRepository);
    return res.status(200).json({ plans: plans.map(sanitizePlan) });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load plans.", error: error.message });
  }
});

app.get("/payment-intents", requireAuth, requirePermission("payments:read"), async (req, res) => {
  try {
    const intents = await listPaymentIntents(req.auth.user, { schoolId: req.query.school_id });
    return res.status(200).json({ intents });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/payment-intents", requireAuth, requirePermission("payments:create"), async (req, res) => {
  try {
    const intent = await createPaymentIntent(req.auth.user, req.body);
    return res.status(201).json({ intent });
  } catch (error) {
    if (error.message === "Child not found" || error.message === "Plan not found") {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message === "You can only manage payments for your assigned school" ||
      error.message === "Inactive plans cannot be purchased"
    ) {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post(
  "/payment-intents/:id/send-link",
  requireAuth,
  requirePermission("payments:send-link"),
  async (req, res) => {
    try {
      const result = await sendPaymentLink(req.auth.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message === "Payment intent not found" || error.message === "Child not found" || error.message === "Guardian not found") {
        return res.status(404).json({ message: error.message });
      }
      if (
        error.message.startsWith("Infobip SMS is not configured") ||
        error.message.startsWith("Twilio SMS is not configured")
      ) {
        return res.status(503).json({ message: error.message });
      }
      if (
        error.message === "You can only manage payments for your assigned school"
      ) {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/payment-intents/:id/mark-paid",
  requireAuth,
  requirePermission("payments:update-status"),
  async (req, res) => {
    try {
      const result = await markPaymentIntentPaid(req.auth.user, req.params.id);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message === "Payment intent not found" || error.message === "Child not found" || error.message === "Guardian not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message === "You can only manage payments for your assigned school") {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.get("/public/payment-intents/:id", async (req, res) => {
  try {
    const details = await getPublicPaymentIntentDetails(req.params.id);
    if (!details) {
      return res.status(404).json({ message: "Payment intent not found." });
    }
    return res.status(200).json(details);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.post("/plans", requireAuth, requirePermission("plans:create"), async (req, res) => {
  try {
    const plan = buildCreatePlan(req.auth.user, req.body);
    await planRepository.createPlanRecord(plan);
    return res.status(201).json({ plan: sanitizePlan(plan) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A plan with that name already exists." });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/plans/:id", requireAuth, requirePermission("plans:update"), async (req, res) => {
  try {
    const rows = await planRepository.listAll();
    const existing = rows.find((entry) => entry.id === req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Plan not found." });
    }

    const updated = buildUpdatePlan(req.auth.user, sanitizePlan(existing), req.body);
    await planRepository.updatePlanRecord(updated);
    return res.status(200).json({ plan: sanitizePlan(updated) });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "A plan with that name already exists." });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.delete("/plans/:id", requireAuth, requirePermission("plans:delete"), async (req, res) => {
  try {
    const existing = await planRepository.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Plan not found." });
    }

    buildDeletePlan(req.auth.user, existing);
    const deleted = await planRepository.deletePlanRecord(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Plan not found." });
    }

    return res.status(200).json({ plan: sanitizePlan(existing) });
  } catch (error) {
    const message = String(error.message || "");
    if (
      message.includes("Cannot delete or update a parent row") ||
      message.includes("a foreign key constraint fails")
    ) {
      return res.status(409).json({
        message: "This plan cannot be deleted because it is already linked to subscriptions or payments.",
      });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.delete("/api/plans/:id", requireAuth, requirePermission("plans:delete"), async (req, res) => {
  try {
    const existing = await planRepository.getById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Plan not found." });
    }

    buildDeletePlan(req.auth.user, existing);
    const deleted = await planRepository.deletePlanRecord(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Plan not found." });
    }

    return res.status(200).json({ plan: sanitizePlan(existing) });
  } catch (error) {
    const message = String(error.message || "");
    if (
      message.includes("Cannot delete or update a parent row") ||
      message.includes("a foreign key constraint fails")
    ) {
      return res.status(409).json({
        message: "This plan cannot be deleted because it is already linked to subscriptions or payments.",
      });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post("/schools", requireAuth, requirePermission("schools:create"), async (req, res) => {
  try {
    const school = createSchool(req.auth.user, req.body);
    await schoolRepository.createSchoolRecord(school);
    return res.status(201).json({ school });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/schools/:id", requireAuth, requirePermission("schools:update"), async (req, res) => {
  try {
    const school = updateSchool(req.auth.user, req.params.id, req.body);
    if (!school) {
      return res.status(404).json({ message: "School not found." });
    }
    await schoolRepository.updateSchoolRecord(school);
    return res.status(200).json({ school });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get(
  "/schools/:id/classes",
  requireAuth,
  requirePermission("classes:list"),
  async (req, res) => {
    try {
      const classes = await classRepository.listAll({ schoolId: req.params.id });
      return res.status(200).json({ classes });
    } catch (error) {
      return res.status(500).json({ message: "Failed to load classes.", error: error.message });
    }
  }
);

app.post(
  "/schools/:id/classes",
  requireAuth,
  requirePermission("classes:create"),
  async (req, res) => {
    try {
      const entry = createClass(req.auth.user, req.params.id, req.body);
      await classRepository.createClassRecord(entry);
      return res.status(201).json({ class: entry });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.patch("/classes/:id", requireAuth, requirePermission("classes:update"), async (req, res) => {
  try {
    const entry = updateClass(req.auth.user, req.params.id, req.body);
    if (!entry) {
      return res.status(404).json({ message: "Class not found." });
    }
    await classRepository.updateClassRecord(entry);
    return res.status(200).json({ class: entry });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/children", requireAuth, requirePermission("children:read"), async (req, res) => {
  try {
    const scopedSchoolId =
      req.auth.role === "ADMIN" ? req.query.school_id : req.auth.assignedSchoolId || req.query.school_id;
    const children = await childReadRepository.listChildren({
      schoolId: scopedSchoolId,
      classId: req.query.class_id,
    });
    return res.status(200).json({ children });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load children.", error: error.message });
  }
});

app.get("/meal-serves", requireAuth, requirePermission("children:read"), async (req, res) => {
  try {
    const scopedSchoolId =
      req.auth.role === "ADMIN" ? req.query.school_id : req.auth.assignedSchoolId || req.query.school_id;
    const params = [];
    const filters = [];

    if (scopedSchoolId) {
      filters.push("ms.school_id = ?");
      params.push(scopedSchoolId);
    }
    if (req.query.serve_date) {
      filters.push("ms.serve_date = ?");
      params.push(req.query.serve_date);
    }

    const [rows] = await getPool().execute(
      `SELECT
         ms.id,
         ms.child_id,
         c.full_name AS child_name,
         ms.school_id,
         ms.meal_type,
         ms.serve_date,
         ms.created_at,
         ms.is_grace,
         c.class_id,
         cl.name AS class_name
       FROM meal_serves ms
       INNER JOIN children c ON c.id = ms.child_id
       LEFT JOIN classes cl ON cl.id = c.class_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY ms.created_at DESC`,
      params
    );

    return res.status(200).json({ mealServes: rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load meal history.", error: error.message });
  }
});

app.get("/meal-scans", requireAuth, requirePermission("children:read"), async (req, res) => {
  try {
    const scopedSchoolId =
      req.auth.role === "ADMIN" ? req.query.school_id : req.auth.assignedSchoolId || req.query.school_id;
    const params = [];
    const filters = [];

    if (scopedSchoolId) {
      filters.push("ms.school_id = ?");
      params.push(scopedSchoolId);
    }
    if (req.query.service_date) {
      filters.push("ms.service_date = ?");
      params.push(req.query.service_date);
    }
    if (req.query.outcome) {
      filters.push("ms.outcome = ?");
      params.push(req.query.outcome);
    }

    const [rows] = await getPool().execute(
      `SELECT
         ms.id,
         ms.child_id,
         c.full_name AS child_name,
         ms.school_id,
         ms.class_id,
         cl.name AS class_name,
         ms.qr_payload,
         ms.meal_type,
         ms.service_date,
         ms.served_at,
         ms.outcome,
         ms.reason,
         ms.created_at
       FROM meal_scans ms
       LEFT JOIN children c ON c.id = ms.child_id
       LEFT JOIN classes cl ON cl.id = ms.class_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY ms.served_at DESC, ms.created_at DESC`,
      params
    );

    return res.status(200).json({ mealScans: rows });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load meal scans.", error: error.message });
  }
});

app.post("/children", requireAuth, requirePermission("children:create"), async (req, res) => {
  let child = null;

  try {
    child = createChild(req.auth.user, req.body);
    const guardian = getState().guardians.find((entry) => entry.childId === child.id) || null;
    const qrRecord = getState().childQr.find((entry) => entry.childId === child.id) || null;
    const school = getState().schools.find((entry) => entry.id === child.schoolId) || null;
    const classEntry = getState().classes.find((entry) => entry.id === child.classId) || null;
    const actorUser = getState().users.find((entry) => entry.id === req.auth.user.id) || null;
    const assignedSchool = actorUser?.assignedSchoolId
      ? getState().schools.find((entry) => entry.id === actorUser.assignedSchoolId) || null
      : null;

    if (!guardian || !qrRecord || !school || !classEntry || !actorUser) {
      throw new Error("Failed to build child verification record.");
    }

    await childEnrollmentRepository.persistManualChildEnrollment({
      child: {
        id: child.id,
        schoolId: child.schoolId,
        classId: child.classId,
        studentId: child.studentId,
        fullName: child.fullName,
        profileImageUrl: child.profileImageUrl,
        subscriptionStatus: child.subscriptionStatus,
        gracePeriodEndsAt: child.gracePeriodEndsAt,
        active: child.active,
        createdAt: child.createdAt,
        updatedAt: child.updatedAt,
      },
      guardian,
      qrRecord,
      actorUser,
      school,
      classEntry,
      assignedSchool,
    });

    return res.status(201).json({ child });
  } catch (error) {
    if (child?.id) {
      rollbackCreatedChildState(child.id);
    }

    if (error.message === "School not found" || error.message === "Class not found") {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message === "You can only manage children for your assigned school" ||
      error.message === "Class does not belong to the selected school"
    ) {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Child already exists in the database." });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/children/:id", requireAuth, requirePermission("children:create"), async (req, res) => {
  try {
    const child = updateChild(req.auth.user, req.params.id, req.body);
    if (!child) {
      return res.status(404).json({ message: "Child not found." });
    }

    const guardian = getState().guardians.find((entry) => entry.childId === child.id) || null;
    const qrRecord = getState().childQr.find((entry) => entry.childId === child.id) || null;

    if (!qrRecord) {
      throw new Error("Failed to refresh child verification record.");
    }

    await childEnrollmentRepository.persistChildProfileUpdate({
      child: {
        id: child.id,
        schoolId: child.schoolId,
        classId: child.classId,
        studentId: child.studentId,
        fullName: child.fullName,
        profileImageUrl: child.profileImageUrl,
        subscriptionStatus: child.subscriptionStatus,
        gracePeriodEndsAt: child.gracePeriodEndsAt,
        active: child.active,
        updatedAt: child.updatedAt,
      },
      guardian,
      qrRecord,
    });

    return res.status(200).json({ child, childQr: qrRecord });
  } catch (error) {
    if (error.message === "School not found" || error.message === "Class not found") {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message === "You can only manage children for your assigned school" ||
      error.message === "Class does not belong to the selected school"
    ) {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({ message: "Child update conflicts with an existing database record." });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.delete("/children/:id", requireAuth, requirePermission("children:create"), async (req, res) => {
  try {
    const deletedChild = deleteChild(req.auth.user, req.params.id);
    if (!deletedChild) {
      return res.status(404).json({ message: "Child not found." });
    }

    await childEnrollmentRepository.deleteChildRecord(req.params.id);
    return res.status(200).json({ child: deletedChild });
  } catch (error) {
    if (error.message === "You can only manage children for your assigned school") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.get("/children/:id/qr", requireAuth, requirePermission("children:read"), async (req, res) => {
  try {
    const childQr = await childReadRepository.getChildQr(req.params.id);
    if (!childQr) {
      return res.status(404).json({ message: "Child not found" });
    }

    if (
      (req.auth.role === "SUPERVISOR" || req.auth.role === "OPERATOR") &&
      req.auth.assignedSchoolId &&
      req.auth.assignedSchoolId !== childQr.school_id
    ) {
      return res.status(403).json({ message: "You can only access QR data for children in your assigned school" });
    }

    return res.status(200).json({
      childQr: {
        childId: childQr.child_id,
        qrPayload: childQr.qr_payload,
        qrImageUrl: childQr.qr_image_url,
        verificationLink: childQr.verification_link || childQr.qr_payload,
        createdAt: childQr.created_at,
      },
    });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get("/children/:id/subscription", requireAuth, requirePermission("subscriptions:read"), async (req, res) => {
  try {
    const subscription = await getChildSubscription(req.auth.user, req.params.id, {
      asOfDate: req.query.as_of_date,
    });
    return res.status(200).json({ subscription });
  } catch (error) {
    if (error.message === "Child not found") {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === "You can only manage subscriptions for your assigned school") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post(
  "/children/:id/subscription/renew",
  requireAuth,
  requirePermission("subscriptions:write"),
  async (req, res) => {
    try {
      const subscription = await renewChildSubscription(req.auth.user, req.params.id, req.body);
      return res.status(201).json({ subscription });
    } catch (error) {
      if (error.message === "Child not found" || error.message === "Plan not found") {
        return res.status(404).json({ message: error.message });
      }
      if (
        error.message === "You can only manage subscriptions for your assigned school" ||
        error.message === "Inactive plans cannot be purchased"
      ) {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

async function manualAttachSubscriptionHandler(req, res) {
  try {
    const subscription = await manuallyAttachSubscription(req.auth.user, req.params.id, req.body);
    return res.status(201).json({ subscription });
  } catch (error) {
    if (error.message === "Child not found" || error.message === "Plan not found") {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.message === "Only platform admin can manually attach subscriptions" ||
      error.message === "You can only manage subscriptions for your assigned school" ||
      error.message === "Inactive plans cannot be purchased"
    ) {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
}

app.post(
  "/children/:id/subscription/manual",
  requireAuth,
  requirePermission("subscriptions:write"),
  manualAttachSubscriptionHandler
);
app.post(
  "/api/children/:id/subscription/manual",
  requireAuth,
  requirePermission("subscriptions:write"),
  manualAttachSubscriptionHandler
);

app.post(
  "/children/:id/subscription/cancel",
  requireAuth,
  requirePermission("subscriptions:write"),
  async (req, res) => {
    try {
      const subscription = await cancelChildSubscription(req.auth.user, req.params.id, req.body);
      return res.status(200).json({ subscription });
    } catch (error) {
      if (error.message === "Child not found" || error.message === "Subscription not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message === "You can only manage subscriptions for your assigned school") {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/children/:id/meal-service/reset-today",
  requireAuth,
  requirePermission("subscriptions:write"),
  async (req, res) => {
    try {
      const result = await resetChildMealServiceForTest(req.auth.user, req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message === "Child not found" || error.message === "Subscription not found") {
        return res.status(404).json({ message: error.message });
      }
      if (
        error.message === "You can only manage subscriptions for your assigned school" ||
        error.message === "Only platform admin can manually attach subscriptions"
      ) {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/api/children/:id/meal-service/reset-today",
  requireAuth,
  requirePermission("subscriptions:write"),
  async (req, res) => {
    try {
      const result = await resetChildMealServiceForTest(req.auth.user, req.params.id, req.body);
      return res.status(200).json(result);
    } catch (error) {
      if (error.message === "Child not found" || error.message === "Subscription not found") {
        return res.status(404).json({ message: error.message });
      }
      if (
        error.message === "You can only manage subscriptions for your assigned school" ||
        error.message === "Only platform admin can manually attach subscriptions"
      ) {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/api/children/:id/subscription/cancel",
  requireAuth,
  requirePermission("subscriptions:write"),
  async (req, res) => {
    try {
      const subscription = await cancelChildSubscription(req.auth.user, req.params.id, req.body);
      return res.status(200).json({ subscription });
    } catch (error) {
      if (error.message === "Child not found" || error.message === "Subscription not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error.message === "You can only manage subscriptions for your assigned school") {
        return res.status(403).json({ message: error.message });
      }
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post(
  "/jobs/expire-subscriptions",
  requireAuth,
  requirePermission("jobs:expire-subscriptions"),
  async (req, res) => {
    try {
      const result = await expireSubscriptions(req.auth.user, { asOfDate: req.body.as_of_date || req.body.asOfDate });
      return res.status(200).json(result);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.post("/children/import", requireAuth, requirePermission("children:import"), (req, res) => {
  try {
    if (!req.body.csvContent) {
      return res.status(400).json({ message: "csvContent is required." });
    }
    const report = importChildrenFromCsv(req.auth.user, req.body.csvContent);
    return res.status(201).json({ report });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.get(
  "/children/import/:id/report",
  requireAuth,
  requirePermission("children:import-report"),
  (req, res) => {
    const report = getChildImportReport(req.params.id);
    if (!report) {
      return res.status(404).json({ message: "Import report not found." });
    }
    return res.status(200).json({ report });
  }
);

app.post("/scanner/resolve-badge", requireScannerAuth, requirePermission("children:read"), async (req, res) => {
  try {
    if (!req.body.qrPayload) {
      return res.status(400).json({ message: "qrPayload is required." });
    }
    const result = await resolveBadge(req.auth, req.body.qrPayload);
    return res.status(200).json(result);
  } catch (error) {
    if (error.message === "Child not found") {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === "You can only scan children in your assigned school") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post("/scanner/meal-scans", requireScannerAuth, requirePermission("children:read"), async (req, res) => {
  try {
    if (!req.body.qrPayload && !req.body.childId) {
      return res.status(400).json({ message: "qrPayload or childId is required." });
    }
    const result = await recordMealScan(req.auth, req.body);
    return res.status(201).json({
      ...result,
    });
  } catch (error) {
    if (error.message === "Child not found") {
      return res.status(404).json({ message: error.message });
    }
    if (error.message === "You can only scan children in your assigned school") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post("/users", requireAuth, requirePermission("users:create"), async (req, res) => {
  try {
    const user = await createUser(req.auth.user, req.body);
    return res.status(201).json({ user });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.patch("/users/:id", requireAuth, requirePermission("users:update"), async (req, res) => {
  try {
    const user = await updateUser(req.auth.user, req.params.id, req.body);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ user });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
});

app.patch(
  "/users/:id/assign-school",
  requireAuth,
  requirePermission("users:assign-school"),
  async (req, res) => {
    try {
      if (!req.body.schoolId) {
        return res.status(400).json({ message: "schoolId is required." });
      }
      const user = await assignSchool(req.auth.user, req.params.id, req.body.schoolId);
      if (!user) {
        return res.status(404).json({ message: "User not found." });
      }
      return res.status(200).json({ user });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
);

app.delete("/users/:id", requireAuth, requirePermission("users:delete"), async (req, res) => {
  try {
    const user = await deleteUser(req.auth.user, req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ user });
  } catch (error) {
    if (error.message === "Only admin can delete users") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.delete("/api/users/:id", requireAuth, requirePermission("users:delete"), async (req, res) => {
  try {
    const user = await deleteUser(req.auth.user, req.params.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({ user });
  } catch (error) {
    if (error.message === "Only admin can delete users") {
      return res.status(403).json({ message: error.message });
    }
    return res.status(400).json({ message: error.message });
  }
});

app.post(
  "/api/blockchain/anchor-daily-batch",
  requireAuth,
  requirePermission("blockchain:write"),
  async (req, res) => {
    try {
      const { schoolId, serveDate, merkleRoot, mealCount, batchVersion = null } = req.body;
      const result = await anchorDailyMealBatch({
        schoolId,
        serveDate,
        merkleRoot,
        mealCount,
        batchVersion,
      });
      return res.status(result.reused ? 200 : 201).json({
        message: result.reused
          ? "Batch already anchored for the current meal batch root."
          : "Daily meal batch anchored successfully.",
        batch: result.batch,
      });
    } catch (error) {
      return res.status(error.statusCode || 500).json({
        message:
          error.message === "Anchor transaction reverted."
            ? error.message
            : error.message === "Blockchain relayer is not configured."
            ? error.message
            : error.message.startsWith("Provided ")
            ? error.message
            : "Failed to anchor daily meal batch.",
        ...(error.details || {}),
        error: error.message,
      });
    }
  }
);

app.get("/blockchain/verify-meal/:id", async (req, res) => {
  try {
    const verification = await getMealVerification(req.params.id);
    return res.status(200).json({ verification });
  } catch (error) {
    if (error.message === "Meal serve not found") {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({
      message: "Failed to verify meal.",
      error: error.message,
    });
  }
});

app.get("/api/blockchain/verify-meal/:id", async (req, res) => {
  try {
    const verification = await getMealVerification(req.params.id);
    return res.status(200).json({ verification });
  } catch (error) {
    if (error.message === "Meal serve not found") {
      return res.status(404).json({ message: error.message });
    }
    return res.status(500).json({
      message: "Failed to verify meal.",
      error: error.message,
    });
  }
});

app.get(
  "/api/blockchain/batches/:id",
  requireAuth,
  requirePermission("blockchain:read"),
  async (req, res) => {
    try {
      const batch = await mealBatchAnchorRepository.findById(req.params.id);

      if (!batch) {
        return res.status(404).json({ message: "Batch not found." });
      }

      return res.status(200).json({ batch });
    } catch (error) {
      return res.status(500).json({
        message: "Failed to load batch.",
        error: error.message,
      });
    }
  }
);

if (require.main === module) {
  ensureIdentityAccessRegistry()
    .then(() => {
      return syncStateFromDatabase();
    })
    .then(() => {
      return messageRepository.ensureMessageSchema();
    })
    .then(() => {
      return ensureMessagingPreferenceSchema();
    })
    .then(() => {
      return mealServeProofRepository.ensureMealServeProofSchema();
    })
    .then(() => {
      return ledgerRepository.ensureLedgerSchemaReady();
    })
    .then(() => {
      return ensureDefaultPlans(planRepository);
    })
    .then(() => {
      ensureAllChildQrRecords();
      scheduleDailySubscriptionExpiryJob();
      scheduleMessageWorker();
      scheduleReminderJob();
      app.listen(PORT, () => {
        console.log(`FeedClass backend running on port ${PORT}`);
      });
    })
    .catch((error) => {
      console.error("Failed to sync runtime state from database:", error.message);
      process.exit(1);
    });
}

module.exports = { app };
