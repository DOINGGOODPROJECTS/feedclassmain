const crypto = require("crypto");

function hashPassword(password) {
  return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
}

module.exports = {
  hashPassword,
  hashToken,
  randomToken,
  safeEqual,
};
