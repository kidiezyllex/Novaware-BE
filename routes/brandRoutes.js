import express from 'express';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../controllers/brandController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Brands
 *     description: Brand management endpoints
 */

/**
 * @swagger
 * /brands:
 *   get:
 *     summary: Get all brands
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Brands retrieved successfully
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
 *                     $ref: '#/components/schemas/Brand'
 *   post:
 *     summary: Create a new brand (Admin only)
 *     tags: [Brands]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Brand'
 *     responses:
 *       201:
 *         description: Brand created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Brand'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 */
router.route('/')
  .get(getBrands)         
  .post(protect, checkAdmin, createBrand);  

router.route('/:id')
  .put(protect, checkAdmin, updateBrand)    
  .delete(protect, checkAdmin, deleteBrand); 

export default router;
