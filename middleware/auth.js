const jwt = require("jsonwebtoken")

// Export a function that takes 'sql' as an argument
// This creates a closure, so 'sql' is available when authenticateToken is called
module.exports = {
  authenticateToken: (sql) => async (req, res, next) => {
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
      const users = await sql`SELECT id, name, email FROM users WHERE id = ${decoded.userId}`

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        })
      }

      // Add user info to request
      req.user = users[0]
      next()
    } catch (error) {
      console.error("Auth middleware error:", error)
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token",
      })
    }
  },
}
