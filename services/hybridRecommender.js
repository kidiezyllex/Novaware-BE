import { Matrix } from 'ml-matrix';
import pkg from 'natural';
const { TfIdf } = pkg;
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

// Memory optimization constants
const MAX_USERS = 2000; // Limit users to prevent memory overflow
const MAX_PRODUCTS = 5000; // Limit products to prevent memory overflow
const BATCH_SIZE = 100; // Process in smaller batches
const MEMORY_CLEANUP_INTERVAL = 50; // Cleanup every N operations

class HybridRecommender {
  constructor() {
    this.userItemMatrix = null;
    this.userSimilarityMatrix = null;
    this.itemSimilarityMatrix = null;
    this.userIndexMap = new Map();
    this.itemIndexMap = new Map();
    this.isTrained = false;
    this.cfWeight = 0.6;
    this.cbWeight = 0.4;
    this.memoryStats = {
      peakMemory: 0,
      currentMemory: 0,
      operationsCount: 0
    };
  }

  async train() {
    try {
      await this.buildUserItemMatrix();
      await this.computeUserSimilarity();
      await this.computeItemSimilarity();
      this.isTrained = true;
    } catch (error) {
      throw error;
    }
  }

  async buildUserItemMatrix() {
    console.log('🏗️ Building user-item matrix with memory optimization...');
    
    // Limit dataset size to prevent memory overflow
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id interactionHistory')
      .limit(MAX_USERS)
      .setOptions({ allowDiskUse: true });
      
    const products = await Product.find()
      .select('_id')
      .limit(MAX_PRODUCTS)
      .setOptions({ allowDiskUse: true });
    
    console.log(`📊 Using ${users.length} users and ${products.length} products (limited for memory)`);
    
    // Clear existing maps to free memory
    this.userIndexMap.clear();
    this.itemIndexMap.clear();
    
    users.forEach((user, index) => {
      this.userIndexMap.set(user._id.toString(), index);
    });
    
    products.forEach((product, index) => {
      this.itemIndexMap.set(product._id.toString(), index);
    });
    
    // Initialize matrix with proper dimensions
    this.userItemMatrix = new Matrix(users.length, products.length);
    
    const interactionWeights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
    
    // Process users in batches to manage memory
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      
      for (const user of batch) {
        const userIndex = this.userIndexMap.get(user._id.toString());
        
        user.interactionHistory.forEach(interaction => {
          const itemIndex = this.itemIndexMap.get(interaction.productId.toString());
          if (itemIndex !== undefined) {
            const weight = interactionWeights[interaction.interactionType] || 1;
            const rating = interaction.rating || 3;
            const score = weight * (rating / 5);
            
            this.userItemMatrix.set(userIndex, itemIndex, score);
          }
        });
      }
      
      // Memory cleanup after each batch
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        this.performMemoryCleanup();
      }
    }
    
    console.log('✅ User-item matrix built successfully');
  }

  async computeUserSimilarity() {
    console.log('🔗 Computing user similarity with memory optimization...');
    const numUsers = this.userItemMatrix.rows;
    
    // Use sparse matrix approach for large datasets
    if (numUsers > 1000) {
      console.log('📊 Using sparse similarity computation for large dataset');
      this.userSimilarityMatrix = new Map(); // Use Map instead of full matrix
      
      for (let i = 0; i < numUsers; i++) {
        this.userSimilarityMatrix.set(`${i}-${i}`, 1.0); // Diagonal elements
        
        // Only compute similarities for top-k similar users
        const similarities = [];
        for (let j = 0; j < numUsers; j++) {
          if (i !== j) {
            const similarity = this.cosineSimilarity(
              this.userItemMatrix.getRow(i),
              this.userItemMatrix.getRow(j)
            );
            if (similarity > 0.1) { // Only store significant similarities
              similarities.push({ user: j, similarity });
            }
          }
        }
        
        // Store only top 50 most similar users
        similarities
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 50)
          .forEach(({ user, similarity }) => {
            this.userSimilarityMatrix.set(`${i}-${user}`, similarity);
            this.userSimilarityMatrix.set(`${user}-${i}`, similarity);
          });
        
        if (i % 100 === 0) {
          console.log(`   Processed ${i}/${numUsers} users`);
          this.performMemoryCleanup();
        }
      }
    } else {
      // Use full matrix for smaller datasets
      this.userSimilarityMatrix = new Matrix(numUsers, numUsers);
      
      for (let i = 0; i < numUsers; i++) {
        for (let j = i; j < numUsers; j++) {
          if (i === j) {
            this.userSimilarityMatrix.set(i, j, 1.0);
          } else {
            const similarity = this.cosineSimilarity(
              this.userItemMatrix.getRow(i),
              this.userItemMatrix.getRow(j)
            );
            this.userSimilarityMatrix.set(i, j, similarity);
            this.userSimilarityMatrix.set(j, i, similarity);
          }
        }
        
        if (i % 50 === 0) {
          this.performMemoryCleanup();
        }
      }
    }
    
    console.log('✅ User similarity computation completed');
  }

  async computeItemSimilarity() {
    console.log('🔗 Computing item similarity with memory optimization...');
    
    // Limit products to prevent memory overflow
    const products = await Product.find()
      .select('_id description featureVector category brand outfitTags')
      .limit(MAX_PRODUCTS)
      .setOptions({ allowDiskUse: true });
    
    console.log(`📊 Processing ${products.length} products for similarity`);
    
    // Initialize TF-IDF with limited vocabulary
    const tfidf = new TfIdf();
    
    // Add product descriptions to TF-IDF in batches
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      batch.forEach(p => tfidf.addDocument(p.description || ''));
    }
    
    // Process products in batches to update feature vectors
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      
      for (const product of batch) {
        const vector = [];
        tfidf.tfidfs(product.description || '', (j, measure) => vector.push(measure));
        
        // Only update if vector is meaningful
        if (vector.length > 0) {
          await Product.findByIdAndUpdate(product._id, { featureVector: vector });
          product.featureVector = vector;
        }
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        this.performMemoryCleanup();
      }
    }
    
    const numItems = products.length;
    
    // Use sparse matrix for large datasets
    if (numItems > 1000) {
      console.log('📊 Using sparse item similarity computation');
      this.itemSimilarityMatrix = new Map();
      
      for (let i = 0; i < numItems; i++) {
        this.itemSimilarityMatrix.set(`${i}-${i}`, 1.0);
        
        const similarities = [];
        for (let j = 0; j < numItems; j++) {
          if (i !== j) {
            const product1 = products[i];
            const product2 = products[j];
            
            const contentSimilarity = this.computeContentSimilarity(product1, product2);
            const categorySimilarity = product1.category === product2.category ? 0.3 : 0;
            const brandSimilarity = product1.brand === product2.brand ? 0.2 : 0;
            const tagSimilarity = this.computeTagSimilarity(product1.outfitTags || [], product2.outfitTags || []);
            
            const totalSimilarity = contentSimilarity + categorySimilarity + brandSimilarity + tagSimilarity;
            
            if (totalSimilarity > 0.1) {
              similarities.push({ item: j, similarity: Math.min(totalSimilarity, 1.0) });
            }
          }
        }
        
        // Store only top 30 most similar items
        similarities
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, 30)
          .forEach(({ item, similarity }) => {
            this.itemSimilarityMatrix.set(`${i}-${item}`, similarity);
            this.itemSimilarityMatrix.set(`${item}-${i}`, similarity);
          });
        
        if (i % 100 === 0) {
          console.log(`   Processed ${i}/${numItems} items`);
          this.performMemoryCleanup();
        }
      }
    } else {
      // Use full matrix for smaller datasets
      this.itemSimilarityMatrix = new Matrix(numItems, numItems);
      
      for (let i = 0; i < numItems; i++) {
        for (let j = i; j < numItems; j++) {
          if (i === j) {
            this.itemSimilarityMatrix.set(i, j, 1.0);
          } else {
            const product1 = products[i];
            const product2 = products[j];
            
            const contentSimilarity = this.computeContentSimilarity(product1, product2);
            const categorySimilarity = product1.category === product2.category ? 0.3 : 0;
            const brandSimilarity = product1.brand === product2.brand ? 0.2 : 0;
            const tagSimilarity = this.computeTagSimilarity(product1.outfitTags || [], product2.outfitTags || []);
            
            const totalSimilarity = contentSimilarity + categorySimilarity + brandSimilarity + tagSimilarity;
            
            this.itemSimilarityMatrix.set(i, j, Math.min(totalSimilarity, 1.0));
            this.itemSimilarityMatrix.set(j, i, Math.min(totalSimilarity, 1.0));
          }
        }
        
        if (i % 50 === 0) {
          this.performMemoryCleanup();
        }
      }
    }
    
    console.log('✅ Item similarity computation completed');
  }

  computeContentSimilarity(product1, product2) {
    const vector1 = product1.featureVector || [];
    const vector2 = product2.featureVector || [];
    
    if (vector1.length === 0 || vector2.length === 0) {
      return 0.1;
    }
    
    // Ensure vectors have the same length for proper cosine similarity calculation
    const maxLength = Math.max(vector1.length, vector2.length);
    const normalizedVector1 = [...vector1];
    const normalizedVector2 = [...vector2];
    
    // Pad shorter vector with zeros
    while (normalizedVector1.length < maxLength) {
      normalizedVector1.push(0);
    }
    while (normalizedVector2.length < maxLength) {
      normalizedVector2.push(0);
    }
    
    const similarity = this.cosineSimilarity(normalizedVector1, normalizedVector2);
    
    // Apply TF-IDF weight and ensure similarity is meaningful
    return Math.max(similarity * 0.5, 0.05);
  }

  computeTagSimilarity(tags1, tags2) {
    if (tags1.length === 0 || tags2.length === 0) {
      return 0;
    }
    
    const commonTags = tags1.filter(tag => tags2.includes(tag));
    const unionTags = [...new Set([...tags1, ...tags2])];
    
    return (commonTags.length / unionTags.length) * 0.3;
  }

  cosineSimilarity(vector1, vector2) {
    if (vector1.length !== vector2.length) {
      return 0;
    }
    
    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    
    for (let i = 0; i < vector1.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      norm1 += vector1[i] * vector1[i];
      norm2 += vector2[i] * vector2[i];
    }
    
    if (norm1 === 0 || norm2 === 0) {
      return 0;
    }
    
    return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  }

  // Helper method to get age-appropriate categories and styles
  getAgeAppropriateCategories(age) {
    if (!age) return null;
    
    if (age >= 13 && age <= 18) {
      return { style: 'casual', categories: ['Tops', 'Bottoms', 'Shoes', 'Accessories'] };
    } else if (age >= 19 && age <= 25) {
      return { style: 'modern', categories: ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories'] };
    } else if (age >= 26 && age <= 35) {
      return { style: 'professional', categories: ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories'] };
    } else if (age >= 36 && age <= 50) {
      return { style: 'classic', categories: ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories'] };
    } else {
      return { style: 'traditional', categories: ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories'] };
    }
  }

  // Helper method to analyze user interaction history
  async analyzeInteractionHistory(user) {
    const history = user.interactionHistory || [];
    if (history.length === 0) return { categories: [], brands: [], styles: [] };

    const historyIds = history.map(i => i.productId);
    const products = await Product.find({ _id: { $in: historyIds } })
      .select('category brand outfitTags')
      .lean();

    const categories = new Map();
    const brands = new Map();
    const styles = new Map();

    products.forEach((product, index) => {
      const interaction = history[index];
      const weight = interaction.interactionType === 'purchase' ? 3 : 
                     interaction.interactionType === 'cart' ? 2 : 
                     interaction.interactionType === 'like' ? 1.5 : 1;

      categories.set(product.category, (categories.get(product.category) || 0) + weight);
      brands.set(product.brand, (brands.get(product.brand) || 0) + weight);
      if (product.outfitTags) {
        product.outfitTags.forEach(tag => {
          styles.set(tag, (styles.get(tag) || 0) + weight);
        });
      }
    });

    return {
      categories: Array.from(categories.entries()).sort((a, b) => b[1] - a[1]).map(([cat]) => cat),
      brands: Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).map(([brand]) => brand),
      styles: Array.from(styles.entries()).sort((a, b) => b[1] - a[1]).map(([style]) => style)
    };
  }

  // Calculate age-based score adjustment
  calculateAgeScore(product, user) {
    if (!user.age) return 1.0;
    
    const ageInfo = this.getAgeAppropriateCategories(user.age);
    if (!ageInfo) return 1.0;
    
    let score = 1.0;
    
    // Category match
    if (ageInfo.categories.includes(product.category)) {
      score *= 1.2;
    }
    
    // Style match
    if (ageInfo.style && product.outfitTags?.includes(ageInfo.style)) {
      score *= 1.15;
    }
    
    return score;
  }

  async recommend(userId, k = 10) {
    if (!this.isTrained) {
      await this.train();
    }
    
    const user = await User.findById(userId).select('_id interactionHistory preferences gender age');
    if (!user) {
      throw new Error('User not found');
    }
    
    const userIndex = this.userIndexMap.get(userId);
    if (userIndex === undefined) {
      throw new Error('User not found in training data');
    }
    
    // Analyze interaction history
    const historyAnalysis = await this.analyzeInteractionHistory(user);
    
    const personalizedProducts = await this.getPersonalizedProducts(user, k * 2);
    
    const scoredProducts = [];
    
    for (const product of personalizedProducts) {
      const itemIndex = this.itemIndexMap.get(product._id.toString());
      if (itemIndex === undefined) continue;
      
      const cfScore = this.computeCollaborativeScore(userIndex, itemIndex);
      const cbScore = this.computeContentBasedScore(user, product);
      let hybridScore = (this.cfWeight * cfScore) + (this.cbWeight * cbScore);
      
      // Apply age-based scoring
      hybridScore *= this.calculateAgeScore(product, user);
      
      // Gender filtering
      if (user.gender) {
        const genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
          : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
          : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
        
        if (genderAllow.has(product.category)) {
          hybridScore *= 1.3;
        } else {
          hybridScore *= 0.3; // Heavily penalize if gender doesn't match
        }
      }
      
      let personalizedScore = hybridScore;
      
      const historySimilarity = this.calculateHistorySimilarity(user, product);
      personalizedScore += historySimilarity * 0.3;
      
      // History-based boosts
      if (historyAnalysis.categories.includes(product.category)) {
        personalizedScore *= 1.4;
      }
      
      if (historyAnalysis.brands.includes(product.brand)) {
        personalizedScore *= 1.3;
      }
      
      if (historyAnalysis.styles.some(style => product.outfitTags?.includes(style))) {
        personalizedScore *= 1.25;
      }
      
      if (user.preferences) {
        if (user.preferences.style && product.outfitTags?.includes(user.preferences.style)) {
          personalizedScore *= 1.2;
        }
        
        if (user.preferences.priceRange) {
          if (product.price < user.preferences.priceRange.min || product.price > user.preferences.priceRange.max) {
            personalizedScore *= 0.5;
          }
        }
        
        if (user.preferences.colorPreferences && user.preferences.colorPreferences.length > 0) {
          const colorMatch = this.checkColorMatch(product, user.preferences.colorPreferences);
          personalizedScore *= (1 + colorMatch * 0.2);
        }
      }
      
      scoredProducts.push({
        product: product.toObject(),
        score: personalizedScore,
        cfScore: cfScore,
        cbScore: cbScore
      });
    }
    
    const topProducts = scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.product);
    
    const outfits = await this.generateGenderSpecificOutfits(topProducts, user);
    
    // Generate explanation
    const explanation = this.generateExplanation(user, historyAnalysis, topProducts);
    
    return {
      products: topProducts,
      outfits: outfits,
      model: 'Hybrid',
      cfWeight: this.cfWeight,
      cbWeight: this.cbWeight,
      personalization: 'Based on interaction history and preferences',
      outfitType: user.gender === 'male' ? 'Men\'s outfits (shirt + pants + shoes)' : 'Women\'s outfits (dress + accessories)',
      timestamp: new Date(),
      explanation
    };
  }

  computeCollaborativeScore(userIndex, itemIndex) {
    let weightedSum = 0;
    let similaritySum = 0;
    
    if (this.userSimilarityMatrix instanceof Map) {
      // Sparse matrix approach
      const userRatings = this.userItemMatrix.getColumn(itemIndex);
      
      for (let i = 0; i < userRatings.length; i++) {
        if (i !== userIndex && userRatings[i] > 0) {
          const similarity = this.userSimilarityMatrix.get(`${userIndex}-${i}`) || 0;
          if (similarity > 0.1) {
            weightedSum += similarity * userRatings[i];
            similaritySum += Math.abs(similarity);
          }
        }
      }
    } else {
      // Full matrix approach
      const userSimilarities = this.userSimilarityMatrix.getRow(userIndex);
      const userRatings = this.userItemMatrix.getColumn(itemIndex);
      
      for (let i = 0; i < userSimilarities.length; i++) {
        if (i !== userIndex && userRatings[i] > 0) {
          const similarity = userSimilarities[i];
          if (similarity > 0.1) {
            weightedSum += similarity * userRatings[i];
            similaritySum += Math.abs(similarity);
          }
        }
      }
    }
    
    if (similaritySum === 0) {
      return 0.1;
    }
    
    return weightedSum / similaritySum;
  }

  computeContentBasedScore(user, product) {
    let score = 0;
    
    if (user.preferences?.style && product.outfitTags?.includes(user.preferences.style)) {
      score += 0.3;
    }
    
    const userCategories = this.getUserCategoryPreferences(user);
    if (userCategories[product.category]) {
      score += userCategories[product.category] * 0.2;
    }
    
    const userBrands = this.getUserBrandPreferences(user);
    if (userBrands[product.brand]) {
      score += userBrands[product.brand] * 0.1;
    }
    
    if (user.preferences?.priceRange) {
      const priceRange = user.preferences.priceRange;
      if (product.price >= priceRange.min && product.price <= priceRange.max) {
        score += 0.2;
      }
    }
    
    if (user.contentProfile?.featureVector && product.featureVector) {
      const featureSimilarity = this.cosineSimilarity(
        user.contentProfile.featureVector,
        product.featureVector
      );
      score += featureSimilarity * 0.2;
    }
    
    return Math.min(score, 1.0);
  }

  getUserCategoryPreferences(user) {
    const categoryCounts = {};
    const totalInteractions = user.interactionHistory.length;
    
    if (totalInteractions === 0) return {};
    
    return categoryCounts;
  }

  getUserBrandPreferences(user) {
    const brandCounts = {};
    const totalInteractions = user.interactionHistory.length;
    
    if (totalInteractions === 0) return {};
    
    return brandCounts;
  }

  async getPersonalizedProducts(user, k) {
    console.log('🎯 Getting personalized products with memory optimization...');
    
    const userCategories = new Set();
    const userBrands = new Set();
    const userStyles = new Set();
    const userColors = new Set();
    
    // Process interactions in batches to prevent memory overflow
    const batchSize = 50;
    for (let i = 0; i < user.interactionHistory.length; i += batchSize) {
      const batch = user.interactionHistory.slice(i, i + batchSize);
      
      for (const interaction of batch) {
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
      
      // Memory cleanup after each batch
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        this.performMemoryCleanup();
      }
    }
    
    let query = {};
    
    if (userCategories.size > 0) {
      query.category = { $in: Array.from(userCategories) };
    }
    
    if (userBrands.size > 0) {
      query.brand = { $in: Array.from(userBrands) };
    }
    
    if (userStyles.size > 0) {
      query.outfitTags = { $in: Array.from(userStyles) };
    }
    
    // Limit results to prevent memory overflow
    const personalizedProducts = await Product.find(query)
      .select('_id name images price category brand outfitTags colors featureVector')
      .limit(Math.min(k * 2, 200)) // Cap at 200 products
      .sort({ rating: -1 })
      .setOptions({ allowDiskUse: true });
    
    if (personalizedProducts.length < k) {
      const popularProducts = await Product.find({ _id: { $nin: personalizedProducts.map(p => p._id) } })
        .select('_id name images price category brand outfitTags colors featureVector')
        .sort({ rating: -1, numReviews: -1 })
        .limit(Math.min(k - personalizedProducts.length, 100)) // Cap at 100 additional products
        .setOptions({ allowDiskUse: true });
      
      personalizedProducts.push(...popularProducts);
    }
    
    console.log(`✅ Retrieved ${personalizedProducts.length} personalized products`);
    return personalizedProducts;
  }

  calculateHistorySimilarity(user, product) {
    let similarity = 0;
    let factors = 0;
    
    if (user.preferences?.style && product.outfitTags?.includes(user.preferences.style)) {
      similarity += 0.3;
      factors++;
    }
    
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
    const outfits = [];
    const gender = user.gender || 'other';
    
    if (gender === 'male') {
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
        
        if (pants.length > 0) {
          const matchingPants = pants[Math.floor(Math.random() * pants.length)];
          outfit.products.push(matchingPants);
          outfit.totalPrice += matchingPants.price;
        }
        
        if (shoes.length > 0) {
          const matchingShoes = shoes[Math.floor(Math.random() * shoes.length)];
          outfit.products.push(matchingShoes);
          outfit.totalPrice += matchingShoes.price;
        }
        
        outfit.compatibilityScore = this.calculateOutfitCompatibility(outfit.products);
        outfits.push(outfit);
      }
      
    } else if (gender === 'female') {
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
        
        if (accessories.length > 0) {
          const matchingAccessory = accessories[Math.floor(Math.random() * accessories.length)];
          outfit.products.push(matchingAccessory);
          outfit.totalPrice += matchingAccessory.price;
        }
        
        if (shoes.length > 0) {
          const matchingShoes = shoes[Math.floor(Math.random() * shoes.length)];
          outfit.products.push(matchingShoes);
          outfit.totalPrice += matchingShoes.price;
        }
        
        outfit.compatibilityScore = this.calculateOutfitCompatibility(outfit.products);
        outfits.push(outfit);
      }
      
    } else {
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
        
        if (bottoms.length > 0) {
          const matchingBottom = bottoms[Math.floor(Math.random() * bottoms.length)];
          outfit.products.push(matchingBottom);
          outfit.totalPrice += matchingBottom.price;
        }
        
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

  async generateOutfitSuggestions(products, user) {
    const outfits = [];
    const categories = ['Tops', 'Bottoms', 'Dresses', 'Outerwear', 'Accessories', 'Shoes'];
    
    const productsByCategory = {};
    categories.forEach(category => {
      productsByCategory[category] = products.filter(p => p.category === category);
    });
    
    const maxOutfits = 3;
    for (let i = 0; i < maxOutfits; i++) {
      const outfit = {
        name: `Outfit ${i + 1}`,
        products: [],
        style: user.preferences?.style || 'casual',
        totalPrice: 0,
        compatibilityScore: 0
      };
      
      const outfitCategories = ['Tops', 'Bottoms'];
      if (productsByCategory['Dresses'].length > 0) {
        outfitCategories.push('Dresses');
      }
      
      for (const category of outfitCategories) {
        if (productsByCategory[category].length > 0) {
          const randomProduct = productsByCategory[category][
            Math.floor(Math.random() * productsByCategory[category].length)
          ];
          outfit.products.push(randomProduct);
          outfit.totalPrice += randomProduct.price;
        }
      }
      
      if (productsByCategory['Accessories'].length > 0 && outfit.products.length < 3) {
        const accessory = productsByCategory['Accessories'][
          Math.floor(Math.random() * productsByCategory['Accessories'].length)
        ];
        outfit.products.push(accessory);
        outfit.totalPrice += accessory.price;
      }
      
      if (outfit.products.length > 0) {
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

  // Generate explanation for recommendations
  generateExplanation(user, historyAnalysis, products) {
    const reasons = [];
    
    if (user.gender) {
      reasons.push(`Dựa trên giới tính ${user.gender === 'male' ? 'nam' : 'nữ'} của bạn`);
    }
    
    if (user.age) {
      const ageInfo = this.getAgeAppropriateCategories(user.age);
      if (ageInfo) {
        reasons.push(`Phù hợp với độ tuổi ${user.age} và phong cách ${ageInfo.style}`);
      }
    }
    
    if (historyAnalysis.categories.length > 0) {
      const topCategories = historyAnalysis.categories.slice(0, 3).join(', ');
      reasons.push(`Dựa trên lịch sử tương tác với các danh mục: ${topCategories}`);
    }
    
    if (historyAnalysis.brands.length > 0) {
      const topBrands = historyAnalysis.brands.slice(0, 2).join(', ');
      reasons.push(`Bạn đã quan tâm đến thương hiệu: ${topBrands}`);
    }
    
    if (user.preferences?.style) {
      reasons.push(`Phù hợp với phong cách ${user.preferences.style} bạn yêu thích`);
    }
    
    reasons.push(`Kết hợp Collaborative Filtering (${(this.cfWeight * 100).toFixed(0)}%) và Content-Based Filtering (${(this.cbWeight * 100).toFixed(0)}%)`);
    
    if (products.length > 0) {
      const categories = [...new Set(products.map(p => p.category))];
      reasons.push(`Gợi ý ${products.length} sản phẩm từ các danh mục: ${categories.join(', ')}`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Dựa trên mô hình Hybrid kết hợp Collaborative và Content-Based Filtering';
  }

  async recommendPersonalize(userId, k = 10) {
    // Try personalized recommendation; fallback to cold start if no history
    try {
      const result = await this.recommend(userId, k);
      return { 
        products: result.products, 
        outfits: result.outfits,
        model: result.model, 
        timestamp: new Date().toISOString(),
        explanation: result.explanation || ''
      };
    } catch (error) {
      const msg = (error && error.message) ? error.message : '';
      const isColdStartCase = msg.includes('not found in training data') || msg.includes('User not found') || msg.includes('no interaction history');
      if (!isColdStartCase) throw error;
      
      // Cold start fallback
      const user = await User.findById(userId).select('gender age');
      let genderAllow = null;
      if (user && user.gender) {
        genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
          : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
          : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
      }
      
      const query = genderAllow ? { category: { $in: Array.from(genderAllow) } } : {};
      const products = await Product.find(query)
        .sort({ rating: -1 })
        .limit(k)
        .setOptions({ allowDiskUse: true })
        .lean();
      
      const coldExplanation = user 
        ? `Dựa trên ${user.gender ? `giới tính ${user.gender === 'male' ? 'nam' : 'nữ'}` : ''} ${user.age ? `độ tuổi ${user.age}` : ''}. Sử dụng sản phẩm phổ biến nhất do chưa có lịch sử tương tác`
        : 'Sử dụng sản phẩm phổ biến nhất do chưa có lịch sử tương tác';
      
      return { 
        products, 
        outfits: [], 
        model: 'ColdStart (TopRated)', 
        timestamp: new Date().toISOString(),
        explanation: coldExplanation
      };
    }
  }

  // Generate explanation for outfit recommendations
  generateOutfitExplanation(user, seedProduct, outfits, historyAnalysis) {
    const reasons = [];
    
    if (seedProduct) {
      reasons.push(`Dựa trên sản phẩm bạn chọn: ${seedProduct.name} (${seedProduct.category})`);
    }
    
    if (user.gender) {
      const genderText = user.gender === 'male' ? 'nam' : user.gender === 'female' ? 'nữ' : 'unisex';
      reasons.push(`Phối đồ phù hợp cho giới tính ${genderText}`);
    }
    
    if (user.age) {
      const ageInfo = this.getAgeAppropriateCategories(user.age);
      if (ageInfo) {
        reasons.push(`Phong cách ${ageInfo.style} phù hợp với độ tuổi ${user.age}`);
      }
    }
    
    if (historyAnalysis.styles.length > 0) {
      reasons.push(`Kết hợp phong cách bạn thường chọn: ${historyAnalysis.styles.slice(0, 2).join(', ')}`);
    }
    
    reasons.push(`Sử dụng mô hình Hybrid (CF ${(this.cfWeight * 100).toFixed(0)}% + CB ${(this.cbWeight * 100).toFixed(0)}%) để phân tích tương thích`);
    
    if (outfits.length > 0) {
      reasons.push(`Tạo ${outfits.length} bộ phối đồ hoàn chỉnh với độ tương thích cao`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Phối đồ dựa trên sản phẩm bạn chọn và mô hình Hybrid phân tích tương thích';
  }

  async recommendOutfits(userId, { productId = null, k = 12 } = {}) {
    // Must have gender and interaction history; and a selected seed product
    const user = await User.findById(userId).select('_id interactionHistory preferences gender age');
    if (!user) {
      throw new Error('User not found');
    }
    
    if (!user.interactionHistory || user.interactionHistory.length === 0) {
      throw new Error('User has no interaction history');
    }
    
    if (!user.gender) {
      throw new Error('User gender is required');
    }
    
    if (!productId) {
      throw new Error('productId is required to build outfit');
    }

    if (!this.isTrained) {
      await this.train();
    }

    const userIndex = this.userIndexMap.get(userId.toString());
    if (userIndex === undefined) {
      throw new Error('User not found in training data');
    }

    // Analyze interaction history
    const historyAnalysis = await this.analyzeInteractionHistory(user);

    // Collect user history categories
    const historyIds = (user.interactionHistory || []).map(i => i.productId);
    const historyProducts = historyIds.length > 0 ? await Product.find({ _id: { $in: historyIds } }).select('_id category').lean() : [];
    const preferredCategories = new Set(historyProducts.map(p => p.category));

    // Get seed product
    const seedProduct = await Product.findById(productId).lean();
    if (!seedProduct) {
      throw new Error('Seed product not found');
    }

    // Get personalized products similar to the seed
    const personalizedProducts = await this.getPersonalizedProducts(user, k * 3);
    
    // Compute scores for products with personalization
    const scoredProducts = [];
    for (const product of personalizedProducts) {
      const itemIndex = this.itemIndexMap.get(product._id.toString());
      if (itemIndex === undefined) continue;
      
      let cfScore = this.computeCollaborativeScore(userIndex, itemIndex);
      let cbScore = this.computeContentBasedScore(user, product);
      let hybridScore = (this.cfWeight * cfScore) + (this.cbWeight * cbScore);
      
      // Apply age-based scoring
      hybridScore *= this.calculateAgeScore(product, user);
      
      // Gender filtering
      if (user.gender) {
        const genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
          : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
          : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
        
        if (genderAllow.has(product.category)) {
          hybridScore *= 1.3;
        } else {
          hybridScore *= 0.3;
        }
      }
      
      // Boost score if same category as seed
      let finalScore = hybridScore;
      if (product.category === seedProduct.category) {
        finalScore *= 1.3;
      }
      
      // History-based boosts
      if (historyAnalysis.categories.includes(product.category)) {
        finalScore *= 1.4;
      }
      
      if (historyAnalysis.brands.includes(product.brand)) {
        finalScore *= 1.3;
      }
      
      scoredProducts.push({
        product: product,
        score: finalScore
      });
    }

    // Rank products
    const rankedProducts = scoredProducts
      .sort((a, b) => b.score - a.score)
      .map(item => item.product);

    // Gender filter
    const gender = user.gender;
    const genderAllow = gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
                      : gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
                      : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);

    // Filter by gender and prioritize preferred categories
    let filtered = rankedProducts.filter(p => genderAllow.has(p.category));
    if (preferredCategories.size > 0) {
      filtered = filtered.sort((a, b) => (preferredCategories.has(b.category) ? 1 : 0) - (preferredCategories.has(a.category) ? 1 : 0));
    }

    // Use the required productId as seed and prioritize category-matching items
    filtered = [
      seedProduct, 
      ...filtered.filter(p => p._id.toString() !== productId && p.category === seedProduct.category), 
      ...filtered.filter(p => p.category !== seedProduct.category)
    ];

    const topProducts = filtered.slice(0, Math.max(k * 2, 20));
    const outfits = await this.generateOutfitsFromSeed(topProducts, user, seedProduct, k);
    
    // Generate explanation
    const explanation = this.generateOutfitExplanation(user, seedProduct, outfits, historyAnalysis);
    
    return { 
      outfits, 
      model: 'Hybrid', 
      timestamp: new Date().toISOString(),
      explanation
    };
  }

  // Build outfits that must include the selected seed product
  async generateOutfitsFromSeed(products, user, seedProduct, k = 12) {
    const outfits = [];
    const gender = user.gender || 'other';
    if (!seedProduct) return outfits;

    const isTop = (p) => p.category === 'Tops' || p.outfitTags?.includes('top') || p.outfitTags?.includes('shirt');
    const isBottom = (p) => p.category === 'Bottoms' || p.outfitTags?.includes('bottom') || p.outfitTags?.includes('pants');
    const isShoe = (p) => p.category === 'Shoes' || p.outfitTags?.includes('shoes');
    const isDress = (p) => p.category === 'Dresses' || p.outfitTags?.includes('dress');
    const isAccessory = (p) => p.category === 'Accessories' || p.outfitTags?.includes('accessory');

    const pool = (predicate, excludeIds = new Set([seedProduct._id.toString()])) => {
      return products.filter(p => predicate(p) && !excludeIds.has(p._id.toString()));
    };

    const pushOutfit = (parts, namePrefix, desc) => {
      const unique = [];
      const seen = new Set();
      for (const p of parts) {
        if (p && !seen.has(p._id.toString())) {
          unique.push(p);
          seen.add(p._id.toString());
        }
      }
      if (unique.length >= 2) {
        outfits.push({
          name: `${namePrefix} ${outfits.length + 1}`,
          products: unique,
          style: user.preferences?.style || 'casual',
          totalPrice: unique.reduce((s, p) => s + (p.price || 0), 0),
          compatibilityScore: this.calculateOutfitCompatibility(unique),
          gender,
          description: desc
        });
      }
    };

    if (gender === 'male' || gender === 'other') {
      // Aim for Top + Bottom + Shoes including seed
      const seedAsTop = isTop(seedProduct);
      const seedAsBottom = isBottom(seedProduct);
      const seedAsShoes = isShoe(seedProduct);

      for (let i = 0; i < Math.min(5, k); i++) {
        const exclude = new Set([seedProduct._id.toString()]);
        const top = seedAsTop ? seedProduct : pool(isTop, exclude)[Math.floor(Math.random() * Math.max(1, pool(isTop, exclude).length))];
        if (top) exclude.add(top._id.toString());
        const bottom = seedAsBottom ? seedProduct : pool(isBottom, exclude)[Math.floor(Math.random() * Math.max(1, pool(isBottom, exclude).length))];
        if (bottom) exclude.add(bottom._id.toString());
        const shoes = seedAsShoes ? seedProduct : pool(isShoe, exclude)[Math.floor(Math.random() * Math.max(1, pool(isShoe, exclude).length))];
        pushOutfit([seedProduct, top, bottom, shoes], "Men's Outfit", 'Top + Bottom + Shoes');
      }
    }

    if (gender === 'female') {
      // Aim for Dress + Accessories + Shoes including seed
      const seedAsDress = isDress(seedProduct);
      const seedAsAcc = isAccessory(seedProduct);
      const seedAsShoes = isShoe(seedProduct);

      for (let i = 0; i < Math.min(5, k); i++) {
        const exclude = new Set([seedProduct._id.toString()]);
        const dress = seedAsDress ? seedProduct : pool(isDress, exclude)[Math.floor(Math.random() * Math.max(1, pool(isDress, exclude).length))];
        if (dress) exclude.add(dress._id.toString());
        const acc = seedAsAcc ? seedProduct : pool(isAccessory, exclude)[Math.floor(Math.random() * Math.max(1, pool(isAccessory, exclude).length))];
        if (acc) exclude.add(acc._id.toString());
        const shoes = seedAsShoes ? seedProduct : pool(isShoe, exclude)[Math.floor(Math.random() * Math.max(1, pool(isShoe, exclude).length))];
        pushOutfit([seedProduct, dress, acc, shoes], "Women's Outfit", 'Dress + Accessories + Shoes');
      }
    }

    // Deduplicate outfits by product sets
    const seenKeys = new Set();
    const deduped = [];
    for (const o of outfits) {
      const key = o.products.map(p => p._id.toString()).sort().join('|');
      if (!seenKeys.has(key)) { 
        seenKeys.add(key); 
        deduped.push(o); 
      }
    }
    return deduped.slice(0, k);
  }

  async trainIncremental() {
    console.log('🚀 Starting incremental Hybrid training...');
    const startTime = Date.now();

    // Reset structures
    this.userIndexMap.clear();
    this.itemIndexMap.clear();
    this.userItemMatrix = null;
    this.userSimilarityMatrix = null;
    this.itemSimilarityMatrix = null;

    // Count documents
    const usersCount = await User.countDocuments({ 'interactionHistory.0': { $exists: true } });
    const productsCount = await Product.countDocuments({});
    console.log(`📊 Counts → users(with history): ${usersCount}, products: ${productsCount}`);

    // Page through users to build user index map
    const usersList = [];
    for (let skip = 0; skip < usersCount && skip < MAX_USERS; skip += BATCH_SIZE) {
      const users = await User.find({ 'interactionHistory.0': { $exists: true } })
        .select('_id interactionHistory')
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();
      
      users.forEach((user, index) => {
        const globalIndex = usersList.length;
        this.userIndexMap.set(user._id.toString(), globalIndex);
        usersList.push(user);
      });
      
      this.performMemoryCleanup();
    }

    // Page through products to build item index map
    const productsList = [];
    for (let skip = 0; skip < productsCount && skip < MAX_PRODUCTS; skip += BATCH_SIZE) {
      const products = await Product.find()
        .select('_id')
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean();
      
      products.forEach((product, index) => {
        const globalIndex = productsList.length;
        this.itemIndexMap.set(product._id.toString(), globalIndex);
        productsList.push(product);
      });
      
      this.performMemoryCleanup();
    }

    // Initialize matrix
    this.userItemMatrix = new Matrix(usersList.length, productsList.length);
    const interactionWeights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };

    // Build user-item matrix in batches
    for (let i = 0; i < usersList.length; i += BATCH_SIZE) {
      const batch = usersList.slice(i, i + BATCH_SIZE);
      
      for (const user of batch) {
        const userIndex = this.userIndexMap.get(user._id.toString());
        
        user.interactionHistory.forEach(interaction => {
          const itemIndex = this.itemIndexMap.get(interaction.productId.toString());
          if (itemIndex !== undefined) {
            const weight = interactionWeights[interaction.interactionType] || 1;
            const rating = interaction.rating || 3;
            const score = weight * (rating / 5);
            this.userItemMatrix.set(userIndex, itemIndex, score);
          }
        });
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL === 0) {
        this.performMemoryCleanup();
      }
    }

    // Compute similarities using incremental approach
    await this.computeUserSimilarity();
    await this.computeItemSimilarity();

    this.isTrained = true;
    console.log(`🎉 Incremental Hybrid training done in ${Date.now() - startTime}ms`);
  }

  updateWeights(cfWeight, cbWeight) {
    if (cfWeight + cbWeight !== 1.0) {
      throw new Error('Weights must sum to 1.0');
    }
    this.cfWeight = cfWeight;
    this.cbWeight = cbWeight;
  }

  // Memory management methods
  performMemoryCleanup() {
    this.memoryStats.operationsCount++;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    // Update memory stats
    const memUsage = process.memoryUsage();
    this.memoryStats.currentMemory = memUsage.heapUsed;
    this.memoryStats.peakMemory = Math.max(this.memoryStats.peakMemory, memUsage.heapUsed);
    
    // Log memory usage every 100 operations
    if (this.memoryStats.operationsCount % 100 === 0) {
      console.log(`🧹 Memory cleanup - Current: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Peak: ${Math.round(this.memoryStats.peakMemory / 1024 / 1024)}MB`);
    }
  }

  // Method to clear large data structures
  clearMemory() {
    console.log('🧹 Clearing memory...');
    
    if (this.userItemMatrix) {
      this.userItemMatrix = null;
    }
    
    if (this.userSimilarityMatrix) {
      if (this.userSimilarityMatrix instanceof Map) {
        this.userSimilarityMatrix.clear();
      }
      this.userSimilarityMatrix = null;
    }
    
    if (this.itemSimilarityMatrix) {
      if (this.itemSimilarityMatrix instanceof Map) {
        this.itemSimilarityMatrix.clear();
      }
      this.itemSimilarityMatrix = null;
    }
    
    this.userIndexMap.clear();
    this.itemIndexMap.clear();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ Memory cleared successfully');
  }

  // Method to get memory statistics
  getMemoryStats() {
    const memUsage = process.memoryUsage();
    return {
      ...this.memoryStats,
      currentHeapUsed: memUsage.heapUsed,
      currentHeapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };
  }
}

const hybridRecommender = new HybridRecommender();
export default hybridRecommender;