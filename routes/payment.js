import express from "express";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import axios from "axios";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:8000/predict";

// =========================
// NORMALIZE TYPE HELPER
// Accepts:  "PAYMENT", "RECEIVE", "RECEIVED", "receive", etc.
// Returns:  "PAYMENT" | "RECEIVE"
// =========================
function normalizeType(raw) {
  const val = String(raw || "").toUpperCase().trim();
  if (val === "PAYMENT") return "PAYMENT";
  // Accept "RECEIVE" and common mistakes like "RECEIVED"
  if (val === "RECEIVE" || val === "RECEIVED" || val === "CREDIT") return "RECEIVE";
  return "PAYMENT"; // safe default
}


/* =========================
   ADD TRANSACTION
========================= */
router.post("/add", authMiddleware, async (req, res) => {
  try {
    let { upi_id, amount, date, time, type } = req.body;

    // ── Basic validation ─────────────────────────────────────────
    if (!upi_id || !amount || !date || !time || !type) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: "Amount must be a positive number" });
    }

    // Normalize type before anything else
    const normalizedType = normalizeType(type);
    const userId = req.user._id;

    // ML result defaults
    let Fraud_Result = false;
    let Risk_Score   = 0;
    let Risk_Level   = "LOW ✅";
    let mlCalled     = false;

    /* =========================
       CALL FLASK ML API
    ========================= */
    try {
      const mlRes = await axios.post(
        ML_API_URL,
        {
          upi_id,
          amount:  parsedAmount,
          date,
          time,
          type:    normalizedType,
        },
        {
          headers: { "Content-Type": "application/json" },
          timeout: 10000,
        }
      );

      console.log("🔥 ML RESPONSE:", mlRes.data);

      Fraud_Result = Boolean(mlRes.data.Fraud_Result);
      Risk_Score   = typeof mlRes.data.Risk_Score === "number" ? mlRes.data.Risk_Score : 0;
      Risk_Level   = typeof mlRes.data.Risk_Level === "string" ? mlRes.data.Risk_Level : "LOW ✅";
      mlCalled     = true;

    } catch (err) {
      const detail = err.response
        ? `status ${err.response.status}: ${JSON.stringify(err.response.data)}`
        : err.message;
      console.error("❌ ML ERROR:", detail);
    }

    /* =========================
       SAVE TO DB
    ========================= */
    const transaction = await Transaction.create({
      upi_id,
      amount:       parsedAmount,
      date,
      time,
      type:         normalizedType,   // always "PAYMENT" or "RECEIVE"
      Fraud_Result,
      Risk_Score,
      Risk_Level,
      userId,
    });

    return res.status(201).json({
      ...transaction.toObject(),
      ml_checked: mlCalled,
    });

  } catch (err) {
    console.error("ADD ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


/* =========================
   GET HISTORY
========================= */
router.get("/all", authMiddleware, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    return res.json(data);

  } catch (err) {
    console.error("GET HISTORY ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


/* =========================
   CLEAR HISTORY
========================= */
router.delete("/clear", authMiddleware, async (req, res) => {
  try {
    const result = await Transaction.deleteMany({ userId: req.user._id });
    return res.json({
      message: "Transaction history cleared",
      deleted: result.deletedCount,
    });

  } catch (err) {
    console.error("CLEAR ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});


/* =========================
   SYSTEM STATS (ALL USERS)
========================= */
router.get("/system-stats", async (req, res) => {
  try {
    const [totalUsers, totalTx, safeTx, fraudTx] = await Promise.all([
      User.countDocuments(),
      Transaction.countDocuments(),
      Transaction.countDocuments({ Fraud_Result: false }),
      Transaction.countDocuments({ Fraud_Result: true }),
    ]);

    const safePercent  = totalTx ? Math.round((safeTx  / totalTx) * 100) : 0;
    const fraudPercent = totalTx ? Math.round((fraudTx / totalTx) * 100) : 0;

    return res.json({
      totalUsers,
      totalTransactions: totalTx,
      safePercent,
      fraudPercent,
    });

  } catch (err) {
    console.error("SYSTEM STATS ERROR:", err.message);
    return res.status(500).json({ error: "Server error" });
  }
});

export default router;