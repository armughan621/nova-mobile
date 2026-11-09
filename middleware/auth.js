const jwt = require("jsonwebtoken");
const User = require("../models/user");

async function authenticate(req, res, next) {
  const authorization = req.headers.authorization;
  const token = typeof authorization === "string"
    ? authorization.match(/^Bearer\s+(.+)$/i)?.[1]
    : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(500).json({ message: "JWT_SECRET is not configured" });
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }

  const user = await User.findById(payload.userId).select("_id role isActive");
  if (!user || user.isActive === false) {
    return res.status(401).json({ message: "User no longer exists" });
  }

  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

function requireAdminForInactive(req, res, next) {
  if (req.query.includeInactive !== "true") {
    return next();
  }

  return authenticate(req, res, () => requireAdmin(req, res, next));
}

module.exports = { authenticate, requireAdmin, requireAdminForInactive };
