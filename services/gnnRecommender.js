import * as tf from '@tensorflow/tfjs-node';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import Outfit from '../models/outfitModel.js';

class GNNRecommender {
  constructor() {
    this.userEmbeddings = new Map();
    this.productEmbeddings = new Map();
    this.adjList = new Map(); // userId -> [productId], productId -> [productId]
    this.embeddingSize = 64;
    this.isTrained = false;
  }

  // GCN Layer
  gcnLayer(features, adj) {
    const normAdj = this.normalizeAdjacency(adj);
    return tf.matMul(normAdj, features);
  }

  normalizeAdjacency(adj) {
    const degrees = tf.sum(adj, 1);
    const norm = tf.pow(degrees, -0.5);
    const normDiag = tf.diag(norm);
    return tf.matMul(tf.matMul(normDiag, adj), normDiag);
  }

  async buildGraph() {
    const users = await User.find({ 'interactionHistory.0': { $exists: true } }).select('_id interactionHistory');
    const products = await Product.find().select('_id compatibleProducts');

    // Build adjacency list
    for (const user of users) {
      const userId = user._id.toString();
      this.adjList.set(userId, []);
      for (const int of user.interactionHistory) {
        const prodId = int.productId.toString();
        this.adjList.get(userId).push(prodId);
        if (!this.adjList.has(prodId)) this.adjList.set(prodId, []);
      }
    }

    // Add product-product edges
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

    // Create embeddings
    for (const [id, _] of this.adjList) {
      const emb = tf.randomNormal([this.embeddingSize]);
      if (id.startsWith('user')) {
        this.userEmbeddings.set(id, emb);
      } else {
        this.productEmbeddings.set(id, emb);
      }
    }
  }

  async train() {
    await this.buildGraph();
    const nodeIds = Array.from(this.adjList.keys());
    const features = tf.stack(
      nodeIds.map(id =>
        id.startsWith('user')
          ? this.userEmbeddings.get(id)
          : this.productEmbeddings.get(id)
      )
    );

    // Build adjacency matrix
    const n = nodeIds.length;
    const adj = tf.zeros([n, n]);
    const adjData = adj.bufferSync();
    nodeIds.forEach((src, i) => {
      this.adjList.get(src).forEach(target => {
        const j = nodeIds.indexOf(target);
        if (j !== -1) adjData.set(1, i, j);
      });
    });

    // GNN: 2-layer GCN
    let h = this.gcnLayer(features, adj);
    h = tf.relu(h);
    h = this.gcnLayer(h, adj);

    // Predict interaction
    const userIdx = nodeIds.filter(id => id.startsWith('user')).map(id => nodeIds.indexOf(id));
    const prodIdx = nodeIds.filter(id => !id.startsWith('user')).map(id => nodeIds.indexOf(id));
    const userEmb = tf.gather(h, userIdx);
    const prodEmb = tf.gather(h, prodIdx);
    const scores = tf.matMul(userEmb, prodEmb, false, true);
    const labels = this.generateLabels(userIdx, prodIdx, nodeIds); // 1 if interacted

    await tf.fit(scores, labels, { epochs: 20 });
    this.isTrained = true;
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

  async recommend(userId, k = 10) {
    if (!this.isTrained) await this.train();

    const user = await User.findById(userId);
    const userEmb = this.userEmbeddings.get(userId.toString());
    const scores = {};

    for (const [prodId, emb] of this.productEmbeddings) {
      const score = tf.matMul(userEmb.reshape([1, -1]), emb.reshape([-1, 1])).dataSync()[0];
      scores[prodId] = score;
    }

    const topIds = Object.keys(scores)
      .sort((a, b) => scores[b] - scores[a])
      .slice(0, k * 2);

    const products = await Product.find({ _id: { $in: topIds } });
    const outfits = await this.generateOutfits(products, user);

    return { products, outfits, model: 'GNN (GCN)' };
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
}

export default new GNNRecommender();