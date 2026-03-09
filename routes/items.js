const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const db = require("../db");

// Multer setup — saves files to server/uploads/
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, "../uploads")),
  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|svg|webp/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  },
});

// @route   GET api/items/stats
// @desc    Get dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const totalResult = await db.query("SELECT COUNT(*) as total FROM items");
    const availableResult = await db.query(
      "SELECT SUM(available_quantity) as available FROM items",
    );
    const categoriesResult = await db.query(
      "SELECT COUNT(DISTINCT category) as cats FROM items",
    );
    const lowStockResult = await db.query(
      "SELECT COUNT(*) as low FROM items WHERE available_quantity <= 2",
    );

    res.json({
      success: true,
      stats: {
        totalItems: parseInt(totalResult.rows[0].total) || 0,
        available: parseInt(availableResult.rows[0].available) || 0,
        categories: parseInt(categoriesResult.rows[0].cats) || 0,
        lowStock: parseInt(lowStockResult.rows[0].low) || 0,
      },
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   GET api/items
// @desc    Get all items (optional ?search= query)
router.get("/", async (req, res) => {
  try {
    const { search } = req.query;
    let result;
    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      result = await db.query(
        `SELECT * FROM items
         WHERE name ILIKE $1
            OR asset_tag ILIKE $1
            OR category ILIKE $1
            OR vendor ILIKE $1
            OR location_room ILIKE $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [q],
      );
    } else {
      result = await db.query("SELECT * FROM items ORDER BY created_at DESC");
    }
    res.json({ success: true, items: result.rows });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST api/items
// @desc    Add new item (with optional photo)
router.post("/", upload.single("photo"), async (req, res) => {
  try {
    const {
      name,
      category,
      assetTag,
      description,
      quantity,
      purchasePrice,
      purchaseDate,
      vendor,
      locationRoom,
      locationShelf,
    } = req.body;

    const initQty = quantity ? parseInt(quantity) : 1;
    const imageUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Auto-generate asset tag if not provided
    const finalAssetTag = assetTag || `ML-${Date.now()}`;

    const result = await db.query(
      `INSERT INTO items 
       (name, category, asset_tag, description, initial_quantity, available_quantity, purchase_cost, purchase_date, vendor, location_room, location_shelf, image_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        name,
        category,
        finalAssetTag,
        description,
        initQty,
        initQty,
        purchasePrice || null,
        purchaseDate || null,
        vendor,
        locationRoom,
        locationShelf,
        imageUrl,
      ],
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ success: false, message: "Asset tag already exists" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT api/items/:id
// @desc    Update an item
router.put("/:id", upload.single("photo"), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      assetTag,
      description,
      quantity,
      availableQuantity,
      purchasePrice,
      purchaseDate,
      vendor,
      locationRoom,
      locationShelf,
      status,
    } = req.body;

    // Fetch existing to preserve image if no new one uploaded
    const existing = await db.query("SELECT * FROM items WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }

    const imageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : existing.rows[0].image_url;

    const result = await db.query(
      `UPDATE items SET
         name = $1, category = $2, asset_tag = $3, description = $4,
         initial_quantity = $5, available_quantity = $6,
         purchase_cost = $7, purchase_date = $8, vendor = $9,
         location_room = $10, location_shelf = $11, status = $12, image_url = $13
       WHERE id = $14 RETURNING *`,
      [
        name,
        category,
        assetTag,
        description,
        parseInt(quantity) || existing.rows[0].initial_quantity,
        parseInt(availableQuantity) ?? existing.rows[0].available_quantity,
        purchasePrice || null,
        purchaseDate || null,
        vendor,
        locationRoom,
        locationShelf,
        status || "Available",
        imageUrl,
        id,
      ],
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    if (err.code === "23505") {
      return res
        .status(400)
        .json({ success: false, message: "Asset tag already exists" });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE api/items/:id
// @desc    Delete an item
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query(
      "DELETE FROM items WHERE id = $1 RETURNING id",
      [id],
    );
    if (result.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });
    }
    res.json({ success: true, message: "Item deleted" });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
