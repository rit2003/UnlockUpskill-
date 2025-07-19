const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const { neon } = require("@neondatabase/serverless")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const Razorpay = require("razorpay")
const path = require("path")

// Load environment variables first and synchronously
dotenv.config()

// Initialize Neon PostgreSQL connection immediately and synchronously
let sql
try {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is required for Neon connection")
  }
  sql = neon(process.env.DATABASE_URL)
  console.log("✅ Neon client initialized.")
} catch (error) {
  console.error("❌ Failed to initialize Neon client:", error.message)
  // It's critical to have a database connection, so exit if it fails here
  process.exit(1)
}

// Initialize Razorpay immediately and synchronously
let razorpayInstance
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpayInstance = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
    console.log("✅ Razorpay initialized successfully")
    console.log(`   Razorpay Key ID loaded: ${process.env.RAZORPAY_KEY_ID ? "Yes" : "No"}`)
    console.log(`   Razorpay Key Secret loaded: ${process.env.RAZORPAY_KEY_SECRET ? "Yes (masked)" : "No"}`)
  } else {
    console.log("⚠️ Razorpay credentials not found - payment features will be disabled")
    console.log(`   RAZORPAY_KEY_ID value: ${process.env.RAZORPAY_KEY_ID}`)
    console.log(`   RAZORPAY_KEY_SECRET value: ${process.env.RAZORPAY_KEY_SECRET ? "***" : "Not set"}`)
  }
} catch (error) {
  console.error("❌ Razorpay initialization failed:", error.message)
}

const app = express()
const PORT = process.env.PORT || 5000

// Function to test DB connection (optional, but good for health check)
async function testDBConnection() {
  try {
    console.log("🧪 Testing Neon database connection...")
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`
    console.log("✅ Neon PostgreSQL connected successfully")
    console.log("📅 Database time:", result[0].current_time)
    console.log("🐘 PostgreSQL version:", result[0].pg_version.split(" ")[0])
    console.log("🚀 Neon serverless PostgreSQL ready!")
    return true
  } catch (error) {
    console.error("❌ Neon database connection test failed:", error)
    throw error // Re-throw to indicate failure
  }
}

// Middleware
app.use(cors())
app.use(express.json())

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")))

// Health check endpoint
app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    const result = await sql`SELECT NOW() as current_time`
    res.json({
      status: "OK",
      message: "Course Platform Backend is running!",
      database: "Connected to Neon PostgreSQL",
      timestamp: new Date().toISOString(),
      db_time: result[0].current_time,
      environment: process.env.NODE_ENV || "development",
      razorpay_configured: !!razorpayInstance,
    })
  } catch (error) {
    console.error("Health check failed:", error)
    res.status(500).json({
      status: "ERROR",
      message: "Database connection failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    })
  }
})

// Import and use modularized routes, passing sql and razorpayInstance
// The route files will now export a function that takes these as arguments
const createAuthRoutes = require("./routes/auth")
const createPaymentRoutes = require("./routes/payment")
const { authenticateToken: createAuthenticateToken } = require("./middleware/auth")

// Pass sql to the middleware creator
const authenticateToken = createAuthenticateToken(sql)

// Pass sql and razorpayInstance to the route creators
app.use("/api/auth", createAuthRoutes(sql, authenticateToken))
app.use("/api/payments", createPaymentRoutes(sql, razorpayInstance, authenticateToken))

// This catch-all route should be AFTER all your API routes
// It serves the frontend application for any route not handled by the API
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"))
})

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err)
  res.status(500).json({
    success: false,
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : undefined,
  })
})

// 404 handler (This will now only catch API routes that are not found)
app.use("/api/*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "API route not found",
  })
})

// Start server
async function startServer() {
  try {
    await testDBConnection() // Test connection before starting server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`)
      console.log(`📍 Health check: http://localhost:${PORT}/api/health`)
      console.log(`🐘 Database: Neon PostgreSQL`)
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
      console.log(`💳 Razorpay: ${razorpayInstance ? "Configured" : "Not configured"}`)
      console.log(`📋 Available endpoints:`)
      console.log(`   POST /api/auth/signup`)
      console.log(`   POST /api/auth/login`)
      console.log(`   GET  /api/auth/me`)
      console.log(`   POST /api/payments/create-order`)
      console.log(`   POST /api/payments/verify`)
      console.log(`   GET  /api/payments/history`)
    })
  } catch (error) {
    console.error("Failed to start server due to database connection issues:", error)
    process.exit(1) // Exit if DB connection fails at startup
  }
}

startServer()

// We no longer need to export sql and razorpayInstance here
// as they are passed directly to the modules that need them.
// If other parts of your application need them, they should also be refactored
// to accept them as arguments or be initialized in a similar way.
