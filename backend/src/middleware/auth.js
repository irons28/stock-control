const { get } = require("../db/connection");
const { verifyAuthToken } = require("../auth/token");

const ROLE_ALIASES = {
  management: "admin",
  purchasing: "office",
  dispatch: "office",
};

function normalizeRole(role) {
  const value = String(role || "").trim().toLowerCase();
  return ROLE_ALIASES[value] || value;
}

function formatRequiredRole(roles) {
  if (roles.length === 1) {
    return roles[0];
  }

  return roles.join(", ");
}

function normalizeDbUser(dbUser) {
  if (!dbUser) {
    return null;
  }

  const role = normalizeRole(dbUser.role);
  const name = String(dbUser.display_name || dbUser.full_name || dbUser.username || "").trim();

  return {
    ...dbUser,
    id: dbUser.id,
    username: String(dbUser.username || "").trim(),
    name,
    full_name: name,
    display_name: name,
    role,
    active:
      dbUser.active === undefined || dbUser.active === null
        ? String(dbUser.status || "").toLowerCase() === "active"
        : Boolean(dbUser.active),
  };
}

function getBearerToken(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return "";
  }
  return authHeader.slice(7).trim();
}

async function resolveUser(req, res, next) {
  const token = getBearerToken(req);
  const userId = String(req.headers["x-user-id"] || "").trim();
  const userName = String(req.headers["x-user-name"] || "").trim();
  const userRole = normalizeRole(req.headers["x-user-role"]);

  let dbUser = null;
  let tokenPayload = null;

  if (token) {
    try {
      tokenPayload = verifyAuthToken(token);
      dbUser = await get(
        `SELECT * FROM users WHERE id = ? AND COALESCE(active, CASE WHEN status = 'active' THEN 1 ELSE 0 END) = 1`,
        [tokenPayload.sub]
      );
    } catch {
      req.user = null;
      return next();
    }
  }

  if (!dbUser && userId) {
    try {
      dbUser = await get(
        `SELECT * FROM users WHERE id = ? AND COALESCE(active, CASE WHEN status = 'active' THEN 1 ELSE 0 END) = 1`,
        [userId]
      );
    } catch {
      dbUser = null;
    }
  }

  if (!dbUser && userName && userRole) {
    try {
      dbUser = await get(
        `SELECT * FROM users
         WHERE LOWER(COALESCE(display_name, full_name)) = LOWER(?)
           AND role = ?
           AND COALESCE(active, CASE WHEN status = 'active' THEN 1 ELSE 0 END) = 1`,
        [userName, userRole]
      );
    } catch {
      dbUser = null;
    }
  }

  const normalizedUser = normalizeDbUser(dbUser);
  const resolvedRole = normalizeRole(tokenPayload?.role || userRole || normalizedUser?.role);
  const resolvedName =
    tokenPayload?.displayName ||
    userName ||
    String(normalizedUser?.full_name || "").trim();

  if (!normalizedUser && !resolvedRole && !resolvedName) {
    req.user = null;
    return next();
  }

  req.user = {
    ...(normalizedUser || {}),
    id: normalizedUser?.id || userId || null,
    username: normalizedUser?.username || tokenPayload?.username || null,
    selectedUserId: userId || normalizedUser?.id || null,
    name: resolvedName || "Unknown User",
    full_name: resolvedName || "Unknown User",
    display_name: resolvedName || "Unknown User",
    role: resolvedRole || "guest",
    active: normalizedUser?.active ?? false,
  };

  next();
}

function requireRole(...allowedRoles) {
  const normalizedAllowedRoles = Array.from(
    new Set(allowedRoles.map(normalizeRole).filter(Boolean))
  );

  return (req, res, next) => {
    const currentRole = normalizeRole(req.user?.role);

    if (!req.user || !currentRole || currentRole === "guest") {
      return res.status(401).json({
        error: true,
        message: "Authentication required. Sign in with a valid username and password.",
        requiredRole: formatRequiredRole(normalizedAllowedRoles),
        currentRole: currentRole || null,
      });
    }

    if (currentRole === "admin") {
      return next();
    }

    if (!normalizedAllowedRoles.includes(currentRole)) {
      return res.status(403).json({
        error: true,
        message: "You don't have permission to perform this action.",
        requiredRole: formatRequiredRole(normalizedAllowedRoles),
        currentRole,
      });
    }

    next();
  };
}

module.exports = { normalizeRole, resolveUser, requireRole };
