// Resolves req.user from X-User-Id header. Applied globally.
// requireRole(...roles) factory for protecting mutation routes.
const { get } = require("../db/connection");

async function resolveUser(req, res, next) {
  const userId = req.headers["x-user-id"];

  if (!userId) {
    req.user = null;
    return next();
  }

  try {
    const user = await get(
      `SELECT * FROM users WHERE id = ? AND status = 'active'`,
      [userId]
    );
    req.user = user || null;
  } catch {
    req.user = null;
  }

  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: true,
        message: "Authentication required. Provide a valid X-User-Id header.",
        required_roles: allowedRoles,
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: true,
        message: `Access denied. Your role '${req.user.role}' is not permitted to perform this action.`,
        required_roles: allowedRoles,
      });
    }

    next();
  };
}

module.exports = { resolveUser, requireRole };
