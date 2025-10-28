import mongoose from 'mongoose';
import natural from 'natural';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import User from './models/userModel.js';
import Outfit from './models/outfitModel.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI + 'novaware');

const tfidf = new natural.TfIdf();

async function preprocess() {
  console.log('🚀 Starting data preprocessing for recommendation system...');
  
  try {
    // Step 1: Compute TF-IDF vectors for products
    console.log('📊 Computing TF-IDF vectors for products...');
    await computeProductFeatureVectors();
    
    // Step 2: Generate user embeddings
    console.log('👤 Generating user embeddings...');
    await generateUserEmbeddings();
    
    // Step 3: Build user-item interaction matrix
    console.log('🔗 Building user-item interaction matrix...');
    await buildUserItemMatrix();
    
    // Step 4: Create outfit compatibility data
    console.log('👗 Creating outfit compatibility data...');
    await createOutfitCompatibility();
    
    console.log('✅ Data preprocessing completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during preprocessing:', error);
  } finally {
    mongoose.disconnect();
  }
}

async function computeProductFeatureVectors() {
  const totalProducts = await Product.countDocuments();
  console.log(`📊 Found ${totalProducts.toLocaleString()} products to process for TF-IDF...`);
  
  const batchSize = 1000; // Process in batches of 1000
  let processedCount = 0;
  let batchNumber = 1;
  
  // Process products in batches
  while (processedCount < totalProducts) {
    const products = await Product.find()
      .select('_id name description category brand outfitTags')
      .skip(processedCount)
      .limit(batchSize);
    
    if (products.length === 0) break;
    
    console.log(`\n🔄 Processing batch ${batchNumber} (${products.length} products)...`);
    console.log(`📈 Progress: ${processedCount.toLocaleString()}/${totalProducts.toLocaleString()} (${((processedCount/totalProducts)*100).toFixed(1)}%)`);
    
    // Add product descriptions to TF-IDF for this batch
    products.forEach(product => {
      const text = `${product.name} ${product.description} ${product.category} ${product.brand} ${product.outfitTags?.join(' ') || ''}`;
      tfidf.addDocument(text.toLowerCase());
    });
    
    // Compute feature vectors for each product in this batch
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const text = `${product.name} ${product.description} ${product.category} ${product.brand} ${product.outfitTags?.join(' ') || ''}`;
      
      const featureVector = [];
      tfidf.tfidfs(text.toLowerCase(), (index, measure) => {
        featureVector[index] = measure;
      });
      
      // Normalize vector
      const magnitude = Math.sqrt(featureVector.reduce((sum, val) => sum + val * val, 0));
      const normalizedVector = magnitude > 0 ? featureVector.map(val => val / magnitude) : featureVector;
      
      await Product.findByIdAndUpdate(product._id, { 
        featureVector: normalizedVector 
      });
      
      // Show progress every 100 products within batch
      if ((i + 1) % 100 === 0) {
        const batchProgress = ((i + 1) / products.length * 100).toFixed(1);
        console.log(`   📊 Batch progress: ${i + 1}/${products.length} (${batchProgress}%)`);
      }
    }
    
    processedCount += products.length;
    batchNumber++;
    
    // Show overall progress
    const overallProgress = ((processedCount / totalProducts) * 100).toFixed(1);
    console.log(`✅ Batch ${batchNumber - 1} completed! Overall: ${processedCount.toLocaleString()}/${totalProducts.toLocaleString()} (${overallProgress}%)`);
    
    // Small delay to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n🎉 TF-IDF vectors computed for all ${totalProducts.toLocaleString()} products!`);
}

async function generateUserEmbeddings() {
  const totalUsers = await User.countDocuments({
    $or: [
      { 'interactionHistory.0': { $exists: true } },
      { 'preferences.style': { $exists: true } }
    ]
  });
  
  console.log(`👤 Found ${totalUsers.toLocaleString()} users to process for embeddings...`);
  
  const batchSize = 500; // Process in batches of 500
  let processedCount = 0;
  let batchNumber = 1;
  
  while (processedCount < totalUsers) {
    const users = await User.find({
      $or: [
        { 'interactionHistory.0': { $exists: true } },
        { 'preferences.style': { $exists: true } }
      ]
    })
    .select('_id age gender height weight preferences interactionHistory')
    .skip(processedCount)
    .limit(batchSize);
    
    if (users.length === 0) break;
    
    console.log(`\n🔄 Processing user batch ${batchNumber} (${users.length} users)...`);
    console.log(`📈 Progress: ${processedCount.toLocaleString()}/${totalUsers.toLocaleString()} (${((processedCount/totalUsers)*100).toFixed(1)}%)`);
    
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const embedding = generateUserEmbedding(user);
      await User.findByIdAndUpdate(user._id, { 
        userEmbedding: embedding 
      });
      
      // Show progress every 50 users within batch
      if ((i + 1) % 50 === 0) {
        const batchProgress = ((i + 1) / users.length * 100).toFixed(1);
        console.log(`   📊 Batch progress: ${i + 1}/${users.length} (${batchProgress}%)`);
      }
    }
    
    processedCount += users.length;
    batchNumber++;
    
    // Show overall progress
    const overallProgress = ((processedCount / totalUsers) * 100).toFixed(1);
    console.log(`✅ User batch ${batchNumber - 1} completed! Overall: ${processedCount.toLocaleString()}/${totalUsers.toLocaleString()} (${overallProgress}%)`);
    
    // Small delay to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  console.log(`\n🎉 User embeddings generated for all ${totalUsers.toLocaleString()} users!`);
}

function generateUserEmbedding(user) {
  const embedding = new Array(128).fill(0);
  
  // Age-based features (0-31)
  if (user.age) {
    const ageNormalized = Math.min(user.age / 100, 1);
    embedding[0] = ageNormalized;
    embedding[1] = Math.sin(ageNormalized * Math.PI);
    embedding[2] = Math.cos(ageNormalized * Math.PI);
  }
  
  // Gender-based features (3-6)
  if (user.gender) {
    const genderMap = { 'male': 1, 'female': 2, 'other': 3 };
    embedding[3] = genderMap[user.gender] / 3;
  }
  
  // Physical features (7-12)
  if (user.height) {
    embedding[7] = Math.min(user.height / 200, 1);
  }
  if (user.weight) {
    embedding[8] = Math.min(user.weight / 150, 1);
  }
  
  // Style preferences (13-18)
  if (user.preferences?.style) {
    const styleMap = { 'casual': 1, 'formal': 2, 'sport': 3, 'vintage': 4, 'modern': 5, 'bohemian': 6 };
    embedding[13] = styleMap[user.preferences.style] / 6;
  }
  
  // Color preferences (19-29)
  if (user.preferences?.colorPreferences) {
    const colorMap = { 'black': 0, 'white': 1, 'red': 2, 'blue': 3, 'green': 4, 'yellow': 5, 'pink': 6, 'purple': 7, 'orange': 8, 'brown': 9, 'gray': 10 };
    user.preferences.colorPreferences.forEach(color => {
      if (colorMap[color] !== undefined) {
        embedding[19 + colorMap[color]] = 1;
      }
    });
  }
  
  // Price range preferences (30-31)
  if (user.preferences?.priceRange) {
    embedding[30] = Math.min(user.preferences.priceRange.min / 1000000, 1);
    embedding[31] = Math.min(user.preferences.priceRange.max / 1000000, 1);
  }
  
  // Interaction history features (32-63)
  if (user.interactionHistory && user.interactionHistory.length > 0) {
    const interactionTypes = { 'view': 1, 'like': 2, 'purchase': 3, 'cart': 4, 'review': 5 };
    const typeCounts = { 'view': 0, 'like': 0, 'purchase': 0, 'cart': 0, 'review': 0 };
    
    user.interactionHistory.forEach(interaction => {
      typeCounts[interaction.interactionType]++;
    });
    
    const totalInteractions = user.interactionHistory.length;
    Object.keys(typeCounts).forEach((type, index) => {
      embedding[32 + index] = typeCounts[type] / totalInteractions;
    });
    
    // Average rating (if available)
    const ratings = user.interactionHistory.filter(i => i.rating).map(i => i.rating);
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      embedding[37] = avgRating / 5; // Normalize to 0-1
    }
  }
  
  // Random features for the remaining dimensions (64-127)
  for (let i = 64; i < 128; i++) {
    embedding[i] = Math.random() * 0.1; // Small random values
  }
  
  // Normalize the embedding
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}

async function buildUserItemMatrix() {
  const users = await User.find({ 'interactionHistory.0': { $exists: true } })
    .select('_id interactionHistory');
  const products = await Product.find().select('_id');
  
  console.log(`Building interaction matrix: ${users.length} users x ${products.length} products`);
  
  // Create product ID to index mapping
  const productIdToIndex = new Map();
  products.forEach((product, index) => {
    productIdToIndex.set(product._id.toString(), index);
  });
  
  // Build interaction matrix
  const interactionMatrix = [];
  for (const user of users) {
    const userVector = new Array(products.length).fill(0);
    
    user.interactionHistory.forEach(interaction => {
      const productIndex = productIdToIndex.get(interaction.productId.toString());
      if (productIndex !== undefined) {
        // Weight different interaction types
        const weights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
        const weight = weights[interaction.interactionType] || 1;
        const rating = interaction.rating || 3; // Default rating if not provided
        
        userVector[productIndex] = weight * (rating / 5); // Normalize rating
      }
    });
    
    interactionMatrix.push(userVector);
  }
  
  return interactionMatrix;
}

async function createOutfitCompatibility() {
  const totalProducts = await Product.countDocuments();
  
  const batchSize = 1000; // Process in batches of 1000
  let processedCount = 0;
  let batchNumber = 1;
  
  while (processedCount < totalProducts) {
    const products = await Product.find()
      .select('_id category outfitTags compatibleProducts')
      .skip(processedCount)
      .limit(batchSize);
    
    if (products.length === 0) break;
    
    console.log(`\n🔄 Processing compatibility batch ${batchNumber} (${products.length} products)...`);
    console.log(`📈 Progress: ${processedCount.toLocaleString()}/${totalProducts.toLocaleString()} (${((processedCount/totalProducts)*100).toFixed(1)}%)`);
    
    // Get all products for compatibility checking (only once)
    const allProducts = processedCount === 0 ? await Product.find().select('_id category outfitTags') : null;
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const compatibleProducts = await findCompatibleProducts(product, allProducts || []);
      
      await Product.findByIdAndUpdate(product._id, {
        compatibleProducts: compatibleProducts.map(p => p._id)
      });
      
      // Show progress every 100 products within batch
      if ((i + 1) % 100 === 0) {
        const batchProgress = ((i + 1) / products.length * 100).toFixed(1);
        console.log(`   📊 Batch progress: ${i + 1}/${products.length} (${batchProgress}%)`);
      }
    }
    
    processedCount += products.length;
    batchNumber++;
    
    // Show overall progress
    const overallProgress = ((processedCount / totalProducts) * 100).toFixed(1);
    console.log(`✅ Compatibility batch ${batchNumber - 1} completed! Overall: ${processedCount.toLocaleString()}/${totalProducts.toLocaleString()} (${overallProgress}%)`);
    
    // Small delay to prevent overwhelming the database
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`\n🎉 Outfit compatibility data created for all ${totalProducts.toLocaleString()} products!`);
}

async function findCompatibleProducts(targetProduct, allProducts) {
  const compatible = [];
  const targetTags = targetProduct.outfitTags || [];
  const targetCategory = targetProduct.category;
  
  for (const product of allProducts) {
    if (product._id.toString() === targetProduct._id.toString()) continue;
    
    let compatibilityScore = 0;
    
    // Category compatibility
    if (product.category === targetCategory) {
      compatibilityScore += 0.3;
    }
    
    // Tag compatibility
    const productTags = product.outfitTags || [];
    const commonTags = targetTags.filter(tag => productTags.includes(tag));
    compatibilityScore += (commonTags.length / Math.max(targetTags.length, 1)) * 0.4;
    
    // Style compatibility (based on category combinations)
    if (isStyleCompatible(targetCategory, product.category)) {
      compatibilityScore += 0.3;
    }
    
    if (compatibilityScore > 0.3) {
      compatible.push({ ...product.toObject(), compatibilityScore });
    }
  }
  
  // Sort by compatibility score and return top 10
  return compatible
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore)
    .slice(0, 10);
}

function isStyleCompatible(category1, category2) {
  const compatibilityMap = {
    'Tops': ['Bottoms', 'Dresses', 'Outerwear'],
    'Bottoms': ['Tops', 'Dresses', 'Outerwear'],
    'Dresses': ['Outerwear', 'Accessories'],
    'Outerwear': ['Tops', 'Bottoms', 'Dresses'],
    'Accessories': ['Tops', 'Bottoms', 'Dresses', 'Outerwear'],
    'Shoes': ['Tops', 'Bottoms', 'Dresses']
  };
  
  return compatibilityMap[category1]?.includes(category2) || 
         compatibilityMap[category2]?.includes(category1);
}

// Run preprocessing if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  preprocess();
}

export default preprocess;
