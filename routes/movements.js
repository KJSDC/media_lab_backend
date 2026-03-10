const express = require("express");
const router = express.Router();
const db = require("../db");

// @route   GET /api/movements
// @desc    List all movements (with borrower + item details)
router.get("/", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        m.*,
        json_agg(
          json_build_object(
            'item_id',   mi.item_id,
            'quantity',  mi.quantity,
            'name',      i.name,
            'asset_tag', i.asset_tag,
            'category',  i.category,
            'image_url', i.image_url
          )
        ) AS items
      FROM movements m
      LEFT JOIN movement_items mi ON mi.movement_id = m.id
      LEFT JOIN items i           ON i.id = mi.item_id
      GROUP BY m.id
      ORDER BY m.created_at DESC
    `);
    res.json({ success: true, movements: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST /api/movements
// @desc    Create a new issue or return movement
router.post("/", async (req, res) => {
  const client = await db.connect();
  try {
    const {
      type, // 'issue' | 'return'
      borrowerName,
      borrowerId,
      contact,
      role,
      purpose,
      comments,
      dueDate,
      items, // [{ itemId, quantity }]
    } = req.body;

    if (!type || !borrowerName || !items || items.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "Missing required fields" });
    }

    await client.query("BEGIN");

    // 1. Insert the movement record
    const mvResult = await client.query(
      `INSERT INTO movements (type, borrower_name, borrower_id, contact, role, purpose, comments, due_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        type,
        borrowerName,
        borrowerId,
        contact,
        role || "student",
        purpose,
        comments,
        dueDate || null,
      ],
    );
    const movement = mvResult.rows[0];

    // 2. For each item: insert movement_item row and adjust available_quantity
    for (const { itemId, quantity } of items) {
      const qty = parseInt(quantity) || 1;

      // Check current stock
      const itemRes = await client.query(
        "SELECT * FROM items WHERE id = $1 FOR UPDATE",
        [itemId],
      );
      if (itemRes.rows.length === 0)
        throw new Error(`Item ${itemId} not found`);
      const item = itemRes.rows[0];

      if (type === "issue") {
        if (item.available_quantity < qty) {
          throw new Error(
            `Not enough stock for "${item.name}" (available: ${item.available_quantity})`,
          );
        }
        await client.query(
          "UPDATE items SET available_quantity = available_quantity - $1 WHERE id = $2",
          [qty, itemId],
        );
      } else {
        // return — increase available, cap at initial_quantity
        const newAvail = Math.min(
          item.initial_quantity,
          item.available_quantity + qty,
        );
        await client.query(
          "UPDATE items SET available_quantity = $1 WHERE id = $2",
          [newAvail, itemId],
        );
      }

      await client.query(
        "INSERT INTO movement_items (movement_id, item_id, quantity) VALUES ($1,$2,$3)",
        [movement.id, itemId, qty],
      );
    }

    await client.query("COMMIT");
    res.json({ success: true, movement });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err.message);
    res.status(400).json({ success: false, message: err.message });
  } finally {
    client.release();
  }
});

// @route   GET /api/movements/active
// @desc    Get all active (unreturned) issues for return lookup
router.get("/active", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT
        m.*,
        json_agg(
          json_build_object(
            'item_id',   mi.item_id,
            'quantity',  mi.quantity,
            'name',      i.name,
            'asset_tag', i.asset_tag,
            'image_url', i.image_url
          )
        ) AS items
      FROM movements m
      LEFT JOIN movement_items mi ON mi.movement_id = m.id
      LEFT JOIN items i           ON i.id = mi.item_id
      WHERE m.type = 'issue' AND m.returned_at IS NULL
      GROUP BY m.id
      ORDER BY m.due_date ASC NULLS LAST
    `);
    res.json({ success: true, movements: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET /api/movements/borrower?q=<name_or_id>
// @desc    Look up a borrower's currently active (unreturned) issued items
router.get("/borrower", async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ success: true, results: [] });
    }
    const search = `%${q.trim()}%`;
    const result = await db.query(
      `SELECT
         m.id         AS movement_id,
         m.borrower_name,
         m.borrower_id,
         m.contact,
         m.role,
         m.due_date,
         m.purpose,
         m.comments,
         json_agg(
           json_build_object(
             'item_id',            mi.item_id,
             'movement_item_id',   mi.id,
             'quantity',           mi.quantity,
             'name',               i.name,
             'asset_tag',          i.asset_tag,
             'category',           i.category,
             'image_url',          i.image_url,
             'initial_quantity',   i.initial_quantity,
             'available_quantity', i.available_quantity
           )
         ) AS items
       FROM movements m
       JOIN movement_items mi ON mi.movement_id = m.id
       JOIN items i           ON i.id = mi.item_id
       WHERE m.type = 'issue'
         AND m.returned_at IS NULL
         AND (
           LOWER(m.borrower_name) LIKE LOWER($1) OR
           LOWER(m.borrower_id)   LIKE LOWER($1)
         )
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      [search],
    );
    res.json({ success: true, results: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
