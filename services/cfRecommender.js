import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import fs from 'fs/promises';
import path from 'path';
import natural from 'natural';
import ContentBasedRecommender from 'content-based-recommender';
import { Matrix } from 'ml-matrix';

const MAX_USERS_CF = process.env.MAX_USERS_CF ? parseInt(process.env.MAX_USERS_CF) : Number.MAX_SAFE_INTEGER;
const MAX_PRODUCTS_CF = process.env.MAX_PRODUCTS_CF ? parseInt(process.env.MAX_PRODUCTS_CF) : Number.MAX_SAFE_INTEGER;
const BATCH_SIZE_CF = 100;
const MEMORY_CLEANUP_INTERVAL_CF = 50;

class CFRecommender {
  constructor() {
    this.productFeatures = new Map(); // productId -> feature data
    this.userProfiles = new Map(); // userId -> user profile
    this.isTrained = false;
    this.lastTrainingTime = 0;
    this.trainingCacheTimeout = 30 * 60 * 1000; // 30 minutes
    this.modelPath = path.join(process.cwd(), 'models', 'cf_model.json');
    this.featuresPath = path.join(process.cwd(), 'models', 'cf_features.json');
    this.strictLoadOnly = (process.env.RECOMMEND_STRICT_LOAD_ONLY || '').toLowerCase() === 'true';
    
    // Initialize Natural TF-IDF
    this.tfidf = new natural.TfIdf();
    this.tokenizer = new natural.WordTokenizer();
    this.stemmer = natural.PorterStemmer;
    
    // Initialize Content-Based Recommender
    this.recommender = new ContentBasedRecommender({
      minScore: 0.1,
      maxSimilarDocuments: 100,
      maxVectorSize: 100
    });
    
    this.productDocuments = new Map(); // productId -> document for TF-IDF
  }

  containsGenderKeywords(product, keywords) {
    const name = (product?.name || '').toLowerCase();
    const desc = (product?.description || '').toLowerCase();
    return keywords.some(k => name.includes(k) || desc.includes(k));
  }

  violatesGenderKeywords(user, product) {
    if (!user || !user.gender) return false;
    const FEMALE_KWS = ['female', 'woman', 'women', "women's", "woman's", 'girl', 'girls', "girl's", 'ladies', 'lady', 'she', 'her'];
    const MALE_KWS = ['male', 'man', 'men', "men's", "man's", 'boy', 'boys', "boy's", 'gentleman', 'gents', 'he', 'him', 'his'];
    if (user.gender === 'male') {
      return this.containsGenderKeywords(product, FEMALE_KWS);
    }
    if (user.gender === 'female') {
      return this.containsGenderKeywords(product, MALE_KWS);
    }
    return false;
  }

  containsChildKeywords(product) {
    const name = (product?.name || '').toLowerCase();
    const CHILD_KWS = ['kid', 'kids', "kid's", "kids'", 'baby', 'babies', "baby's", "babies'", 'toddler', 'toddlers', "toddler's", "toddlers'", 'infant', 'infants', "infant's", "infants'", 'child', 'children', "child's", "children's", 'junior', 'juniors', "junior's", "juniors'", 'youth', 'youths', "youth's", "youths'"];
    return CHILD_KWS.some(k => name.includes(k));
  }

  violatesAgeRestriction(user, product) {
    if (!user || !user.age) return false;
    if (user.age > 12) {
      return this.containsChildKeywords(product);
    }
    return false;
  }

  async ensureUserWithHistory(userId, { requireGender = false } = {}) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    if (!user.interactionHistory || user.interactionHistory.length === 0) {
      throw new Error('User has no interaction history');
    }
    if (requireGender && !user.gender) {
      throw new Error('User gender is required');
    }
    return user;
  }

  /**
   * Tạo document text từ product để sử dụng cho TF-IDF
   */
  createProductDocument(product) {
    const parts = [];
    
    // Name
    if (product.name) {
      parts.push(product.name);
    }
    
    // Description
    if (product.description) {
      parts.push(product.description);
    }
    
    // Category
    if (product.category) {
      parts.push(product.category);
    }
    
    // Brand
    if (product.brand) {
      parts.push(product.brand);
    }
    
    // Outfit tags
    if (product.outfitTags && Array.isArray(product.outfitTags)) {
      parts.push(product.outfitTags.join(' '));
    }
    
    // Colors
    if (product.colors && Array.isArray(product.colors)) {
      const colorNames = product.colors.map(c => c.name || c).filter(c => c);
      parts.push(colorNames.join(' '));
    }
    
    return parts.join(' ').toLowerCase();
  }

  /**
   * Tính TF-IDF similarity giữa hai documents sử dụng Natural
   */
  calculateTfIdfSimilarity(doc1, doc2) {
    if (!doc1 || !doc2) return 0;
    
    const tokens1 = this.tokenizer.tokenize(doc1.toLowerCase());
    const tokens2 = this.tokenizer.tokenize(doc2.toLowerCase());
    
    if (!tokens1 || !tokens2 || tokens1.length === 0 || tokens2.length === 0) {
      return 0;
    }
    
    // Tạo TF-IDF vectors
    const tfidf = new natural.TfIdf();
    tfidf.addDocument(tokens1.join(' '));
    tfidf.addDocument(tokens2.join(' '));
    
    // Tính cosine similarity
    const vector1 = [];
    const vector2 = [];
    const allTerms = new Set([...tokens1, ...tokens2]);
    
    allTerms.forEach(term => {
      const tfidf1 = tfidf.tfidf(term, 0);
      const tfidf2 = tfidf.tfidf(term, 1);
      vector1.push(tfidf1);
      vector2.push(tfidf2);
    });
    
    return this.cosineSimilarity(vector1, vector2);
  }

  /**
   * Cosine similarity giữa hai vectors
   */
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Cosine similarity sử dụng ml-matrix
   */
  cosineSimilarityMatrix(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    
    try {
      const matrixA = new Matrix([vecA]);
      const matrixB = new Matrix([vecB]);
      
      const dotProduct = matrixA.mmul(matrixB.transpose()).get(0, 0);
      const normA = Math.sqrt(matrixA.mmul(matrixA.transpose()).get(0, 0));
      const normB = Math.sqrt(matrixB.mmul(matrixB.transpose()).get(0, 0));
      
      if (normA === 0 || normB === 0) return 0;
      return dotProduct / (normA * normB);
    } catch (error) {
      // Fallback to manual calculation
      return this.cosineSimilarity(vecA, vecB);
    }
  }

  extractProductFeatures(product) {
    const features = {
      category: product.category || 'other',
      brand: product.brand || 'unknown',
      price: product.price || 0,
      rating: product.rating || 0,
      outfitTags: product.outfitTags || [],
      colors: (product.colors || []).map(c => c.name?.toLowerCase() || '').filter(c => c),
      hasSale: (product.sale || 0) > 0,
      salePercent: product.sale || 0,
      document: this.createProductDocument(product) // Thêm document cho TF-IDF
    };
    return features;
  }

  async buildProductFeatures() {
    console.log('🏗️  Building product features for Content-based Filtering (using Natural TF-IDF)...');
    const startTime = Date.now();
    
    this.productFeatures.clear();
    this.productDocuments.clear();
    this.tfidf = new natural.TfIdf(); // Reset TF-IDF
    
    const productQuery = Product.find()
      .select('_id name description category brand price rating outfitTags colors sale')
      .setOptions({ allowDiskUse: true });
    
    if (MAX_PRODUCTS_CF < Number.MAX_SAFE_INTEGER) {
      productQuery.limit(MAX_PRODUCTS_CF);
      console.log(`   ⚠️  Limiting to ${MAX_PRODUCTS_CF} products (configured via MAX_PRODUCTS_CF)`);
    }
    
    const products = await productQuery.lean();
    console.log(`📊 Processing ${products.length} products...`);
    
    // Chuẩn bị documents cho content-based-recommender
    const documents = [];
    
    for (let i = 0; i < products.length; i += BATCH_SIZE_CF) {
      const batch = products.slice(i, i + BATCH_SIZE_CF);
      
      for (const product of batch) {
        const productId = product._id.toString();
        const features = this.extractProductFeatures(product);
        const document = features.document;
        
        // Lưu document cho TF-IDF
        this.productDocuments.set(productId, document);
        this.tfidf.addDocument(document);
        
        // Chuẩn bị cho content-based-recommender
        documents.push({
          id: productId,
          content: document
        });
        
        // Lưu features
        this.productFeatures.set(productId, features);
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL_CF === 0) {
        this.performMemoryCleanup();
        console.log(`   Processed ${Math.min(i + BATCH_SIZE_CF, products.length)}/${products.length} products...`);
      }
    }
    
    // Train content-based-recommender
    console.log('📚 Training content-based-recommender...');
    this.recommender.train(documents);
    console.log('✅ Content-based-recommender trained');
    
    const buildTime = Date.now() - startTime;
    console.log(`✅ Product features built successfully!`);
    console.log(`   📊 Total products: ${this.productFeatures.size}`);
    console.log(`   ⏱️  Build time: ${buildTime}ms`);
  }

  async buildUserProfiles() {
    console.log('👤 Building user profiles for Content-based Filtering...');
    const startTime = Date.now();
    
    this.userProfiles.clear();
    
    const userQuery = User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id interactionHistory')
      .setOptions({ allowDiskUse: true });
    
    if (MAX_USERS_CF < Number.MAX_SAFE_INTEGER) {
      userQuery.limit(MAX_USERS_CF);
      console.log(`   ⚠️  Limiting to ${MAX_USERS_CF} users (configured via MAX_USERS_CF)`);
    }
    
    const users = await userQuery.lean();
    console.log(`📊 Processing ${users.length} users...`);
    
    const interactionWeights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
    
    for (let i = 0; i < users.length; i += BATCH_SIZE_CF) {
      const batch = users.slice(i, i + BATCH_SIZE_CF);
      
      for (const user of batch) {
        const userId = user._id.toString();
        const history = user.interactionHistory || [];
        
        if (history.length === 0) continue;
        
        const historyProductIds = history.map(int => int.productId.toString());
        const products = await Product.find({ _id: { $in: historyProductIds } })
          .select('_id name description category brand price rating outfitTags colors sale')
          .lean();
        
        const productMap = new Map(products.map(p => [p._id.toString(), p]));
        
        const categoryWeights = new Map();
        const brandWeights = new Map();
        const priceSum = { total: 0, count: 0 };
        const ratingSum = { total: 0, count: 0 };
        const outfitTagsSet = new Set();
        const colorsSet = new Set();
        const userDocuments = []; // Documents từ lịch sử để tính TF-IDF profile
        let totalWeight = 0;
        
        history.forEach(interaction => {
          const productId = interaction.productId.toString();
          const product = productMap.get(productId);
          if (!product) return;
          
          const weight = interactionWeights[interaction.interactionType] || 1;
          totalWeight += weight;
          
          const features = this.extractProductFeatures(product);
          
          categoryWeights.set(features.category, (categoryWeights.get(features.category) || 0) + weight);
          brandWeights.set(features.brand, (brandWeights.get(features.brand) || 0) + weight);
          priceSum.total += features.price * weight;
          priceSum.count += weight;
          ratingSum.total += features.rating * weight;
          ratingSum.count += weight;
          
          features.outfitTags.forEach(tag => outfitTagsSet.add(tag));
          features.colors.forEach(color => colorsSet.add(color));
          
          // Thêm document vào user profile (có thể lặp lại theo weight)
          for (let w = 0; w < weight; w++) {
            userDocuments.push(features.document);
          }
        });
        
        if (totalWeight === 0) continue;
        
        const avgPrice = priceSum.count > 0 ? priceSum.total / priceSum.count : 0;
        const avgRating = ratingSum.count > 0 ? ratingSum.total / ratingSum.count : 0;
        
        const preferredCategory = Array.from(categoryWeights.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
        const preferredBrand = Array.from(brandWeights.entries())
          .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
        
        // Tạo user profile document từ lịch sử
        const userProfileDocument = userDocuments.join(' ');
        
        const userProfile = {
          preferredCategory,
          preferredBrand,
          avgPrice,
          avgRating,
          preferredOutfitTags: Array.from(outfitTagsSet),
          preferredColors: Array.from(colorsSet),
          document: userProfileDocument // Document để tính similarity với products
        };
        
        this.userProfiles.set(userId, userProfile);
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL_CF === 0) {
        this.performMemoryCleanup();
        console.log(`   Processed ${Math.min(i + BATCH_SIZE_CF, users.length)}/${users.length} users...`);
      }
    }
    
    const buildTime = Date.now() - startTime;
    console.log(`✅ User profiles built successfully!`);
    console.log(`   📊 Total users: ${this.userProfiles.size}`);
    console.log(`   ⏱️  Build time: ${buildTime}ms`);
  }

  async train() {
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached CF model');
      return;
    }
    
    console.log('🚀 Starting Content-based Filtering training (Natural + content-based-recommender)...');
    const startTime = Date.now();
    
    await this.buildProductFeatures();
    await this.buildUserProfiles();
    
    this.isTrained = true;
    this.lastTrainingTime = Date.now();
    const trainingTime = Date.now() - startTime;
    console.log(`🎉 CF training completed successfully!`);
    console.log(`   ⏱️  Total training time: ${trainingTime}ms`);
    
    console.log('💾 Saving trained model...');
    await this.saveModel();
  }

  async trainIncremental() {
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached CF model');
      return;
    }

    if (this.productFeatures.size === 0 && this.userProfiles.size === 0) {
      console.log('🔄 No features in memory, attempting to load saved model first...');
      const loaded = await this.loadModel();
      if (loaded) {
        const modelAge = Date.now() - this.lastTrainingTime;
        if (modelAge < this.trainingCacheTimeout) {
          console.log('✅ Loaded saved model is still valid, skipping retraining');
          return;
        }
        console.log('⚠️  Loaded model is expired, will retrain with incremental updates');
      }
    }

    console.log('🚀 Starting incremental CF training...');
    const startTime = Date.now();

    const existingProductFeatures = new Map(this.productFeatures);
    const existingUserProfiles = new Map(this.userProfiles);

    this.productFeatures.clear();
    this.userProfiles.clear();
    this.productDocuments.clear();
    this.tfidf = new natural.TfIdf();

    const productsCount = await Product.countDocuments({});
    const usersCount = await User.countDocuments({ 'interactionHistory.0': { $exists: true } });
    console.log(`📊 Counts → products: ${productsCount}, users(with history): ${usersCount}`);

    const documents = [];
    const maxProductsToProcess = MAX_PRODUCTS_CF < Number.MAX_SAFE_INTEGER ? Math.min(productsCount, MAX_PRODUCTS_CF) : productsCount;
    
    for (let skip = 0; skip < maxProductsToProcess; skip += BATCH_SIZE_CF) {
      const products = await Product.find()
        .select('_id name description category brand price rating outfitTags colors sale')
        .skip(skip)
        .limit(BATCH_SIZE_CF)
        .lean();
      
      for (const product of products) {
        const productId = product._id.toString();
        const existing = existingProductFeatures.get(productId);
        if (existing) {
          this.productFeatures.set(productId, existing);
          const doc = existing.document || this.createProductDocument(product);
          this.productDocuments.set(productId, doc);
          this.tfidf.addDocument(doc);
          documents.push({ id: productId, content: doc });
        } else {
          const features = this.extractProductFeatures(product);
          const doc = features.document;
          this.productFeatures.set(productId, features);
          this.productDocuments.set(productId, doc);
          this.tfidf.addDocument(doc);
          documents.push({ id: productId, content: doc });
        }
      }
      this.performMemoryCleanup();
    }

    // Retrain content-based-recommender
    this.recommender.train(documents);

    const maxUsersToProcess = MAX_USERS_CF < Number.MAX_SAFE_INTEGER ? Math.min(usersCount, MAX_USERS_CF) : usersCount;
    for (let skip = 0; skip < maxUsersToProcess; skip += BATCH_SIZE_CF) {
      const users = await User.find({ 'interactionHistory.0': { $exists: true } })
        .select('_id interactionHistory')
        .skip(skip)
        .limit(BATCH_SIZE_CF)
        .lean();
      
      for (const user of users) {
        const userId = user._id.toString();
        const existing = existingUserProfiles.get(userId);
        if (existing) {
          this.userProfiles.set(userId, existing);
        } else {
          const history = user.interactionHistory || [];
          if (history.length === 0) continue;
          
          const historyProductIds = history.map(int => int.productId.toString());
          const products = await Product.find({ _id: { $in: historyProductIds } })
            .select('_id name description category brand price rating outfitTags colors sale')
            .lean();
          
          const productMap = new Map(products.map(p => [p._id.toString(), p]));
          const interactionWeights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
          
          const categoryWeights = new Map();
          const brandWeights = new Map();
          const priceSum = { total: 0, count: 0 };
          const ratingSum = { total: 0, count: 0 };
          const outfitTagsSet = new Set();
          const colorsSet = new Set();
          const userDocuments = [];
          let totalWeight = 0;
          
          history.forEach(interaction => {
            const productId = interaction.productId.toString();
            const product = productMap.get(productId);
            if (!product) return;
            
            const weight = interactionWeights[interaction.interactionType] || 1;
            totalWeight += weight;
            
            const features = this.extractProductFeatures(product);
            categoryWeights.set(features.category, (categoryWeights.get(features.category) || 0) + weight);
            brandWeights.set(features.brand, (brandWeights.get(features.brand) || 0) + weight);
            priceSum.total += features.price * weight;
            priceSum.count += weight;
            ratingSum.total += features.rating * weight;
            ratingSum.count += weight;
            features.outfitTags.forEach(tag => outfitTagsSet.add(tag));
            features.colors.forEach(color => colorsSet.add(color));
            
            for (let w = 0; w < weight; w++) {
              userDocuments.push(features.document);
            }
          });
          
          if (totalWeight === 0) continue;
          
          const avgPrice = priceSum.count > 0 ? priceSum.total / priceSum.count : 0;
          const avgRating = ratingSum.count > 0 ? ratingSum.total / ratingSum.count : 0;
          const preferredCategory = Array.from(categoryWeights.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'other';
          const preferredBrand = Array.from(brandWeights.entries())
            .sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
          
          const userProfileDocument = userDocuments.join(' ');
          
          const userProfile = {
            preferredCategory,
            preferredBrand,
            avgPrice,
            avgRating,
            preferredOutfitTags: Array.from(outfitTagsSet),
            preferredColors: Array.from(colorsSet),
            document: userProfileDocument
          };
          
          this.userProfiles.set(userId, userProfile);
        }
      }
      this.performMemoryCleanup();
    }

    this.isTrained = true;
    this.lastTrainingTime = Date.now();
    console.log(`🎉 Incremental CF training done in ${Date.now() - startTime}ms`);
    await this.saveModel();
  }

  async saveModel() {
    try {
      console.log('💾 Saving CF model...');
      const saveStartTime = Date.now();
      
      const modelsDir = path.dirname(this.modelPath);
      await fs.mkdir(modelsDir, { recursive: true });
      
      const modelData = {
        isTrained: this.isTrained,
        lastTrainingTime: this.lastTrainingTime,
        productFeaturesCount: this.productFeatures.size,
        userProfilesCount: this.userProfiles.size,
        savedAt: new Date().toISOString()
      };
      
      await fs.writeFile(this.modelPath, JSON.stringify(modelData, null, 2));
      
      const featuresData = {
        productFeatures: {},
        userProfiles: {},
        productDocuments: {}
      };
      
      for (const [id, data] of this.productFeatures) {
        featuresData.productFeatures[id] = data;
      }
      
      for (const [id, profile] of this.userProfiles) {
        featuresData.userProfiles[id] = profile;
      }
      
      for (const [id, doc] of this.productDocuments) {
        featuresData.productDocuments[id] = doc;
      }
      
      await fs.writeFile(this.featuresPath, JSON.stringify(featuresData, null, 2));
      
      const saveEndTime = Date.now() - saveStartTime;
      console.log(`🎉 CF model saved successfully!`);
      console.log(`   ⏱️  Save time: ${saveEndTime}ms`);
      return true;
    } catch (error) {
      console.error('❌ Error saving CF model:', error);
      return false;
    }
  }

  async loadModel() {
    try {
      console.log('📂 Loading CF model...');
      const loadStartTime = Date.now();
      
      const modelExists = await fs.access(this.modelPath).then(() => true).catch(() => false);
      const featuresExist = await fs.access(this.featuresPath).then(() => true).catch(() => false);
      
      if (!modelExists || !featuresExist) {
        console.log('❌ No saved model found, will train new model');
        return false;
      }
      
      const modelData = JSON.parse(await fs.readFile(this.modelPath, 'utf8'));
      const modelAge = Date.now() - modelData.lastTrainingTime;
      
      if (modelAge > this.trainingCacheTimeout) {
        console.log('⚠️  Saved model is too old, will retrain');
        return false;
      }
      
      const featuresData = JSON.parse(await fs.readFile(this.featuresPath, 'utf8'));
      
      this.productFeatures.clear();
      for (const [id, data] of Object.entries(featuresData.productFeatures || {})) {
        this.productFeatures.set(id, data);
      }
      
      this.userProfiles.clear();
      for (const [id, profile] of Object.entries(featuresData.userProfiles || {})) {
        this.userProfiles.set(id, profile);
      }
      
      this.productDocuments.clear();
      this.tfidf = new natural.TfIdf();
      const documents = [];
      for (const [id, doc] of Object.entries(featuresData.productDocuments || {})) {
        this.productDocuments.set(id, doc);
        this.tfidf.addDocument(doc);
        documents.push({ id, content: doc });
      }
      
      // Retrain content-based-recommender với dữ liệu đã load
      if (documents.length > 0) {
        this.recommender.train(documents);
      }
      
      this.isTrained = modelData.isTrained;
      this.lastTrainingTime = modelData.lastTrainingTime;
      
      const loadEndTime = Date.now() - loadStartTime;
      console.log(`🎉 CF model loaded successfully!`);
      console.log(`   ⏱️  Load time: ${loadEndTime}ms`);
      console.log(`   📊 Product features: ${this.productFeatures.size}`);
      console.log(`   👥 User profiles: ${this.userProfiles.size}`);
      return true;
    } catch (error) {
      console.error('❌ Error loading CF model:', error);
      return false;
    }
  }

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

  /**
   * Tính content score sử dụng TF-IDF similarity từ Natural
   */
  calculateContentScore(product, userProfile) {
    if (!userProfile) return 0;
    
    let score = 0;
    const productFeatures = this.productFeatures.get(product._id.toString());
    if (!productFeatures) return 0;
    
    // Category match
    if (productFeatures.category === userProfile.preferredCategory) {
      score += 0.2;
    }
    
    // Brand match
    if (productFeatures.brand === userProfile.preferredBrand) {
      score += 0.15;
    }
    
    // TF-IDF similarity giữa product document và user profile document
    if (userProfile.document && productFeatures.document) {
      const tfidfSimilarity = this.calculateTfIdfSimilarity(
        productFeatures.document,
        userProfile.document
      );
      score += tfidfSimilarity * 0.5;
    }
    
    // Outfit tags overlap
    if (userProfile.preferredOutfitTags.length > 0) {
      const productTags = productFeatures.outfitTags || [];
      const overlap = productTags.filter(tag => userProfile.preferredOutfitTags.includes(tag)).length;
      score += Math.min(0.1, overlap / 10);
    }
    
    // Colors overlap
    if (userProfile.preferredColors.length > 0) {
      const productColors = productFeatures.colors || [];
      const overlap = productColors.filter(color => userProfile.preferredColors.includes(color)).length;
      score += Math.min(0.05, overlap / 5);
    }
    
    return Math.min(1.0, score);
  }

  calculatePersonalizedScore(product, user, historyAnalysis, baseScore) {
    let personalizedScore = baseScore;
    const factors = [];

    if (user.gender) {
      const genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
        : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
        : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
      
      if (genderAllow.has(product.category)) {
        personalizedScore *= 1.3;
        factors.push(`suitable for ${user.gender === 'male' ? 'male' : 'female'} gender`);
      } else {
        personalizedScore *= 0.3;
      }
    }

    if (historyAnalysis.categories.includes(product.category)) {
      personalizedScore *= 1.4;
      factors.push(`you have interacted with ${product.category} category`);
    }
    
    if (historyAnalysis.brands.includes(product.brand)) {
      personalizedScore *= 1.3;
      factors.push(`you have purchased ${product.brand} brand`);
    }
    
    if (historyAnalysis.styles.some(style => product.outfitTags?.includes(style))) {
      personalizedScore *= 1.25;
      factors.push(`matches your preferred style`);
    }

    if (user.preferences) {
      if (user.preferences.style && product.outfitTags?.includes(user.preferences.style)) {
        personalizedScore *= 1.2;
        factors.push(`matches your preferred ${user.preferences.style} style`);
      }
      
      if (user.preferences.colorPreferences && product.colors) {
        const productColors = product.colors.map(c => c.name.toLowerCase());
        const matchingColors = user.preferences.colorPreferences.filter(cp => 
          productColors.includes(cp.toLowerCase())
        );
        if (matchingColors.length > 0) {
          personalizedScore *= 1.15;
          factors.push(`has your favorite colors (${matchingColors.join(', ')})`);
        }
      }
    }

    return { score: personalizedScore, factors };
  }

  async recommendPersonalize(userId, k = 10, opts = {}) {
    try {
      const { productId } = opts || {};
      
      if (!this.isTrained) {
        console.log('🔄 Model not trained, attempting to load saved model...');
        const loaded = await this.loadModel();
        if (!loaded) {
          if (this.strictLoadOnly) {
            const err = new Error('CF model not available (strict offline mode). Please run offline training first.');
            err.statusCode = 503;
            throw err;
          }
          console.log('❌ No saved model found, training new model...');
          await this.train();
        }
      }

      if (this.productFeatures.size === 0) {
        console.warn('⚠️  No product features available. Falling back to cold-start');
        const cold = await this.recommendColdStart(userId, k);
        return { 
          products: cold, 
          model: 'ColdStart (TopRated)', 
          timestamp: new Date().toISOString(),
          explanation: 'No feature data available, using most popular products'
        };
      }

      const user = await User.findById(userId).select('_id interactionHistory gender age preferences');
      if (!user || !user.interactionHistory || user.interactionHistory.length === 0) {
        throw new Error('User not found or has no interaction history');
      }

      const historyAnalysis = await this.analyzeInteractionHistory(user);
      const userProfile = this.userProfiles.get(userId.toString());

      let seedProduct = null;
      if (productId) {
        seedProduct = await Product.findById(productId)
          .select('_id name description images price sale category brand outfitTags colors')
          .lean();
      }

      // Sử dụng content-based-recommender để lấy recommendations ban đầu
      let candidateProductIds = [];
      
      if (seedProduct) {
        // Nếu có seed product, tìm similar products từ content-based-recommender
        const similarProducts = this.recommender.getSimilarDocuments(seedProduct._id.toString(), k * 3);
        candidateProductIds = similarProducts.map(item => item.id);
      } else if (userProfile && userProfile.document) {
        // Nếu không có seed product, tìm products similar với user profile
        // Tạo một temporary document từ user profile để tìm similar
        const userDocId = `user_${userId}`;
        const tempDocs = [{ id: userDocId, content: userProfile.document }];
        const tempRecommender = new ContentBasedRecommender({
          minScore: 0.1,
          maxSimilarDocuments: k * 3,
          maxVectorSize: 100
        });
        
        // Thêm user document và tất cả product documents
        const allDocs = [{ id: userDocId, content: userProfile.document }];
        for (const [id, doc] of this.productDocuments) {
          allDocs.push({ id, content: doc });
        }
        tempRecommender.train(allDocs);
        
        const similarProducts = tempRecommender.getSimilarDocuments(userDocId, k * 3);
        candidateProductIds = similarProducts.map(item => item.id);
      } else {
        // Fallback: lấy tất cả product IDs
        candidateProductIds = Array.from(this.productFeatures.keys());
      }

      // Nếu không có đủ candidates, thêm tất cả products
      if (candidateProductIds.length < k) {
        const allIds = Array.from(this.productFeatures.keys());
        candidateProductIds = [...new Set([...candidateProductIds, ...allIds])];
      }

      const scoredProducts = [];

      for (const prodId of candidateProductIds) {
        if (productId && prodId === productId.toString()) continue;
        
        const product = await Product.findById(prodId)
          .select('_id name description images price sale category brand outfitTags colors')
          .lean();
        
        if (!product) continue;
        if (this.violatesGenderKeywords(user, product)) continue;
        if (this.violatesAgeRestriction(user, product)) continue;

        let baseScore = this.calculateContentScore(product, userProfile);
        
        if (seedProduct) {
          const seedDoc = this.productDocuments.get(seedProduct._id.toString());
          const productDoc = this.productDocuments.get(prodId);
          
          if (seedDoc && productDoc) {
            const similarity = this.calculateTfIdfSimilarity(seedDoc, productDoc);
            baseScore = 0.6 * baseScore + 0.4 * similarity;
          }
          
          if (product.category === seedProduct.category) {
            baseScore *= 1.3;
          }
          if (product.brand === seedProduct.brand) {
            baseScore *= 1.2;
          }
        }

        const { score, factors } = this.calculatePersonalizedScore(product, user, historyAnalysis, baseScore);
        
        scoredProducts.push({
          product,
          score,
          factors
        });
      }

      scoredProducts.sort((a, b) => b.score - a.score);
      const topProducts = scoredProducts.slice(0, k).map(item => item.product);

      const explanation = this.generatePersonalizedExplanation(user, seedProduct, historyAnalysis, topProducts);

      return { 
        products: topProducts, 
        model: 'Content-based Filtering (Natural TF-IDF)', 
        timestamp: new Date().toISOString(),
        explanation: explanation
      };
    } catch (error) {
      const msg = (error && error.message) ? error.message : '';
      const isColdStartCase = msg.includes('no interaction history') || msg.includes('not found') || msg.includes('User not found');
      if (!isColdStartCase) throw error;
      
      const cold = await this.recommendColdStart(userId, k);
      const { productId } = opts || {};
      let filteredCold = cold;
      
      if (productId && cold.length > 0) {
        try {
          const seedProduct = await Product.findById(productId).select('_id category brand').lean();
          if (seedProduct) {
            filteredCold = cold.filter(p => {
              if (!p) return false;
              return p.category === seedProduct.category || p.brand === seedProduct.brand;
            });
          }
        } catch (_) {}
      }
      
      const user = await User.findById(userId).select('gender age');
      if (user && user.age > 12) {
        filteredCold = filteredCold.filter(p => !this.containsChildKeywords(p));
      }
      
      const coldExplanation = user 
        ? `Based on ${user.gender ? `${user.gender === 'male' ? 'male' : 'female'} gender` : ''} ${user.age ? `age ${user.age}` : ''}. Using most popular products due to no interaction history${productId ? ' (filtered by same category or brand)' : ''}`
        : `Using most popular products due to no interaction history${productId ? ' (filtered by same category or brand)' : ''}`;
      
      return { 
        products: filteredCold, 
        model: 'ColdStart (TopRated)', 
        timestamp: new Date().toISOString(),
        explanation: coldExplanation
      };
    }
  }

  generatePersonalizedExplanation(user, seedProduct, historyAnalysis, products) {
    const reasons = [];
    
    if (seedProduct) {
      reasons.push(`Based on the product you are viewing: ${seedProduct.name} (${seedProduct.category})`);
      reasons.push(`Showing products with similar features using TF-IDF similarity`);
    }
    
    if (user.gender) {
      reasons.push(`Suitable for your ${user.gender === 'male' ? 'male' : 'female'} gender`);
    }
    
    if (historyAnalysis.categories.length > 0) {
      const topCategories = historyAnalysis.categories.slice(0, 3).join(', ');
      reasons.push(`Based on your interaction history with categories: ${topCategories}`);
    }
    
    if (historyAnalysis.brands.length > 0) {
      const topBrands = historyAnalysis.brands.slice(0, 2).join(', ');
      reasons.push(`You have shown interest in brands: ${topBrands}`);
    }
    
    if (user.preferences?.style) {
      reasons.push(`Matches your preferred ${user.preferences.style} style`);
    }
    
    if (products.length > 0) {
      const categories = [...new Set(products.map(p => p.category))];
      reasons.push(`Recommending ${products.length} similar products from categories: ${categories.join(', ')}`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Based on the product you are viewing and content-based similarity analysis using Natural TF-IDF';
  }

  async recommendColdStart(userId, k = 10) {
    let genderAllow = null;
    try {
      const user = await User.findById(userId).select('gender');
      if (user && user.gender) {
        genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
          : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
          : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
      }
    } catch (_) {}

    const query = genderAllow ? { category: { $in: Array.from(genderAllow) } } : {};

    const userForCold = await User.findById(userId).select('gender');
    if (userForCold && userForCold.gender) {
      const femaleRegex = /(female|woman|women|ladies|girl|girls|she|her)/i;
      const maleRegex = /(male|man|men|gentleman|gents|boy|boys|he|him|his)/i;
      const exclusion = userForCold.gender === 'male'
        ? { $and: [ { name: { $not: femaleRegex } }, { description: { $not: femaleRegex } } ] }
        : userForCold.gender === 'female'
          ? { $and: [ { name: { $not: maleRegex } }, { description: { $not: maleRegex } } ] }
          : {};
      Object.assign(query, exclusion);
    }

    const products = await Product.find(query)
      .select('_id name description images price sale category brand outfitTags colors')
      .sort({ rating: -1 })
      .limit(k)
      .setOptions({ allowDiskUse: true })
      .lean();
    return products;
  }

  async recommendOutfits(userId, { productId = null, k = 12, gender = null } = {}) {
    const user = await this.ensureUserWithHistory(userId, { requireGender: false });
    
    if (gender && ['male', 'female', 'other'].includes(gender.toLowerCase())) {
      user.gender = gender.toLowerCase();
    } else if (!user.gender) {
      user.gender = 'other';
    }
    
    if (!productId) {
      throw new Error('productId is required to build outfit');
    }

    if (!this.isTrained) {
      const loaded = await this.loadModel();
      if (!loaded) {
        if (this.strictLoadOnly) {
          const err = new Error('CF model not available (strict offline mode). Please run offline training first.');
          err.statusCode = 503;
          throw err;
        }
        await this.train();
      }
    }

    const historyAnalysis = await this.analyzeInteractionHistory(user);
    const userProfile = this.userProfiles.get(userId.toString());

    const seedProduct = await Product.findById(productId)
      .select('_id name description images category price sale brand outfitTags colors')
      .lean();
    
    if (!seedProduct) {
      throw new Error('Seed product not found');
    }

    const seedDoc = this.productDocuments.get(seedProduct._id.toString());
    if (!seedDoc) {
      throw new Error('Seed product features not found. Please train the model first.');
    }

    // Sử dụng content-based-recommender để tìm similar products
    const similarProducts = this.recommender.getSimilarDocuments(seedProduct._id.toString(), k * 3);
    const candidateProductIds = similarProducts.map(item => item.id);
    
    // Nếu không đủ, thêm tất cả products
    if (candidateProductIds.length < k * 2) {
      const allIds = Array.from(this.productFeatures.keys());
      candidateProductIds.push(...allIds.filter(id => !candidateProductIds.includes(id)));
    }

    const scoredProducts = [];

    for (const prodId of candidateProductIds) {
      if (prodId === productId.toString()) continue;
      
      const product = await Product.findById(prodId)
        .select('_id name description images category price sale brand outfitTags colors')
        .lean();
      
      if (!product) continue;
      if (this.violatesGenderKeywords(user, product)) continue;
      if (this.violatesAgeRestriction(user, product)) continue;

      const productDoc = this.productDocuments.get(prodId);
      if (!productDoc) continue;

      let baseScore = this.calculateContentScore(product, userProfile);
      
      // Tính similarity sử dụng TF-IDF từ Natural
      const similarity = this.calculateTfIdfSimilarity(seedDoc, productDoc);
      baseScore = 0.5 * baseScore + 0.5 * similarity;

      if (product.category === seedProduct.category) {
        baseScore *= 1.2;
      }

      const { score } = this.calculatePersonalizedScore(product, user, historyAnalysis, baseScore);
      scoredProducts.push({ product, score });
    }

    scoredProducts.sort((a, b) => b.score - a.score);
    let rankedProducts = scoredProducts.map(item => item.product);

    const userGender = user.gender;
    const genderAllow = userGender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
                      : userGender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes', 'Tops', 'Bottoms'])
                      : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes', 'Dresses']);

    let filtered = rankedProducts.filter(p => genderAllow.has(p.category) && !this.violatesGenderKeywords(user, p));
    
    const historyIds = (user.interactionHistory || []).map(i => i.productId);
    const historyProducts = historyIds.length > 0 ? await Product.find({ _id: { $in: historyIds } }).select('_id category').lean() : [];
    const preferredCategories = new Set(historyProducts.map(p => p.category));
    if (preferredCategories.size > 0) {
      filtered = filtered.sort((a, b) => (preferredCategories.has(b.category) ? 1 : 0) - (preferredCategories.has(a.category) ? 1 : 0));
    }

    if (filtered.find(p => p._id.toString() === productId)) {
      filtered = [seedProduct, ...filtered.filter(p => p._id.toString() !== productId && p.category === seedProduct.category), ...filtered.filter(p => p._id.toString() !== productId && p.category !== seedProduct.category)];
    } else {
      filtered = [seedProduct, ...filtered];
    }

    let topProducts = filtered.slice(0, Math.max(k * 2, 20));

    if (topProducts.length < 5 && seedProduct) {
      const additionalProducts = await Product.find({
        _id: { $ne: productId },
        category: { $in: Array.from(genderAllow) }
      })
        .select('_id name description images category price sale brand outfitTags colors')
        .limit(20)
        .lean();
      
      const existingIds = new Set(topProducts.map(p => p._id.toString()));
      const newProducts = additionalProducts.filter(p => !existingIds.has(p._id.toString()));
      topProducts = [...topProducts, ...newProducts].slice(0, Math.max(k * 2, 20));
    }

    const outfits = await this.generateOutfitsFromSeed(topProducts, user, seedProduct, k);
    const explanation = this.generateOutfitExplanation(user, seedProduct, outfits, historyAnalysis);

    return { outfits, model: 'Content-based Filtering (Natural TF-IDF)', timestamp: new Date().toISOString(), explanation };
  }

  generateOutfitExplanation(user, seedProduct, outfits, historyAnalysis) {
    const reasons = [];
    
    if (seedProduct) {
      reasons.push(`Based on the product you selected: ${seedProduct.name} (${seedProduct.category})`);
    }
    
    if (user.gender) {
      const genderText = user.gender === 'male' ? 'male' : user.gender === 'female' ? 'female' : 'unisex';
      reasons.push(`Outfit matching suitable for ${genderText} gender`);
    }
    
    if (historyAnalysis.styles.length > 0) {
      reasons.push(`Combining styles you often choose: ${historyAnalysis.styles.slice(0, 2).join(', ')}`);
    }
    
    if (outfits.length > 0) {
      reasons.push(`Created ${outfits.length} complete outfit combinations with high compatibility using TF-IDF similarity`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Outfit matching based on the product you selected and content-based similarity analysis using Natural TF-IDF';
  }

  calculateOutfitCompatibility(products) {
    const categories = new Set(products.map(p => p.category));
    const diversity = Math.min(1, categories.size / 3);
    const total = products.reduce((s, p) => s + (p.price || 0), 0);
    const priceScore = total > 0 ? Math.max(0, 1 - Math.abs(total - 200) / 400) : 0.5;
    
    // Tính cosine similarity giữa các products trong outfit sử dụng ml-matrix
    if (products.length > 1) {
      const productDocs = products.map(p => {
        const doc = this.productDocuments.get(p._id.toString());
        return doc ? this.tokenizer.tokenize(doc.toLowerCase()) || [] : [];
      }).filter(tokens => tokens.length > 0);
      
      if (productDocs.length > 1) {
        // Tính average similarity giữa các products
        let totalSimilarity = 0;
        let count = 0;
        for (let i = 0; i < productDocs.length; i++) {
          for (let j = i + 1; j < productDocs.length; j++) {
            const doc1 = productDocs[i].join(' ');
            const doc2 = productDocs[j].join(' ');
            const similarity = this.calculateTfIdfSimilarity(doc1, doc2);
            totalSimilarity += similarity;
            count++;
          }
        }
        const avgSimilarity = count > 0 ? totalSimilarity / count : 0;
        return Math.min(1, 0.4 * diversity + 0.3 * priceScore + 0.3 * avgSimilarity);
      }
    }
    
    return Math.min(1, 0.6 * diversity + 0.4 * priceScore);
  }

  async generateOutfitsFromSeed(products, user, seedProduct, k = 12) {
    const outfits = [];
    const gender = user.gender || 'other';
    if (!seedProduct) {
      console.log('⚠️  No seedProduct provided for outfit generation');
      return outfits;
    }

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
      const seedAsTop = isTop(seedProduct);
      const seedAsBottom = isBottom(seedProduct);
      const seedAsShoes = isShoe(seedProduct);

      for (let i = 0; i < Math.min(5, k); i++) {
        const exclude = new Set([seedProduct._id.toString()]);
        const topPool = pool(isTop, exclude);
        const top = seedAsTop ? seedProduct : (topPool.length > 0 ? topPool[Math.floor(Math.random() * topPool.length)] : null);
        if (top && top._id.toString() !== seedProduct._id.toString()) exclude.add(top._id.toString());
        
        const bottomPool = pool(isBottom, exclude);
        const bottom = seedAsBottom ? seedProduct : (bottomPool.length > 0 ? bottomPool[Math.floor(Math.random() * bottomPool.length)] : null);
        if (bottom && bottom._id.toString() !== seedProduct._id.toString()) exclude.add(bottom._id.toString());
        
        const shoesPool = pool(isShoe, exclude);
        const shoes = seedAsShoes ? seedProduct : (shoesPool.length > 0 ? shoesPool[Math.floor(Math.random() * shoesPool.length)] : null);
        
        const outfitParts = [seedProduct, top, bottom, shoes].filter(p => p !== null && p !== undefined);
        if (outfitParts.length >= 2) {
          pushOutfit(outfitParts, "Men's Outfit", 'Top + Bottom + Shoes');
        } else {
          const anyOtherProduct = products.find(p => p._id.toString() !== seedProduct._id.toString());
          if (anyOtherProduct) {
            pushOutfit([seedProduct, anyOtherProduct], "Men's Outfit", 'Basic Outfit');
          }
        }
      }
    }

    if (gender === 'female') {
      const seedAsDress = isDress(seedProduct);
      const seedAsAcc = isAccessory(seedProduct);
      const seedAsShoes = isShoe(seedProduct);
      const seedAsTop = isTop(seedProduct);
      const seedAsBottom = isBottom(seedProduct);

      if (seedAsTop || seedAsBottom) {
        for (let i = 0; i < Math.min(5, k); i++) {
          const exclude = new Set([seedProduct._id.toString()]);
          const topPool = pool(isTop, exclude);
          const top = seedAsTop ? seedProduct : (topPool.length > 0 ? topPool[Math.floor(Math.random() * topPool.length)] : null);
          if (top && top._id.toString() !== seedProduct._id.toString()) exclude.add(top._id.toString());
          
          const bottomPool = pool(isBottom, exclude);
          const bottom = seedAsBottom ? seedProduct : (bottomPool.length > 0 ? bottomPool[Math.floor(Math.random() * bottomPool.length)] : null);
          if (bottom && bottom._id.toString() !== seedProduct._id.toString()) exclude.add(bottom._id.toString());
          
          const shoesPool = pool(isShoe, exclude);
          const shoes = seedAsShoes ? seedProduct : (shoesPool.length > 0 ? shoesPool[Math.floor(Math.random() * shoesPool.length)] : null);
          
          const outfitParts = [seedProduct, top, bottom, shoes].filter(p => p !== null && p !== undefined);
          if (outfitParts.length >= 2) {
            pushOutfit(outfitParts, "Women's Outfit", 'Top + Bottom + Shoes');
          } else {
            const anyOtherProduct = products.find(p => p._id.toString() !== seedProduct._id.toString());
            if (anyOtherProduct) {
              pushOutfit([seedProduct, anyOtherProduct], "Women's Outfit", 'Basic Outfit');
              break;
            }
          }
        }
      }

      const dressPool = pool(isDress, new Set([seedProduct._id.toString()]));
      if (dressPool.length > 0 || seedAsDress) {
        for (let i = 0; i < Math.min(5, k); i++) {
          const exclude = new Set([seedProduct._id.toString()]);
          const dress = seedAsDress ? seedProduct : (dressPool.length > 0 ? dressPool[Math.floor(Math.random() * dressPool.length)] : null);
          if (dress && dress._id.toString() !== seedProduct._id.toString()) exclude.add(dress._id.toString());
          
          const accPool = pool(isAccessory, exclude);
          const acc = seedAsAcc ? seedProduct : (accPool.length > 0 ? accPool[Math.floor(Math.random() * accPool.length)] : null);
          if (acc && acc._id.toString() !== seedProduct._id.toString()) exclude.add(acc._id.toString());
          
          const shoesPool = pool(isShoe, exclude);
          const shoes = seedAsShoes ? seedProduct : (shoesPool.length > 0 ? shoesPool[Math.floor(Math.random() * shoesPool.length)] : null);
          
          const outfitParts = [dress || seedProduct, acc, shoes].filter(p => p !== null && p !== undefined);
          if (outfitParts.length >= 2) {
            pushOutfit(outfitParts, "Women's Outfit", 'Dress + Accessories + Shoes');
          } else {
            const anyOtherProduct = products.find(p => p._id.toString() !== seedProduct._id.toString());
            if (anyOtherProduct) {
              pushOutfit([seedProduct, anyOtherProduct], "Women's Outfit", 'Basic Outfit');
              break;
            }
          }
        }
      }

      if (outfits.length === 0) {
        const anyOtherProduct = products.find(p => p._id.toString() !== seedProduct._id.toString());
        if (anyOtherProduct) {
          pushOutfit([seedProduct, anyOtherProduct], "Women's Outfit", 'Basic Outfit');
        }
      }
    }

    const seenKeys = new Set();
    const deduped = [];
    for (const o of outfits) {
      const key = o.products.map(p => p._id.toString()).sort().join('|');
      if (!seenKeys.has(key)) { seenKeys.add(key); deduped.push(o); }
    }
    return deduped.slice(0, k);
  }

  performMemoryCleanup() {
    if (global.gc) {
      global.gc();
    }
  }

  clearMemory() {
    console.log('🧹 Clearing CF memory...');
    
    this.productFeatures.clear();
    this.userProfiles.clear();
    this.productDocuments.clear();
    this.tfidf = new natural.TfIdf();
    this.recommender = new ContentBasedRecommender({
      minScore: 0.1,
      maxSimilarDocuments: 100,
      maxVectorSize: 100
    });
    
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ CF memory cleared successfully');
  }
}

export default new CFRecommender();
 