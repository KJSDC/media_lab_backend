require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

// Middleware — ORDER MATTERS, put these first
app.use(cors());
app.use(express.json({ limit: "10mb" }));        // ✅ only once, with limit
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded photos (keep for backwards compat)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Database connection
const db = require("./db");

// Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/items", require("./routes/items"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/config", require("./routes/config"));

// Test DB Connection Route
app.get("/api/db-test", async (req, res) => {
  try {
    const result = await db.query("SELECT NOW()");
    res.json({ success: true, timestamp: result.rows[0].now });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      success: false,
      message: "Database connection error",
      error: error.message,
    });
  }
});

// Simple Hello Route
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from Media Lab Express Backend!" });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});