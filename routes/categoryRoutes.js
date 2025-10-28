import express from "express";
const router = express.Router();
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryCounts,
} from "../controllers/categoryController.js";
import { protect, checkAdmin } from "../middlewares/authMiddleware.js";

router.route("/").get(getCategories).post(protect, checkAdmin, createCategory);
router.route('/counts').get(getCategoryCounts);

router
  .route("/:id")
  .put(protect, checkAdmin, updateCategory)
  .delete(protect, checkAdmin, deleteCategory);

export default router;
