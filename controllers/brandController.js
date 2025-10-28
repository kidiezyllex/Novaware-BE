import Brand from "../models/brandModel.js";

// @desc    Get all brands
// @route   GET /api/brands
// @access  Public
export const getBrands = async (req, res) => {
  try {
    const brands = await Brand.find({});
    res.json(brands);
  } catch (error) {
    res.status(500).json({ message: "Unable to fetch brands" });
  }
};

export const createBrand = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Brand name is required" });
    }
    const brandExists = await Brand.findOne({ name });
    if (brandExists) {
      return res.status(400).json({ message: "Brand already exists" });
    }

    const brand = new Brand({ name });
    const createdBrand = await brand.save();
    res.status(201).json(createdBrand);
  } catch (error) {
    console.error("Error creating brand:", error);
    res.status(500).json({ message: "Unable to create brand" });
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
      res.json(updatedBrand);
    } else {
      res.status(404).json({ message: "Brand not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Unable to update brand" });
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
      res.json({ message: "Brand removed" });
    } else {
      res.status(404).json({ message: "Brand not found" });
    }
  } catch (error) {
    res.status(500).json({ message: "Unable to delete brand" });
  }
};
