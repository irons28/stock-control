const express = require("express");
const { all } = require("../db/connection");

const router = express.Router();

// GET /audit-log/meta — distinct values for filter dropdowns
router.get("/meta", async (req, res, next) => {
  try {
    const [actions, entities, users] = await Promise.all([
      all(`SELECT DISTINCT action_type FROM activity_log WHERE action_type IS NOT NULL ORDER BY action_type ASC`),
      all(`SELECT DISTINCT entity_type FROM activity_log WHERE entity_type IS NOT NULL ORDER BY entity_type ASC`),
      all(`SELECT DISTINCT user_name FROM activity_log WHERE user_name IS NOT NULL AND user_name != 'System' ORDER BY user_name ASC`),
    ]);
    res.json({
      actions: actions.map((r) => r.action_type),
      entities: entities.map((r) => r.entity_type),
      users: users.map((r) => r.user_name),
    });
  } catch (error) {
    next(error);
  }
});

// GET /audit-log — paginated, filterable activity log
router.get("/", async (req, res, next) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Number(req.query.offset) || 0;
  const action = req.query.action ? String(req.query.action) : null;
  const entityType = req.query.entity_type ? String(req.query.entity_type) : null;
  const entityRef = req.query.entity_ref ? String(req.query.entity_ref) : null;
  const user = req.query.user ? String(req.query.user) : null;

  const conditions = [];
  const params = [];

  if (action) { conditions.push("al.action_type = ?"); params.push(action); }
  if (entityType) { conditions.push("al.entity_type = ?"); params.push(entityType); }
  if (entityRef) { conditions.push("al.entity_ref = ?"); params.push(entityRef); }
  if (user) { conditions.push("al.user_name = ?"); params.push(user); }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  try {
    const items = await all(
      `SELECT al.*, u.email, u.full_name
       FROM activity_log al
       LEFT JOIN users u ON u.id = al.user_id
       ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({ items, limit, offset });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
