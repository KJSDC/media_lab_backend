const express = require("express");
const router = express.Router();
const db = require("../db");

// Increase JSON limit for base64 images
router.use(express.json({ limit: "10mb" }));
router.use(express.urlencoded({ extended: true, limit: "10mb" }));

// @route   GET api/items/stats
// @desc    Get dashboard statistics
router.get("/stats", async (req, res) => {
  try {
    const totalResult = await db.query("SELECT COUNT(*) as total FROM items");
    const availableResult = await db.query(
      "SELECT SUM(available_quantity) as available FROM items"
    );
    const categoriesResult = await db.query(
      "SELECT COUNT(DISTINCT category) as cats FROM items"
    );
    const lowStockResult = await db.query(
      "SELECT COUNT(*) as low FROM items WHERE available_quantity <= 2"
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
        [q]
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

// @route   GET api/items/:id
// @desc    Get single item by ID
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query("SELECT * FROM items WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// @route   POST api/items
// @desc    Add new item (with optional base64 photo)
router.post("/", async (req, res) => {
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
      photo, // base64 string: "data:image/jpeg;base64,/9j/..." or raw base64
    } = req.body;

    // Validate required fields
    if (!name || !category) {
      return res.status(400).json({
        success: false,
        message: "Name and category are required",
      });
    }

    const initQty = quantity ? parseInt(quantity) : 1;

    // Auto-generate asset tag if not provided
    const finalAssetTag = assetTag || `ML-${Date.now()}`;

    // Strip the data URI prefix if present
    // e.g. "data:image/jpeg;base64,XXXX" → "XXXX"
    let imageB64 = null;
    if (photo) {
      imageB64 = photo.includes("base64,")
        ? photo.split("base64,")[1]
        : photo;
    }

    const result = await db.query(
      `INSERT INTO items 
       (name, category, asset_tag, description, initial_quantity, available_quantity,
        purchase_cost, purchase_date, vendor, location_room, location_shelf, image_b64)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
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
      ]
    );

    res.status(201).json({ success: true, item: result.rows[0] });
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
// @desc    Update an item (with optional new base64 photo)
router.put("/:id", async (req, res) => {
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
      photo, // base64 string (optional — omit to keep existing image)
    } = req.body;

    // Fetch existing item
    const existing = await db.query("SELECT * FROM items WHERE id = $1", [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    const existingItem = existing.rows[0];

    // Use new photo if provided, otherwise keep the existing one
    let imageB64 = existingItem.image_b64;
    if (photo) {
      imageB64 = photo.includes("base64,")
        ? photo.split("base64,")[1]
        : photo;
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
         image_b64 = $13
       WHERE id = $14 RETURNING *`,
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
        status || existingItem.status || "Available",
        imageB64,
        id,
      ]
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

// @route   PATCH api/items/:id/image
// @desc    Update only the image of an item
router.patch("/:id/image", async (req, res) => {
  try {
    const { id } = req.params;
    const { photo } = req.body;

    if (!photo) {
      return res.status(400).json({ success: false, message: "No image provided" });
    }

    const imageB64 = photo.includes("base64,")
      ? photo.split("base64,")[1]
      : photo;

    const result = await db.query(
      "UPDATE items SET image_b64 = $1 WHERE id = $2 RETURNING id, name, image_b64",
      [imageB64, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    res.json({ success: true, item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE api/items/:id/image
// @desc    Remove image from an item
router.delete("/:id/image", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "UPDATE items SET image_b64 = NULL WHERE id = $1 RETURNING id, name",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    res.json({ success: true, message: "Image removed", item: result.rows[0] });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// @route   DELETE api/items/:id
// @desc    Delete an item
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      "DELETE FROM items WHERE id = $1 RETURNING id, name",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: "Item not found" });
    }

    res.json({ success: true, message: `Item "${result.rows[0].name}" deleted` });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;