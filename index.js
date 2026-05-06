import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import connectDB from "./db/db.js";
import authRoutes from "./routes/auth.js";
import transactionRoutes from "./routes/payment.js";

dotenv.config();

const app = express();

/* MIDDLEWARE */
app.use(cors({
  origin: "http://localhost:5173",
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ROUTES */
app.use("/api/auth", authRoutes);
app.use("/api/transactions", transactionRoutes);

/* TEST */
app.get("/", (req, res) => {
  res.json({ message: "Backend Working ✅" });
});

/* SERVER */
const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});