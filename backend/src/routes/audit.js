const express = require("express");
const { all } = require("../db/connection");

const router = express.Router();

router.get("/", async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;

  try {
    const items = await all(
      `SELECT al.*, u.email, u.full_name
       FROM activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json({ items, limit, offset });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
