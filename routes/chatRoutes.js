import express from 'express';
import { getUserChat, sendMessage, getAllChats } from '../controllers/chatController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

/**
 * @swagger
 * tags:
 *   - name: Chats
 *     description: Chat management endpoints
 */

/**
 * @swagger
 * /chats:
 *   get:
 *     summary: Lấy tất cả cuộc trò chuyện (chỉ Admin)
 *     description: Retrieve all chat conversations for admin review
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
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
 *         description: Number of chats per page
 *     responses:
 *       200:
 *         description: All chats retrieved successfully
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
 *                     $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 */

/**
 * @swagger
 * /chats/{userId}:
 *   get:
 *     summary: Lấy tin nhắn của người dùng
 *     description: Retrieve all chat messages for a specific user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: User chat messages retrieved successfully
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
 *                     $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 *         $ref: '#/components/responses/NotFoundError'
 *   post:
 *     summary: Gửi tin nhắn đến người dùng
 *     description: Send a new message to a specific user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - message
 *             properties:
 *               message:
 *                 type: string
 *                 description: Message content
 *                 example: "Hello, how can I help you?"
 *     responses:
 *       201:
 *         description: Message sent successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/Chat'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 *         $ref: '#/components/responses/NotFoundError'
 */

// Lấy tất cả tin nhắn của một người dùng cụ thể
router.get('/:userId', protect, getUserChat);

// Gửi tin nhắn mới đến một người dùng (do người dùng đó hoặc admin thực hiện)
router.post('/:userId', protect, sendMessage);

// Lấy tất cả các đoạn chat của mọi người dùng (chỉ admin)
router.get('/', protect, checkAdmin, getAllChats);

export default router;
