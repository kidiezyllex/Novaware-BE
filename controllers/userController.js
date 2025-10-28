import User from "../models/userModel.js";
import Product  from "../models/productModel.js";
import Order from "../models/orderModel.js";
import asyncHandler from "express-async-handler";
import generateToken from "../utils/generateToken.js";
import sendEmail from "../utils/sendEmail.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sendSuccess, sendError, sendValidationError, sendNotFound, sendUnauthorized, sendCreated } from "../utils/responseHelper.js";

const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (user && (await user.matchPassword(password))) {
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      token: generateToken(user._id),
    };
    sendSuccess(res, 200, "Login successful", userData);
  } else {
    if (!user) {
      sendUnauthorized(res, "Invalid email");
    } else {
      sendUnauthorized(res, "Invalid password");
    }
  }
});

const getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      height: user.height,
      weight: user.weight,
      gender: user.gender,
      isAdmin: user.isAdmin,
    };
    sendSuccess(res, 200, "User profile retrieved successfully", userData);
  } else {
    sendNotFound(res, "User not found");
  }
});

const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;
  const userExist = await User.findOne({ email });

  if (userExist) {
    sendValidationError(res, "User already existed");
    return;
  }

  const user = await User.create({
    name,
    email,
    password,
  });

  if (user) {
    const userData = {
      _id: user._id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
    };
    sendCreated(res, "User registered successfully", userData);
  } else {
    sendValidationError(res, "Invalid user data");
  }
});

const updateUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (user) {
    const { name, email } = req.body;

    user.name = name || user.name;
    user.email = email || user.email;
    if (req.body.password) {
      user.password = req.body.password;
    }
    user.height = req.body.height || user.height;
    user.weight = req.body.weight || user.weight;
    user.gender = req.body.gender || user.gender;

    const updatedUser = await user.save();

    const userData = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      height: updatedUser.height,
      weight: updatedUser.weight,
      gender: updatedUser.gender,
      isAdmin: updatedUser.isAdmin,
      token: generateToken(updatedUser._id),
    };
    sendSuccess(res, 200, "User profile updated successfully", userData);
  } else {
    sendNotFound(res, "User not found");
  }
});


const getUsers = asyncHandler(async (req, res) => {
  const users = await User.find({});
  sendSuccess(res, 200, "Users retrieved successfully", { users });
});

const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (user) {
    await user.remove();
    sendSuccess(res, 200, "User removed successfully");
  } else {
    sendNotFound(res, "User not found");
  }
});

const getUserById = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");

  if (user) {
    sendSuccess(res, 200, "User retrieved successfully", { user });
  } else {
    sendNotFound(res, "User not found");
  }
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select("-password");

  if (user) {
    const { name, email, isAdmin } = req.body;
    user.name = name || user.name;
    user.email = email || user.email;
    user.isAdmin = isAdmin;

    const updatedUser = await user.save();
    const userData = {
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      isAdmin: updatedUser.isAdmin,
    };
    sendSuccess(res, 200, "User updated successfully", { user: userData });
  } else {
    sendNotFound(res, "User not found");
  }
});

const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    sendNotFound(res, "User not found with this email");
    return;
  }

  const verificationCode = Math.floor(
    100000 + Math.random() * 900000
  ).toString();

  user.resetPasswordToken = verificationCode;
  user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  await user.save({ validateBeforeSave: false });

  const message = `You are receiving this email because you (or someone else) has requested the reset of a password. Your verification code is: ${verificationCode}\n\nIf you did not request this, please ignore this email.`;

  try {
    await sendEmail({
      email: user.email,
      subject: "Password reset request - Verification Code",
      message,
    });

    sendSuccess(res, 200, `Email sent to ${user.email} with verification code`);
  } catch (error) {
    console.error(error);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save({ validateBeforeSave: false });

    sendError(res, 500, "Email could not be sent");
  }
});

const verifyCode = asyncHandler(async (req, res) => {
  const { email, code } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    sendNotFound(res, "User not found with this email");
    return;
  }

  if (
    user.resetPasswordToken === code &&
    user.resetPasswordExpire > Date.now()
  ) {
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    const resetToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "10m",
    });

    const hashedResetToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedResetToken;
    user.unhashedResetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

    await user.save({ validateBeforeSave: false });

    sendSuccess(res, 200, "Verification successful", { resetToken });
  } else {
    sendValidationError(res, "Invalid or expired code");
  }
});

const resetPassword = asyncHandler(async (req, res) => {
  const authHeader = req.headers.authorization;
  const password = req.body.password;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    sendUnauthorized(res, "Not authorized, no token provided");
    return;
  }
  const token = authHeader.split(" ")[1];
  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,
    resetPasswordExpire: { $gt: Date.now() },
  });

  if (!user) {
    sendValidationError(res, "Invalid token or token has expired");
    return;
  }

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  await user.save();

  sendSuccess(res, 200, "Password updated successfully");
});

const addToFavorites = asyncHandler(async (req, res) => {
  const { productId } = req.body;
  const user = await User.findById(req.params.userId);
  const product = await Product.findById(productId);

  if (user && product) {
    if (!user.favorites.includes(productId)) {
      user.favorites.push(productId);
      await user.save();
      sendCreated(res, "Product added to favorites");
    } else {
      sendValidationError(res, "Product already in favorites");
    }
  } else {
    sendNotFound(res, "User or product not found");
  }
});
const removeFromFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId);

  if (user) {
    const index = user.favorites.indexOf(req.params.productId);
    if (index > -1) {
      user.favorites.splice(index, 1);
      await user.save();
      sendSuccess(res, 200, "Product removed from favorites");
    } else {
      sendNotFound(res, "Product not found in favorites");
    }
  } else {
    sendNotFound(res, "User not found");
  }
});

const getFavorites = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).populate("favorites");

  if (user) {
    sendSuccess(res, 200, "Favorites retrieved successfully", { favorites: user.favorites });
  } else {
    sendNotFound(res, "User not found");
  }
});

// Check if user has purchase history
const checkHasPurchaseHistory = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  
  const orderCount = await Order.countDocuments({ 
    user: userId,
    isPaid: true 
  });

  const hasPurchaseHistory = orderCount > 0;

  sendSuccess(res, 200, "Purchase history checked successfully", {
    hasPurchaseHistory,
    orderCount
  });
});

// Check if user has gender
const checkHasGender = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select("gender");

  if (!user) {
    sendNotFound(res, "User not found");
    return;
  }

  const hasGender = !!user.gender;

  sendSuccess(res, 200, "Gender check completed successfully", {
    hasGender,
    gender: user.gender || null
  });
});

// Check if user has preferences.style
const checkHasStylePreference = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.userId).select("preferences");

  if (!user) {
    sendNotFound(res, "User not found");
    return;
  }

  const hasStylePreference = !!(user.preferences && user.preferences.style);

  sendSuccess(res, 200, "Style preference check completed successfully", {
    hasStylePreference,
    style: user.preferences?.style || null
  });
});

export {
  authUser,
  getUserProfile,
  registerUser,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
  forgotPassword,
  verifyCode,
  resetPassword,
  addToFavorites,
  removeFromFavorites,
  getFavorites,
  checkHasPurchaseHistory,
  checkHasGender,
  checkHasStylePreference,
};
