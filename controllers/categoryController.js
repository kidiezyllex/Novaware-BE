import Category from "../models/categoryModel.js";
import asyncHandler from "express-async-handler";
import Product from "../models/productModel.js";
import { sendSuccess, sendError, sendValidationError, sendNotFound } from "../utils/responseHelper.js";

// @desc    Get all categories
// @route   GET /api/categories
// @access  Public
const getCategories = asyncHandler(async (req, res) => {
  const categories = await Category.find({});
  sendSuccess(res, 200, "Categories retrieved successfully", { categories });
});

const getCategoryCounts = asyncHandler(async (req, res) => {
  const categories = await Category.find({});
  const categoryCounts = [];

  for (const category of categories) {
    const count = await Product.countDocuments({ category: category.name });
    categoryCounts.push({
      name: category.name,
      count: count,
    });
  }

  sendSuccess(res, 200, "Category counts retrieved successfully", { categoryCounts });
});

const createCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    sendValidationError(res, "Category name is required");
    return;
  }

  const categoryExists = await Category.findOne({ name });

  if (categoryExists) {
    sendValidationError(res, "Category already exists");
    return;
  }

  const category = await Category.create({
    name,
  });

  if (category) {
    sendSuccess(res, 201, "Category created successfully", { category });
  } else {
    sendValidationError(res, "Invalid category data");
  }
});

// @desc    Update a category
// @route   PUT /api/categories/:id
// @access  Private/Admin
const updateCategory = asyncHandler(async (req, res) => {
  const { name } = req.body;

  const category = await Category.findById(req.params.id);

  if (category) {
    category.name = name || category.name;

    const updatedCategory = await category.save();
    sendSuccess(res, 200, "Category updated successfully", { category: updatedCategory });
  } else {
    sendNotFound(res, "Category not found");
  }
});

// @desc    Delete a category
// @route   DELETE /api/categories/:id
// @access  Private/Admin
const deleteCategory = asyncHandler(async (req, res) => {
  const category = await Category.findById(req.params.id);

  if (category) {
    await category.remove();
    sendSuccess(res, 200, "Category removed successfully");
  } else {
    sendNotFound(res, "Category not found");
  }
});

export {
  getCategories,
  getCategoryCounts,
  createCategory,
  updateCategory,
  deleteCategory,
};
