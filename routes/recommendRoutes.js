import express from 'express';
import asyncHandler from 'express-async-handler';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';
import cfRecommender from '../services/cfRecommender.js';

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
 *       - in: query
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Current viewed productId to bias personalization
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
  const { k = 9, productId = null } = req.query;
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for personalize' });
    }

    const data = await gnnRecommender.recommendPersonalize(userId, parseInt(k), { productId });

    return res.json({ 
      success: true, 
      data: { 
        ...data, 
        explanation: data.explanation || '', 
        explanationSpeech: data.explanation || '' 
      }, 
      message: 'Personalized recommendations generated successfully' 
    });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'User not eligible for personalize' });
  }
}));

/**
 * @swagger
 * /recommend/hybrid/personalize/{userId}:
 *   get:
 *     summary: Bạn có thể thích (Hybrid)
 *     description: Personalized product recommendations using Hybrid collaborative and content-based filtering. Requires user interaction history.
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
 *       - in: query
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Current viewed productId to bias personalization
 *     responses:
 *       200:
 *         description: Personalized recommendations generated successfully
 *       400:
 *         description: User not eligible (no interaction history)
 *       500:
 *         description: Error generating personalize
 */
router.get('/hybrid/personalize/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, productId = null } = req.query;
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for personalize' });
    }

    const data = await hybridRecommender.recommendPersonalize(userId, parseInt(k), { productId });

    return res.json({ 
      success: true, 
      data: { 
        ...data, 
        explanation: data.explanation || '', 
        explanationSpeech: data.explanation || '' 
      }, 
      message: 'Personalized recommendations generated successfully' 
    });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'User not eligible for personalize' });
  }
}));

/**
 * @swagger
 * /recommend/cf/personalize/{userId}:
 *   get:
 *     summary: Bạn có thể thích (Content-based Filtering)
 *     description: Personalized product recommendations using Content-based Filtering. Requires user interaction history.
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
 *       - in: query
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Current viewed productId to bias personalization
 *     responses:
 *       200:
 *         description: Personalized recommendations generated successfully
 *       400:
 *         description: User not eligible (no interaction history)
 *       500:
 *         description: Error generating personalize
 */
router.get('/cf/personalize/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, productId = null } = req.query;
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for personalize' });
    }

    const data = await cfRecommender.recommendPersonalize(userId, parseInt(k), { productId });

    return res.json({ 
      success: true, 
      data: { 
        ...data, 
        explanation: data.explanation || '', 
        explanationSpeech: data.explanation || '' 
      }, 
      message: 'Personalized recommendations generated successfully' 
    });
  } catch (e) {
    return res.status(400).json({ success: false, message: e.message || 'User not eligible for personalize' });
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
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [male, female, other]
 *         description: User gender (optional, uses user's gender from database if not provided, defaults to 'other')
 *     responses:
 *       200:
 *         description: Outfit recommendations generated successfully
 *       400:
 *         description: User not eligible (no interaction history)
 *       404:
 *         description: User not found
 *       500:
 *         description: Error generating outfit recommendations
 */
router.get('/gnn/outfit-perfect/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, pageNumber = 1, perPage = 9, productId = null, gender = null } = req.query;
  
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for outfit-perfect' });
    }
    // Service will validate gender and history
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    // Generate outfits via GNN with optional seed productId and gender
    const payload = await gnnRecommender.recommendOutfits(userId, { productId, k: parseInt(k), gender });
    
    // Filter to only return outfits with pagination
    const paginatedOutfits = payload.outfits?.slice(skip, skip + limit) || [];
    
    const response = {
      outfits: paginatedOutfits,
      model: payload.model,
      timestamp: payload.timestamp,
      explanation: payload.explanation || '',
      explanationSpeech: payload.explanation || '',
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
 * /recommend/hybrid/outfit-perfect/{userId}:
 *   get:
 *     summary: Phối đồ hoàn hảo (Hybrid)
 *     description: Generate perfect outfit recommendations with Hybrid model. Requires user gender and interaction history.
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
router.get('/hybrid/outfit-perfect/:userId', asyncHandler(async (req, res) => {
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
    
    // Generate outfits via Hybrid with optional seed productId
    const payload = await hybridRecommender.recommendOutfits(userId, { productId, k: parseInt(k) });
    
    // Filter to only return outfits with pagination
    const paginatedOutfits = payload.outfits?.slice(skip, skip + limit) || [];
    
    const response = {
      outfits: paginatedOutfits,
      model: payload.model,
      timestamp: payload.timestamp,
      explanation: payload.explanation || '',
      explanationSpeech: payload.explanation || '',
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
 * /recommend/cf/outfit-perfect/{userId}:
 *   get:
 *     summary: Phối đồ hoàn hảo (Content-based Filtering)
 *     description: Generate perfect outfit recommendations with Content-based Filtering. Requires user gender and interaction history.
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
 *       - in: query
 *         name: gender
 *         schema:
 *           type: string
 *           enum: [male, female, other]
 *         description: User gender (optional, uses user's gender from database if not provided, defaults to 'other')
 *     responses:
 *       200:
 *         description: Outfit recommendations generated successfully
 *       400:
 *         description: User not eligible (no interaction history)
 *       404:
 *         description: User not found
 *       500:
 *         description: Error generating outfit recommendations
 */
router.get('/cf/outfit-perfect/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9, pageNumber = 1, perPage = 9, productId = null, gender = null } = req.query;
  
  try {
    if (!productId) {
      return res.status(400).json({ success: false, message: 'productId is required for outfit-perfect' });
    }
    // Service will validate gender and history
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    // Generate outfits via CF with optional seed productId and gender
    const payload = await cfRecommender.recommendOutfits(userId, { productId, k: parseInt(k), gender });
    
    // Filter to only return outfits with pagination
    const paginatedOutfits = payload.outfits?.slice(skip, skip + limit) || [];
    
    const response = {
      outfits: paginatedOutfits,
      model: payload.model,
      timestamp: payload.timestamp,
      explanation: payload.explanation || '',
      explanationSpeech: payload.explanation || '',
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

/**
 * @swagger
 * /recommend/train/hybrid-incremental:
 *   post:
 *     summary: Huấn luyện Hybrid dạng incremental
 *     description: Incremental training for Hybrid model to handle very large collections efficiently
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: Hybrid incremental training done
 *       500:
 *         description: Error in incremental training
 */
// Incremental Hybrid training for very large collections
router.post('/train/hybrid-incremental', asyncHandler(async (req, res) => {
  try {
    const start = Date.now();
    await hybridRecommender.trainIncremental();
    const time = Date.now() - start;
    res.json({ success: true, data: { hybrid: { trained: true, trainingTime: `${(time/1000).toFixed(2)}s`, mode: 'incremental' } }, message: 'Hybrid incremental training done' });
  } catch (error) {
    console.error('Incremental Training Error:', error);
    res.status(500).json({ success: false, message: 'Error in incremental training', error: error.message });
  }
}));

/**
 * @swagger
 * /recommend/train/cf-incremental:
 *   post:
 *     summary: Huấn luyện Content-based Filtering dạng incremental
 *     description: Incremental training for Content-based Filtering to handle very large collections efficiently
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: CF incremental training done
 *       500:
 *         description: Error in incremental training
 */
// Incremental CF training for very large collections
router.post('/train/cf-incremental', asyncHandler(async (req, res) => {
  try {
    const start = Date.now();
    await cfRecommender.trainIncremental();
    const time = Date.now() - start;
    res.json({ success: true, data: { cf: { trained: true, trainingTime: `${(time/1000).toFixed(2)}s`, mode: 'incremental' } }, message: 'CF incremental training done' });
  } catch (error) {
    console.error('Incremental Training Error:', error);
    res.status(500).json({ success: false, message: 'Error in incremental training', error: error.message });
  }
}));

/**
 * @swagger
 * /recommend/train/all:
 *   post:
 *     summary: Huấn luyện cả 2 mô hình (GNN và Hybrid)
 *     description: Train both GNN and Hybrid models incrementally
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: Both models training done
 *       500:
 *         description: Error in training
 */
// Train both models
router.post('/train/all', asyncHandler(async (req, res) => {
  try {
    const overallStart = Date.now();
    const results = {};

    // Train GNN model
    try {
      const gnnStart = Date.now();
      await gnnRecommender.trainIncremental();
      const gnnTime = Date.now() - gnnStart;
      results.gnn = { 
        trained: true, 
        trainingTime: `${(gnnTime/1000).toFixed(2)}s`, 
        mode: 'incremental' 
      };
    } catch (error) {
      console.error('GNN Training Error:', error);
      results.gnn = { 
        trained: false, 
        error: error.message 
      };
    }

    // Train Hybrid model
    try {
      const hybridStart = Date.now();
      await hybridRecommender.trainIncremental();
      const hybridTime = Date.now() - hybridStart;
      results.hybrid = { 
        trained: true, 
        trainingTime: `${(hybridTime/1000).toFixed(2)}s`, 
        mode: 'incremental' 
      };
    } catch (error) {
      console.error('Hybrid Training Error:', error);
      results.hybrid = { 
        trained: false, 
        error: error.message 
      };
    }

    const overallTime = Date.now() - overallStart;
    res.json({ 
      success: true, 
      data: results, 
      totalTime: `${(overallTime/1000).toFixed(2)}s`,
      message: 'Both models training completed' 
    });
  } catch (error) {
    console.error('Training Error:', error);
    res.status(500).json({ success: false, message: 'Error in training', error: error.message });
  }
}));

export default router;
