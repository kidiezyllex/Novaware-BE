import mongoose from "mongoose";

const sizeSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
    }, // 'S', 'M', 'L', 'XL'
  },
  {
    timestamps: true,
  }
);

const Size = mongoose.model("Size", sizeSchema);

export default Size;
