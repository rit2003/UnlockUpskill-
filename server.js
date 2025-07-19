const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const { neon } = require("@neondatabase/serverless")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const Razorpay = require("razorpay")
const path = require("path")

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, "public")))

// Neon PostgreSQL connection
let sql

async function connectDB() {
  try {
    console.log("🔍 Attempting to connect to Neon database...")
    console.log("Environment check:")
    console.log("- NODE_ENV:", process.env.NODE_ENV)
    console.log("- DATABASE_URL exists:", !!process.env.DATABASE_URL)

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is required for Neon connection")
    }

    // Initialize Neon connection
    sql = neon(process.env.DATABASE_URL)

    // Test the connection
    console.log("🧪 Testing Neon database connection...")
    const result = await sql`SELECT NOW() as current_time, version() as pg_version`

    console.log("✅ Neon PostgreSQL connected successfully")
    console.log("📅 Database time:", result[0].current_time)
    console.log("🐘 PostgreSQL version:", result[0].pg_version.split(" ")[0])
    console.log("🚀 Neon serverless PostgreSQL ready!")

    return true
  } catch (error) {
    console.error("❌ Neon database connection failed:")
    console.error("Error details:", {
      message: error.message,
      code: error.code,
    })

    if (error.message.includes("DATABASE_URL")) {
      console.error("💡 Please set your Neon DATABASE_URL in environment variables")
      console.error("   Get it from: https://console.neon.tech → Your Project → Connection Details")
    } else if (error.code === "ENOTFOUND") {
      console.error("🔍 Network error - Check if:")
      console.error("  1. Your Neon database URL is correct")
      console.error("  2. Your internet connection is working")
    } else {
      console.error("🔧 Other possible issues:")
      console.error("  1. Neon database might be sleeping (free tier)")
      console.error("  2. Check your Neon project status")
    }

    process.exit(1)
  }
}

// Initialize Razorpay
let razorpay
try {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    })
    console.log("✅ Razorpay initialized successfully")
  } else {
    console.log("⚠️ Razorpay credentials not found - payment features will be disabled")
  }
} catch (error) {
  console.error("❌ Razorpay initialization failed:", error.message)
}

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
      razorpay_configured: !!razorpay,
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

// Import and use modularized routes
const authRoutes = require("./routes/auth")
const paymentRoutes = require("./routes/payment")

app.use("/api/auth", authRoutes)
app.use("/api/payments", paymentRoutes)

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
  await connectDB()

  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`)
    console.log(`📍 Health check: http://localhost:${PORT}/api/health`)
    console.log(`🐘 Database: Neon PostgreSQL`)
    console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`)
    console.log(`💳 Razorpay: ${razorpay ? "Configured" : "Not configured"}`)
    console.log(`📋 Available endpoints:`)
    console.log(`   POST /api/auth/signup`)
    console.log(`   POST /api/auth/login`)
    console.log(`   GET  /api/auth/me`)
    console.log(`   POST /api/payments/create-order`)
    console.log(`   POST /api/payments/verify`)
    console.log(`   GET  /api/payments/history`)
  })
}

startServer()

// Export for use in other files
module.exports = { sql, razorpay } // Export razorpay as well
