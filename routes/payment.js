const express = require("express");
const crypto = require("crypto");
const createAuthMiddleware = require("../middleware/auth");

/**
 * Factory function to create payment routes.
 * @param {object} db - The initialized database connection.
 * @param {object} razorpay - The initialized Razorpay instance.
 * @returns {object} Express Router instance.
 */
module.exports = function(db, razorpay) {
  const router = express.Router();
  const authenticateToken = createAuthMiddleware(db);

  // @route   GET /api/payments/get-key
  // @desc    Get Razorpay Key ID for the frontend
  router.get("/get-key", (req, res) => {
    res.json({ success: true, key: process.env.RAZORPAY_KEY_ID });
  });

  // @route   POST /api/payments/create-order
  // @desc    Create a new Razorpay order
  router.post("/create-order", authenticateToken, async (req, res) => {
    try {
      const { amount } = req.body;
      const userId = req.user.id;

      if (!amount || amount < 1) {
        return res.status(400).json({ success: false, message: "A valid amount is required." });
      }

      const options = {
        amount: amount * 100, // Razorpay expects amount in the smallest currency unit (paise)
        currency: "INR",
        receipt: `receipt_user_${userId}_${Date.now()}`,
        notes: {
          userId: userId,
          userName: req.user.name,
          userEmail: req.user.email,
        },
      };

      const order = await razorpay.orders.create(options);
      
      // Store the created order in the database
      await db.execute(
        "INSERT INTO payments (user_id, razorpay_order_id, amount, status) VALUES (?, ?, ?, ?)",
        [userId, order.id, amount, "created"]
      );

      res.json({ success: true, data: { order, amount } });
    } catch (error) {
      console.error("Create order error:", error);
      res.status(500).json({ success: false, message: "Failed to create payment order." });
    }
  });

  // @route   POST /api/payments/verify-payment
  // @desc    Verify payment signature after successful payment
  router.post("/verify-payment", authenticateToken, async (req, res) => {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
      const userId = req.user.id;

      const body = razorpay_order_id + "|" + razorpay_payment_id;

      // Verify the signature
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: "Payment verification failed. Signature mismatch." });
      }

      // Signature is valid, now update the database
      await db.execute(
        "UPDATE payments SET razorpay_payment_id = ?, razorpay_signature = ?, verified = TRUE, status = 'completed', verified_at = NOW() WHERE razorpay_order_id = ? AND user_id = ?",
        [razorpay_payment_id, razorpay_signature, razorpay_order_id, userId]
      );
      
      // Respond with success and course details
      res.json({
        success: true,
        message: "Payment verified successfully!",
        data: {
          couponCode: "UPSKILL50", // Example coupon
          redirectUrl: "https://www.udemy.com/course/the-complete-web-development-bootcamp/", // Example redirect
        },
      });

    } catch (error) {
      console.error("Payment verification error:", error);
      res.status(500).json({ success: false, message: "Server error during payment verification." });
    }
  });

  return router;
};
