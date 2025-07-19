const express = require("express")
const crypto = require("crypto")
// Removed: const { sql, razorpay } = require("../server") // No longer needed, 'sql' and 'razorpayInstance' will be passed as arguments
// Removed: const { authenticateToken } = require("../middleware/auth") // No longer needed, 'authenticateToken' will be passed as an argument

// Export a function that takes 'sql', 'razorpayInstance', and 'authenticateToken' as arguments
module.exports = (sql, razorpayInstance, authenticateToken) => {
  const router = express.Router()

  // @route   POST /api/payments/create-order
  // @desc    Create Razorpay order
  // @access  Private
  router.post("/create-order", authenticateToken, async (req, res) => {
    try {
      if (!razorpayInstance) {
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

      const order = await razorpayInstance.orders.create(options) // Use razorpayInstance

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
  // @desc    Verify Razorpay payment
  // @access  Private
  router.post("/verify", authenticateToken, async (req, res) => {
    try {
      if (!razorpayInstance) {
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
      const payments = await sql`
        SELECT id FROM payments 
        WHERE user_id = ${userId} AND razorpay_order_id = ${razorpay_order_id}
      `

      if (payments.length === 0) {
        return res.status(404).json({
          success: false,
          message: "Payment record not found",
        })
      }

      const payment = payments[0]

      // Update payment as verified
      await sql`
        UPDATE payments 
        SET razorpay_payment_id = ${razorpay_payment_id}, 
            razorpay_signature = ${razorpay_signature}, 
            verified = TRUE, 
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
  // @desc    Get user's payment history
  // @access  Private
  router.get("/history", authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id

      const payments = await sql`
        SELECT 
          id, amount, status, verified, created_at, razorpay_payment_id
        FROM payments 
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
      `

      res.json({
        success: true,
        data: {
          payments,
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

  return router
}
