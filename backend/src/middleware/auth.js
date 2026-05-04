// Resolves req.user from X-User-Id header. Applied globally.
// requireRole(...roles) factory for protecting mutation routes.
const { get } = require("../db/connection");

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

async function resolveUser(req, res, next) {
  const userId = String(req.headers["x-user-id"] || "").trim();
  const userName = String(req.headers["x-user-name"] || "").trim();
  const userRole = normalizeRole(req.headers["x-user-role"]);

  let dbUser = null;

  if (userId) {
    try {
      dbUser = await get(
        `SELECT * FROM users WHERE id = ? AND status = 'active'`,
        [userId]
      );
    } catch {
      dbUser = null;
    }
  }

  if (!dbUser && userName && userRole) {
    try {
      dbUser = await get(
        `SELECT * FROM users WHERE LOWER(full_name) = LOWER(?) AND role = ? AND status = 'active'`,
        [userName, userRole]
      );
    } catch {
      dbUser = null;
    }
  }

  const resolvedRole = userRole || normalizeRole(dbUser?.role);
  const resolvedName = userName || String(dbUser?.full_name || "").trim();

  if (!dbUser && !resolvedRole && !resolvedName) {
    req.user = null;
    return next();
  }

  req.user = {
    ...(dbUser || {}),
    id: dbUser?.id || userId || null,
    selectedUserId: userId || dbUser?.id || null,
    name: resolvedName || "Unknown User",
    full_name: resolvedName || "Unknown User",
    role: resolvedRole || "guest",
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
        message: "Authentication required. Provide a valid X-User-Id header.",
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
