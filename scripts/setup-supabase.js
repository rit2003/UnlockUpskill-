// const { Pool } = require("pg")
// require("dotenv").config()

// async function setupSupabaseDatabase() {
//   let db
//   let dbConfig

//   try {
//     // Connect to Supabase PostgreSQL
//     dbConfig = {
//       connectionString: process.env.DATABASE_URL,
//       ssl: {
//         rejectUnauthorized: false,
//       },
//     }

//     // Alternative configuration if DATABASE_URL doesn't work
//     if (!process.env.DATABASE_URL) {
//       dbConfig = {
//         host: process.env.DB_HOST,
//         user: process.env.DB_USER,
//         password: process.env.DB_PASSWORD,
//         database: process.env.DB_NAME,
//         port: process.env.DB_PORT || 5432,
//         ssl: {
//           rejectUnauthorized: false,
//         },
//       }
//     }

//     db = new Pool(dbConfig)

//     console.log("📡 Connected to Supabase PostgreSQL")

//     // Test connection
//     const testResult = await db.query("SELECT NOW() as current_time")
//     console.log("✅ Database connection test passed:", testResult.rows[0].current_time)

//     console.log("👥 Creating users table...")
//     await db.query(`
//       CREATE TABLE IF NOT EXISTS users (
//         id SERIAL PRIMARY KEY,
//         name VARCHAR(255) NOT NULL,
//         email VARCHAR(255) UNIQUE NOT NULL,
//         password_hash TEXT NOT NULL,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `)

//     console.log("💳 Creating payments table...")
//     await db.query(`
//       CREATE TABLE IF NOT EXISTS payments (
//         id SERIAL PRIMARY KEY,
//         user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
//         razorpay_order_id VARCHAR(255),
//         razorpay_payment_id VARCHAR(255),
//         razorpay_signature TEXT,
//         amount INTEGER NOT NULL,
//         status VARCHAR(20) DEFAULT 'created' CHECK (status IN ('created', 'completed', 'failed')),
//         verified BOOLEAN DEFAULT FALSE,
//         verified_at TIMESTAMP,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `)

//     console.log("📊 Creating indexes...")
//     await db.query(`
//       CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
//       CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);
//       CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
//     `)

//     console.log("📋 Showing tables...")
//     const tablesResult = await db.query(`
//       SELECT table_name 
//       FROM information_schema.tables 
//       WHERE table_schema = 'public' 
//       AND table_type = 'BASE TABLE'
//       ORDER BY table_name
//     `)

//     console.log("✅ Created tables:", tablesResult.rows.map((row) => row.table_name).join(", "))

//     // Show table structures
//     console.log("\n📋 Table structures:")

//     const usersStructure = await db.query(`
//       SELECT column_name, data_type, is_nullable, column_default
//       FROM information_schema.columns 
//       WHERE table_name = 'users' 
//       ORDER BY ordinal_position
//     `)

//     console.log("👥 Users table:")
//     usersStructure.rows.forEach((col) => {
//       console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === "NO" ? "NOT NULL" : "NULL"}`)
//     })

//     const paymentsStructure = await db.query(`
//       SELECT column_name, data_type, is_nullable, column_default
//       FROM information_schema.columns 
//       WHERE table_name = 'payments' 
//       ORDER BY ordinal_position
//     `)

//     console.log("💳 Payments table:")
//     paymentsStructure.rows.forEach((col) => {
//       console.log(`   ${col.column_name}: ${col.data_type} ${col.is_nullable === "NO" ? "NOT NULL" : "NULL"}`)
//     })

//     console.log("\n🎉 Supabase database setup completed successfully!")
//     console.log("📋 Next steps:")
//     console.log("   1. Verify your Supabase connection details in .env")
//     console.log("   2. Update Razorpay keys in .env file")
//     console.log("   3. Deploy to Render or run locally: npm run dev")
//   } catch (error) {
//     console.error("❌ Supabase database setup failed:", error)
//     console.error("Please check your Supabase credentials and connection")
//   } finally {
//     if (db) {
//       await db.end()
//     }
//   }
// }

// setupSupabaseDatabase()
