const express = require("express");
const { all } = require("../db/connection");
const { requireRole } = require("../middleware/auth");

const router = express.Router();

const GUEST = { id: null, role: "guest", name: "Guest", full_name: "Guest", email: "" };

router.get("/me", (req, res) => {
  if (!req.user) {
    return res.json(GUEST);
  }
  res.json(req.user);
});

router.get("/", requireRole("admin", "management"), async (_req, res, next) => {
  try {
    const users = await all(
      `SELECT id, email, full_name, role, status, last_login_at, created_at, updated_at
       FROM users
       WHERE status = 'active'
       ORDER BY full_name ASC`
    );
    res.json({ items: users });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
