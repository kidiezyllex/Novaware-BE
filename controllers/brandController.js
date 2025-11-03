import Brand from "../models/brandModel.js";
import { sendSuccess, sendError, sendValidationError, sendNotFound } from "../utils/responseHelper.js";

// @desc    Get all brands
// @route   GET /api/brands
// @access  Public
export const getBrands = async (req, res) => {
  try {
    const perPage = parseInt(req.query.perPage) || 9;
    const page = parseInt(req.query.pageNumber) || 1;
    
    const count = await Brand.countDocuments({});
    const brands = await Brand.find({})
      .limit(perPage)
      .skip(perPage * (page - 1));
      
    sendSuccess(res, 200, "Brands retrieved successfully", { 
      brands, 
      page, 
      pages: Math.ceil(count / perPage), 
      count 
    });
  } catch (error) {
    sendError(res, 500, "Unable to fetch brands");
  }
};

export const createBrand = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return sendValidationError(res, "Brand name is required");
    }
    const brandExists = await Brand.findOne({ name });
    if (brandExists) {
      return sendValidationError(res, "Brand already exists");
    }

    const brand = new Brand({ name });
    const createdBrand = await brand.save();
    sendSuccess(res, 201, "Brand created successfully", { brand: createdBrand });
  } catch (error) {
    console.error("Error creating brand:", error);
    sendError(res, 500, "Unable to create brand");
  }
};

// @desc    Update a brand
// @route   PUT /api/brands/:id
// @access  Private/Admin
export const updateBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (brand) {
      brand.name = req.body.name || brand.name;
      const updatedBrand = await brand.save();
      sendSuccess(res, 200, "Brand updated successfully", { brand: updatedBrand });
    } else {
      sendNotFound(res, "Brand not found");
    }
  } catch (error) {
    sendError(res, 500, "Unable to update brand");
  }
};

// @desc    Delete a brand
// @route   DELETE /api/brands/:id
// @access  Private/Admin
export const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);

    if (brand) {
      await brand.remove();
      sendSuccess(res, 200, "Brand removed successfully");
    } else {
      sendNotFound(res, "Brand not found");
    }
  } catch (error) {
    sendError(res, 500, "Unable to delete brand");
  }
};

// @desc    Get brands grouped by first letter (max 5 per letter)
// @route   GET /api/brands/grouped
// @access  Public
export const getBrandsGrouped = async (req, res) => {
  try {
    const groups = await Brand.aggregate([
      {
        $addFields: {
          firstLetter: { $toUpper: { $substrCP: ["$name", 0, 1] } },
        },
      },
      { $sort: { firstLetter: 1, name: 1 } },
      {
        $group: {
          _id: "$firstLetter",
          brands: { $push: { _id: "$_id", name: "$name" } },
        },
      },
      { $project: { _id: 0, letter: "$_id", brands: { $slice: ["$brands", 5] } } },
      { $sort: { letter: 1 } },
    ]);

    sendSuccess(res, 200, "Brands grouped successfully", { groups });
  } catch (error) {
    sendError(res, 500, "Unable to group brands");
  }
};
