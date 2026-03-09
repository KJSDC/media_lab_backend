CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL,
  description VARCHAR(255),
  max_quantity INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  block_name VARCHAR(100),
  campus_name VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL, -- TODO: migrate to category_id
  asset_tag VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  initial_quantity INTEGER NOT NULL DEFAULT 1,
  available_quantity INTEGER NOT NULL DEFAULT 1,
  purchase_cost NUMERIC(10, 2),
  purchase_date DATE,
  vendor VARCHAR(255),
  is_movable BOOLEAN DEFAULT true,
  location_room VARCHAR(100),
  location_shelf VARCHAR(100),
  status VARCHAR(50) DEFAULT 'Available',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Insert a default admin user for testing (password is 'admin123' hashed with bcrypt)
INSERT INTO users (name, email, password_hash, role)
VALUES ('Admin User', 'admin@kristujayanti.com', '$2a$10$XzV19VbLPOd4JqG4/0z/a.hM1hY8aJzL8L9h.E.eB7hR9R8b8eR8K', 'admin')
ON CONFLICT (email) DO NOTHING;


CREATE TABLE IF NOT EXISTS movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE IF NOT EXISTS movement_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_id UUID NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES items(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 1
);