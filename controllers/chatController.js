import Chat from '../models/chatModel.js';
import asyncHandler from 'express-async-handler';
import { sendSuccess, sendError, sendUnauthorized } from '../utils/responseHelper.js';

// @desc    Lấy tất cả tin nhắn của một người dùng
// @route   GET /api/chats/:userId
// @access  Private (Chỉ người dùng đó hoặc admin)
export const getUserChat = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  if (req.user.isAdmin || req.user._id.toString() === userId) {
    const chat = await Chat.findOne({ user: userId }).populate('user', 'name email');
    if (chat) {
      sendSuccess(res, 200, "Chat retrieved successfully", { chat });
    } else {
      sendSuccess(res, 200, "No chat found", { messages: [] }); // Trả về mảng rỗng nếu không có chat
    }
  } else {
    sendUnauthorized(res, 'Not authorized to view this chat');
  }
});

// @desc    Gửi tin nhắn mới
// @route   POST /api/chats/:userId
// @access  Private (Chỉ người dùng đó hoặc admin)
export const sendMessage = asyncHandler(async (req, res) => {
  const userId = req.params.userId;
  const { sender, content } = req.body;

  if (req.user.isAdmin || req.user._id.toString() === userId) {
    let chat = await Chat.findOne({ user: userId });

    if (!chat) {
      chat = new Chat({
        user: userId,
        messages: [],
      });
    }

    const newMessage = {
      sender,
      content,
      timestamp: new Date(),
    };

    chat.messages.push(newMessage);
    await chat.save();

    sendSuccess(res, 201, "Message sent successfully", { message: newMessage });
  } else {
    sendUnauthorized(res, 'Not authorized to send a message in this chat');
  }
});

// @desc    Lấy tất cả đoạn chat của tất cả người dùng (Chỉ dành cho admin)
// @route   GET /api/chats
// @access  Private/Admin
export const getAllChats = asyncHandler(async (req, res) => {
  if (req.user.isAdmin) {
    try {
      const chats = await Chat.find({}).populate('user', 'name email');
      sendSuccess(res, 200, "All chats retrieved successfully", { chats });
    } catch (error) {
      sendError(res, 500, 'Server error while fetching all chats');
    }
  } else {
    sendUnauthorized(res, 'Not authorized to view all chats');
  }
});
