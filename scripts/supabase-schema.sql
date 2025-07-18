-- -- Supabase PostgreSQL Schema for Course Platform

-- -- Enable UUID extension (optional, using SERIAL for simplicity)
-- -- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- -- Users table
-- CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     name VARCHAR(255) NOT NULL,
--     email VARCHAR(255) UNIQUE NOT NULL,
--     password_hash TEXT NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- Payments table
-- CREATE TABLE IF NOT EXISTS payments (
--     id SERIAL PRIMARY KEY,
--     user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
--     razorpay_order_id VARCHAR(255),
--     razorpay_payment_id VARCHAR(255),
--     razorpay_signature TEXT,
--     amount INTEGER NOT NULL, -- Amount in rupees
--     status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed')),
--     verified BOOLEAN DEFAULT FALSE,
--     verified_at TIMESTAMP,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
--     updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

-- -- Indexes for better performance
-- CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
-- CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);
-- CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- -- Function to update updated_at timestamp
-- CREATE OR REPLACE FUNCTION update_updated_at_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--     NEW.updated_at = CURRENT_TIMESTAMP;
--     RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- -- Triggers to automatically update updated_at
-- CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
--     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- -- Show created tables
-- SELECT table_name 
-- FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_type = 'BASE TABLE'
-- ORDER BY table_name;
