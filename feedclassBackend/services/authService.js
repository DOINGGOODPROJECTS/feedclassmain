const crypto = require("crypto");
const { signJwt, verifyJwt } = require("../lib/jwt");
const { getState, getRolePermissions, getUserByEmail, getUserById, getUserRole, sanitizeUser } = require("../lib/state");
const { hashPassword, hashToken, randomToken, safeEqual } = require("../lib/security");

const ACCESS_TOKEN_TTL_SECONDS = Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900);
const REFRESH_TOKEN_TTL_SECONDS = Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 60 * 60 * 24 * 30);
const JWT_SECRET = process.env.JWT_SECRET || "feedclass-dev-secret";

function createAccessToken(user) {
  const role = getUserRole(user.id);
  return signJwt(
    {
      sub: user.id,
      role,
      permissions: getRolePermissions(role),
      assignedSchoolId: user.assignedSchoolId,
      email: user.email,
    },
    {
      secret: JWT_SECRET,
      expiresInSeconds: ACCESS_TOKEN_TTL_SECONDS,
      jwtId: randomToken(10),
    }
  );
}

function createSession(user, reqMeta = {}) {
  const refreshToken = randomToken(32);
  const refreshTokenHash = hashToken(refreshToken);
  const session = {
    id: crypto.randomUUID(),
    userId: user.id,
    refreshTokenHash,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    revokedAt: null,
    lastRotatedAt: null,
    userAgent: reqMeta.userAgent || "unknown",
    ipAddress: reqMeta.ipAddress || "unknown",
  };
  getState().sessions.push(session);
  return { session, refreshToken, accessToken: createAccessToken(user) };
}

function logLoginAttempt({ user, email, success, reqMeta, reason = null }) {
  getState().loginLogs.push({
    id: crypto.randomUUID(),
    userId: user?.id || null,
    email: email || null,
    success,
    reason,
    ipAddress: reqMeta.ipAddress || "unknown",
    userAgent: reqMeta.userAgent || "unknown",
    createdAt: new Date().toISOString(),
  });
}

function authenticateUser(email, password, reqMeta) {
  const user = getUserByEmail(email);
  if (!user || !user.active || !safeEqual(user.passwordHash, hashPassword(password))) {
    logLoginAttempt({
      user,
      email,
      success: false,
      reqMeta,
      reason: user && !user.active ? "inactive_user" : "invalid_credentials",
    });
    return null;
  }

  logLoginAttempt({ user, email, success: true, reqMeta });
  return {
    ...createSession(user, reqMeta),
    user: sanitizeUser(user),
  };
}

function rotateRefreshToken(refreshToken, reqMeta) {
  const refreshTokenHash = hashToken(refreshToken);
  const session = getState().sessions.find((entry) => entry.revokedAt === null && entry.refreshTokenHash === refreshTokenHash);
  if (!session) {
    return null;
  }

  if (new Date(session.expiresAt).getTime() <= Date.now()) {
    session.revokedAt = new Date().toISOString();
    return null;
  }

  const user = getUserById(session.userId);
  if (!user || !user.active) {
    session.revokedAt = new Date().toISOString();
    return null;
  }

  const nextRefreshToken = randomToken(32);
  session.refreshTokenHash = hashToken(nextRefreshToken);
  session.lastRotatedAt = new Date().toISOString();
  session.userAgent = reqMeta.userAgent || session.userAgent;
  session.ipAddress = reqMeta.ipAddress || session.ipAddress;

  return {
    accessToken: createAccessToken(user),
    refreshToken: nextRefreshToken,
    user: sanitizeUser(user),
  };
}

function authenticateAccessToken(token) {
  const payload = verifyJwt(token, JWT_SECRET);
  const user = getUserById(payload.sub);
  if (!user || !user.active) {
    throw new Error("User not available");
  }
  return {
    ...payload,
    user: sanitizeUser(user),
  };
}

module.exports = {
  authenticateUser,
  rotateRefreshToken,
  authenticateAccessToken,
};
