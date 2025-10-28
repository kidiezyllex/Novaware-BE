import Chat from '../models/chatModel.js';
import asyncHandler from 'express-async-handler';

// @desc    Lấy tất cả tin nhắn của một người dùng
// @route   GET /api/chats/:userId
// @access  Private (Chỉ người dùng đó hoặc admin)
export const getUserChat = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  if (req.user.isAdmin || req.user._id.toString() === userId) {
    const chat = await Chat.findOne({ user: userId }).populate('user', 'name email');
    if (chat) {
      res.json(chat);
    } else {
      res.status(200).json({ messages: [] }); // Trả về mảng rỗng nếu không có chat
    }
  } else {
    res.status(401);
    throw new Error('Not authorized to view this chat');
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

    res.status(201).json(newMessage);
  } else {
    res.status(401);
    throw new Error('Not authorized to send a message in this chat');
  }
});

// @desc    Lấy tất cả đoạn chat của tất cả người dùng (Chỉ dành cho admin)
// @route   GET /api/chats
// @access  Private/Admin
export const getAllChats = asyncHandler(async (req, res) => {
  if (req.user.isAdmin) {
    try {
      const chats = await Chat.find({}).populate('user', 'name email');
      res.json(chats);
    } catch (error) {
      res.status(500);
      throw new Error('Server error while fetching all chats');
    }
  } else {
    res.status(401);
    throw new Error('Not authorized to view all chats');
  }
});
