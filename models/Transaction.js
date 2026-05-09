import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    upi_id: {
      type: String,
      required: [true, "UPI ID is required"],
      trim: true,
    },

    amount: {
      type: Number,
      required: [true, "Amount is required"],
      min: [0, "Amount cannot be negative"],
    },

    date: {
      type: String,
      required: [true, "Date is required"],
    },

    time: {
      type: String,
      required: [true, "Time is required"],
    },

    type: {
      type: String,
      required: [true, "Transaction type is required"],
      enum: ["PAYMENT", "RECEIVE"], 
    },

    Fraud_Result: {
      type: Boolean,
      default: false,
    },

    Risk_Score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
  },
  {
    timestamps: true, // adds createdAt & updatedAt automatically
  }
);

const Transaction = mongoose.model("Transaction", transactionSchema);

export default Transaction;