const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const createAuthMiddleware = require("../middleware/auth");

/**
 * Factory function to create authentication routes.
 * @param {object} db - The initialized database connection.
 * @returns {object} Express Router instance.
 */
module.exports = function(db) {
  const router = express.Router();
  const authenticateToken = createAuthMiddleware(db);

  // Helper to generate JWT
  const generateToken = (userId) => {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
  };

  // @route   POST /api/auth/signup
  // @desc    Register a new user
  router.post("/signup", async (req, res) => {
    try {
      const { name, email, password } = req.body;

      // Basic validation
      if (!name || !email || !password || password.length < 8) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid name, email, and a password of at least 8 characters.",
        });
      }

      // Check if user already exists
      const [existingUsers] = await db.execute("SELECT id FROM users WHERE email = ?", [email]);
      if (existingUsers.length > 0) {
        return res.status(400).json({ success: false, message: "User with this email already exists." });
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);

      // Insert new user
      const [result] = await db.execute(
        "INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)",
        [name, email, passwordHash]
      );
      const newUser = { id: result.insertId, name, email };

      // Generate token
      const token = generateToken(newUser.id);

      res.status(201).json({
        success: true,
        message: "Signup successful!",
        data: { user: newUser, token },
      });
    } catch (error) {
      console.error("Signup error:", error);
      res.status(500).json({ success: false, message: "Server error during signup." });
    }
  });

  // @route   POST /api/auth/login
  // @desc    Login a user
  router.post("/login", async (req, res) => {
     try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ success: false, message: "Please provide email and password." });
      }

      // Find user
      const [users] = await db.execute("SELECT id, name, email, password_hash FROM users WHERE email = ?", [email]);
      if (users.length === 0) {
        return res.status(401).json({ success: false, message: "Invalid credentials." });
      }
      const user = users[0];

      // Check password
      const isPasswordValid = await bcrypt.compare(password, user.password_hash);
      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: "Invalid credentials." });
      }
      
      const token = generateToken(user.id);
      
      const userResponse = { id: user.id, name: user.name, email: user.email };

      res.json({
        success: true,
        message: "Login successful",
        data: { user: userResponse, token },
      });
    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ success: false, message: "Server error during login." });
    }
  });

  // @route   GET /api/auth/me
  // @desc    Get current user's data
  router.get("/me", authenticateToken, (req, res) => {
    // req.user is attached by the authenticateToken middleware
    res.json({
      success: true,
      data: {
        user: req.user,
      },
    });
  });

  return router;
};
