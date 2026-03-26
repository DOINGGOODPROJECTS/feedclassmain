const { authenticateAccessToken } = require("../services/authService");
const { getRolePermissions } = require("../lib/state");

function buildScannerTokenAuth() {
  const scannerActorEmail = String(process.env.SCANNER_API_ACTOR_EMAIL || "admin@feedclass.test").trim();

  return {
    sub: "scanner-api-token",
    role: "OPERATOR",
    permissions: getRolePermissions("OPERATOR"),
    assignedSchoolId: null,
    email: scannerActorEmail,
    user: {
      id: "scanner-api-token",
      name: "FeedClass QR Scanner",
      email: scannerActorEmail,
      active: true,
      assignedSchoolId: null,
    },
  };
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [, token] = authHeader.split(" ");
  if (!token) {
    return res.status(401).json({ message: "Authorization bearer token is required." });
  }

  try {
    const auth = authenticateAccessToken(token);
    req.auth = auth;
    return next();
  } catch (error) {
    return res.status(401).json({ message: error.message });
  }
}

function requireScannerAuth(req, res, next) {
  const scannerToken = String(process.env.SCANNER_API_TOKEN || "").trim();
  const headerToken = String(req.headers["x-api-token"] || "").trim();

  if (scannerToken && headerToken && headerToken === scannerToken) {
    req.auth = buildScannerTokenAuth();
    return next();
  }

  return requireAuth(req, res, next);
}

function requirePermission(permission) {
  return (req, res, next) => {
    const permissions = getRolePermissions(req.auth.role);
    if (!permissions.includes(permission)) {
      return res.status(403).json({ message: "Insufficient permissions." });
    }
    return next();
  };
}

module.exports = {
  requireAuth,
  requireScannerAuth,
  requirePermission,
};
