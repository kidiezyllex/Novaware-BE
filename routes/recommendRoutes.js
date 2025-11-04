import express from 'express';
import asyncHandler from 'express-async-handler';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';
import User from '../models/userModel.js';

const router = express.Router();
/**
 * @swagger
 * /recommend/gnn/personalize/{userId}:
 *   get:
 *     summary: Bạn có thể thích (GNN)
 *     description: Personalized product recommendations using Graph Neural Network. Requires user interaction history.
 *     tags: [Recommendations]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of recommendations to generate
 *     responses:
 *       200:
 *         description: Personalized recommendations generated successfully
 *       400:
 *         description: User not eligible (no interaction history)
 *       500:
 *         description: Error generating personalize
 */

router.get('/gnn/personalize/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9 } = req.query;
  try {
    const data = await gnnRecommender.recommendPersonalize(userId, parseInt(k));
    return res.json({ success: true, data, message: 'Personalized recommendations generated successfully' });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'User not eligible for personalize' });
  }
}));

/**
 * @swagger
 * /recommend/hybrid/{userId}:
 *   get:
 *     summary: Lấy gợi ý sản phẩm dựa trên hybrid
 *     description: Generate product recommendations using hybrid collaborative and content-based filtering
 *     tags: [Recommendations]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of recommendations to generate (before pagination)
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang (bắt đầu từ 1)
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Số lượng recommendations mỗi trang (mặc định 9)
 *     responses:
 *       200:
 *         description: Hybrid recommendations generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/RecommendationResponse'
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Error generating recommendations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.get('/hybrid/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, pageNumber = 1, perPage = 9 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    // Generate recommendations
    const recommendations = await hybridRecommender.recommend(userId, parseInt(k));
    
    // Apply pagination to recommendations
    const paginatedRecommendations = {
      ...recommendations,
      products: recommendations.products?.slice(skip, skip + limit) || [],
      pagination: {
        page,
        pages: Math.ceil((recommendations.products?.length || 0) / limit),
        count: recommendations.products?.length || 0,
        perPage: limit
      }
    };
    
    res.json({
      success: true,
      data: paginatedRecommendations,
      message: 'Hybrid recommendations generated successfully'
    });
    
  } catch (error) {
    console.error('Hybrid Recommendation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating hybrid recommendations',
      error: error.message
    });
  }
}));


 
/**
 * @swagger
 * /recommend/gnn/outfit-perfect/{userId}:
 *   get:
 *     summary: Phối đồ hoàn hảo (GNN)
 *     description: Generate perfect outfit recommendations with GNN. Requires user gender and interaction history.
 *     tags: [Recommendations]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Selected productId to build the outfit around
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of outfit recommendations to generate (before pagination)
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang (bắt đầu từ 1)
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Số lượng outfit recommendations mỗi trang (mặc định 9)
 *     responses:
 *       200:
 *         description: Outfit recommendations generated successfully
 *       400:
 *         description: User not eligible (missing gender or no interaction history)
 *       404:
 *         description: User not found
 *       500:
 *         description: Error generating outfit recommendations
 */
router.get('/gnn/outfit-perfect/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, pageNumber = 1, perPage = 9, productId = null } = req.query;
  
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for outfit-perfect' });
    }
    // Service will validate gender and history
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    // Generate outfits via GNN with optional seed productId
    const payload = await gnnRecommender.recommendOutfits(userId, { productId, k: parseInt(k) });
    
    // Filter to only return outfits with pagination
    const paginatedOutfits = payload.outfits?.slice(skip, skip + limit) || [];
    
    const response = {
      outfits: paginatedOutfits,
      model: payload.model,
      timestamp: payload.timestamp,
      pagination: {
        page,
        pages: Math.ceil((payload.outfits?.length || 0) / limit),
        count: payload.outfits?.length || 0,
        perPage: limit
      }
    };
    
    res.json({
      success: true,
      data: response,
      message: 'Outfit recommendations generated successfully'
    });
    
  } catch (error) {
    console.error('Outfit Recommendation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating outfit recommendations',
      error: error.message
    });
  }
}));

 

/**
 * @swagger
 * /recommend/train/gnn-incremental:
 *   post:
 *     summary: Huấn luyện GNN dạng incremental
 *     description: Incremental training for GNN to handle very large collections efficiently
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: GNN incremental training done
 *       500:
 *         description: Error in incremental training
 */
// Incremental GNN training for very large collections
router.post('/train/gnn-incremental', asyncHandler(async (req, res) => {
  try {
    const start = Date.now();
    await gnnRecommender.trainIncremental();
    const time = Date.now() - start;
    res.json({ success: true, data: { gnn: { trained: true, trainingTime: `${(time/1000).toFixed(2)}s`, mode: 'incremental' } }, message: 'GNN incremental training done' });
  } catch (error) {
    console.error('Incremental Training Error:', error);
    res.status(500).json({ success: false, message: 'Error in incremental training', error: error.message });
  }
}));

export default router;
