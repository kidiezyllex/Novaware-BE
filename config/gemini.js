import fetch from 'node-fetch';
global.fetch = fetch;

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.OOGLE_GENERATIVE_AI_API_KEY;
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

const defaultGenerationConfig = {
  temperature: 0.7,
  topK: 1,
  topP: 1,
  maxOutputTokens: 1024,
};

const defaultSafetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

export const chatWithGemini = async (prompt, { modelName = "gemini-2.5-flash", generationConfig = defaultGenerationConfig } = {}) => {
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
      safetySettings: defaultSafetySettings,
    });
    const response = result.response;
    if (response && response.text()) return response.text();
    throw new Error('Invalid or unexpected response format from Gemini API');
  } catch (error) {
    console.error('Lỗi khi gọi Gemini API:', error);
    throw new Error('Lỗi khi giao tiếp với Gemini API');
  }
};

export const explainRecommendations = async ({ user, products, systemPrompt }) => {
  const safeUser = user ? {
    id: user._id?.toString?.() || String(user._id || ''),
    gender: user.gender || 'unknown',
    preferences: user.preferences || {},
  } : null;

  const briefProducts = (products || []).map(p => ({
    id: p._id?.toString?.() || String(p._id || ''),
    name: p.name,
    category: p.category,
    price: p.price,
    rating: p.rating,
    tags: p.outfitTags,
  }));

  const defaultSystemPrompt =
    "Bạn là một stylist AI của cửa hàng thời trang. Hãy giải thích ngắn gọn, chuyên nghiệp, dễ hiểu vì sao những sản phẩm sau phù hợp với người dùng này. Nhấn mạnh: 1) sở thích/giới tính nếu có, 2) danh mục, 3) giá/độ phổ biến (rating), 4) cách mix&match cơ bản. Trả lời tối đa 80-120 từ, tiếng Việt.";

  const fullPrompt = `${systemPrompt || defaultSystemPrompt}\n\nNgười dùng: ${JSON.stringify(safeUser)}\nSản phẩm đề xuất: ${JSON.stringify(briefProducts)}`;

  try {
    const text = await chatWithGemini(fullPrompt, { modelName: "gemini-2.5-flash" });
    return text;
  } catch (e) {
    // 失败时返回为空字符串，避免阻塞主流程
    return "";
  }
};

export const cleanTextForSpeech = (text) => {
  if (!text || typeof text !== 'string') return '';
  return text.replace(/\*\*(.*?)\*\*/g, "$1");
};

export default chatWithGemini;