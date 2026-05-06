const jwt = require("jsonwebtoken");

const TOKEN_TTL = process.env.AUTH_TOKEN_TTL || "12h";
const DEFAULT_SECRET = "stock-control-dev-secret";

function getJwtSecret() {
  return process.env.JWT_SECRET || DEFAULT_SECRET;
}

function signAuthToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      username: user.username,
      role: user.role,
      displayName: user.display_name || user.full_name,
    },
    getJwtSecret(),
    { expiresIn: TOKEN_TTL }
  );
}

function verifyAuthToken(token) {
  return jwt.verify(token, getJwtSecret());
}

module.exports = {
  signAuthToken,
  verifyAuthToken,
};
