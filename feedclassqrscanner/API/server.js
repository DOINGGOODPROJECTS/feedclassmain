const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const mysql = require("mysql2/promise");

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;

const dummyBadges = [
  {
    id: 1,
    qrCode: "BADGE-ALPHA-001",
    name: "Ada Lovelace",
    status: "active",
    role: "Speaker",
  },
  {
    id: 2,
    qrCode: "BADGE-BETA-014",
    name: "Grace Hopper",
    status: "active",
    role: "VIP",
  },
  {
    id: 3,
    qrCode: "BADGE-GAMMA-207",
    name: "Katherine Johnson",
    status: "revoked",
    role: "Guest",
  },
];

let pool = null;

async function initDb() {
  if (!process.env.MYSQL_HOST) {
    return;
  }

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
    port: process.env.MYSQL_PORT ? Number(process.env.MYSQL_PORT) : 3306,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });

  await pool.query("SELECT 1");
  console.log("Connected to MySQL");
}

function findDummyBadge(qrCode) {
  return dummyBadges.find((badge) => badge.qrCode === qrCode) || null;
}

async function findBadge(qrCode) {
  if (!pool) {
    return { badge: findDummyBadge(qrCode), source: "dummy" };
  }

  const [rows] = await pool.query(
    "SELECT id, qr_code AS qrCode, name, status, role FROM badges WHERE qr_code = ? LIMIT 1",
    [qrCode]
  );

  if (!rows || rows.length === 0) {
    return { badge: null, source: "mysql" };
  }

  return { badge: rows[0], source: "mysql" };
}

function createApp() {
  const app = express();

  app.use(cors({
    origin: process.env.CORS_ORIGIN || "*",
  }));
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.get("/api/badges", (_req, res) => {
    res.json({ badges: dummyBadges, source: pool ? "mysql" : "dummy" });
  });

  app.post("/api/scan", async (req, res) => {
    const { qrCode } = req.body || {};

    if (!qrCode || typeof qrCode !== "string") {
      res.status(400).json({ error: "qrCode is required" });
      return;
    }

    try {
      const { badge, source } = await findBadge(qrCode.trim());
      if (!badge) {
        res.status(404).json({
          found: false,
          message: "Badge not found",
          source,
        });
        return;
      }

      res.json({
        found: true,
        badge,
        source,
        scannedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Scan error:", error);
      res.status(500).json({ error: "Failed to scan badge" });
    }
  });

  return app;
}

async function startServer() {
  try {
    await initDb();
  } catch (error) {
    console.error("MySQL connection failed. Falling back to dummy data.");
    console.error(error.message || error);
    pool = null;
  }

  const app = createApp();
  app.listen(PORT, () => {
    console.log(`QR badge API running on port ${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer };
