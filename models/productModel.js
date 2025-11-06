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
    variants: [
      {
        color: { type: String, required: true },
        size: { type: String, required: true },
        price: { type: Number, required: true },
        stock: { type: Number, default: 0 },
      },
    ],
    outfitTags: [String],
    compatibleProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    featureVector: { type: [Number], default: [] },
    // Amazon identifiers for data mapping
    amazonAsin: { type: String, index: true },
    amazonParentAsin: { type: String, index: true },
  },
  {
    timestamps: true,
  }
);

productSchema.pre("save", function (next) {
  let totalCountInStock = 0;

  if (this.variants && this.variants.length > 0) {
    totalCountInStock = this.variants.reduce((sum, variant) => {
      return sum + (variant.stock || 0);
    }, 0);
  } else if (this.size) {
    totalCountInStock += this.size.s + this.size.m + this.size.l + this.size.xl;
  }

  this.countInStock = totalCountInStock;

  next();
});

const Product = mongoose.model("Product", productSchema);

export default Product;
