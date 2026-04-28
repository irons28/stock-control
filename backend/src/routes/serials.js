const express = require("express");
const { all, get } = require("../db/connection");

const router = express.Router();

// GET /api/serials?search=ABC123
router.get("/", async (req, res, next) => {
  try {
    const raw = req.query.search || "";
    const term = raw.trim().toUpperCase();

    if (!term) {
      return res.json({ items: [] });
    }

    const items = await all(
      `SELECT si.*,
         p.sku,
         p.name  AS product_name,
         p.tracking_mode,
         sl.code AS location_code,
         sl.name AS location_name
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) LIKE ?
       ORDER BY si.created_at DESC
       LIMIT 20`,
      [`%${term}%`],
    );

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

// GET /api/serials/:serial
router.get("/:serial", async (req, res, next) => {
  try {
    const serial = req.params.serial.trim().toUpperCase();

    const item = await get(
      `SELECT si.*,
         p.sku,
         p.name  AS product_name,
         p.tracking_mode,
         sl.code AS location_code,
         sl.name AS location_name
       FROM stock_items si
       JOIN products p ON p.id = si.product_id
       LEFT JOIN stock_locations sl ON sl.id = si.stock_location_id
       WHERE UPPER(si.serial_number) = ?`,
      [serial],
    );

    if (!item) {
      const err = new Error(`Serial '${req.params.serial}' not found`);
      err.status = 404;
      return next(err);
    }

    const movements = await all(
      `SELECT sm.*,
         src.code  AS source_code,
         dest.code AS destination_code
       FROM stock_movements sm
       LEFT JOIN stock_locations src  ON src.id  = sm.source_location_id
       LEFT JOIN stock_locations dest ON dest.id = sm.destination_location_id
       WHERE sm.stock_item_id = ?
       ORDER BY sm.created_at DESC`,
      [item.id],
    );

    res.json({ item, movements });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
