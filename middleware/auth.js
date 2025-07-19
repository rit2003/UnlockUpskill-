const jwt = require("jsonwebtoken");

/**
 * This is a factory function that creates the authentication middleware.
 * It takes the database connection `db` as an argument.
 * This pattern (dependency injection) avoids circular dependencies and initialization errors.
 * * @param {object} db - The database connection object.
 * @returns {function} The Express middleware function.
 */
module.exports = function(db) {
  return async function authenticateToken(req, res, next) {
    try {
      const authHeader = req.headers["authorization"];
      const token = authHeader && authHeader.split(" ")[1]; // Format: "Bearer TOKEN"

      if (!token) {
        return res.status(401).json({
          success: false,
          message: "Access denied. No token provided.",
        });
      }

      // Verify the token using the secret key
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check if the user from the token still exists in the database
      const [users] = await db.execute("SELECT id, name, email FROM users WHERE id = ?", [decoded.userId]);

      if (users.length === 0) {
        return res.status(401).json({
          success: false,
          message: "Authorization failed. User not found.",
        });
      }

      // Attach user information to the request object
      req.user = users[0];
      next(); // Proceed to the next middleware or route handler
    } catch (error) {
      console.error("Authentication middleware error:", error);
      return res.status(403).json({
        success: false,
        message: "Invalid or expired token.",
      });
    }
  };
};
