const express = require("express");
const bcrypt = require("bcryptjs");
const { all, get, run } = require("../db/connection");
const { requireRole } = require("../middleware/auth");
const { sanitizeUser } = require("./auth");

const router = express.Router();

const ALLOWED_ROLES = new Set(["admin", "office", "warehouse", "read_only"]);

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function normalizeActiveValue(value) {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === "number") {
    return value > 0;
  }

  const normalized = String(value || "").trim().toLowerCase();
  if (["true", "1", "active"].includes(normalized)) {
    return true;
  }
  if (["false", "0", "inactive"].includes(normalized)) {
    return false;
  }

  return null;
}

function validateRole(role) {
  return ALLOWED_ROLES.has(normalizeRole(role));
}

async function countActiveAdmins(excludingUserId = null) {
  const params = [];
  let where = `role = 'admin' AND COALESCE(active, CASE WHEN status = 'active' THEN 1 ELSE 0 END) = 1`;

  if (excludingUserId !== null) {
    where += " AND id != ?";
    params.push(excludingUserId);
  }

  const row = await get(`SELECT COUNT(*) AS total FROM users WHERE ${where}`, params);
  return Number(row?.total || 0);
}

async function fetchUserById(id) {
  return get("SELECT * FROM users WHERE id = ?", [id]);
}

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: true,
      message: "Authentication required.",
    });
  }

  res.json({ user: sanitizeUser(req.user) });
});

router.get("/", requireRole("admin"), async (_req, res, next) => {
  try {
    const users = await all(
      `SELECT id, username, email, display_name, full_name, role, active, status, last_login_at, created_at, updated_at
       FROM users
       ORDER BY COALESCE(display_name, full_name, username) ASC`
    );

    res.json({
      items: users.map((user) => sanitizeUser(user)),
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", requireRole("admin"), async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const displayName = String(req.body?.display_name || req.body?.full_name || "").trim();
    const email = String(req.body?.email || `${username}@ops.example`).trim().toLowerCase();
    const password = String(req.body?.password || "");
    const role = normalizeRole(req.body?.role);
    const active = normalizeActiveValue(req.body?.active);

    if (!username || !displayName || !password || !validateRole(role) || active === null) {
      return res.status(400).json({
        error: true,
        message: "Username, display name, password, role, and active status are required.",
      });
    }

    const existing = await get(
      "SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)",
      [username, email]
    );

    if (existing) {
      return res.status(409).json({
        error: true,
        message: "A user with that username or email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const result = await run(
      `INSERT INTO users
        (username, email, display_name, full_name, password_hash, role, active, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        username,
        email,
        displayName,
        displayName,
        passwordHash,
        role,
        active ? 1 : 0,
        active ? "active" : "inactive",
      ]
    );

    const created = await fetchUserById(result.id);

    res.status(201).json({
      item: sanitizeUser(created),
      message: `User ${username} created successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.put("/:id", requireRole("admin"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const user = await fetchUserById(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found.",
      });
    }

    const displayName = String(req.body?.display_name || req.body?.full_name || "").trim();
    const role = normalizeRole(req.body?.role);
    const active = normalizeActiveValue(req.body?.active);

    if (!displayName || !validateRole(role) || active === null) {
      return res.status(400).json({
        error: true,
        message: "Display name, role, and active status are required.",
      });
    }

    if (user.role === "admin" && (!active || role !== "admin")) {
      const remainingAdmins = await countActiveAdmins(userId);
      if (remainingAdmins === 0) {
        return res.status(400).json({
          error: true,
          message: "You cannot deactivate or demote the final active admin user.",
        });
      }
    }

    await run(
      `UPDATE users
       SET display_name = ?,
           full_name = ?,
           role = ?,
           active = ?,
           status = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        displayName,
        displayName,
        role,
        active ? 1 : 0,
        active ? "active" : "inactive",
        userId,
      ]
    );

    const updated = await fetchUserById(userId);

    res.json({
      item: sanitizeUser(updated),
      message: `User ${updated.username} updated successfully.`,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/reset-password", requireRole("admin"), async (req, res, next) => {
  try {
    const userId = Number(req.params.id);
    const user = await fetchUserById(userId);

    if (!user) {
      return res.status(404).json({
        error: true,
        message: "User not found.",
      });
    }

    const password = String(req.body?.password || "");
    if (!password) {
      return res.status(400).json({
        error: true,
        message: "A new password is required.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      `UPDATE users
       SET password_hash = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [passwordHash, userId]
    );

    res.json({
      ok: true,
      message: `Password reset for ${user.username} completed.`,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
