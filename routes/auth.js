import express from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";

const router = express.Router();

/* ================= REGISTER ================= */
router.post("/register", async (req, res) => {
  try {
    let { name, phone, email, password } = req.body;

    // ✅ Normalize input
    name = name?.trim();
    phone = phone?.trim();
    email = email?.trim().toLowerCase();

    // ✅ Validation
    if (!name || !phone || !email || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    // ✅ Check existing user
    const exists = await User.findOne({
      $or: [{ email }, { phone }],
    });

    if (exists) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // ✅ Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // ✅ Create user
    const newUser = await User.create({
      name,
      phone,
      email,
      password: hashedPassword,
    });

    res.status(201).json({
      success: true,
      message: "Account created successfully",
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
      },
    });

  } catch (error) {
    console.error("REGISTER ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


/* ================= LOGIN ================= */
router.post("/login", async (req, res) => {
  try {
    let { identifier, password } = req.body;

    identifier = identifier?.trim().toLowerCase();

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    // ✅ Find user
    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    // ✅ Compare password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    // ✅ Create token
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "7d" }
    );

    // ✅ Cookie
    res.cookie("token", token, {
      httpOnly: true,
      secure: false, // 🔥 true in production (HTTPS)
      sameSite: "lax",
      path:"/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token, // 🔥 IMPORTANT (frontend can use it)
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
      },
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


/* ================= LOGOUT ================= */
router.post("/logout", (req, res) => {
  try {
    res.clearCookie("token");

    res.json({
      success: true,
      message: "Logged out successfully",
    });

  } catch (error) {
    console.error("LOGOUT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


/* ================= FORGOT PASSWORD ================= */
router.post("/forgot-password", async (req, res) => {
  try {
    let { identifier, newPassword } = req.body;

    identifier = identifier?.trim().toLowerCase();

    if (!identifier || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "All fields required",
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters",
      });
    }

    const user = await User.findOne({
      $or: [{ email: identifier }, { phone: identifier }],
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    res.json({
      success: true,
      message: "Password reset successful",
    });

  } catch (error) {
    console.error("FORGOT PASSWORD ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/* ================= TOTAL USERS ================= */
router.get("/users-count", async (req, res) => {
  try {
    const count = await User.countDocuments();

    res.json({
      success: true,
      totalUsers: count
    });

  } catch (error) {
    console.error("USER COUNT ERROR:", error);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

export default router;