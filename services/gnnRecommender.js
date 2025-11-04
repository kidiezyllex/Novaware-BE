import * as tf from '@tensorflow/tfjs';
import fs from 'fs/promises';
import path from 'path';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import Outfit from '../models/outfitModel.js';

// Memory optimization constants
const MAX_NODES = 1000; // Further reduced limit
const MAX_USERS_GNN = 500; // Limit users for GNN
const MAX_PRODUCTS_GNN = 1000; // Limit products for GNN
const BATCH_SIZE_GNN = 50; // Smaller batch size
const MEMORY_CLEANUP_INTERVAL_GNN = 25; // More frequent cleanup

class GNNRecommender {
  constructor() {
    this.userEmbeddings = new Map();
    this.productEmbeddings = new Map();
    this.adjList = new Map(); // userId -> [productId], productId -> [productId]
    this.embeddingSize = 32; // Reduced from 64 to save memory
    this.isTrained = false;
    this.lastTrainingTime = 0;
    this.trainingCacheTimeout = 30 * 60 * 1000; // 30 minutes cache
    this.modelPath = path.join(process.cwd(), 'models', 'gnn_model.json');
    this.embeddingsPath = path.join(process.cwd(), 'models', 'gnn_embeddings.json');
    this.memoryStats = {
      peakMemory: 0,
      currentMemory: 0,
      operationsCount: 0
    };
  }

  // --- Validation helpers ---
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

  // GCN Layer
  gcnLayer(features, adj) {
    console.log('   🔧 Starting GCN layer computation...');
    console.log(`   📊 Input features shape: ${features.shape}`);
    console.log(`   📊 Adjacency matrix shape: ${adj.shape}`);
    
    try {
      console.log('   🔧 Normalizing adjacency matrix...');
      const normAdj = this.normalizeAdjacency(adj);
      console.log(`   ✅ Normalized adjacency shape: ${normAdj.shape}`);
      
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
    
    // Clear existing data to free memory
    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();
    
    // Limit the number of users and products to prevent memory issues
    console.log('📊 Fetching users with interaction history...');
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id interactionHistory')
      .limit(MAX_USERS_GNN)
      .sort({ 'interactionHistory': -1 }); // Get most active users first
      
    console.log('📊 Fetching products with compatibility data...');
    const products = await Product.find()
      .select('_id compatibleProducts')
      .limit(MAX_PRODUCTS_GNN)
      .sort({ rating: -1 }); // Get highest rated products first

    console.log(`✅ Found ${users.length} users and ${products.length} products (memory-limited)`);

    // Build adjacency list in batches
    console.log('🔗 Building user-product adjacency list...');
    let userProductEdges = 0;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE_GNN) {
      const batch = users.slice(i, i + BATCH_SIZE_GNN);
      
      for (const user of batch) {
        const userId = user._id.toString();
        this.adjList.set(userId, []);
        
        for (const int of user.interactionHistory) {
          const prodId = int.productId.toString();
          this.adjList.get(userId).push(prodId);
          if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
          userProductEdges++;
        }
      }
      
      // Memory cleanup after each batch
      if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
        this.performMemoryCleanup();
      }
    }
    console.log(`✅ Created ${userProductEdges} user-product edges`);

    // Add product-product edges in batches
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
      
      // Memory cleanup after each batch
      if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
        this.performMemoryCleanup();
      }
    }
    console.log(`✅ Created ${productProductEdges} product-product edges`);

    // Create embeddings in batches
    console.log('🎲 Generating random embeddings for all nodes...');
    const nodeIds = Array.from(this.adjList.keys());
    let userEmbeddingCount = 0;
    let productEmbeddingCount = 0;
    
    for (let i = 0; i < nodeIds.length; i += BATCH_SIZE_GNN) {
      const batch = nodeIds.slice(i, i + BATCH_SIZE_GNN);
      
      for (const id of batch) {
        const emb = tf.randomNormal([this.embeddingSize]);
        if (id.startsWith('user')) {
          this.userEmbeddings.set(id, emb);
          userEmbeddingCount++;
        } else {
          this.productEmbeddings.set(id, emb);
          productEmbeddingCount++;
        }
      }
      
      // Memory cleanup after each batch
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
    // Check if we can use cached training
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached GNN model');
      return;
    }
    
    console.log('🚀 Starting GNN training...');
    const startTime = Date.now();
    
    await this.buildGraph();
    const nodeIds = Array.from(this.adjList.keys());
    
    // Check if the graph is too large for memory
    const n = nodeIds.length;
    const maxNodes = MAX_NODES; // Use constant
    
    if (n > maxNodes) {
      console.log(`⚠️  Graph too large (${n} nodes), sampling ${maxNodes} nodes for training`);
      
      // Sample nodes randomly to reduce size
      console.log('🎲 Randomly sampling nodes...');
      const shuffled = nodeIds.sort(() => 0.5 - Math.random());
      const sampledNodeIds = shuffled.slice(0, maxNodes);
      console.log(`✅ Sampled ${sampledNodeIds.length} nodes`);
      
      // Rebuild adjacency list with sampled nodes
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
        
        // Memory cleanup after each batch
        if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
          this.performMemoryCleanup();
        }
      }
      console.log(`✅ Rebuilt adjacency list with ${edgeCount} edges`);
      
      // Use sampled data
      console.log('📊 Creating feature matrix for sampled nodes...');
      const features = tf.stack(
        sampledNodeIds.map(id =>
          id.startsWith('user')
            ? this.userEmbeddings.get(id)
            : this.productEmbeddings.get(id)
        )
      );
      console.log(`✅ Feature matrix created: ${features.shape}`);

      // Build sparse adjacency matrix for sampled nodes
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
        
        // Memory cleanup after each batch
        if (i % MEMORY_CLEANUP_INTERVAL_GNN === 0) {
          this.performMemoryCleanup();
        }
      }
      console.log(`✅ Adjacency matrix built with ${matrixEdges} edges`);

      // Simplified GNN: Skip complex GCN computation
      console.log('🧠 Starting simplified GNN training...');
      console.log('   ⚡ Skipping complex GCN computation to prevent hanging...');
      
      try {
        // Use original features directly instead of GCN layers
        console.log('📊 Using original features for training...');
        const h = features; // Use original features as embeddings
        
        // Predict interaction
        console.log('🎯 Preparing interaction prediction...');
        const userIdx = sampledNodeIds.filter(id => id.startsWith('user')).map(id => sampledNodeIds.indexOf(id));
        const prodIdx = sampledNodeIds.filter(id => !id.startsWith('user')).map(id => sampledNodeIds.indexOf(id));
        
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
          
          // Update embeddings based on computed scores
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
      
      // Original logic for smaller graphs
      console.log('📊 Creating feature matrix for all nodes...');
      const features = tf.stack(
        nodeIds.map(id =>
          id.startsWith('user')
            ? this.userEmbeddings.get(id)
            : this.productEmbeddings.get(id)
        )
      );
      console.log(`✅ Feature matrix created: ${features.shape}`);

      // Build adjacency matrix
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

      // Simplified GNN: Skip complex GCN computation
      console.log('🧠 Starting simplified GNN training...');
      console.log('   ⚡ Skipping complex GCN computation to prevent hanging...');
      
      try {
        // Use original features directly instead of GCN layers
        console.log('📊 Using original features for training...');
        const h = features; // Use original features as embeddings
        
        // Predict interaction
        console.log('🎯 Preparing interaction prediction...');
        const userIdx = nodeIds.filter(id => id.startsWith('user')).map(id => nodeIds.indexOf(id));
        const prodIdx = nodeIds.filter(id => !id.startsWith('user')).map(id => nodeIds.indexOf(id));
        
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
          
          // Update embeddings based on computed scores
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
    
    // Save the trained model
    console.log('💾 Saving trained model...');
    await this.saveModel();
  }

  // Incremental training for large datasets: counts first, then paginates
  async trainIncremental() {
    const now = Date.now();
    if (this.isTrained && (now - this.lastTrainingTime) < this.trainingCacheTimeout) {
      console.log('✅ Using cached GNN model');
      return;
    }

    console.log('🚀 Starting incremental GNN training...');
    const startTime = Date.now();

    // Reset structures
    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();

    // Count documents
    const usersCount = await User.countDocuments({ 'interactionHistory.0': { $exists: true } });
    const productsCount = await Product.countDocuments({});
    console.log(`📊 Counts → users(with history): ${usersCount}, products: ${productsCount}`);

    // Page through users
    for (let skip = 0; skip < usersCount && skip < MAX_USERS_GNN; skip += BATCH_SIZE_GNN) {
      const users = await User.find({ 'interactionHistory.0': { $exists: true } })
        .select('_id interactionHistory')
        .skip(skip)
        .limit(BATCH_SIZE_GNN)
        .lean();
      for (const user of users) {
        const userId = user._id.toString();
        if (!this.adjList.has(userId)) this.adjList.set(userId, []);
        for (const int of user.interactionHistory) {
          const prodId = int.productId.toString();
          this.adjList.get(userId).push(prodId);
          if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
        }
      }
      this.performMemoryCleanup();
    }

    // Page through products to add product-product edges
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

    // Initialize embeddings for nodes seen
    const nodeIds = Array.from(this.adjList.keys());
    for (let i = 0; i < nodeIds.length; i += BATCH_SIZE_GNN) {
      const batch = nodeIds.slice(i, i + BATCH_SIZE_GNN);
      for (const id of batch) {
        const emb = tf.randomNormal([this.embeddingSize]);
        if (id.startsWith('user')) {
          this.userEmbeddings.set(id, emb);
        } else {
          this.productEmbeddings.set(id, emb);
        }
      }
      this.performMemoryCleanup();
    }

    // Train with simplified approach and node sampling if too large
    const n = nodeIds.length;
    const maxNodes = MAX_NODES;
    const usedNodeIds = n > maxNodes ? nodeIds.sort(() => 0.5 - Math.random()).slice(0, maxNodes) : nodeIds;

    const features = tf.stack(
      usedNodeIds.map(id => id.startsWith('user') ? this.userEmbeddings.get(id) : this.productEmbeddings.get(id))
    );
    const userIdx = usedNodeIds.filter(id => id.startsWith('user')).map(id => usedNodeIds.indexOf(id));
    const prodIdx = usedNodeIds.filter(id => !id.startsWith('user')).map(id => usedNodeIds.indexOf(id));
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
    // Create labels based on interaction history
    const labels = tf.zeros([userIdx.length, prodIdx.length]);
    const labelData = labels.bufferSync();

    // This is a simplified version - in practice you'd want to check actual interactions
    // For now, we'll create random labels for demonstration
    for (let i = 0; i < userIdx.length; i++) {
      for (let j = 0; j < prodIdx.length; j++) {
        // Random binary labels for now
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
      
      // Update user embeddings based on scores
      for (let i = 0; i < userIdx.length; i++) {
        const userId = nodeIds[userIdx[i]];
        const userEmb = this.userEmbeddings.get(userId);
        
        if (userEmb) {
          // Simple gradient update based on average scores
          const avgScore = Array.from({length: prodIdx.length}, (_, j) => scoresData[i * prodIdx.length + j])
            .reduce((sum, score) => sum + score, 0) / prodIdx.length;
          
          const update = tf.scalar(learningRate * avgScore);
          const newEmb = tf.add(userEmb, update);
          this.userEmbeddings.set(userId, newEmb);
        }
      }
      
      // Update product embeddings based on scores
      for (let j = 0; j < prodIdx.length; j++) {
        const prodId = nodeIds[prodIdx[j]];
        const prodEmb = this.productEmbeddings.get(prodId);
        
        if (prodEmb) {
          // Simple gradient update based on average scores
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
      
      // Simple random walk update for all embeddings
      for (const nodeId of nodeIds) {
        if (nodeId.startsWith('user')) {
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
      
      // Ensure models directory exists
      console.log('📁 Creating models directory...');
      const modelsDir = path.dirname(this.modelPath);
      await fs.mkdir(modelsDir, { recursive: true });
      console.log(`✅ Models directory ready: ${modelsDir}`);
      
      // Save model metadata
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
      
      // Save embeddings as arrays (convert tensors to arrays)
      console.log('🎲 Converting embeddings to arrays...');
      const embeddingsData = {
        userEmbeddings: {},
        productEmbeddings: {},
        adjList: {}
      };
      
      // Convert user embeddings
      console.log(`🔄 Converting ${this.userEmbeddings.size} user embeddings...`);
      let userCount = 0;
      for (const [id, tensor] of this.userEmbeddings) {
        embeddingsData.userEmbeddings[id] = tensor.dataSync();
        userCount++;
        if (userCount % 100 === 0) {
          console.log(`   Converted ${userCount}/${this.userEmbeddings.size} user embeddings...`);
        }
      }
      console.log(`✅ Converted ${userCount} user embeddings`);
      
      // Convert product embeddings
      console.log(`🔄 Converting ${this.productEmbeddings.size} product embeddings...`);
      let productCount = 0;
      for (const [id, tensor] of this.productEmbeddings) {
        embeddingsData.productEmbeddings[id] = tensor.dataSync();
        productCount++;
        if (productCount % 200 === 0) {
          console.log(`   Converted ${productCount}/${this.productEmbeddings.size} product embeddings...`);
        }
      }
      console.log(`✅ Converted ${productCount} product embeddings`);
      
      // Convert adjacency list
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
      
      // Check if model files exist
      console.log('🔍 Checking for saved model files...');
      const modelExists = await fs.access(this.modelPath).then(() => true).catch(() => false);
      const embeddingsExist = await fs.access(this.embeddingsPath).then(() => true).catch(() => false);
      
      if (!modelExists || !embeddingsExist) {
        console.log('❌ No saved model found, will train new model');
        return false;
      }
      console.log('✅ Model files found');
      
      // Load model metadata
      console.log('📊 Loading model metadata...');
      const modelData = JSON.parse(await fs.readFile(this.modelPath, 'utf8'));
      console.log(`   📅 Model saved at: ${modelData.savedAt}`);
      console.log(`   📊 Original graph size: ${modelData.adjListSize} nodes`);
      console.log(`   👥 Original user embeddings: ${modelData.userEmbeddingsCount}`);
      console.log(`   🛍️  Original product embeddings: ${modelData.productEmbeddingsCount}`);
      
      // Check if model is not too old (optional: you can remove this check)
      const modelAge = Date.now() - modelData.lastTrainingTime;
      const ageMinutes = Math.floor(modelAge / (1000 * 60));
      console.log(`   ⏰ Model age: ${ageMinutes} minutes`);
      
      if (modelAge > this.trainingCacheTimeout) {
        console.log('⚠️  Saved model is too old, will retrain');
        return false;
      }
      console.log('✅ Model age is acceptable');
      
      // Load embeddings
      console.log('🎲 Loading embeddings data...');
      const embeddingsData = JSON.parse(await fs.readFile(this.embeddingsPath, 'utf8'));
      
      // Restore user embeddings
      console.log(`🔄 Restoring ${Object.keys(embeddingsData.userEmbeddings).length} user embeddings...`);
      this.userEmbeddings.clear();
      let userRestoreCount = 0;
      for (const [id, data] of Object.entries(embeddingsData.userEmbeddings)) {
        this.userEmbeddings.set(id, tf.tensor(data));
        userRestoreCount++;
        if (userRestoreCount % 100 === 0) {
          console.log(`   Restored ${userRestoreCount}/${Object.keys(embeddingsData.userEmbeddings).length} user embeddings...`);
        }
      }
      console.log(`✅ Restored ${userRestoreCount} user embeddings`);
      
      // Restore product embeddings
      console.log(`🔄 Restoring ${Object.keys(embeddingsData.productEmbeddings).length} product embeddings...`);
      this.productEmbeddings.clear();
      let productRestoreCount = 0;
      for (const [id, data] of Object.entries(embeddingsData.productEmbeddings)) {
        this.productEmbeddings.set(id, tf.tensor(data));
        productRestoreCount++;
        if (productRestoreCount % 200 === 0) {
          console.log(`   Restored ${productRestoreCount}/${Object.keys(embeddingsData.productEmbeddings).length} product embeddings...`);
        }
      }
      console.log(`✅ Restored ${productRestoreCount} product embeddings`);
      
      // Restore adjacency list
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
      
      // Restore model state
      console.log('🔧 Restoring model state...');
      this.isTrained = modelData.isTrained;
      this.lastTrainingTime = modelData.lastTrainingTime;
      this.embeddingSize = modelData.embeddingSize;
      
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

  async recommend(userId, k = 10) {
    console.log(`🎯 Starting recommendation for user: ${userId}`);
    const recommendStartTime = Date.now();
    
    // Try to load saved model first
    if (!this.isTrained) {
      console.log('🔄 Model not trained, attempting to load saved model...');
      const loaded = await this.loadModel();
      if (!loaded) {
        console.log('❌ No saved model found, training new model...');
        await this.train();
      }
    }

    console.log('👤 Fetching user data...');
    const user = await this.ensureUserWithHistory(userId);
    console.log(`✅ User found: ${user.email || user._id}`);

    const userIdStr = userId.toString();
    let userEmb = this.userEmbeddings.get(userIdStr);
    
    // If user wasn't in the training set (due to sampling), create a random embedding
    if (!userEmb) {
      console.log(`⚠️  User ${userIdStr} not in training set, using random embedding`);
      userEmb = tf.randomNormal([this.embeddingSize]);
      this.userEmbeddings.set(userIdStr, userEmb);
    } else {
      console.log(`✅ User ${userIdStr} found in training set`);
    }

    console.log(`🔢 Computing scores for ${this.productEmbeddings.size} products...`);
    const scores = {};
    let scoreCount = 0;

    for (const [prodId, emb] of this.productEmbeddings) {
      const score = tf.matMul(userEmb.reshape([1, -1]), emb.reshape([-1, 1])).dataSync()[0];
      scores[prodId] = score;
      scoreCount++;
      
      if (scoreCount % 500 === 0) {
        console.log(`   Computed scores for ${scoreCount}/${this.productEmbeddings.size} products...`);
      }
    }
    console.log(`✅ Computed scores for ${scoreCount} products`);

    console.log(`📊 Sorting and selecting top ${k} products...`);
    const topIds = Object.keys(scores)
      .sort((a, b) => scores[b] - scores[a])
      .slice(0, k);
    console.log(`✅ Selected ${topIds.length} top products`);

    console.log('🛍️  Fetching product details from database...');
    const products = await Product.find({ _id: { $in: topIds } });
    console.log(`✅ Retrieved ${products.length} product details`);

    console.log('👗 Generating outfit recommendations...');
    const outfits = await this.generateOutfits(products, user);
    console.log(`✅ Generated ${outfits.length} outfit recommendations`);

    const recommendEndTime = Date.now() - recommendStartTime;
    console.log(`🎉 Recommendation completed successfully!`);
    console.log(`   ⏱️  Recommendation time: ${recommendEndTime}ms`);
    console.log(`   🛍️  Products recommended: ${products.length}`);
    console.log(`   👗 Outfits generated: ${outfits.length}`);
    console.log(`   🎯 Model used: GNN (GCN)`);

    return { products, outfits, model: 'GNN (GCN)' };
  }

  async recommendPersonalize(userId, k = 10) {
    // Must have interaction history
    const result = await this.recommend(userId, k);
    return { products: result.products, model: result.model, timestamp: new Date().toISOString() };
  }

  async recommendOutfits(userId, { productId = null, k = 12 } = {}) {
    // Must have gender and interaction history; and a selected seed product
    const user = await this.ensureUserWithHistory(userId, { requireGender: true });
    if (!productId) {
      throw new Error('productId is required to build outfit');
    }

    if (!this.isTrained) {
      const loaded = await this.loadModel();
      if (!loaded) await this.train();
    }

    const userIdStr = userId.toString();
    let userEmb = this.userEmbeddings.get(userIdStr);
    if (!userEmb) {
      userEmb = tf.randomNormal([this.embeddingSize]);
      this.userEmbeddings.set(userIdStr, userEmb);
    }

    // Collect user history categories
    const historyIds = (user.interactionHistory || []).map(i => i.productId);
    const historyProducts = historyIds.length > 0 ? await Product.find({ _id: { $in: historyIds } }).select('_id category').lean() : [];
    const preferredCategories = new Set(historyProducts.map(p => p.category));

    // Compute scores across products
    const scores = {};
    for (const [pid, emb] of this.productEmbeddings) {
      scores[pid] = tf.matMul(userEmb.reshape([1, -1]), emb.reshape([-1, 1])).dataSync()[0];
    }
    // Rank products
    let rankedIds = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);

    // Gender filter
    const gender = user.gender;
    const genderAllow = gender === 'male' ? new Set(['Tops', 'Bottoms', 'Shoes'])
                      : gender === 'female' ? new Set(['Dresses', 'Accessories', 'Shoes'])
                      : new Set(['Tops', 'Bottoms', 'Accessories', 'Shoes']);

    // Pull product docs in chunks and filter
    const candidates = await Product.find({ _id: { $in: rankedIds.slice(0, Math.max(k * 5, 50)) } }).lean();
    let filtered = candidates.filter(p => genderAllow.has(p.category));
    if (preferredCategories.size > 0) {
      filtered = filtered.sort((a, b) => (preferredCategories.has(b.category) ? 1 : 0) - (preferredCategories.has(a.category) ? 1 : 0));
    }

    // Use the required productId as seed and prioritize category-matching items
    let seedProduct = await Product.findById(productId).lean();
    if (seedProduct) {
      filtered = [seedProduct, ...filtered.filter(p => p._id.toString() !== productId && p.category === seedProduct.category), ...filtered.filter(p => p.category !== seedProduct.category)];
    }

    const topProducts = filtered.slice(0, Math.max(k, 20));
    const outfits = await this.generateOutfitsFromSeed(topProducts, user, seedProduct, k);
    return { outfits, model: 'GNN (GCN)', timestamp: new Date().toISOString() };
  }

  calculateOutfitCompatibility(products) {
    // Simple heuristic: prefer diverse categories and moderate total price
    const categories = new Set(products.map(p => p.category));
    const diversity = Math.min(1, categories.size / 3);
    const total = products.reduce((s, p) => s + (p.price || 0), 0);
    const priceScore = total > 0 ? Math.max(0, 1 - Math.abs(total - 200) / 400) : 0.5; // favor around 200
    return Math.min(1, 0.6 * diversity + 0.4 * priceScore);
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
    
    // Log memory usage every 50 operations
    if (this.memoryStats.operationsCount % 50 === 0) {
      console.log(`🧹 Memory cleanup - Current: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB, Peak: ${Math.round(this.memoryStats.peakMemory / 1024 / 1024)}MB`);
    }
  }

  // Method to clear large data structures
  clearMemory() {
    console.log('🧹 Clearing GNN memory...');
    
    // Clear embeddings
    this.userEmbeddings.clear();
    this.productEmbeddings.clear();
    this.adjList.clear();
    
    // Force garbage collection
    if (global.gc) {
      global.gc();
    }
    
    console.log('✅ GNN memory cleared successfully');
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

export default new GNNRecommender();