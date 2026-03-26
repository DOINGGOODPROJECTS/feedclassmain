const mysql = require("mysql2/promise");
const { loadEnv } = require("../config/env");

loadEnv();

let pool;

function getDbConfig() {
  return {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "feedclass",
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    queueLimit: 0,
  };
}

function getPool() {
  if (!pool) {
    pool = mysql.createPool(getDbConfig());
  }

  return pool;
}

module.exports = { getDbConfig, getPool };
