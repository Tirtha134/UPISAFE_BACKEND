import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    upi_id: { type: String, required: true, trim: true },
    amount: { type: Number, required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    type: { type: String, required: true },

    Fraud_Result: { type: Boolean, default: false },
    Risk_Score: { type: Number, default: 0 },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Transaction", transactionSchema);