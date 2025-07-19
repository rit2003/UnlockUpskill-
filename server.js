const express = require("express")
const cors = require("cors")
const dotenv = require("dotenv")
const { neon } = require("@neondatabase/serverless")
const bcrypt = require("bcryptjs")
const jwt = require("jsonwebtoken")
const crypto = require("crypto")
const Razorpay = require("razorpay")
const path = require("path") // --- ADD THIS ---

//import route factories 
const authRoutesFactory = require("./routes/auth");
const paymentRoutesFactory = require("./routes/payment");

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cors())
app.use(express.json())
app.use(express.static(path.join(__dirname, 'public')))

// Neon PostgreSQL connection
let sql

// ... (The rest of your connectDB, Razorpay, and other functions remain unchanged)
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

// Auth Middleware
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"]
    const token = authHeader && authHeader.split(" ")[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Access token required",
      })
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    // Check if user still exists
    const result = await sql`SELECT id, name, email FROM users WHERE id = ${decoded.userId}`

    if (result.length === 0) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      })
    }

    // Add user info to request
    req.user = result[0]
    next()
  } catch (error) {
    console.error("Auth middleware error:", error)
    return res.status(403).json({
      success: false,
      message: "Invalid or expired token",
    })
  }
}

// Generate JWT token
const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET environment variable is required")
  }
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" })
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

// AUTH ROUTES
// @route   POST /api/auth/signup
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { name, email, password } = req.body

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, and password",
      })
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      })
    }

    // Check if user already exists
    const existingUser = await sql`SELECT id FROM users WHERE email = ${email}`

    if (existingUser.length > 0) {
      return res.status(400).json({
        success: false,
        message: "User with this email already exists",
      })
    }

    // Hash password
    const saltRounds = 12
    const passwordHash = await bcrypt.hash(password, saltRounds)

    // Create user
    const result = await sql`
      INSERT INTO users (name, email, password_hash) 
      VALUES (${name}, ${email}, ${passwordHash}) 
      RETURNING id
    `

    const userId = result[0].id

    // Generate token
    const token = generateToken(userId)

    res.status(201).json({
      success: true,
      message: "User registered successfully",
      data: {
        user: {
          id: userId,
          name,
          email,
        },
        token,
      },
    })
  } catch (error) {
    console.error("Signup error:", error)
    res.status(500).json({
      success: false,
      message: "Registration failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// @route   POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password",
      })
    }

    // Find user
    const result = await sql`
      SELECT id, name, email, password_hash 
      FROM users 
      WHERE email = ${email}
    `

    if (result.length === 0) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      })
    }

    const user = result[0]

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash)

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      })
    }

    // Generate token
    const token = generateToken(user.id)

    res.json({
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
        token,
      },
    })
  } catch (error) {
    console.error("Login error:", error)
    res.status(500).json({
      success: false,
      message: "Login failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// @route   GET /api/auth/me
app.get("/api/auth/me", authenticateToken, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
    },
  })
})

// PAYMENT ROUTES
// @route   POST /api/payments/create-order
app.post("/api/payments/create-order", authenticateToken, async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Payment service not configured",
      })
    }

    const { amount } = req.body // Amount in rupees
    const userId = req.user.id

    if (!amount || amount < 1) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      })
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // Amount in paise
      currency: "INR",
      receipt: `user_${userId}_${Date.now()}`,
      notes: {
        userId: userId,
        userName: req.user.name,
      },
    }

    const order = await razorpay.orders.create(options)

    // Store order in database
    await sql`
      INSERT INTO payments (user_id, razorpay_order_id, amount, status) 
      VALUES (${userId}, ${order.id}, ${amount}, 'created')
    `

    res.json({
      success: true,
      data: {
        order,
        amount: amount,
      },
    })
  } catch (error) {
    console.error("Create order error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to create payment order",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// @route   POST /api/payments/verify
app.post("/api/payments/verify", authenticateToken, async (req, res) => {
  try {
    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: "Payment service not configured",
      })
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body

    const userId = req.user.id

    // Verify signature
    const body = razorpay_order_id + "|" + razorpay_payment_id
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest("hex")

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      })
    }

    // Find payment record
    const paymentResult = await sql`
      SELECT id FROM payments 
      WHERE user_id = ${userId} AND razorpay_order_id = ${razorpay_order_id}
    `

    if (paymentResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      })
    }

    const payment = paymentResult[0]

    // Update payment as verified
    await sql`
      UPDATE payments 
      SET razorpay_payment_id = ${razorpay_payment_id}, 
          razorpay_signature = ${razorpay_signature}, 
          verified = true, 
          status = 'completed', 
          verified_at = NOW() 
      WHERE id = ${payment.id}
    `

    res.json({
      success: true,
      message: "Payment verified successfully",
      data: {
        couponCode: "UPSKILL50", // Static coupon code
        redirectUrl: "https://www.udemy.com/course/the-complete-web-development-bootcamp/",
      },
    })
  } catch (error) {
    console.error("Payment verification error:", error)
    res.status(500).json({
      success: false,
      message: "Payment verification failed",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// @route   GET /api/payments/history
app.get("/api/payments/history", authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id

    const result = await sql`
      SELECT id, amount, status, verified, created_at, razorpay_payment_id
      FROM payments 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `

    res.json({
      success: true,
      data: {
        payments: result,
      },
    })
  } catch (error) {
    console.error("Get payment history error:", error)
    res.status(500).json({
      success: false,
      message: "Failed to fetch payment history",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    })
  }
})

// --- ADD THIS ---
// This catch-all route should be AFTER all your API routes
// It serves the frontend application for any route not handled by the API
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

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
  let db, razorpay;

  try {
    // 1. Connect to Neon Database
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set.");
    }
    const sql = neon(process.env.DATABASE_URL);
    // Create a db object with an execute method for queries
    db = {
      execute: (query, params) => sql(query, params),
    };
    // Test the connection
    await db.execute(`SELECT NOW()`);
    console.log("✅ Neon PostgreSQL connected successfully.");

    // 2. Initialize Razorpay
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
        throw new Error("Razorpay Key ID and Key Secret must be configured in .env");
    }
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
    console.log("💳 Razorpay instance configured.");

    // 3. Setup API Routes (Injecting dependencies like db and razorpay)
    const authRoutes = authRoutesFactory(db);
    const paymentRoutes = paymentRoutesFactory(db, razorpay);

    app.use("/api/auth", authRoutes);
    app.use("/api/payments", paymentRoutes);
    
    // --- Health Check Endpoint ---
    app.get("/api/health", (req, res) => {
        res.json({ status: "ok", timestamp: new Date() });
    });

    // --- Frontend Catch-all Route ---
    // This route serves your index.html for any request that doesn't match an API route
    // This is important for single-page applications.
    app.get('*', (req, res) => {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    });

    // --- Error Handling Middleware ---
    app.use((err, req, res, next) => {
      console.error("Unhandled Error:", err);
      res.status(500).json({
        success: false,
        message: "An internal server error occurred.",
      });
    });

    // 5. Start Listening for Requests
    app.listen(PORT, () => {
      console.log(`🚀 Server is running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// --- Start the server ---
startServer();

// Export for use in other files
module.exports = { sql }
