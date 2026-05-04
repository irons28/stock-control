const rateLimit = require("express-rate-limit");

// Generous limit suitable for an internal multi-user tool.
// Prevents runaway scripts and accidental hammering, not adversarial abuse.
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,       // 1 minute
  max: 200,                  // 200 write requests per IP per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: true, message: "Too many requests. Please slow down." },
  skip: (req) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS",
});

module.exports = { writeLimiter };
