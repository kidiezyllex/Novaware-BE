import Product from "../models/productModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import recommendSize from "../utils/sizeRecommendation.js";
import mongoose from "mongoose";
import { sendSuccess, sendError, sendValidationError, sendNotFound } from "../utils/responseHelper.js";

// Hàm tính tổng countInStock (dùng chung cho cả client và server)
function calculateTotalCountInStock(size) {
  let total = 0;
  if (size) {
    total +=
      (parseInt(size.s) || 0) +
      (parseInt(size.m) || 0) +
      (parseInt(size.l) || 0) +
      (parseInt(size.xl) || 0);
  }
  return total;
}

const getProducts = asyncHandler(async (req, res) => {
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      return sendError(res, 503, 'Database not connected', {
        error: 'Please wait for database connection to be established'
      });
    }

    if (req.query.option === "all") {
      const products = await Product.find({}).maxTimeMS(30000);
      sendSuccess(res, 200, "All products retrieved successfully", { products });
    } else {
      const perPage = Math.min(parseInt(req.query.pageSize) || 20, 20);
      const page = parseInt(req.query.pageNumber) || 1;

      const keyword = req.query.keyword
        ? {
            name: {
              $regex: req.query.keyword,
              $options: "i",
            },
          }
        : {};

      // Use Promise.all to run count and find operations in parallel with timeout
      const [count, products] = await Promise.all([
        Product.countDocuments({ ...keyword }).maxTimeMS(30000),
        Product.find({ ...keyword })
          .limit(perPage)
          .skip(perPage * (page - 1))
          .maxTimeMS(30000)
      ]);

      sendSuccess(res, 200, "Products retrieved successfully", { 
        products, 
        page, 
        pages: Math.ceil(count / perPage), 
        count 
      });
    }
  } catch (error) {
    console.error('Error in getProducts:', error);
    sendError(res, 500, 'Database operation timed out or failed', {
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (product) {
    sendSuccess(res, 200, "Product retrieved successfully", { product });
  } else {
    sendNotFound(res, "Product not found");
  }
});

const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);

  if (product) {
    await product.remove();
    sendSuccess(res, 200, "Product removed successfully");
  } else {
    sendNotFound(res, "Product not found");
  }
});

const createProduct = asyncHandler(async (req, res) => {
  const {
    name,
    price,
    sale,
    images,
    brand,
    category,
    description,
    size,
    colors,
    countInStock,
  } = req.body;

  // Tính toán tổng countInStock dựa trên size
  const totalCountInStock = calculateTotalCountInStock(size);

  const product = new Product({
    user: req.user._id,
    name,
    price,
    sale,
    images,
    brand,
    category,
    description,
    size,
    countInStock: totalCountInStock,
    colors,
  });

  const createdProduct = await product.save();
  sendSuccess(res, 201, "Product created successfully", { product: createdProduct });
});

const updateProduct = asyncHandler(async (req, res) => {
  const {
    name,
    price,
    sale,
    images,
    brand,
    category,
    description,
    size,
    countInStock,
    colors,
  } = req.body;

  const product = await Product.findById(req.params.id);

  if (product) {
    // Tính toán tổng countInStock dựa trên size
    const totalCountInStock = calculateTotalCountInStock(size);

    product.name = name || product.name;
    product.price = price || product.price;
    product.sale = sale || product.sale;
    product.images = images || product.images;
    product.brand = brand || product.brand;
    product.category = category || product.category;
    product.description = description || product.description;
    product.size = size || product.size;
    product.countInStock = totalCountInStock;
    product.colors = colors || product.colors;

    const updatedProduct = await product.save();
    sendSuccess(res, 200, "Product updated successfully", { product: updatedProduct });
  } else {
    sendNotFound(res, "Product not found");
  }
});

const createProductReview = asyncHandler(async (req, res) => {
  const { rating, comment } = req.body;

  const product = await Product.findById(req.params.id);

  if (product) {
    const alreadyReviewed = product.reviews.find(
      (r) => r.user.toString() === req.user._id.toString()
    );

    if (alreadyReviewed) {
      sendValidationError(res, "Product already reviewed");
      return;
    }

    const review = {
      name: req.user.name,
      rating: Number(rating),
      comment,
      user: req.user._id,
    };

    product.reviews.push(review);

    product.numReviews = product.reviews.length;

    product.rating =
      product.reviews.reduce((acc, item) => item.rating + acc, 0) /
      product.reviews.length;

    await product.save();
    sendSuccess(res, 201, "Review added successfully");
  } else {
    sendNotFound(res, "Product not found");
  }
});

const getTopProducts = asyncHandler(async (req, res) => {
  const perPage = Math.min(parseInt(req.query.perPage) || 15, 15);
  const products = await Product.aggregate([
    { $sample: { size: perPage } },
  ]).allowDiskUse(true);

  sendSuccess(res, 200, "Top products retrieved successfully", { page: 1, pages: 1, products, count: products.length });
});

const getLatestProducts = asyncHandler(async (req, res) => {
  const perPage = Math.min(parseInt(req.query.perPage) || 15, 15);
  const products = await Product.aggregate([
    { $sample: { size: perPage } },
  ]).allowDiskUse(true);

  sendSuccess(res, 200, "Latest products retrieved successfully", { page: 1, pages: 1, products, count: products.length });
});

const getSaleProducts = asyncHandler(async (req, res) => {
  const perPage = Math.min(parseInt(req.query.perPage) || 15, 15);
  const products = await Product.aggregate([
    { $match: { sale: { $gt: 0 } } },
    { $sample: { size: perPage } },
  ]).allowDiskUse(true);

  sendSuccess(res, 200, "Sale products retrieved successfully", { page: 1, pages: 1, products, count: products.length });
});

const getRelatedProducts = asyncHandler(async (req, res) => {
  const rawCategory = req.query.category;
  const excludeId = req.query.excludeId;

  const category =
    !rawCategory || rawCategory === "undefined" ? "clothes" : rawCategory;

  const products = await Product.find({
    category,
    _id: { $ne: new mongoose.Types.ObjectId(excludeId) }, // ép kiểu đúng
  })
    .sort({ rating: -1 })
    .limit(4);

  res.set("Cache-Control", "no-store"); 
  sendSuccess(res, 200, "Related products retrieved successfully", { products });
});

const getSortByPriceProducts = asyncHandler(async (req, res) => {
  const sortBy = req.query.sortBy || "asc";

  const perPage = Math.min(parseInt(req.query.perPage) || 20, 20);
  const page = parseInt(req.query.pageNumber) || 1;
  const skipCount = perPage * (page - 1);
  const count = await Product.countDocuments({});

  const products = await Product.aggregate([
    {
      $project: {
        price: 1,
        sale: 1,
        size: 1,
        images: 1,
        rating: 1,
        numReviews: 1,
        countInStock: 1,
        name: 1,
        brand: 1,
        category: 1,
        description: 1,
        user: 1,
        reviews: 1,
        createdAt: 1,
        updatedAt: 1,
        priceSale: {
          $subtract: ["$price", { $multiply: ["$price", "$sale", 0.01] }],
        },
      },
    },
    { $sort: { priceSale: sortBy === "asc" ? 1 : -1 } },
    { $skip: skipCount },
    { $limit: perPage },
  ]).allowDiskUse(true);

  sendSuccess(res, 200, "Products sorted by price retrieved successfully", { page, pages: Math.ceil(count / perPage), products, count });
});

const recommendSizeForUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const user = await User.findById(userId);

  if (!user) {
    sendNotFound(res, "User not found");
    return;
  }

  const { gender, height, weight } = user;

  if (!gender || !height || !weight) {
    sendValidationError(res, "Incomplete user profile for size recommendation");
    return;
  }

  const recommendedSize = recommendSize(gender, height, weight);

  if (!recommendedSize) {
    sendNotFound(res, "No size recommendation found for the given parameters");
    return;
  }

  sendSuccess(res, 200, "Size recommendation retrieved successfully", { recommendedSize });
});

const filterProducts = asyncHandler(async (req, res) => {
  const perPage = Math.min(parseInt(req.query.perPage) || 20, 20);
  const page = parseInt(req.query.pageNumber) || 1;

  let query = {};

  if (req.query.keyword) {
    query.name = {
      $regex: req.query.keyword,
      $options: "i",
    };
  }
  if (req.query.categories) {
    query.category = { $in: req.query.categories.split(",") };
  }
  if (req.query.brands) {
    query.brand = { $in: req.query.brands.split(",") };
  }
  if (req.query.size) {
    const sizeKey = `size.${req.query.size}`;
    query[sizeKey] = { $gt: 0 };
  }

  const basePipeline = [
    {
      $addFields: {
        priceSale: {
          $multiply: [
            "$price",
            { $subtract: [1, { $divide: ["$sale", 100] }] },
          ],
        },
      },
    },
    { $match: query },
  ];

  // loc rating
  if (req.query.rating) {
    const rating = parseFloat(req.query.rating);
    let minRating, maxRating;

    if (rating === 5) {
      minRating = 5;
      maxRating = 6;
    } else if (rating >= 1 && rating < 5) {
      minRating = rating;
      maxRating = rating + 1;
    } else {
      minRating = 0;
      maxRating = 0;
    }

    basePipeline.push({
      $match: {
        rating: { $gte: minRating, $lt: maxRating },
      },
    });
  }

  if (req.query.priceMin) {
    basePipeline.push({
      $match: { priceSale: { $gte: parseFloat(req.query.priceMin) } },
    });
  }
  if (req.query.priceMax) {
    basePipeline.push({
      $match: { priceSale: { $lte: parseFloat(req.query.priceMax) } },
    });
  }

  let sortOption = { createdAt: -1 };
  if (req.query.sort_by === "latest") {
    sortOption = { createdAt: -1 };
  } else if (req.query.sort_by === "rating") {
    sortOption = { rating: -1 };
  } else if (req.query.sort_by === "sale") {
    sortOption = { sale: -1 };
  } else if (req.query.sort_by === "priceAsc") {
    sortOption = { priceSale: 1 };
  } else if (req.query.sort_by === "priceDesc") {
    sortOption = { priceSale: -1 };
  }

  const dataPipeline = [
    ...basePipeline,
    { $sort: sortOption },
    { $skip: perPage * (page - 1) },
    { $limit: perPage },
  ];

  const countPipeline = [
    ...basePipeline,
    { $count: "count" },
  ];

  const [products, countQuery] = await Promise.all([
    Product.aggregate(dataPipeline).allowDiskUse(true),
    Product.aggregate(countPipeline).allowDiskUse(true),
  ]);

  const totalCount = countQuery.length > 0 ? countQuery[0].count : 0;

  sendSuccess(res, 200, "Filtered products retrieved successfully", {
    products,
    page,
    pages: Math.ceil(totalCount / perPage),
    count: totalCount,
  });
});

export {
  getProducts,
  getProductById,
  deleteProduct,
  createProduct,
  updateProduct,
  createProductReview,
  getTopProducts,
  getLatestProducts,
  getSaleProducts,
  getRelatedProducts,
  getSortByPriceProducts,
  recommendSizeForUser,
  filterProducts,
};
