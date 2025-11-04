import mongoose from "mongoose";

const reviewSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    rating: {
      type: Number,
      required: true,
    },
    comment: {
      type: String,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

const productSchema = mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      auto: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    name: {
      type: String,
      required: true,
    },
    images: [String],
    brand: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    reviews: [reviewSchema],
    rating: {
      type: Number,
      required: true,
      default: 0,
    },
    numReviews: {
      type: Number,
      required: true,
      default: 0,
    },
    price: {
      type: Number,
      required: true,
      default: 0,
    },
    sale: {
      type: Number,
      required: true,
      default: 0,
    },
    countInStock: {
      type: Number,
      required: true,
      default: 0,
    },
    size: {
      s: {
        type: Number,
        default: 0,
      },
      m: {
        type: Number,
        default: 0,
      },
      l: {
        type: Number,
        default: 0,
      },
      xl: {
        type: Number,
        default: 0,
      },
    },
    colors: [
      {
        name: { type: String, required: true },
        hexCode: { type: String, required: true },
      },
    ],
    // Variants theo tổ hợp color (hex) × size (mã ngắn)
    variants: [
      {
        color: { type: String, required: true }, // ví dụ: "#eee"
        size: { type: String, required: true },  // ví dụ: "sm", "md", "lg", "xl"
        price: { type: Number, required: true },
        stock: { type: Number, default: 0 },
      },
    ],
    // Tags cho outfit và styling
    outfitTags: [String], // ['top', 'bottom', 'accessory', 'summer', 'casual']
    // Sản phẩm tương thích cho outfit matching
    compatibleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    // Vector đặc trưng cho content-based filtering
    featureVector: { type: [Number], default: [] },
  },
  {
    timestamps: true,
  }
);

productSchema.pre("save", function (next) {
  let totalCountInStock = 0;

  // Tính tổng số lượng từ variants (ưu tiên)
  if (this.variants && this.variants.length > 0) {
    totalCountInStock = this.variants.reduce((sum, variant) => {
      return sum + (variant.stock || 0);
    }, 0);
  } else if (this.size) {
    // Fallback to old size structure if variants not available
    totalCountInStock += this.size.s + this.size.m + this.size.l + this.size.xl;
  }

  // Cập nhật countInStock
  this.countInStock = totalCountInStock;

  next();
});

const Product = mongoose.model("Product", productSchema);

export default Product;
