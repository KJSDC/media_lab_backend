require("dotenv").config();
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movements (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      type VARCHAR(10) NOT NULL CHECK (type IN ('issue', 'return')),
      borrower_name VARCHAR(255) NOT NULL,
      borrower_id VARCHAR(100),
      contact VARCHAR(100),
      role VARCHAR(50) DEFAULT 'student',
      purpose TEXT,
      comments TEXT,
      due_date DATE,
      returned_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS movement_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
      item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
      quantity INTEGER NOT NULL DEFAULT 1
    );
  `);
  console.log("✅ movements and movement_items tables created.");
  await pool.end();
}

run().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
