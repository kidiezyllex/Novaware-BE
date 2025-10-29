import express from 'express';
import asyncHandler from 'express-async-handler';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

const router = express.Router();

/**
 * @swagger
 * /recommend/gnn/{userId}:
 *   get:
 *     summary: Lấy gợi ý sản phẩm dựa trên GNN
 *     description: Generate product recommendations using Graph Neural Network model
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
 *         description: GNN recommendations generated successfully
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
router.get('/gnn/:userId', asyncHandler(async (req, res) => {
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
    const recommendations = await gnnRecommender.recommend(userId, parseInt(k));
    
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
      message: 'GNN recommendations generated successfully'
    });
    
  } catch (error) {
    console.error('GNN Recommendation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating GNN recommendations',
      error: error.message
    });
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
 * /recommend/best/{userId}:
 *   get:
 *     summary: Lấy gợi ý từ mô hình tốt nhất
 *     description: Generate recommendations using the best performing model (currently GNN)
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
 *         description: Best recommendations generated successfully
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
router.get('/best/:userId', asyncHandler(async (req, res) => {
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
    
    // Use GNN as the best model (can be changed based on evaluation results)
    const recommendations = await gnnRecommender.recommend(userId, parseInt(k));
    
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
      message: 'Best recommendations generated successfully'
    });
    
  } catch (error) {
    console.error('Best Recommendation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating best recommendations',
      error: error.message
    });
  }
}));

/**
 * @swagger
 * /recommend/outfits/{userId}:
 *   get:
 *     summary: Lấy gợi ý trang phục
 *     description: Generate complete outfit recommendations for a user
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     outfits:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           name:
 *                             type: string
 *                           products:
 *                             type: array
 *                             items:
 *                               $ref: '#/components/schemas/Product'
 *                           style:
 *                             type: string
 *                           totalPrice:
 *                             type: number
 *                           compatibilityScore:
 *                             type: number
 *                           gender:
 *                             type: string
 *                           description:
 *                             type: string
 *                     model:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Error generating outfit recommendations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.get('/outfits/:userId', asyncHandler(async (req, res) => {
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
    
    // Generate recommendations with outfits
    const recommendations = await gnnRecommender.recommend(userId, 20); // Get more products for better outfit creation
    
    // Filter to only return outfits with pagination
    const paginatedOutfits = recommendations.outfits?.slice(skip, skip + limit) || [];
    
    const response = {
      outfits: paginatedOutfits,
      model: recommendations.model,
      timestamp: recommendations.timestamp,
      pagination: {
        page,
        pages: Math.ceil((recommendations.outfits?.length || 0) / limit),
        count: recommendations.outfits?.length || 0,
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
 * /recommend/similar/{productId}:
 *   get:
 *     summary: Lấy sản phẩm tương tự
 *     description: Find products similar to the specified product using content-based filtering
 *     tags: [Recommendations]
 *     parameters:
 *       - in: path
 *         name: productId
 *         required: true
 *         schema:
 *           type: string
 *         description: Product ID
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of similar products to generate (before pagination)
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
 *         description: Số lượng similar products mỗi trang (mặc định 9)
 *     responses:
 *       200:
 *         description: Similar products found successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SimilarProductsResponse'
 *       404:
 *         description: Product not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Error finding similar products
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.get('/similar/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { k = 9, pageNumber = 1, perPage = 9 } = req.query;
  
  try {
    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    // Find similar products using content-based filtering
    const allProducts = await Product.find({ _id: { $ne: productId } })
      .select('_id name images price category brand outfitTags featureVector');
    
    const similarProducts = [];
    
    for (const otherProduct of allProducts) {
      if (otherProduct.featureVector && product.featureVector) {
        // Calculate cosine similarity
        const similarity = calculateCosineSimilarity(product.featureVector, otherProduct.featureVector);
        
        // Add category and tag bonuses
        let bonus = 0;
        if (product.category === otherProduct.category) bonus += 0.2;
        
        const commonTags = (product.outfitTags || []).filter(tag => 
          (otherProduct.outfitTags || []).includes(tag)
        );
        bonus += (commonTags.length / Math.max(product.outfitTags?.length || 1, 1)) * 0.3;
        
        const finalScore = similarity + bonus;
        
        if (finalScore > 0.1) {
          similarProducts.push({
            product: otherProduct,
            similarity: finalScore
          });
        }
      }
    }
    
    // Sort by similarity and apply pagination
    const sortedSimilar = similarProducts.sort((a, b) => b.similarity - a.similarity);
    const paginatedSimilar = sortedSimilar.slice(skip, skip + limit);
    const topSimilar = paginatedSimilar.map(item => item.product);
    
    res.json({
      success: true,
      data: {
        originalProduct: product,
        similarProducts: topSimilar,
        count: topSimilar.length,
        pagination: {
          page,
          pages: Math.ceil(sortedSimilar.length / limit),
          totalCount: sortedSimilar.length,
          perPage: limit
        }
      },
      message: 'Similar products found successfully'
    });
    
  } catch (error) {
    console.error('Similar Products Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error finding similar products',
      error: error.message
    });
  }
}));

/**
 * @swagger
 * /recommend/trending:
 *   get:
 *     summary: Lấy sản phẩm xu hướng
 *     description: Get products that are currently trending based on recent interactions
 *     tags: [Recommendations]
 *     parameters:
 *       - in: query
 *         name: k
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of trending products to generate (before pagination)
 *       - in: query
 *         name: days
 *         schema:
 *           type: integer
 *           default: 30
 *         description: Number of days to look back for trending calculation
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
 *         description: Số lượng trending products mỗi trang (mặc định 9)
 *     responses:
 *       200:
 *         description: Trending products retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrendingProductsResponse'
 *       500:
 *         description: Error retrieving trending products
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.get('/trending', asyncHandler(async (req, res) => {
  const { k = 9, days = 30, pageNumber = 1, perPage = 9 } = req.query;
  
  try {
    const page = parseInt(pageNumber);
    const limit = parseInt(perPage);
    const skip = limit * (page - 1);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    // Get products with recent interactions
    const trendingProducts = await Product.aggregate([
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: 'interactionHistory.productId',
          as: 'interactions'
        }
      },
      {
        $addFields: {
          recentInteractions: {
            $filter: {
              input: '$interactions',
              as: 'interaction',
              cond: {
                $gte: ['$$interaction.interactionHistory.timestamp', cutoffDate]
              }
            }
          }
        }
      },
      {
        $addFields: {
          interactionCount: { $size: '$recentInteractions' },
          avgRating: { $avg: '$reviews.rating' }
        }
      },
      {
        $match: {
          interactionCount: { $gt: 0 }
        }
      },
      {
        $sort: {
          interactionCount: -1,
          avgRating: -1
        }
      },
      {
        $project: {
          _id: 1,
          name: 1,
          images: 1,
          price: 1,
          category: 1,
          brand: 1,
          rating: 1,
          numReviews: 1,
          interactionCount: 1
        }
      }
    ]);
    
    // Apply pagination
    const paginatedProducts = trendingProducts.slice(skip, skip + limit);
    
    res.json({
      success: true,
      data: {
        trendingProducts: paginatedProducts,
        period: `${days} days`,
        count: paginatedProducts.length,
        pagination: {
          page,
          pages: Math.ceil(trendingProducts.length / limit),
          totalCount: trendingProducts.length,
          perPage: limit
        }
      },
      message: 'Trending products retrieved successfully'
    });
    
  } catch (error) {
    console.error('Trending Products Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving trending products',
      error: error.message
    });
  }
}));

/**
 * @swagger
 * /recommend/personalized/{userId}:
 *   get:
 *     summary: Lấy gợi ý cá nhân hóa
 *     description: Get product recommendations based on user preferences and interaction history
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
 *         description: Number of personalized recommendations to return
 *     responses:
 *       200:
 *         description: Personalized recommendations generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     products:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Product'
 *                     userPreferences:
 *                       type: object
 *                     count:
 *                       type: number
 *                 message:
 *                   type: string
 *       404:
 *         description: User not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/NotFoundError'
 *       500:
 *         description: Error generating personalized recommendations
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.get('/personalized/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 9 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId).select('preferences interactionHistory');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Get products that match user preferences
    let query = {};
    
    if (user.preferences) {
      // Style preference
      if (user.preferences.style) {
        query['outfitTags'] = { $in: [user.preferences.style] };
      }
      
      // Price range
      if (user.preferences.priceRange) {
        query['price'] = {
          $gte: user.preferences.priceRange.min,
          $lte: user.preferences.priceRange.max
        };
      }
      
      // Brand preferences
      if (user.preferences.brandPreferences && user.preferences.brandPreferences.length > 0) {
        query['brand'] = { $in: user.preferences.brandPreferences };
      }
    }
    
    // Get products matching preferences
    const personalizedProducts = await Product.find(query)
      .select('_id name images price category brand outfitTags rating numReviews')
      .sort({ rating: -1, numReviews: -1 })
      .limit(parseInt(k));
    
    // If not enough products, fill with popular products
    if (personalizedProducts.length < parseInt(k)) {
      const popularProducts = await Product.find({ _id: { $nin: personalizedProducts.map(p => p._id) } })
        .select('_id name images price category brand outfitTags rating numReviews')
        .sort({ rating: -1, numReviews: -1 })
        .limit(parseInt(k) - personalizedProducts.length);
      
      personalizedProducts.push(...popularProducts);
    }
    
    res.json({
      success: true,
      data: {
        products: personalizedProducts,
        userPreferences: user.preferences,
        count: personalizedProducts.length
      },
      message: 'Personalized recommendations generated successfully'
    });
    
  } catch (error) {
    console.error('Personalized Recommendation Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating personalized recommendations',
      error: error.message
    });
  }
}));

/**
 * @swagger
 * /recommend/train:
 *   post:
 *     summary: Huấn luyện mô hình gợi ý
 *     description: Train both GNN and Hybrid recommendation models
 *     tags: [Recommendations]
 *     responses:
 *       200:
 *         description: Models trained successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/TrainingResponse'
 *       500:
 *         description: Error training models
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/responses/ErrorResponse'
 */
router.post('/train', asyncHandler(async (req, res) => {
  try {
    // Train both models
    const gnnStart = Date.now();
    await gnnRecommender.train();
    const gnnTime = Date.now() - gnnStart;
    
    const hybridStart = Date.now();
    await hybridRecommender.train();
    const hybridTime = Date.now() - hybridStart;
    
    res.json({
      success: true,
      data: {
        gnn: {
          trained: true,
          trainingTime: `${(gnnTime / 1000).toFixed(2)}s`
        },
        hybrid: {
          trained: true,
          trainingTime: `${(hybridTime / 1000).toFixed(2)}s`
        }
      },
      message: 'Models trained successfully'
    });
    
  } catch (error) {
    console.error('Model Training Error:', error);
    res.status(500).json({
      success: false,
      message: 'Error training models',
      error: error.message
    });
  }
}));

function calculateCosineSimilarity(vector1, vector2) {
  if (vector1.length !== vector2.length) return 0;
  
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < vector1.length; i++) {
    dotProduct += vector1[i] * vector2[i];
    norm1 += vector1[i] * vector1[i];
    norm2 += vector2[i] * vector2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

export default router;
