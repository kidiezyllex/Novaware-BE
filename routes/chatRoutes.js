import express from 'express';
import { getUserChat, sendMessage, getAllChats } from '../controllers/chatController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Lấy tất cả tin nhắn của một người dùng cụ thể
router.get('/:userId', protect, getUserChat);

// Gửi tin nhắn mới đến một người dùng (do người dùng đó hoặc admin thực hiện)
router.post('/:userId', protect, sendMessage);

// Lấy tất cả các đoạn chat của mọi người dùng (chỉ admin)
router.get('/', protect, checkAdmin, getAllChats);

export default router;
