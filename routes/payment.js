import express from "express";
import Transaction from "../models/Transaction.js";
import axios from "axios";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

/* =========================
   ADD TRANSACTION
========================= */
router.post("/add", authMiddleware, async (req, res) => {
  try {
    let { upi_id, amount, date, time, type } = req.body;

    if (!upi_id || !amount || !date || !time || !type) {
      return res.status(400).json({ error: "All fields required" });
    }

    const userId = req.user._id;

    let Fraud_Result = false;
    let Risk_Score = 0;

    /* =========================
       CALL FLASK ML API
    ========================= */
    try {
      const mlRes = await axios.post(
        "http://127.0.0.1:8000/predict",
        {
          upi_id,
          amount,
          date,
          time,
          type
        },
        {
          headers: {
            "Content-Type": "application/json"
          },
          timeout: 5000
        }
      );

      console.log("🔥 ML RESPONSE:", mlRes.data);

      Fraud_Result = mlRes.data.Fraud_Result;
      Risk_Score = mlRes.data.Risk_Score;

    } catch (err) {
      console.error("❌ ML ERROR:", err.message);
    }

    /* =========================
       SAVE TO DB
    ========================= */
    const transaction = await Transaction.create({
      upi_id,
      amount,
      date,
      time,
      type,
      Fraud_Result,
      Risk_Score,
      userId
    });

    res.status(201).json(transaction);

  } catch (err) {
    console.error("ADD ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
});


/* =========================
   GET HISTORY
========================= */
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 });

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* =========================
   CLEAR HISTORY
========================= */
router.delete("/clear", authMiddleware, async (req, res) => {
  try {
    await Transaction.deleteMany({ userId: req.user._id });
    res.json({ message: "Cleared" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


/* =========================
   SYSTEM STATS (ALL USERS)
========================= */
router.get("/system-stats", async (req, res) => {
  try {
    const Transaction = (await import("../models/Transaction.js")).default;
    const User = (await import("../models/User.js")).default;

    // total users
    const totalUsers = await User.countDocuments();

    // total transactions
    const totalTx = await Transaction.countDocuments();

    // safe & fraud
    const safeTx = await Transaction.countDocuments({ Fraud_Result: false });
    const fraudTx = await Transaction.countDocuments({ Fraud_Result: true });

    const safePercent = totalTx
      ? Math.round((safeTx / totalTx) * 100)
      : 0;

    const fraudPercent = totalTx
      ? Math.round((fraudTx / totalTx) * 100)
      : 0;

    res.json({
      totalUsers,
      safePercent,
      fraudPercent
    });

  } catch (err) {
    console.error("SYSTEM STATS ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});
export default router;