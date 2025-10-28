import { Matrix } from 'ml-matrix';
import { TfIdf } from 'natural';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

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
    const users = await User.find({ 'interactionHistory.0': { $exists: true } })
      .select('_id interactionHistory');
    const products = await Product.find().select('_id');
    
    users.forEach((user, index) => {
      this.userIndexMap.set(user._id.toString(), index);
    });
    
    products.forEach((product, index) => {
      this.itemIndexMap.set(product._id.toString(), index);
    });
    
    this.userItemMatrix = new Matrix(users.length, products.length);
    
    const interactionWeights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
    
    for (const user of users) {
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
  }

  async computeUserSimilarity() {
    const numUsers = this.userItemMatrix.rows;
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
    }
  }

  async computeItemSimilarity() {
    // Initialize TF-IDF and compute feature vectors
    const tfidf = new TfIdf();
    const products = await Product.find().select('_id description featureVector category brand outfitTags');
    
    // Add product descriptions to TF-IDF
    products.forEach(p => tfidf.addDocument(p.description || ''));
    
    // Save TF-IDF vectors to products
    for (let i = 0; i < products.length; i++) {
      const vector = [];
      tfidf.tfidfs(products[i].description || '', (j, measure) => vector.push(measure));
      await Product.findByIdAndUpdate(products[i]._id, { featureVector: vector });
      
      // Update the products array with new feature vectors
      products[i].featureVector = vector;
    }
    
    const numItems = products.length;
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
    }
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
    
    const personalizedProducts = await this.getPersonalizedProducts(user, k);
    
    const scoredProducts = [];
    
    for (const product of personalizedProducts) {
      const itemIndex = this.itemIndexMap.get(product._id.toString());
      if (itemIndex === undefined) continue;
      
      const cfScore = this.computeCollaborativeScore(userIndex, itemIndex);
      const cbScore = this.computeContentBasedScore(user, product);
      const hybridScore = (this.cfWeight * cfScore) + (this.cbWeight * cbScore);
      
      let personalizedScore = hybridScore;
      
      const historySimilarity = this.calculateHistorySimilarity(user, product);
      personalizedScore += historySimilarity * 0.3;
      
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
    
    return {
      products: topProducts,
      outfits: outfits,
      model: 'Hybrid',
      cfWeight: this.cfWeight,
      cbWeight: this.cbWeight,
      personalization: 'Based on interaction history and preferences',
      outfitType: user.gender === 'male' ? 'Men\'s outfits (shirt + pants + shoes)' : 'Women\'s outfits (dress + accessories)',
      timestamp: new Date()
    };
  }

  computeCollaborativeScore(userIndex, itemIndex) {
    const userSimilarities = this.userSimilarityMatrix.getRow(userIndex);
    const userRatings = this.userItemMatrix.getColumn(itemIndex);
    
    let weightedSum = 0;
    let similaritySum = 0;
    
    for (let i = 0; i < userSimilarities.length; i++) {
      if (i !== userIndex && userRatings[i] > 0) {
        const similarity = userSimilarities[i];
        if (similarity > 0.1) {
          weightedSum += similarity * userRatings[i];
          similaritySum += Math.abs(similarity);
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
    const userCategories = new Set();
    const userBrands = new Set();
    const userStyles = new Set();
    const userColors = new Set();
    
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
    
    const personalizedProducts = await Product.find(query)
      .select('_id name images price category brand outfitTags colors featureVector')
      .limit(k * 2);
    
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

  updateWeights(cfWeight, cbWeight) {
    if (cfWeight + cbWeight !== 1.0) {
      throw new Error('Weights must sum to 1.0');
    }
    this.cfWeight = cfWeight;
    this.cbWeight = cbWeight;
  }
}

const hybridRecommender = new HybridRecommender();
export default hybridRecommender;