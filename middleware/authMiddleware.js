import jwt from "jsonwebtoken";
import User from "../models/User.js";

const authMiddleware = async (req, res, next) => {
  try {
    let token;

    // ✅ 1. From header
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    // ✅ 2. From cookie
    if (!token && req.cookies?.token) {
      token = req.cookies.token;
    }

    if (!token) {
      console.log("❌ TOKEN NOT FOUND");
      return res.status(401).json({
        success: false,
        message: "No token, authorization denied"
      });
    }

    console.log("✅ TOKEN RECEIVED:", token);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    req.user = user;
    next();

  } catch (error) {
    console.error("AUTH ERROR:", error.message);
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }
};

export default authMiddleware;