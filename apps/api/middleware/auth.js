const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "voltaimart-dev-secret-change-me";
const JWT_EXPIRES_IN = "7d";

function signToken(user){
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/** Reads "Authorization: Bearer <token>", attaches req.user if valid. Does NOT reject if missing. */
function attachUser(req, res, next){
  const header = req.headers.authorization || "";
  const [, token] = header.split(" ");
  if (token){
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      req.user = { id: payload.sub, email: payload.email, name: payload.name, role: payload.role };
    } catch (e){
      // invalid/expired token — leave req.user undefined
    }
  }
  next();
}

/** Rejects the request if there's no valid, authenticated user. */
function requireAuth(req, res, next){
  if (!req.user){
    return res.status(401).json({ error: "Not authenticated. Please log in." });
  }
  next();
}

/** Rejects the request unless req.user.role is one of the allowed roles. */
function requireRole(...roles){
  return (req, res, next) => {
    if (!req.user){
      return res.status(401).json({ error: "Not authenticated. Please log in." });
    }
    if (!roles.includes(req.user.role)){
      return res.status(403).json({ error: `Requires role: ${roles.join(" or ")}` });
    }
    next();
  };
}

module.exports = { signToken, attachUser, requireAuth, requireRole, JWT_SECRET };
