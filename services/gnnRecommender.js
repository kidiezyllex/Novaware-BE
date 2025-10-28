import * as tf from '@tensorflow/tfjs';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

class GNNRecommender {
  constructor() {
    this.model = null;
    this.userEmbeddings = new Map();
    this.productEmbeddings = new Map();
    this.adjacencyMatrix = null;
    this.isTrained = false;
    this.embeddingSize = 64;
  }

  initializeModel() {
    this.model = tf.sequential({
      layers: [
        // Input layer
        tf.layers.dense({
          inputShape: [this.embeddingSize * 2], // user + product embeddings
          units: 128,
          activation: 'relu',
          name: 'input_layer'
        }),
        
        // Hidden layers
        tf.layers.dense({
          units: 64,
          activation: 'relu',
          name: 'hidden_layer_1'
        }),
        
        tf.layers.dense({
          units: 32,
          activation: 'relu',
          name: 'hidden_layer_2'
        }),
        
        // Output layer
        tf.layers.dense({
          units: 1,
          activation: 'sigmoid',
          name: 'output_layer'
        })
      ]
    });

    // Compile the model
    this.model.compile({
      optimizer: tf.train.adam(0.001),
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    });

    console.log('✅ GNN model initialized with TensorFlow.js');
  }

  async buildGraph() {
    console.log('🔗 Building graph structure...');
    
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id userEmbedding interactionHistory');
    const products = await Product.find().select('_id featureVector compatibleProducts');
    
    console.log(`Graph nodes: ${users.length} users, ${products.length} products`);
    
    // Create embeddings for users and products
    await this.createEmbeddings(users, products);
    
    // Build adjacency matrix
    await this.buildAdjacencyMatrix(users, products);
    
    console.log('✅ Graph structure built');
  }

  async createEmbeddings(users, products) {
    console.log('📊 Creating embeddings...');
    
    // User embeddings
    for (const user of users) {
      if (user.userEmbedding && user.userEmbedding.length > 0) {
        // Use existing embedding if available, truncate to embeddingSize
        this.userEmbeddings.set(user._id.toString(), user.userEmbedding.slice(0, this.embeddingSize));
      } else {
        // Generate random embedding
        const embedding = Array(this.embeddingSize).fill(0).map(() => Math.random());
        this.userEmbeddings.set(user._id.toString(), embedding);
      }
    }
    
    // Product embeddings
    for (const product of products) {
      if (product.featureVector && product.featureVector.length > 0) {
        // Use existing feature vector if available, truncate to embeddingSize
        this.productEmbeddings.set(product._id.toString(), product.featureVector.slice(0, this.embeddingSize));
      } else {
        // Generate random embedding
        const embedding = Array(this.embeddingSize).fill(0).map(() => Math.random());
        this.productEmbeddings.set(product._id.toString(), embedding);
      }
    }
    
    console.log(`Created embeddings for ${this.userEmbeddings.size} users and ${this.productEmbeddings.size} products`);
  }

  async buildAdjacencyMatrix(users, products) {
    console.log('🔗 Building adjacency matrix...');
    
    // Create ID to index mappings
    const userIdToIndex = new Map();
    const productIdToIndex = new Map();
    
    users.forEach((user, index) => {
      userIdToIndex.set(user._id.toString(), index);
    });
    
    products.forEach((product, index) => {
      productIdToIndex.set(product._id.toString(), index);
    });
    
    // Build interaction edges
    const interactionWeights = { 'view': 0.1, 'like': 0.3, 'cart': 0.5, 'purchase': 1.0, 'review': 0.7 };
    
    for (const user of users) {
      const userIndex = userIdToIndex.get(user._id.toString());
       
      user.interactionHistory.forEach(interaction => {
        const productIndex = productIdToIndex.get(interaction.productId.toString());
        if (productIndex !== undefined) {
          const weight = interactionWeights[interaction.interactionType] || 0.1;
          const edgeKey = `${userIndex}-${productIndex}`;
          this.adjacencyMatrix.set(edgeKey, weight);
        }
      });
    }
    
    // Add product-product edges based on compatibility
    for (const product of products) {
      const productIndex = productIdToIndex.get(product._id.toString());
      
      if (product.compatibleProducts && product.compatibleProducts.length > 0) {
        product.compatibleProducts.forEach(compatibleId => {
          const compatibleIndex = productIdToIndex.get(compatibleId.toString());
          if (compatibleIndex !== undefined) {
            const edgeKey = `${productIndex}-${compatibleIndex}`;
            this.adjacencyMatrix.set(edgeKey, 0.2); // Compatibility weight
          }
        });
      }
    }
    
    console.log('✅ Adjacency matrix built');
  }

  async train() {
    console.log('🎯 Training GNN model with TensorFlow.js...');
    
    if (!this.model) {
      this.initializeModel();
    }
    
    if (!this.adjacencyMatrix) {
      await this.buildGraph();
    }
    
    // Prepare training data
    const { features, labels } = await this.prepareTrainingData();
    
    if (features.length === 0) {
      console.log('⚠️ No training data available');
      return;
    }
    
    // Convert to tensors
    const xTrain = tf.tensor2d(features);
    const yTrain = tf.tensor2d(labels, [labels.length, 1]);
    
    // Train the model
    const history = await this.model.fit(xTrain, yTrain, {
      epochs: 50,
      batchSize: 32,
      validationSplit: 0.2,
      verbose: 1,
      callbacks: {
        onEpochEnd: (epoch, logs) => {
          if (epoch % 10 === 0) {
            console.log(`Epoch ${epoch}: loss = ${logs.loss.toFixed(4)}, accuracy = ${logs.acc.toFixed(4)}`);
          }
        }
      }
    });
    
    // Clean up tensors
    xTrain.dispose();
    yTrain.dispose();
    
    this.isTrained = true;
    console.log('✅ GNN model training completed with TensorFlow.js');
  }

  async prepareTrainingData() {
    console.log('📊 Preparing training data for TensorFlow.js...');
    
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id userEmbedding interactionHistory');
    const products = await Product.find().select('_id featureVector');
    
    const features = [];
    const labels = [];
    
    for (const user of users) {
      const userEmbedding = this.userEmbeddings.get(user._id.toString()) || 
                           Array(this.embeddingSize).fill(0);
      
      // Create positive samples from interaction history
      user.interactionHistory.forEach(interaction => {
        const productEmbedding = this.productEmbeddings.get(interaction.productId.toString()) || 
                                Array(this.embeddingSize).fill(0);
        
        // Combine user and product embeddings
        const combinedEmbedding = [...userEmbedding, ...productEmbedding];
        features.push(combinedEmbedding);
        
        // Label based on interaction type
        const interactionWeights = { 'view': 0.2, 'like': 0.6, 'cart': 0.8, 'purchase': 1.0, 'review': 0.9 };
        labels.push([interactionWeights[interaction.interactionType] || 0.1]);
      });
      
      // Create negative samples (random products not interacted with)
      const interactedProductIds = new Set(user.interactionHistory.map(i => i.productId.toString()));
      const availableProducts = products.filter(p => !interactedProductIds.has(p._id.toString()));
      
      // Add some negative samples
      const numNegativeSamples = Math.min(3, availableProducts.length);
      for (let i = 0; i < numNegativeSamples; i++) {
        const randomProduct = availableProducts[Math.floor(Math.random() * availableProducts.length)];
        const productEmbedding = this.productEmbeddings.get(randomProduct._id.toString()) || 
                                Array(this.embeddingSize).fill(0);
        
        const combinedEmbedding = [...userEmbedding, ...productEmbedding];
        features.push(combinedEmbedding);
        labels.push([0.0]); // Negative sample
      }
    }
    
    console.log(`Prepared ${features.length} training samples for TensorFlow.js`);
    return { features, labels };
  }

  async recommend(userId, k = 10) {
    if (!this.isTrained) {
      console.log('⚠️ Model not trained yet. Training now...');
      await this.train();
    }
    
    console.log(`🎯 Generating GNN recommendations for user ${userId}...`);
    
    const user = await User.findById(userId).select('_id userEmbedding interactionHistory preferences gender age');
    if (!user) {
      throw new Error('User not found');
    }
    
    const userEmbedding = this.userEmbeddings.get(userId) || 
                         (user.userEmbedding && user.userEmbedding.slice(0, this.embeddingSize)) ||
                         Array(this.embeddingSize).fill(0);
    
    // PERSONALIZATION: Get products similar to user's interaction history
    const similarProducts = await this.getPersonalizedProducts(user, k);
    
    // Score all products
    const scoredProducts = [];
    
    for (const product of similarProducts) {
      const productEmbedding = this.productEmbeddings.get(product._id.toString()) || 
                              (product.featureVector && product.featureVector.slice(0, this.embeddingSize)) ||
                              Array(this.embeddingSize).fill(0);
      
      // Combine embeddings
      const combinedEmbedding = [...userEmbedding, ...productEmbedding];
      
      // Predict score using TensorFlow.js
      const input = tf.tensor2d([combinedEmbedding]);
      const prediction = this.model.predict(input);
      const score = await prediction.data();
      let personalizedScore = score[0];
      
      // Clean up tensors
      input.dispose();
      prediction.dispose();
      
      // PERSONALIZATION: Boost score for products similar to user's history
      const historySimilarity = this.calculateHistorySimilarity(user, product);
      personalizedScore += historySimilarity * 0.3;
      
      // Filter by preferences
      if (user.preferences) {
        // Style preference
        if (user.preferences.style && product.outfitTags?.includes(user.preferences.style)) {
          personalizedScore *= 1.2;
        }
        
        // Price range
        if (user.preferences.priceRange) {
          if (product.price < user.preferences.priceRange.min || product.price > user.preferences.priceRange.max) {
            personalizedScore *= 0.5;
          }
        }
        
        // Color preferences
        if (user.preferences.colorPreferences && user.preferences.colorPreferences.length > 0) {
          const colorMatch = this.checkColorMatch(product, user.preferences.colorPreferences);
          personalizedScore *= (1 + colorMatch * 0.2);
        }
      }
      
      scoredProducts.push({
        product: product.toObject(),
        score: personalizedScore
      });
    }
    
    // Sort by score and get top K
    const topProducts = scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.product);
    
    // OUTFIT SUGGESTIONS: Generate gender-specific outfit combinations
    const outfits = await this.generateGenderSpecificOutfits(topProducts, user);
    
    console.log(`✅ Generated ${topProducts.length} personalized product recommendations and ${outfits.length} gender-specific outfit suggestions`);
    
    return {
      products: topProducts,
      outfits: outfits,
      model: 'GNN (TensorFlow.js)',
      personalization: 'Based on interaction history and preferences',
      outfitType: user.gender === 'male' ? 'Men\'s outfits (shirt + pants + shoes)' : 'Women\'s outfits (dress + accessories)',
      timestamp: new Date()
    };
  }

  async getPersonalizedProducts(user, k) {
    const userCategories = new Set();
    const userBrands = new Set();
    const userStyles = new Set();
    const userColors = new Set();
    
    // Analyze user's interaction history
    for (const interaction of user.interactionHistory) {
      const product = await Product.findById(interaction.productId).select('category brand outfitTags colors');
      if (product) {
        userCategories.add(product.category);
        userBrands.add(product.brand);
        if (product.outfitTags) {
          product.outfitTags.forEach(tag => userStyles.add(tag));
        }
        if (product.colors) {
          product.colors.forEach(color => userColors.add(color.name.toLowerCase()));
        }
      }
    }
    
    // Build query for similar products
    let query = {};
    
    // Find products in similar categories
    if (userCategories.size > 0) {
      query.category = { $in: Array.from(userCategories) };
    }
    
    // Find products with similar brands
    if (userBrands.size > 0) {
      query.brand = { $in: Array.from(userBrands) };
    }
    
    // Find products with similar styles
    if (userStyles.size > 0) {
      query.outfitTags = { $in: Array.from(userStyles) };
    }
    
    // Get personalized products
    const personalizedProducts = await Product.find(query)
      .select('_id name images price category brand outfitTags colors featureVector')
      .limit(k * 2); // Get more to filter later
    
    // If not enough personalized products, fill with popular products
    if (personalizedProducts.length < k) {
      const popularProducts = await Product.find({ _id: { $nin: personalizedProducts.map(p => p._id) } })
        .select('_id name images price category brand outfitTags colors featureVector')
        .sort({ rating: -1, numReviews: -1 })
        .limit(k - personalizedProducts.length);
      
      personalizedProducts.push(...popularProducts);
    }
    
    return personalizedProducts;
  }

  calculateHistorySimilarity(user, product) {
    let similarity = 0;
    let factors = 0;
    
    // Style similarity
    if (user.preferences?.style && product.outfitTags?.includes(user.preferences.style)) {
      similarity += 0.3;
      factors++;
    }
    
    // Color similarity
    if (user.preferences?.colorPreferences && product.colors) {
      const productColors = product.colors.map(c => c.name.toLowerCase());
      const commonColors = user.preferences.colorPreferences.filter(color => 
        productColors.includes(color.toLowerCase())
      );
      if (commonColors.length > 0) {
        similarity += (commonColors.length / user.preferences.colorPreferences.length) * 0.2;
        factors++;
      }
    }
    
    return factors > 0 ? similarity / factors : 0.1;
  }

  checkColorMatch(product, userColorPreferences) {
    if (!product.colors || !userColorPreferences) return 0;
    
    const productColors = product.colors.map(c => c.name.toLowerCase());
    const commonColors = userColorPreferences.filter(color => 
      productColors.includes(color.toLowerCase())
    );
    
    return commonColors.length / userColorPreferences.length;
  }

  async generateGenderSpecificOutfits(products, user) {
    console.log(`👗 Generating ${user.gender} outfit suggestions...`);
    
    const outfits = [];
    const gender = user.gender || 'other';
    
    if (gender === 'male') {
      // Men's outfits: shirt + pants + shoes
      const shirts = products.filter(p => p.category === 'Tops' || p.outfitTags?.includes('shirt'));
      const pants = products.filter(p => p.category === 'Bottoms' || p.outfitTags?.includes('pants'));
      const shoes = products.filter(p => p.category === 'Shoes');
      
      for (let i = 0; i < Math.min(3, shirts.length); i++) {
        const outfit = {
          name: `Men's Outfit ${i + 1}`,
          products: [shirts[i]],
          style: user.preferences?.style || 'casual',
          totalPrice: shirts[i].price,
          compatibilityScore: 0.8,
          gender: 'male',
          description: 'Shirt + Pants + Shoes combination'
        };
        
        // Add matching pants
        if (pants.length > 0) {
          const matchingPants = pants[Math.floor(Math.random() * pants.length)];
          outfit.products.push(matchingPants);
          outfit.totalPrice += matchingPants.price;
        }
        
        // Add matching shoes
        if (shoes.length > 0) {
          const matchingShoes = shoes[Math.floor(Math.random() * shoes.length)];
          outfit.products.push(matchingShoes);
          outfit.totalPrice += matchingShoes.price;
        }
        
        outfit.compatibilityScore = this.calculateOutfitCompatibility(outfit.products);
        outfits.push(outfit);
      }
      
    } else if (gender === 'female') {
      // Women's outfits: dress + accessories
      const dresses = products.filter(p => p.category === 'Dresses');
      const accessories = products.filter(p => p.category === 'Accessories');
      const shoes = products.filter(p => p.category === 'Shoes');
      
      for (let i = 0; i < Math.min(3, dresses.length); i++) {
        const outfit = {
          name: `Women's Outfit ${i + 1}`,
          products: [dresses[i]],
          style: user.preferences?.style || 'casual',
          totalPrice: dresses[i].price,
          compatibilityScore: 0.8,
          gender: 'female',
          description: 'Dress + Accessories combination'
        };
        
        // Add matching accessories
        if (accessories.length > 0) {
          const matchingAccessory = accessories[Math.floor(Math.random() * accessories.length)];
          outfit.products.push(matchingAccessory);
          outfit.totalPrice += matchingAccessory.price;
        }
        
        // Add matching shoes
        if (shoes.length > 0) {
          const matchingShoes = shoes[Math.floor(Math.random() * shoes.length)];
          outfit.products.push(matchingShoes);
          outfit.totalPrice += matchingShoes.price;
        }
        
        outfit.compatibilityScore = this.calculateOutfitCompatibility(outfit.products);
        outfits.push(outfit);
      }
      
    } else {
      // Unisex outfits: mix of categories
      const tops = products.filter(p => p.category === 'Tops');
      const bottoms = products.filter(p => p.category === 'Bottoms');
      const accessories = products.filter(p => p.category === 'Accessories');
      
      for (let i = 0; i < Math.min(3, tops.length); i++) {
        const outfit = {
          name: `Unisex Outfit ${i + 1}`,
          products: [tops[i]],
          style: user.preferences?.style || 'casual',
          totalPrice: tops[i].price,
          compatibilityScore: 0.7,
          gender: 'unisex',
          description: 'Top + Bottom + Accessory combination'
        };
        
        // Add matching bottom
        if (bottoms.length > 0) {
          const matchingBottom = bottoms[Math.floor(Math.random() * bottoms.length)];
          outfit.products.push(matchingBottom);
          outfit.totalPrice += matchingBottom.price;
        }
        
        // Add matching accessory
        if (accessories.length > 0) {
          const matchingAccessory = accessories[Math.floor(Math.random() * accessories.length)];
          outfit.products.push(matchingAccessory);
          outfit.totalPrice += matchingAccessory.price;
        }
        
        outfit.compatibilityScore = this.calculateOutfitCompatibility(outfit.products);
        outfits.push(outfit);
      }
    }
    
    return outfits;
  }

  calculateOutfitCompatibility(products) {
    if (products.length < 2) return 0.5;
    
    let totalCompatibility = 0;
    let comparisons = 0;
    
    for (let i = 0; i < products.length; i++) {
      for (let j = i + 1; j < products.length; j++) {
        const product1 = products[i];
        const product2 = products[j];
        
        // Check if products are compatible based on tags
        const tags1 = product1.outfitTags || [];
        const tags2 = product2.outfitTags || [];
        const commonTags = tags1.filter(tag => tags2.includes(tag));
        
        const compatibility = commonTags.length / Math.max(tags1.length, tags2.length, 1);
        totalCompatibility += compatibility;
        comparisons++;
      }
    }
    
    return comparisons > 0 ? totalCompatibility / comparisons : 0.5;
  }

  async saveModel(path = './models/gnn_model') {
    if (this.model && this.isTrained) {
      await this.model.save(`file://${path}`);
      console.log(`✅ GNN model saved to ${path}`);
    }
  }

  async loadModel(path = './models/gnn_model') {
    try {
      this.model = await tf.loadLayersModel(`file://${path}/model.json`);
      this.isTrained = true;
      console.log(`✅ GNN model loaded from ${path}`);
    } catch (error) {
      console.log('⚠️ Could not load pre-trained model:', error.message);
    }
  }
}

// Create and export singleton instance
const gnnRecommender = new GNNRecommender();
export default gnnRecommender;