const express = require("express");
const router = express.Router();
const multer = require("multer");
const db = require("../db");

// Multer — store in MEMORY (not disk), convert to base64
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|svg|webp/;
    const valid =
      allowed.test(file.mimetype) ||
      allowed.test(file.originalname.toLowerCase());
    cb(null, valid);
  },
});

// Helper: convert multer memory buffer → base64 data URI
const toBase64 = (file) => {
  if (!file) return null;
  return `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
};

// @route   GET /api/items/stats
// @desc    Get dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const totalResult = await db.query(
      "SELECT COUNT(*) as total FROM items WHERE is_active = true",
    );
    const availableResult = await db.query(
      "SELECT SUM(available_quantity) as available FROM items WHERE is_active = true",
    );
    const categoriesResult = await db.query(
      "SELECT COUNT(DISTINCT category) as cats FROM items WHERE is_active = true",
    );
    const lowStockResult = await db.query(
      "SELECT COUNT(*) as low FROM items WHERE available_quantity <= 2 AND is_active = true",
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

// @route   GET /api/items
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

// @route   GET /api/items/:id
// @desc    Get single item by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM items WHERE id = $1", [id]);

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST /api/items
// @desc    Add new item — send as multipart/form-data, photo field is the image file
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

    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Name and category are required",
      });
    }

    const initQty = quantity ? parseInt(quantity) : 1;
    const finalAssetTag = assetTag || `ML-${Date.now()}`;
    const imageB64 = toBase64(req.file); // null if no file uploaded

    const result = await db.query(
      `INSERT INTO items
       (name, category, asset_tag, description, initial_quantity, available_quantity,
        purchase_cost, purchase_date, vendor, location_room, location_shelf, image_b64)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        name,
        category,
        finalAssetTag,
        description || null,
        initQty,
        initQty,
        purchasePrice || null,
        purchaseDate || null,
        vendor || null,
        locationRoom || null,
        locationShelf || null,
        imageB64,
      ],
    );

    res.status(201).json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    if (err.code === "23505")
      return res
        .status(400)
        .json({ success: false, message: "Asset tag already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PUT /api/items/:id
// @desc    Update an item — send as multipart/form-data, photo field optional
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

    const existing = await db.query("SELECT * FROM items WHERE id = $1", [id]);
    if (existing.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    const existingItem = existing.rows[0];

    // Use new photo if uploaded, otherwise keep existing
    const imageB64 = req.file ? toBase64(req.file) : existingItem.image_b64;

    // Determine if item should be inactive based on status
    const newStatus = status || existingItem.status || "Available";
    const inactiveStatuses = ["Under Service", "Damaged", "Lost", "Wear/Tear"];

    // Explicit toggle if provided in body, else derive from status
    let finalIsActive = existingItem.is_active;
    if (req.body.is_active !== undefined) {
      finalIsActive =
        req.body.is_active === "true" || req.body.is_active === true;
    } else if (inactiveStatuses.includes(newStatus)) {
      finalIsActive = false;
    } else if (newStatus === "Available") {
      finalIsActive = true;
    }

    const result = await db.query(
      `UPDATE items SET
         name = $1,
         category = $2,
         asset_tag = $3,
         description = $4,
         initial_quantity = $5,
         available_quantity = $6,
         purchase_cost = $7,
         purchase_date = $8,
         vendor = $9,
         location_room = $10,
         location_shelf = $11,
         status = $12,
         image_b64 = $13,
         is_active = $14
       WHERE id = $15 RETURNING *`,
      [
        name || existingItem.name,
        category || existingItem.category,
        assetTag || existingItem.asset_tag,
        description ?? existingItem.description,
        parseInt(quantity) || existingItem.initial_quantity,
        parseInt(availableQuantity) ?? existingItem.available_quantity,
        purchasePrice || existingItem.purchase_cost,
        purchaseDate || existingItem.purchase_date,
        vendor ?? existingItem.vendor,
        locationRoom ?? existingItem.location_room,
        locationShelf ?? existingItem.location_shelf,
        newStatus,
        imageB64,
        finalIsActive,
        id,
      ],
    );

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    if (err.code === "23505")
      return res
        .status(400)
        .json({ success: false, message: "Asset tag already exists" });
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/items/:id/image
// @desc    Update only the image of an item
router.patch("/:id/image", upload.single("photo"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file)
      return res
        .status(400)
        .json({ success: false, message: "No image provided" });

    const imageB64 = toBase64(req.file);

    const result = await db.query(
      "UPDATE items SET image_b64 = $1 WHERE id = $2 RETURNING id, name, image_b64",
      [imageB64, id],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/items/:id/image
// @desc    Remove image from an item
router.delete("/:id/image", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "UPDATE items SET image_b64 = NULL WHERE id = $1 RETURNING id, name",
      [id],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    res.json({ success: true, message: "Image removed", item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   PATCH /api/items/:id/active
// @desc    Toggle an item's active/inactive status
router.patch("/:id/active", async (req, res) => {
  try {
    const { id } = req.params;
    const { is_active } = req.body;

    const result = await db.query(
      "UPDATE items SET is_active = $1 WHERE id = $2 RETURNING *",
      [is_active, id],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    res.json({
      success: true,
      message: `Item marked as ${is_active ? "Active" : "Inactive"}`,
      item: result.rows[0],
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE /api/items/:id
// @desc    Delete an item
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM items WHERE id = $1 RETURNING id, name",
      [id],
    );

    if (result.rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: "Item not found" });

    res.json({
      success: true,
      message: `Item "${result.rows[0].name}" deleted`,
    });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
