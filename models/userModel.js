import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { type } from "os";

const userSchema = mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: false,
    },
    isAdmin: {
      type: Boolean,
      required: true,
      default: false,
    },
    height: {
      type: Number,
      required: false,
    },
    weight: {
      type: Number,
      required: false,
    },
    gender: {
      type: String,
      required: false,
      enum: ['male', 'female', 'other'],
      lowercase: true,
    },
    age: {
      type: Number,
      required: false,
      min: 13,
      max: 100,
    },
    resetPasswordToken: {
      type: String,
    },
    resetPasswordExpire: {
      type: Date,
    },
    unhashedResetPasswordToken: {
      type: String,
    },
    favorites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
      },
    ],
    // Thông tin cho hệ thống gợi ý
    preferences: {
      style: {
        type: String,
        enum: ['casual', 'formal', 'sport', 'vintage', 'modern', 'bohemian'],
        default: 'casual',
      },
      colorPreferences: [{
        type: String,
        enum: ['black', 'white', 'red', 'blue', 'green', 'yellow', 'pink', 'purple', 'orange', 'brown', 'gray'],
      }],
      priceRange: {
        min: {
          type: Number,
          default: 0,
        },
        max: {
          type: Number,
          default: 1000000,
        },
      },
      brandPreferences: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: "Brand",
      }],
    },
    // Lịch sử tương tác cho Collaborative Filtering
    interactionHistory: [{
      productId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      interactionType: {
        type: String,
        // xem, thích, mua, giỏ hàng, review
        enum: ['view', 'like', 'purchase', 'cart', 'review'],
        required: true,
      },
      rating: {
        type: Number,
        min: 1,
        max: 5,
      },
      timestamp: {
        type: Date,
        default: Date.now,
      },
    }],
    // Thông tin cho GNN (Graph Neural Network)
    userEmbedding: {
      type: [Number], // Vector embedding cho GNN
      default: [],
    },
    // Thông tin cho Content-based Filtering
    contentProfile: {
      categoryWeights: [{
        categoryId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Category",
        },
        weight: {
          type: Number,
          default: 0,
        },
      }],
      featureVector: {
        type: [Number], // Vector đặc trưng cho content-based
        default: [],
      },
    },
    // Lịch sử outfit cho hệ thống gợi ý
    outfitHistory: [{
      outfitId: { type: String }, // ID duy nhất của outfit
      products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
      interactionType: { type: String, enum: ['view', 'like', 'purchase'] },
      timestamp: { type: Date, default: Date.now }
    }],
  },
  {
    timestamps: true,
  }
);

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

// Encrypt password before save it to database
userSchema.pre("save", async function (next) {
  // Nếu không chỉnh sửa mật khẩu thì không hash lại mật khẩu
  if (!this.isModified("password")) {
    next();
  }
  // Hash mật khẩu chỉ khi tồn tại
  if (this.password) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
});
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString("hex");
  this.resetPasswordToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;
  return resetToken;
};

// Phương thức cho hệ thống gợi ý
userSchema.methods.addInteraction = function (productId, interactionType, rating = null) {
  this.interactionHistory.push({
    productId,
    interactionType,
    rating,
    timestamp: new Date(),
  });
  return this.save();
};

userSchema.methods.updatePreferences = function (preferences) {
  if (preferences.style) this.preferences.style = preferences.style;
  if (preferences.colorPreferences) this.preferences.colorPreferences = preferences.colorPreferences;
  if (preferences.priceRange) this.preferences.priceRange = preferences.priceRange;
  if (preferences.brandPreferences) this.preferences.brandPreferences = preferences.brandPreferences;
  return this.save();
};

userSchema.methods.getUserProfile = function () {
  return {
    userId: this._id,
    age: this.age,
    gender: this.gender,
    height: this.height,
    weight: this.weight,
    preferences: this.preferences,
    interactionCount: this.interactionHistory.length,
    hasEmbedding: this.userEmbedding.length > 0,
    hasContentProfile: this.contentProfile.featureVector.length > 0,
  };
};

// Static method để lấy users cho training GNN
userSchema.statics.getUsersForGNN = function () {
  return this.find({
    $and: [
      { age: { $exists: true, $ne: null } },
      { gender: { $exists: true, $ne: null } },
      { 'interactionHistory.0': { $exists: true } }
    ]
  }).select('_id age gender height weight preferences interactionHistory userEmbedding');
};

// Static method để lấy users cho Content-based Filtering
userSchema.statics.getUsersForContentBased = function () {
  return this.find({
    $and: [
      { age: { $exists: true, $ne: null } },
      { gender: { $exists: true, $ne: null } },
      { 'preferences.style': { $exists: true } }
    ]
  }).select('_id age gender preferences contentProfile interactionHistory');
};

const User = mongoose.model("User", userSchema);

export default User;
