const express = require("express");
const bcrypt = require("bcryptjs");
const { get, run } = require("../db/connection");
const { signAuthToken } = require("../auth/token");

const router = express.Router();

function sanitizeUser(user) {
  if (!user) {
    return null;
  }

  const displayName = String(user.display_name || user.full_name || user.username || "").trim();
  const role = String(user.role || "").trim().toLowerCase();
  const active =
    user.active === undefined || user.active === null
      ? String(user.status || "").toLowerCase() === "active"
      : Boolean(user.active);

  return {
    id: String(user.id),
    username: String(user.username || "").trim(),
    display_name: displayName,
    full_name: displayName,
    role,
    active,
    email: String(user.email || "").trim(),
    created_at: user.created_at,
    last_login_at: user.last_login_at || null,
  };
}

router.post("/login", async (req, res, next) => {
  try {
    const username = String(req.body?.username || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        error: true,
        message: "Username and password are required.",
      });
    }

    const user = await get(
      `SELECT *
       FROM users
       WHERE LOWER(username) = LOWER(?)
       LIMIT 1`,
      [username]
    );

    const active =
      user?.active === undefined || user?.active === null
        ? String(user?.status || "").toLowerCase() === "active"
        : Boolean(user?.active);

    if (!user || !active) {
      return res.status(401).json({
        error: true,
        message: "Invalid username or password.",
      });
    }

    const passwordMatches = user.password_hash
      ? await bcrypt.compare(password, user.password_hash)
      : false;

    if (!passwordMatches) {
      return res.status(401).json({
        error: true,
        message: "Invalid username or password.",
      });
    }

    await run(
      `UPDATE users
       SET last_login_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [user.id]
    );

    const refreshedUser = await get("SELECT * FROM users WHERE id = ?", [user.id]);
    const safeUser = sanitizeUser(refreshedUser);

    res.json({
      token: signAuthToken(safeUser),
      user: safeUser,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.status(401).json({
      error: true,
      message: "Authentication required.",
    });
  }

  res.json({ user: sanitizeUser(req.user) });
});

router.post("/logout", (_req, res) => {
  res.json({ ok: true });
});

module.exports = {
  router,
  sanitizeUser,
};
