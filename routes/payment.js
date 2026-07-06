import express from "express";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";
import axios from "axios";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

const ML_API_URL = process.env.ML_API_URL || "http://127.0.0.1:5000/";

// =========================
// NORMALIZE TYPE HELPER
// Accepts: "Requested", "requested", "REQUEST" etc.
// Returns: "Requested" | "Debited" | null (invalid)
// =========================
function normalizeType(raw) {
  const val = String(raw || "").trim().toLowerCase();
  if (val === "requested" || val === "request") return "Requested";
  if (val === "debited" || val === "debit") return "Debited";
  return null;
}

// =========================
// PARSE dd-mm-yyyy -> Date object (midnight)
// =========================
function parseDDMMYYYY(dateStr) {
  const parts = String(dateStr || "").split("-");
  if (parts.length !== 3) return null;

  const [dd, mm, yyyy] = parts.map(Number);
  if (!dd || !mm || !yyyy) return null;

  const d = new Date(yyyy, mm - 1, dd);
  if (d.getDate() !== dd || d.getMonth() !== mm - 1 || d.getFullYear() !== yyyy) {
    return null; // catches invalid dates like 31-02-2026
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

// =========================
// VALIDATE 24-hour HH:MM
// =========================
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

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

    // Normalize + validate type
    const normalizedType = normalizeType(type);
    if (!normalizedType) {
      return res.status(400).json({ error: "Type must be 'Requested' or 'Debited'" });
    }

    // Validate date format (dd-mm-yyyy)
    const parsedDate = parseDDMMYYYY(date);
    if (!parsedDate) {
      return res.status(400).json({ error: "Date must be in dd-mm-yyyy format" });
    }

    // Validate time format (24hr HH:MM)
    if (!TIME_REGEX.test(time)) {
      return res.status(400).json({ error: "Time must be in 24-hour HH:MM format" });
    }

    // ── Type vs Date business rule ──────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (normalizedType === "Requested" && parsedDate < today) {
      return res.status(400).json({
        error: "⚠️ 'Requested' payments must be for today or a future date.",
      });
    }

    if (normalizedType === "Debited" && parsedDate > today) {
      return res.status(400).json({
        error: "⚠️ 'Debited' payments must be for today or a past date.",
      });
    }

    const userId = req.user._id;

    // ML result defaults
    let Fraud_Result = false;
    let Risk_Score   = 0;
    let Risk_Level   = "LOW ✅";
    let mlCalled     = false;

    /* =========================
       CALL FLASK ML API
       NOTE: Flask reads request.form.get(...), so this MUST be
       sent as x-www-form-urlencoded, not JSON.
    ========================= */
    try {
      const params = new URLSearchParams();
      params.append("upi_id", upi_id);
      params.append("amount", parsedAmount);
      params.append("date", date);   // dd-mm-yyyy string, as sent by frontend
      params.append("time", time);   // HH:MM (24hr)
      params.append("type", normalizedType); // "Requested" | "Debited"

      const mlRes = await axios.post(ML_API_URL, params, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000,
      });

      console.log("🔥 ML RESPONSE:", mlRes.data);

      // Flask returns Fraud_Result / Risk_Score as strings — convert them
      Fraud_Result = String(mlRes.data.Fraud_Result).toLowerCase() === "true";
      Risk_Score   = Number(mlRes.data.Risk_Score) || 0;
      Risk_Level   = Fraud_Result ? "HIGH ⚠️" : "LOW ✅";
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
      date,          // stored as dd-mm-yyyy
      time,          // stored as HH:MM (24hr)
      type:         normalizedType,   // "Requested" | "Debited"
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
