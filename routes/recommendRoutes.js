import express from 'express';
import asyncHandler from 'express-async-handler';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

const router = express.Router();

router.get('/gnn/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 10 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate recommendations
    const recommendations = await gnnRecommender.recommend(userId, parseInt(k));
    
    res.json({
      success: true,
      data: recommendations,
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

router.get('/hybrid/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 10 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate recommendations
    const recommendations = await hybridRecommender.recommend(userId, parseInt(k));
    
    res.json({
      success: true,
      data: recommendations,
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

router.get('/best/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 10 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Use GNN as the best model (can be changed based on evaluation results)
    const recommendations = await gnnRecommender.recommend(userId, parseInt(k));
    
    res.json({
      success: true,
      data: recommendations,
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

router.get('/outfits/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 3 } = req.query;
  
  try {
    // Validate user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Generate recommendations with outfits
    const recommendations = await gnnRecommender.recommend(userId, 20); // Get more products for better outfit creation
    
    // Filter to only return outfits
    const response = {
      outfits: recommendations.outfits.slice(0, parseInt(k)),
      model: recommendations.model,
      timestamp: recommendations.timestamp
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

router.get('/similar/:productId', asyncHandler(async (req, res) => {
  const { productId } = req.params;
  const { k = 10 } = req.query;
  
  try {
    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }
    
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
    
    // Sort by similarity and return top K
    const topSimilar = similarProducts
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, parseInt(k))
      .map(item => item.product);
    
    res.json({
      success: true,
      data: {
        originalProduct: product,
        similarProducts: topSimilar,
        count: topSimilar.length
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

router.get('/trending', asyncHandler(async (req, res) => {
  const { k = 10, days = 30 } = req.query;
  
  try {
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
        $limit: parseInt(k)
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
    
    res.json({
      success: true,
      data: {
        trendingProducts,
        period: `${days} days`,
        count: trendingProducts.length
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

router.get('/personalized/:userId', asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { k = 10 } = req.query;
  
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

router.post('/train', asyncHandler(async (req, res) => {
  try {
    console.log('🚀 Starting model training...');
    
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
