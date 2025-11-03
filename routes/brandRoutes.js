import express from 'express';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
  getBrandsGrouped,
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
 *     summary: Lấy danh sách tất cả thương hiệu
 *     tags: [Brands]
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of brands per page
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
 *     summary: Tạo thương hiệu mới (chỉ Admin)
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

/**
 * @swagger
 * /brands/grouped:
 *   get:
 *     summary: Lấy danh sách thương hiệu theo chữ cái đầu tiên, mỗi chữ cái tối đa 5 brand
 *     tags: [Brands]
 *     responses:
 *       200:
 *         description: Brands grouped successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     groups:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           letter:
 *                             type: string
 *                           brands:
 *                             type: array
 *                             items:
 *                               $ref: '#/components/schemas/Brand'
 */
router.get('/grouped', getBrandsGrouped);

router.route('/:id')
  .put(protect, checkAdmin, updateBrand)    
  .delete(protect, checkAdmin, deleteBrand); 

export default router;
