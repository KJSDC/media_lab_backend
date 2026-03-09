const express = require("express");
const router = express.Router();
const db = require("../db");

// CATEGORIES API

// 1. Get all categories
router.get("/categories", async (req, res) => {
  try {
    const result = await db.query(`
      SELECT c.*, COUNT(i.id) AS items
      FROM categories c
      LEFT JOIN items i ON c.name = i.category
      GROUP BY c.id
      ORDER BY c.name ASC
    `);
    res.json({ success: true, categories: result.rows });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 2. Add a new category
router.post("/categories", async (req, res) => {
  const { name, sub, max_quantity } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ success: false, message: "Name is required" });

  try {
    const check = await db.query("SELECT * FROM categories WHERE name = $1", [
      name,
    ]);
    if (check.rows.length > 0) {
      return res
        .status(400)
        .json({ success: false, message: "Category already exists" });
    }

    const result = await db.query(
      "INSERT INTO categories (name, description, max_quantity) VALUES ($1, $2, $3) RETURNING *",
      [name, sub, max_quantity || 0],
    );
    res
      .status(201)
      .json({ success: true, category: { ...result.rows[0], items: 0 } });
  } catch (error) {
    console.error("Error adding category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 3. Update an existing category
router.put("/categories/:id", async (req, res) => {
  const { id } = req.params;
  const { name, sub, max_quantity } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ success: false, message: "Name is required" });

  try {
    const result = await db.query(
      "UPDATE categories SET name = $1, description = $2, max_quantity = $3 WHERE id = $4 RETURNING *",
      [name, sub, max_quantity || 0, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    // Fetch counts again to return a complete updated object if needed, but for now just send what we got
    res.json({ success: true, category: result.rows[0] });
  } catch (error) {
    console.error("Error updating category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 4. Delete a category
router.delete("/categories/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM categories WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Category not found" });
    }
    res.json({ success: true, message: "Category deleted successfully" });
  } catch (error) {
    console.error("Error deleting category:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// LOCATIONS API

// 1. Get all locations
router.get("/locations", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM locations ORDER BY name ASC");
    res.json({ success: true, locations: result.rows });
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 2. Add a new location
router.post("/locations", async (req, res) => {
  const { name, block_name, campus_name } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ success: false, message: "Name is required" });

  try {
    const result = await db.query(
      "INSERT INTO locations (name, block_name, campus_name) VALUES ($1, $2, $3) RETURNING *",
      [name, block_name, campus_name],
    );
    res.status(201).json({ success: true, location: result.rows[0] });
  } catch (error) {
    console.error("Error adding location:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 3. Update an existing location
router.put("/locations/:id", async (req, res) => {
  const { id } = req.params;
  const { name, block_name, campus_name } = req.body;
  if (!name)
    return res
      .status(400)
      .json({ success: false, message: "Name is required" });

  try {
    const result = await db.query(
      "UPDATE locations SET name = $1, block_name = $2, campus_name = $3 WHERE id = $4 RETURNING *",
      [name, block_name, campus_name, id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Location not found" });
    }
    res.json({ success: true, location: result.rows[0] });
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// 4. Delete a location
router.delete("/locations/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query(
      "DELETE FROM locations WHERE id = $1 RETURNING *",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Location not found" });
    }
    res.json({ success: true, message: "Location deleted successfully" });
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
