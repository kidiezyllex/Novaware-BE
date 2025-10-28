import express from 'express';
import {
  getContentSections,
  createContentSection,
  updateContentSection,
  deleteContentSection,
} from '../controllers/contentSectionController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Content Sections
 *     description: Content section management endpoints
 */

/**
 * @swagger
 * /content-sections:
 *   get:
 *     summary: Get all content sections
 *     description: Retrieve all content sections
 *     tags: [Content Sections]
 *     responses:
 *       200:
 *         description: Content sections retrieved successfully
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
 *                     $ref: '#/components/schemas/ContentSection'
 *   post:
 *     summary: Create a new content section (Admin only)
 *     description: Create a new content section
 *     tags: [Content Sections]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContentSection'
 *     responses:
 *       201:
 *         description: Content section created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ContentSection'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 *       400:
 *         description: Bad request
 *         $ref: '#/components/responses/ValidationError'
 */

/**
 * @swagger
 * /content-sections/{id}:
 *   put:
 *     summary: Update content section (Admin only)
 *     description: Update an existing content section
 *     tags: [Content Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content section ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ContentSection'
 *     responses:
 *       200:
 *         description: Content section updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/ContentSection'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Content section not found
 *         $ref: '#/components/responses/NotFoundError'
 *   delete:
 *     summary: Delete content section (Admin only)
 *     description: Delete a content section
 *     tags: [Content Sections]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Content section ID
 *     responses:
 *       200:
 *         description: Content section deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Content section not found
 *         $ref: '#/components/responses/NotFoundError'
 */

router.route('/')
  .get(getContentSections) 
  .post(protect, checkAdmin, createContentSection);

router.route('/:id')
  .put(protect, checkAdmin, updateContentSection)
  .delete(protect, checkAdmin, deleteContentSection);

export default router;