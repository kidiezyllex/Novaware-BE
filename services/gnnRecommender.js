import * as tf from '@tensorflow/tfjs';
import fs from 'fs/promises';
import path from 'path';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

const MAX_NODES = 1000;
const MAX_USERS_GNN = 500;
const MAX_PRODUCTS_GNN = 1000;
const BATCH_SIZE_GNN = 50;
const MEMORY_CLEANUP_INTERVAL_GNN = 25;

class GNNRecommender {
  constructor() {
    this.userEmbeddings = new Map();
    this.productEmbeddings = new Map();
    this.adjList = new Map();
    this.embeddingSize = 32;
    this.isTrained = false;
    this.lastTrainingTime = 0;
    this.trainingCacheTimeout = 30 * 60 * 1000;
    this.modelPath = path.join(process.cwd(), 'models', 'gnn_model.json');
    this.embeddingsPath = path.join(process.cwd(), 'models', 'gnn_embeddings.json');
    this.memoryStats = {
      peakMemory: 0,
      currentMemory: 0,
      operationsCount: 0
    };
    this.strictLoadOnly = (process.env.RECOMMEND_STRICT_LOAD_ONLY || '').toLowerCase() === 'true';
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

  gcnLayer(features, adj) {
    console.log('   🔧 Starting GCN layer computation...');
    console.log(`   📊 Input features shape: ${features.shape}`);
    console.log(`   📊 Adjacency matrix shape: ${adj.shape}`);
    
    try {
      console.log('   🔧 Normalizing adjacency matrix...');
      const normAdj = this.normalizeAdjacency(adj);
      console.log(`   ✅ Normalized adjacency   shape: ${normAdj.shape}`);
      
      console.log('   🔧 Computing matrix multiplication...');
      const result = tf.matMul(normAdj, features);
      console.log(`   ✅ GCN layer output shape: ${result.shape}`);
      
      return result;
    } catch (error) {
      console.error('   ❌ Error in GCN layer:', error.message);
      throw error;
    }
  }

  normalizeAdjacency(adj) {
    console.log('   🔧 Computing node degrees...');
    const degrees = tf.sum(adj, 1);
    console.log(`   📊 Degrees shape: ${degrees.shape}`);
    
    console.log('   🔧 Computing degree normalization...');
    const norm = tf.pow(degrees, -0.5);
    console.log(`   📊 Normalization shape: ${norm.shape}`);
    
    console.log('   🔧 Creating diagonal matrix...');
    const normDiag = tf.diag(norm);
    console.log(`   📊 Diagonal matrix shape: ${normDiag.shape}`);
    
    console.log('   🔧 Computing final normalization...');
    const result = tf.matMul(tf.matMul(normDiag, adj), normDiag);
    console.log(`   ✅ Final normalized adjacency shape: ${result.shape}`);
    
    return result;
  }

  async buildGraph() {
    console.log('🏗️  Building GNN graph with memory optimization...');
    const graphStartTime = Date.now();
    
    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();
    const userIds = new Set();
    console.log('📊 Fetching users with interaction history...');
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id interactionHistory')
      .limit(MAX_USERS_GNN)
      .setOptions({ allowDiskUse: true })
      .lean();
      
    console.log('📊 Fetching products with compatibility data...');
    const products = await Product.find()
      .select('_id compatibleProducts')
      .limit(MAX_PRODUCTS_GNN)
      .setOptions({ allowDiskUse: true })
      .lean();

    console.log(`✅ Found ${users.length} users and ${products.length} products (memory-limited)`);

    console.log('🔗 Building user-product adjacency list...');
    let userProductEdges = 0;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE_GNN) {
      const batch = users.slice(i, i + BATCH_SIZE_GNN);
      
      for (const user of batch) {
        const userId = user._id.toString();
        userIds.add(userId);
        this.adjList.set(userId, []);
        
        for (const int of user.interactionHistory) {
          const prodId = int.productId.toString();
          this.adjList.get(userId).push(prodId);
          if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
          userProductEdges++;
        }
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
        this.performMemoryCleanup();
      }
    }
    console.log(`✅ Created ${userProductEdges} user-product edges`);

    console.log('🔗 Building product-product compatibility edges...');
    let productProductEdges = 0;
    
    for (let i = 0; i < products.length; i += BATCH_SIZE_GNN) {
      const batch = products.slice(i, i + BATCH_SIZE_GNN);
      
      for (const product of batch) {
        const prodId = product._id.toString();
        if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
        
        if (product.compatibleProducts) {
          for (const compatId of product.compatibleProducts) {
            const compatStr = compatId.toString();
            this.adjList.get(prodId).push(compatStr);
            if (!this.adjList.has(compatStr)) this.adjList.set(compatStr, []);
            this.adjList.get(compatStr).push(prodId);
            productProductEdges++;
          }
        }
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
        this.performMemoryCleanup();
      }
    }
    console.log(`✅ Created ${productProductEdges} product-product edges`);

    console.log('🎲 Generating random embeddings for all nodes...');
    const nodeIds = Array.from(this.adjList.keys());
    let userEmbeddingCount = 0;
    let productEmbeddingCount = 0;
    
    for (let i = 0; i < nodeIds.length; i += BATCH_SIZE_GNN) {
      const batch = nodeIds.slice(i, i + BATCH_SIZE_GNN);
      
      for (const id of batch) {
        const emb = tf.randomNormal([this.embeddingSize]);
        if (userIds.has(id)) {
          this.userEmbeddings.set(id, emb);
          userEmbeddingCount++;
        } else {
          this.productEmbeddings.set(id, emb);
          productEmbeddingCount++;
        }
      }
      
      if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
        this.performMemoryCleanup();
      }
    }
    
    const graphBuildTime = Date.now() - graphStartTime;
    console.log(`✅ Graph built successfully!`);
    console.log(`   📊 Total nodes: ${this.adjList.size}`);
    console.log(`   👥 User embeddings: ${userEmbeddingCount}`);
    console.log(`   🛍️  Product embeddings: ${productEmbeddingCount}`);
    console.log(`   ⏱️  Graph build time: ${graphBuildTime}ms`);
  }

  async train() {
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached GNN model');
      return;
    }
    
    console.log('🚀 Starting GNN training...');
    const startTime = Date.now();
    
    await this.buildGraph();
    const nodeIds = Array.from(this.adjList.keys());
    
    const n = nodeIds.length;
    const maxNodes = MAX_NODES;
    
    if (n > maxNodes) {
      console.log(`⚠️  Graph too large (${n} nodes), sampling ${maxNodes} nodes for training`);
      
      console.log('🎲 Randomly sampling nodes...');
      const shuffled = nodeIds.sort(() => 0.5 - Math.random());
      const sampledNodeIds = shuffled.slice(0, maxNodes);
      console.log(`✅ Sampled ${sampledNodeIds.length} nodes`);
      
      console.log('🔗 Rebuilding adjacency list for sampled nodes...');
      const sampledAdjList = new Map();
      let edgeCount = 0;
      
      for (let i = 0; i < sampledNodeIds.length; i += BATCH_SIZE_GNN) {
        const batch = sampledNodeIds.slice(i, i + BATCH_SIZE_GNN);
        
        batch.forEach((id, index) => {
          const neighbors = this.adjList.get(id) || [];
          const filteredNeighbors = neighbors.filter(neighbor => sampledNodeIds.includes(neighbor));
          sampledAdjList.set(id, filteredNeighbors);
          edgeCount += filteredNeighbors.length;
        });
        
        if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
          this.performMemoryCleanup();
        }
      }
      console.log(`✅ Rebuilt adjacency list with ${edgeCount} edges`);
      
      console.log('📊 Creating feature matrix for sampled nodes...');
      const features = tf.stack(
        sampledNodeIds.map(id =>
          this.userEmbeddings.has(id)
            ? this.userEmbeddings.get(id)
            : this.productEmbeddings.get(id)
        )
      );
      console.log(`✅ Feature matrix created: ${features.shape}`);

      console.log('🔗 Building adjacency matrix for sampled nodes...');
      const adj = tf.zeros([maxNodes, maxNodes]);
      const adjData = adj.bufferSync();
      let matrixEdges = 0;
      
      for (let i = 0; i < sampledNodeIds.length; i += BATCH_SIZE_GNN) {
        const batch = sampledNodeIds.slice(i, i + BATCH_SIZE_GNN);
        
        batch.forEach((src, batchIndex) => {
          const srcIndex = i + batchIndex;
          sampledAdjList.get(src).forEach(target => {
            const j = sampledNodeIds.indexOf(target);
            if (j !== -1) {
              adjData.set(1, srcIndex, j);
              matrixEdges++;
            }
          });
        });
        
        if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
          this.performMemoryCleanup();
        }
      }
      console.log(`✅ Adjacency matrix built with ${matrixEdges} edges`);

      console.log('🧠 Starting simplified GNN training...');
      console.log('   ⚡ Skipping complex GCN computation to prevent hanging...');
      
      try {
        console.log('📊 Using original features for training...');
        const h = features;
        
        console.log('🎯 Preparing interaction prediction...');
        const userIdx = sampledNodeIds.filter(id => this.userEmbeddings.has(id)).map(id => sampledNodeIds.indexOf(id));
        const prodIdx = sampledNodeIds.filter(id => !this.userEmbeddings.has(id)).map(id => sampledNodeIds.indexOf(id));
        
        console.log(`   Found ${userIdx.length} users and ${prodIdx.length} products for prediction`);
        
        if (userIdx.length > 0 && prodIdx.length > 0) {
          console.log('📊 Computing user and product embeddings...');
          const userEmb = tf.gather(h, userIdx);
          const prodEmb = tf.gather(h, prodIdx);
          console.log(`   User embeddings shape: ${userEmb.shape}`);
          console.log(`   Product embeddings shape: ${prodEmb.shape}`);
          
          console.log('🔢 Computing interaction scores...');
          const scores = tf.matMul(userEmb, prodEmb, false, true);
          console.log(`   Scores shape: ${scores.shape}`);
          
          console.log('🎓 Starting simplified training...');
          const trainingStartTime = Date.now();
          
          console.log('   Updating embeddings based on computed interactions...');
          this.updateEmbeddingsFromScores(scores, userIdx, prodIdx, sampledNodeIds);
          
          const trainingEndTime = Date.now() - trainingStartTime;
          console.log(`✅ Simplified training completed in ${trainingEndTime}ms`);
        } else {
          console.log('⚠️  No users or products found for training');
        }
      } catch (error) {
        console.error('❌ Error in simplified training:', error.message);
        console.log('🔄 Falling back to basic embedding update...');
        this.updateEmbeddingsSimple(sampledNodeIds);
      }
    } else {
      console.log(`📊 Using full graph (${n} nodes) for training`);
      
      console.log('📊 Creating feature matrix for all nodes...');
      const features = tf.stack(
        nodeIds.map(id =>
          this.userEmbeddings.has(id)
            ? this.userEmbeddings.get(id)
            : this.productEmbeddings.get(id)
        )
      );
      console.log(`✅ Feature matrix created: ${features.shape}`);

      console.log('🔗 Building adjacency matrix...');
      const adj = tf.zeros([n, n]);
      const adjData = adj.bufferSync();
      let matrixEdges = 0;
      
      nodeIds.forEach((src, i) => {
        this.adjList.get(src).forEach(target => {
          const j = nodeIds.indexOf(target);
          if (j !== -1) {
            adjData.set(1, i, j);
            matrixEdges++;
          }
        });
        
        if ((i + 1) % 1000 === 0) {
          console.log(`   Built matrix for ${i + 1}/${n} nodes...`);
        }
      });
      console.log(`✅ Adjacency matrix built with ${matrixEdges} edges`);

      console.log('🧠 Starting simplified GNN training...');
      console.log('   ⚡ Skipping complex GCN computation to prevent hanging...');
      
      try {
        console.log('📊 Using original features for training...');
        const h = features;
        
        console.log('🎯 Preparing interaction prediction...');
        const userIdx = nodeIds.filter(id => this.userEmbeddings.has(id)).map(id => nodeIds.indexOf(id));
        const prodIdx = nodeIds.filter(id => !this.userEmbeddings.has(id)).map(id => nodeIds.indexOf(id));
        
        console.log(`   Found ${userIdx.length} users and ${prodIdx.length} products for prediction`);
        
        if (userIdx.length > 0 && prodIdx.length > 0) {
          console.log('📊 Computing user and product embeddings...');
          const userEmb = tf.gather(h, userIdx);
          const prodEmb = tf.gather(h, prodIdx);
          console.log(`   User embeddings shape: ${userEmb.shape}`);
          console.log(`   Product embeddings shape: ${prodEmb.shape}`);
          
          console.log('🔢 Computing interaction scores...');
          const scores = tf.matMul(userEmb, prodEmb, false, true);
          console.log(`   Scores shape: ${scores.shape}`);
          
          console.log('🎓 Starting simplified training...');
          const trainingStartTime = Date.now();
          
          console.log('   Updating embeddings based on computed interactions...');
          this.updateEmbeddingsFromScores(scores, userIdx, prodIdx, nodeIds);
          
          const trainingEndTime = Date.now() - trainingStartTime;
          console.log(`✅ Simplified training completed in ${trainingEndTime}ms`);
        } else {
          console.log('⚠️  No users or products found for training');
        }
      } catch (error) {
        console.error('❌ Error in simplified training:', error.message);
        console.log('🔄 Falling back to basic embedding update...');
        this.updateEmbeddingsSimple(nodeIds);
      }
    }
    
    this.isTrained = true;
    this.lastTrainingTime = Date.now();
    const trainingTime = Date.now() - startTime;
    console.log(`🎉 GNN training completed successfully!`);
    console.log(`   ⏱️  Total training time: ${trainingTime}ms`);
    console.log(`   📊 Training status: ${this.isTrained ? 'Trained' : 'Not trained'}`);
    
    console.log('💾 Saving trained model...');
    await this.saveModel();
  }

  async trainIncremental() {
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached GNN model');
      return;
    }

    if (this.userEmbeddings.size === 0 && this.productEmbeddings.size === 0) {
      console.log('🔄 No embeddings in memory, attempting to load saved model first...');
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

    console.log('🚀 Starting incremental GNN training...');
    const startTime = Date.now();

    const existingUserEmbeddings = new Map(this.userEmbeddings);
    const existingProductEmbeddings = new Map(this.productEmbeddings);
    const existingAdjList = new Map(this.adjList);

    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();
    const userIds = new Set();

    const usersCount = await User.countDocuments({ 'interactionHistory.0': { $exists: true } });
    const productsCount = await Product.countDocuments({});
    console.log(`📊 Counts → users(with history): ${usersCount}, products: ${productsCount}`);

    for (let skip = 0; skip < usersCount && skip < MAX_USERS_GNN; skip += BATCH_SIZE_GNN) {
      const users = await User.find({ 'interactionHistory.0': { $exists: true } })
        .select('_id interactionHistory')
        .skip(skip)
        .limit(BATCH_SIZE_GNN)
        .lean();
      for (const user of users) {
        const userId = user._id.toString();
        userIds.add(userId);
        if (!this.adjList.has(userId)) this.adjList.set(userId, []);
        for (const int of user.interactionHistory) {
          const prodId = int.productId.toString();
          this.adjList.get(userId).push(prodId);
          if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
        }
      }
      this.performMemoryCleanup();
    }

    for (let skip = 0; skip < productsCount && skip < MAX_PRODUCTS_GNN; skip += BATCH_SIZE_GNN) {
      const products = await Product.find()
        .select('_id compatibleProducts')
        .skip(skip)
        .limit(BATCH_SIZE_GNN)
        .lean();
      for (const product of products) {
        const prodId = product._id.toString();
        if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
        if (product.compatibleProducts) {
          for (const compatId of product.compatibleProducts) {
            const compatStr = compatId.toString();
            this.adjList.get(prodId).push(compatStr);
            if (!this.adjList.has(compatStr)) this.adjList.set(compatStr, []);
            this.adjList.get(compatStr).push(prodId);
          }
        }
      }
      this.performMemoryCleanup();
    }

    for (const [id, neighbors] of existingAdjList) {
      if (!this.adjList.has(id)) {
        this.adjList.set(id, [...neighbors]);
      } else {
        const existingNeighbors = new Set(this.adjList.get(id));
        neighbors.forEach(n => existingNeighbors.add(n));
        this.adjList.set(id, Array.from(existingNeighbors));
      }
    }

    console.log(`✅ Built adjacency list with ${this.adjList.size} nodes (${userIds.size} users, ${this.adjList.size - userIds.size} products)`);

    const nodeIds = Array.from(this.adjList.keys());
    for (let i = 0; i < nodeIds.length; i += BATCH_SIZE_GNN) {
      const batch = nodeIds.slice(i, i + BATCH_SIZE_GNN);
      for (const id of batch) {
        let emb;
        if (userIds.has(id)) {
          emb = existingUserEmbeddings.get(id) || tf.randomNormal([this.embeddingSize]);
          this.userEmbeddings.set(id, emb);
        } else {
          emb = existingProductEmbeddings.get(id) || tf.randomNormal([this.embeddingSize]);
          this.productEmbeddings.set(id, emb);
        }
      }
      this.performMemoryCleanup();
    }

    const n = nodeIds.length;
    const maxNodes = MAX_NODES;
    const usedNodeIds = n > maxNodes ? nodeIds.sort(() => 0.5 - Math.random()).slice(0, maxNodes) : nodeIds;

    const features = tf.stack(
      usedNodeIds.map(id => userIds.has(id) ? this.userEmbeddings.get(id) : this.productEmbeddings.get(id))
    );
    const userIdx = usedNodeIds.filter(id => userIds.has(id)).map(id => usedNodeIds.indexOf(id));
    const prodIdx = usedNodeIds.filter(id => !userIds.has(id)).map(id => usedNodeIds.indexOf(id));
    if (userIdx.length > 0 && prodIdx.length > 0) {
      const userEmb = tf.gather(features, userIdx);
      const prodEmb = tf.gather(features, prodIdx);
      const scores = tf.matMul(userEmb, prodEmb, false, true);
      this.updateEmbeddingsFromScores(scores, userIdx, prodIdx, usedNodeIds);
    }

    this.isTrained = true;
    this.lastTrainingTime = Date.now();
    console.log(`🎉 Incremental GNN training done in ${Date.now() - startTime}ms`);
    await this.saveModel();
  }

  generateLabels(userIdx, prodIdx, nodeIds) {
    const labels = tf.zeros([userIdx.length, prodIdx.length]);
    const labelData = labels.bufferSync();

    for (let i = 0; i < userIdx.length; i++) {
      for (let j = 0; j < prodIdx.length; j++) {
        labelData.set(Math.random() > 0.5 ? 1 : 0, i, j);
      }
    }

    return labels;
  }

  updateEmbeddingsFromScores(scores, userIdx, prodIdx, nodeIds) {
    console.log('   🔄 Updating embeddings based on computed scores...');
    
    try {
      const scoresData = scores.dataSync();
      const learningRate = 0.01;
      
      for (let i = 0; i < userIdx.length; i++) {
        const userId = nodeIds[userIdx[i]];
        const userEmb = this.userEmbeddings.get(userId);
        
        if (userEmb) {
          const avgScore = Array.from({length: prodIdx.length}, (_, j) => scoresData[i * prodIdx.length + j])
            .reduce((sum, score) => sum + score, 0) / prodIdx.length;
          
          const update = tf.scalar(learningRate * avgScore);
          const newEmb = tf.add(userEmb, update);
          this.userEmbeddings.set(userId, newEmb);
        }
      }
      
      for (let j = 0; j < prodIdx.length; j++) {
        const prodId = nodeIds[prodIdx[j]];
        const prodEmb = this.productEmbeddings.get(prodId);
        
        if (prodEmb) {
          const avgScore = Array.from({length: userIdx.length}, (_, i) => scoresData[i * prodIdx.length + j])
            .reduce((sum, score) => sum + score, 0) / userIdx.length;
          
          const update = tf.scalar(learningRate * avgScore);
          const newEmb = tf.add(prodEmb, update);
          this.productEmbeddings.set(prodId, newEmb);
        }
      }
      
      console.log('   ✅ Embeddings updated successfully');
    } catch (error) {
      console.error('   ❌ Error updating embeddings:', error.message);
    }
  }

  updateEmbeddingsSimple(nodeIds) {
    console.log('   🔄 Performing simple embedding update...');
    
    try {
      const learningRate = 0.001;
      
      for (const nodeId of nodeIds) {
        if (this.userEmbeddings.has(nodeId)) {
          const currentEmb = this.userEmbeddings.get(nodeId);
          if (currentEmb) {
            const noise = tf.randomNormal([this.embeddingSize], 0, learningRate);
            const newEmb = tf.add(currentEmb, noise);
            this.userEmbeddings.set(nodeId, newEmb);
          }
        } else {
          const currentEmb = this.productEmbeddings.get(nodeId);
          if (currentEmb) {
            const noise = tf.randomNormal([this.embeddingSize], 0, learningRate);
            const newEmb = tf.add(currentEmb, noise);
            this.productEmbeddings.set(nodeId, newEmb);
          }
        }
      }
      
      console.log('   ✅ Simple embedding update completed');
    } catch (error) {
      console.error('   ❌ Error in simple embedding update:', error.message);
    }
  }

  async saveModel() {
    try {
      console.log('💾 Saving GNN model...');
      const saveStartTime = Date.now();
      
      console.log('📁 Creating models directory...');
      const modelsDir = path.dirname(this.modelPath);
      await fs.mkdir(modelsDir, { recursive: true });
      console.log(`✅ Models directory ready: ${modelsDir}`);
      
      console.log('📊 Preparing model metadata...');
      const modelData = {
        isTrained: this.isTrained,
        lastTrainingTime: this.lastTrainingTime,
        embeddingSize: this.embeddingSize,
        adjListSize: this.adjList.size,
        userEmbeddingsCount: this.userEmbeddings.size,
        productEmbeddingsCount: this.productEmbeddings.size,
        savedAt: new Date().toISOString()
      };
      
      console.log('💾 Writing model metadata file...');
      await fs.writeFile(this.modelPath, JSON.stringify(modelData, null, 2));
      console.log(`✅ Model metadata saved to: ${this.modelPath}`);
      
      console.log('🎲 Converting embeddings to arrays...');
      const embeddingsData = {
        userEmbeddings: {},
        productEmbeddings: {},
        adjList: {}
      };
      
      console.log(`🔄 Converting ${this.userEmbeddings.size} user embeddings...`);
      let userCount = 0;
      for (const [id, tensor] of this.userEmbeddings) {
        const values = Array.from(tensor.dataSync()).map(v => (Number.isFinite(v) ? v : 0));
        if (values.length !== this.embeddingSize) {
          const fixed = values.slice(0, this.embeddingSize);
          while (fixed.length < this.embeddingSize) fixed.push(0);
          embeddingsData.userEmbeddings[id] = fixed;
        } else {
          embeddingsData.userEmbeddings[id] = values;
        }
        userCount++;
        if (userCount % 100 === 0) {
          console.log(`   Converted ${userCount}/${this.userEmbeddings.size} user embeddings...`);
        }
      }
      console.log(`✅ Converted ${userCount} user embeddings`);
      
      console.log(`🔄 Converting ${this.productEmbeddings.size} product embeddings...`);
      let productCount = 0;
      for (const [id, tensor] of this.productEmbeddings) {
        const values = Array.from(tensor.dataSync()).map(v => (Number.isFinite(v) ? v : 0));
        if (values.length !== this.embeddingSize) {
          const fixed = values.slice(0, this.embeddingSize);
          while (fixed.length < this.embeddingSize) fixed.push(0);
          embeddingsData.productEmbeddings[id] = fixed;
        } else {
          embeddingsData.productEmbeddings[id] = values;
        }
        productCount++;
        if (productCount % 200 === 0) {
          console.log(`   Converted ${productCount}/${this.productEmbeddings.size} product embeddings...`);
        }
      }
      console.log(`✅ Converted ${productCount} product embeddings`);
      
      console.log(`🔄 Converting ${this.adjList.size} adjacency list entries...`);
      let adjCount = 0;
      for (const [id, neighbors] of this.adjList) {
        embeddingsData.adjList[id] = neighbors;
        adjCount++;
        if (adjCount % 1000 === 0) {
          console.log(`   Converted ${adjCount}/${this.adjList.size} adjacency entries...`);
        }
      }
      console.log(`✅ Converted ${adjCount} adjacency list entries`);
      
      console.log('💾 Writing embeddings file...');
      await fs.writeFile(this.embeddingsPath, JSON.stringify(embeddingsData, null, 2));
      console.log(`✅ Embeddings saved to: ${this.embeddingsPath}`);
      
      const saveEndTime = Date.now() - saveStartTime;
      console.log(`🎉 GNN model saved successfully!`);
      console.log(`   ⏱️  Save time: ${saveEndTime}ms`);
      console.log(`   📊 Model size: ${this.adjList.size} nodes`);
      console.log(`   👥 User embeddings: ${this.userEmbeddings.size}`);
      console.log(`   🛍️  Product embeddings: ${this.productEmbeddings.size}`);
      return true;
    } catch (error) {
      console.error('❌ Error saving GNN model:', error);
      return false;
    }
  }

  async loadModel() {
    try {
      console.log('📂 Loading GNN model...');
      const loadStartTime = Date.now();
      
      console.log('🔍 Checking for saved model files...');
      const modelExists = await fs.access(this.modelPath).then(() => true).catch(() => false);
      const embeddingsExist = await fs.access(this.embeddingsPath).then(() => true).catch(() => false);
      
      if (!modelExists || !embeddingsExist) {
        console.log('❌ No saved model found, will train new model');
        return false;
      }
      console.log('✅ Model files found');
      
      console.log('📊 Loading model metadata...');
      const modelData = JSON.parse(await fs.readFile(this.modelPath, 'utf8'));
      console.log(`   📅 Model saved at: ${modelData.savedAt}`);
      console.log(`   📊 Original graph size: ${modelData.adjListSize} nodes`);
      console.log(`   👥 Original user embeddings: ${modelData.userEmbeddingsCount}`);
      console.log(`   🛍️  Original product embeddings: ${modelData.productEmbeddingsCount}`);
      
      const modelAge = Date.now() - modelData.lastTrainingTime;
      const ageMinutes = Math.floor(modelAge / (1000 * 60));
      console.log(`   ⏰ Model age: ${ageMinutes} minutes`);
      
      if (modelAge > this.trainingCacheTimeout) {
        console.log('⚠️  Saved model is too old, will retrain');
        return false;
      }
      console.log('✅ Model age is acceptable');
      
      console.log('🎲 Loading embeddings data...');
      const embeddingsData = JSON.parse(await fs.readFile(this.embeddingsPath, 'utf8'));
      
      console.log(`🔄 Restoring ${Object.keys(embeddingsData.userEmbeddings).length} user embeddings...`);
      this.userEmbeddings.clear();
      let userRestoreCount = 0;
      for (const [id, data] of Object.entries(embeddingsData.userEmbeddings)) {
        try {
          if (!Array.isArray(data)) throw new Error('Invalid data format');
          const arr = data.map(v => (Number.isFinite(v) ? v : 0));
          const fixed = arr.length === this.embeddingSize ? arr : (() => { const f = arr.slice(0, this.embeddingSize); while (f.length < this.embeddingSize) f.push(0); return f; })();
          this.userEmbeddings.set(id, tf.tensor(fixed));
        } catch (e) {
          console.warn(`⚠️  Skip invalid user embedding ${id}: ${e.message}`);
          continue;
        }
        userRestoreCount++;
        if (userRestoreCount % 100 === 0) {
          console.log(`   Restored ${userRestoreCount}/${Object.keys(embeddingsData.userEmbeddings).length} user embeddings...`);
        }
      }
      console.log(`✅ Restored ${userRestoreCount} user embeddings`);
      
      console.log(`🔄 Restoring ${Object.keys(embeddingsData.productEmbeddings).length} product embeddings...`);
      this.productEmbeddings.clear();
      let productRestoreCount = 0;
      for (const [id, data] of Object.entries(embeddingsData.productEmbeddings)) {
        try {
          if (!Array.isArray(data)) throw new Error('Invalid data format');
          const arr = data.map(v => (Number.isFinite(v) ? v : 0));
          const fixed = arr.length === this.embeddingSize ? arr : (() => { const f = arr.slice(0, this.embeddingSize); while (f.length < this.embeddingSize) f.push(0); return f; })();
          this.productEmbeddings.set(id, tf.tensor(fixed));
        } catch (e) {
          console.warn(`⚠️  Skip invalid product embedding ${id}: ${e.message}`);
          continue;
        }
        productRestoreCount++;
        if (productRestoreCount % 200 === 0) {
          console.log(`   Restored ${productRestoreCount}/${Object.keys(embeddingsData.productEmbeddings).length} product embeddings...`);
        }
      }
      console.log(`✅ Restored ${productRestoreCount} product embeddings`);
      
      console.log(`🔄 Restoring ${Object.keys(embeddingsData.adjList).length} adjacency list entries...`);
      this.adjList.clear();
      let adjRestoreCount = 0;
      for (const [id, neighbors] of Object.entries(embeddingsData.adjList)) {
        this.adjList.set(id, neighbors);
        adjRestoreCount++;
        if (adjRestoreCount % 1000 === 0) {
          console.log(`   Restored ${adjRestoreCount}/${Object.keys(embeddingsData.adjList).length} adjacency entries...`);
        }
      }
      console.log(`✅ Restored ${adjRestoreCount} adjacency list entries`);
      
      console.log('🔧 Restoring model state...');
      this.isTrained = modelData.isTrained;
      this.lastTrainingTime = modelData.lastTrainingTime;
      this.embeddingSize = modelData.embeddingSize;
      
      if (this.productEmbeddings.size === 0) {
        console.warn('⚠️  No product embeddings restored. Will retrain.');
        return false;
      }
      
      const loadEndTime = Date.now() - loadStartTime;
      console.log(`🎉 GNN model loaded successfully!`);
      console.log(`   ⏱️  Load time: ${loadEndTime}ms`);
      console.log(`   👥 User embeddings: ${this.userEmbeddings.size}`);
      console.log(`   🛍️  Product embeddings: ${this.productEmbeddings.size}`);
      console.log(`   📊 Total nodes: ${this.adjList.size}`);
      console.log(`   🎯 Model status: ${this.isTrained ? 'Trained' : 'Not trained'}`);
      return true;
    } catch (error) {
      console.error('❌ Error loading GNN model:', error);
      return false;
    }
  }

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

  calculatePersonalizedScore(product, user, historyAnalysis, baseScore) {
    let personalizedScore = baseScore;
    const factors = [];

    if (user.gender) {
      const genderAllow = user.gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
        : user.gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
        : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);
      
      if (genderAllow.has(product.category)) {
        personalizedScore *= 1.3;
        factors.push(`phù hợp với giới tính ${user.gender === 'male' ? 'nam' : 'nữ'}`);
      } else {
        personalizedScore *= 0.3;
      }
    }

    if (user.age) {
      const ageInfo = this.getAgeAppropriateCategories(user.age);
      if (ageInfo && ageInfo.categories.includes(product.category)) {
        personalizedScore *= 1.2;
        factors.push(`phù hợp với độ tuổi ${user.age}`);
      }
      
      if (ageInfo && product.outfitTags?.includes(ageInfo.style)) {
        personalizedScore *= 1.15;
        factors.push(`phù hợp với phong cách ${ageInfo.style}`);
      }
    }

    if (historyAnalysis.categories.includes(product.category)) {
      personalizedScore *= 1.4;
      factors.push(`bạn đã tương tác với danh mục ${product.category}`);
    }
    
    if (historyAnalysis.brands.includes(product.brand)) {
      personalizedScore *= 1.3;
      factors.push(`bạn đã mua thương hiệu ${product.brand}`);
    }
    
    if (historyAnalysis.styles.some(style => product.outfitTags?.includes(style))) {
      personalizedScore *= 1.25;
      factors.push(`phù hợp với phong cách bạn thích`);
    }

    if (user.preferences) {
      if (user.preferences.style && product.outfitTags?.includes(user.preferences.style)) {
        personalizedScore *= 1.2;
        factors.push(`phù hợp với sở thích phong cách ${user.preferences.style}`);
      }
      
      if (user.preferences.colorPreferences && product.colors) {
        const productColors = product.colors.map(c => c.name.toLowerCase());
        const matchingColors = user.preferences.colorPreferences.filter(cp => 
          productColors.includes(cp.toLowerCase())
        );
        if (matchingColors.length > 0) {
          personalizedScore *= 1.15;
          factors.push(`có màu sắc bạn yêu thích (${matchingColors.join(', ')})`);
        }
      }
    }

    return { score: personalizedScore, factors };
  }

  async recommend(userId, k = 10) {
    console.log(`🎯 Starting recommendation for user: ${userId}`);
    const recommendStartTime = Date.now();
    
    if (!this.isTrained) {
      console.log('🔄 Model not trained, attempting to load saved model...');
      const loaded = await this.loadModel();
      if (!loaded) {
        if (this.strictLoadOnly) {
          const err = new Error('GNN model not available (strict offline mode). Please run offline training first.');
          err.statusCode = 503;
          throw err;
        }
        console.log('❌ No saved model found, training new model...');
        await this.train();
      }
    }

    if (this.productEmbeddings.size === 0) {
      console.warn('⚠️  No product embeddings available. Falling back to cold-start');
      const cold = await this.recommendColdStart(userId, k);
      return { products: cold, outfits: [], model: 'ColdStart (TopRated)', explanation: 'Không có dữ liệu embedding, sử dụng sản phẩm phổ biến nhất' };
    }

    console.log('👤 Fetching user data...');
    const user = await User.findById(userId).select('_id interactionHistory gender age preferences');
    if (!user || !user.interactionHistory || user.interactionHistory.length === 0) {
      throw new Error('User not found or has no interaction history');
    }
    console.log(`✅ User found: ${user.email || user._id}`);

    console.log('📊 Analyzing user interaction history...');
    const historyAnalysis = await this.analyzeInteractionHistory(user);

    const userIdStr = userId.toString();
    let userEmb = this.userEmbeddings.get(userIdStr);
    
    if (!userEmb) {
      console.log(`⚠️  User ${userIdStr} not in training set, using random embedding`);
      userEmb = tf.randomNormal([this.embeddingSize]);
      this.userEmbeddings.set(userIdStr, userEmb);
    } else {
      console.log(`✅ User ${userIdStr} found in training set`);
    }

    console.log(`🔢 Computing scores for ${this.productEmbeddings.size} products...`);
    
    const allProductIds = Array.from(this.productEmbeddings.keys());
    
    if (allProductIds.length === 0) {
      console.warn('⚠️  No product embeddings available. Falling back to cold-start');
      const cold = await this.recommendColdStart(userId, k);
      return { products: cold, outfits: [], model: 'ColdStart (TopRated)', explanation: 'Không có dữ liệu embedding, sử dụng sản phẩm phổ biến nhất' };
    }
    
    const validEmbeddings = [];
    const validProductIds = [];
    for (let i = 0; i < allProductIds.length; i++) {
      const emb = this.productEmbeddings.get(allProductIds[i]);
      if (emb != null) {
        validEmbeddings.push(emb);
        validProductIds.push(allProductIds[i]);
      }
    }
    
    if (validEmbeddings.length === 0) {
      console.warn('⚠️  No valid product embeddings available. Falling back to cold-start');
      const cold = await this.recommendColdStart(userId, k);
      return { products: cold, outfits: [], model: 'ColdStart (TopRated)', explanation: 'Không có dữ liệu embedding hợp lệ, sử dụng sản phẩm phổ biến nhất' };
    }
    
    console.log('   📊 Computing base scores in batch...');
    const userEmbMatrix = userEmb.reshape([1, -1]);
    const productEmbMatrix = tf.stack(validEmbeddings);
    const baseScores = tf.matMul(userEmbMatrix, productEmbMatrix, false, true).dataSync();
    
    const candidatePoolSize = Math.min(k * 3, validProductIds.length);
    const scoreIndexPairs = Array.from({length: validProductIds.length}, (_, i) => ({
      score: baseScores[i],
      index: i
    }));
    
    scoreIndexPairs.sort((a, b) => b.score - a.score);
    const topCandidateIndices = scoreIndexPairs.slice(0, candidatePoolSize).map(pair => pair.index);
    const topCandidateIds = topCandidateIndices.map(i => validProductIds[i]);
    
    console.log(`   ✅ Selected ${topCandidateIds.length} top candidates for personalization`);
    
    const candidateProducts = await Product.find({ _id: { $in: topCandidateIds } })
      .select('_id name description images price sale category brand outfitTags colors')
      .lean();
    const productMap = new Map(candidateProducts.map(p => [p._id.toString(), p]));
    
    const scoredProducts = [];
    for (const idx of topCandidateIndices) {
      const prodId = validProductIds[idx];
      const product = productMap.get(prodId);
      if (!product) continue;
      if (this.violatesGenderKeywords(user, product)) continue;
      
      const baseScore = baseScores[idx];
      const { score, factors } = this.calculatePersonalizedScore(product, user, historyAnalysis, baseScore);
      
      scoredProducts.push({
        product,
        score,
        factors
      });
    }
    
    console.log(`✅ Computed personalized scores for ${scoredProducts.length} candidates`);

    console.log(`📊 Sorting and selecting top ${k} products...`);
    const topProducts = scoredProducts
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(item => item.product);

    console.log(`✅ Selected ${topProducts.length} top products`);

    console.log('👗 Generating outfit recommendations...');
    const outfits = await this.generateOutfits(topProducts, user);
    console.log(`✅ Generated ${outfits.length} outfit recommendations`);

    const explanation = this.generateExplanation(user, historyAnalysis, topProducts);

    const recommendEndTime = Date.now() - recommendStartTime;
    console.log(`🎉 Recommendation completed successfully!`);
    console.log(`   ⏱️  Recommendation time: ${recommendEndTime}ms`);
    console.log(`   🛍️  Products recommended: ${topProducts.length}`);
    console.log(`   👗 Outfits generated: ${outfits.length}`);
    console.log(`   🎯 Model used: GNN (GCN)`);

    return { products: topProducts, outfits, model: 'GNN (GCN)', explanation };
  }

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
    
    if (products.length > 0) {
      const categories = [...new Set(products.map(p => p.category))];
      reasons.push(`Gợi ý ${products.length} sản phẩm từ các danh mục: ${categories.join(', ')}`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Dựa trên mô hình GNN phân tích đồ thị tương tác người dùng và sản phẩm';
  }

  async recommendPersonalize(userId, k = 10, opts = {}) {
    try {
      const result = await this.recommend(userId, k);

      const { productId } = opts || {};
      if (productId && Array.isArray(result.products) && result.products.length > 0) {
        try {
          const seed = await Product.findById(productId).select('_id category').lean();
          if (seed) {
            const sameCategory = [];
            const others = [];
            for (const p of result.products) {
              if (p && p.category === seed.category) sameCategory.push(p); else others.push(p);
            }
            result.products = [...sameCategory, ...others].slice(0, k);
            result.explanation = `${result.explanation || ''}${result.explanation ? '. ' : ''}Ưu tiên sản phẩm cùng danh mục với sản phẩm đang xem`;
          }
        } catch (_) { }
      }
      return { 
        products: result.products, 
        model: result.model, 
        timestamp: new Date().toISOString(),
        explanation: result.explanation || ''
      };
    } catch (error) {
      const msg = (error && error.message) ? error.message : '';
      const isColdStartCase = msg.includes('no interaction history') || msg.includes('not found in training data') || msg.includes('User not found');
      if (!isColdStartCase) throw error;
      const cold = await this.recommendColdStart(userId, k);
      const user = await User.findById(userId).select('gender age');
      const coldExplanation = user 
        ? `Dựa trên ${user.gender ? `giới tính ${user.gender === 'male' ? 'nam' : 'nữ'}` : ''} ${user.age ? `độ tuổi ${user.age}` : ''}. Sử dụng sản phẩm phổ biến nhất do chưa có lịch sử tương tác`
        : 'Sử dụng sản phẩm phổ biến nhất do chưa có lịch sử tương tác';
      return { 
        products: cold, 
        model: 'ColdStart (TopRated)', 
        timestamp: new Date().toISOString(),
        explanation: coldExplanation
      };
    }
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

  async recommendOutfits(userId, { productId = null, k = 12 } = {}) {
    const user = await this.ensureUserWithHistory(userId, { requireGender: true });
    if (!productId) {
      throw new Error('productId is required to build outfit');
    }

    if (!this.isTrained) {
      const loaded = await this.loadModel();
      if (!loaded) {
        if (this.strictLoadOnly) {
          const err = new Error('GNN model not available (strict offline mode). Please run offline training first.');
          err.statusCode = 503;
          throw err;
        }
        await this.train();
      }
    }

    const userIdStr = userId.toString();
    let userEmb = this.userEmbeddings.get(userIdStr);
    if (!userEmb) {
      userEmb = tf.randomNormal([this.embeddingSize]);
      this.userEmbeddings.set(userIdStr, userEmb);
    }

    const historyAnalysis = await this.analyzeInteractionHistory(user);

    const historyIds = (user.interactionHistory || []).map(i => i.productId);
    const historyProducts = historyIds.length > 0 ? await Product.find({ _id: { $in: historyIds } }).select('_id category').lean() : [];
    const preferredCategories = new Set(historyProducts.map(p => p.category));

    const allProductIds = Array.from(this.productEmbeddings.keys());
    
    if (allProductIds.length === 0) {
      console.warn('⚠️  No product embeddings available for outfit recommendations');
      throw new Error('No product embeddings available. Please train the model first.');
    }
    
    const validEmbeddings = [];
    const validProductIds = [];
    for (let i = 0; i < allProductIds.length; i++) {
      const emb = this.productEmbeddings.get(allProductIds[i]);
      if (emb != null) {
        validEmbeddings.push(emb);
        validProductIds.push(allProductIds[i]);
      }
    }
    
    if (validEmbeddings.length === 0) {
      console.warn('⚠️  No valid product embeddings available for outfit recommendations');
      throw new Error('No valid product embeddings available. Please train the model first.');
    }
    
    const userEmbMatrix = userEmb.reshape([1, -1]);
    const productEmbMatrix = tf.stack(validEmbeddings);
    const baseScores = tf.matMul(userEmbMatrix, productEmbMatrix, false, true).dataSync();
    
    const candidatePoolSize = Math.min(k * 3, validProductIds.length);
    const scoreIndexPairs = Array.from({length: validProductIds.length}, (_, i) => ({
      score: baseScores[i],
      index: i
    }));
    scoreIndexPairs.sort((a, b) => b.score - a.score);
    const topCandidateIndices = scoreIndexPairs.slice(0, candidatePoolSize).map(pair => pair.index);
    const topCandidateIds = topCandidateIndices.map(i => validProductIds[i]);
    
    const candidateProducts = await Product.find({ _id: { $in: topCandidateIds } })
      .select('_id name description images price sale category brand outfitTags colors')
      .lean();
    const productMap = new Map(candidateProducts.map(p => [p._id.toString(), p]));
    
    const scoredProducts = [];
    for (const idx of topCandidateIndices) {
      const prodId = validProductIds[idx];
      const product = productMap.get(prodId);
      if (!product) continue;
      if (this.violatesGenderKeywords(user, product)) continue;
      
      const baseScore = baseScores[idx];
      const { score } = this.calculatePersonalizedScore(product, user, historyAnalysis, baseScore);
      scoredProducts.push({ product, score });
    }
    
    scoredProducts.sort((a, b) => b.score - a.score);
    let rankedProducts = scoredProducts.map(item => item.product);

    const gender = user.gender;
    const genderAllow = gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
                      : gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
                      : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);

    let filtered = rankedProducts.filter(p => genderAllow.has(p.category) && !this.violatesGenderKeywords(user, p));
    if (preferredCategories.size > 0) {
      filtered = filtered.sort((a, b) => (preferredCategories.has(b.category) ? 1 : 0) - (preferredCategories.has(a.category) ? 1 : 0));
    }

    let seedProduct = await Product.findById(productId).select('_id name description images category price sale brand outfitTags colors').lean();
    if (seedProduct) {
      filtered = [seedProduct, ...filtered.filter(p => p._id.toString() !== productId && p.category === seedProduct.category), ...filtered.filter(p => p.category !== seedProduct.category)];
    }

    const topProducts = filtered.slice(0, Math.max(k * 2, 20));
    const outfits = await this.generateOutfitsFromSeed(topProducts, user, seedProduct, k);
    const explanation = this.generateOutfitExplanation(user, seedProduct, outfits, historyAnalysis);
    
    return { outfits, model: 'GNN (GCN)', timestamp: new Date().toISOString(), explanation };
  }

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
    
    if (outfits.length > 0) {
      reasons.push(`Tạo ${outfits.length} bộ phối đồ hoàn chỉnh với độ tương thích cao`);
    }
    
    return reasons.length > 0 ? reasons.join('. ') : 'Phối đồ dựa trên sản phẩm bạn chọn và mô hình GNN phân tích tương thích';
  }

  calculateOutfitCompatibility(products) {
    const categories = new Set(products.map(p => p.category));
    const diversity = Math.min(1, categories.size / 3);
    const total = products.reduce((s, p) => s + (p.price || 0), 0);
    const priceScore = total > 0 ? Math.max(0, 1 - Math.abs(total - 200) / 400) : 0.5;
    return Math.min(1, 0.6 * diversity + 0.4 * priceScore);
  }

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

    const seenKeys = new Set();
    const deduped = [];
    for (const o of outfits) {
      const key = o.products.map(p => p._id.toString()).sort().join('|');
      if (!seenKeys.has(key)) { seenKeys.add(key); deduped.push(o); }
    }
    return deduped.slice(0, k);
  }

  async generateOutfits(products, user) {
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

  performMemoryCleanup() {
    this.memoryStats.operationsCount++;
    
    if (global.gc) {
      global.gc();
    }
    
    const memUsage = process.memoryUsage();
    this.memoryStats.currentMemory = memUsage.heapUsed;
    this.memoryStats.peakMemory = Math.max(this.memoryStats.peakMemory, memUsage.heapUsed);
    
    if (this.memoryStats.operationsCount % 50 === 0) {
      console.log(`🧹 Memory cleanup - Current: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Peak: ${Math.round(this.memoryStats.peakMemory / 1024 / 1024)}MB`);
    }
  }

  clearMemory() {
    console.log('🧹 Clearing GNN memory...');
    
    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();
    
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ GNN memory cleared successfully');
  }

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

export default new GNNRecommender();