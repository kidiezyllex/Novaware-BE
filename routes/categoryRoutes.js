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

/**
 * @swagger
 * tags:
 *   - name: Categories
 *     description: Category management endpoints
 */

/**
 * @swagger
 * /categories:
 *   get:
 *     summary: Get all categories
 *     tags: [Categories]
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Category'
 *   post:
 *     summary: Create a new category (Admin only)
 *     tags: [Categories]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Category'
 *     responses:
 *       201:
 *         description: Category created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Category'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 */
router.route("/").get(getCategories).post(protect, checkAdmin, createCategory);
router.route('/counts').get(getCategoryCounts);

router
  .route("/:id")
  .put(protect, checkAdmin, updateCategory)
  .delete(protect, checkAdmin, deleteCategory);

export default router;
