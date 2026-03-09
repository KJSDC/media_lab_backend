const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Uncomment below if using a managed postgres like render/supabase that requires ssl
  // ssl: {
  //   rejectUnauthorized: false
  // }
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  connect: () => pool.connect(),
};
