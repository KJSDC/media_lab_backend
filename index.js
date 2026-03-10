require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// ✅ cors middleware as backup
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  preflightContinue: false,
  optionsSuccessStatus: 204,
}));

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Serve uploaded photos
app.use("/uploads", express.static(path.join(__dirname, "uploads")));



// Database connection Setup
const db = require("./db");

// Load Routes
app.use("/api/auth", require("./routes/auth"));
app.use("/api/items", require("./routes/items"));
app.use("/api/movements", require("./routes/movements"));
app.use("/api/config", require("./routes/config"));

// Test DB Connection Route
app.get("/api/db-test", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW()");
    res.json({ success: true, timestamp: result.rows[0].now });
  } catch (error) {
    console.error("Database connection error:", error);
    res.status(500).json({
      success: false,
      message: "Database connecting error",
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
