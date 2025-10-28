import mongoose from 'mongoose';
import natural from 'natural';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import User from './models/userModel.js';
import Outfit from './models/outfitModel.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI + 'novaware');

const tfidf = new natural.TfIdf();

async function preprocess() {
  try {
    await computeProductFeatureVectors();
    await generateUserEmbeddings();
    await buildUserItemMatrix();
    await createOutfitCompatibility();

  } catch (error) {
  } finally {
    mongoose.disconnect();
  }
}

async function computeProductFeatureVectors() {
  const totalProducts = await Product.countDocuments();

  const batchSize = 1000;
  let processedCount = 0;
  let batchNumber = 1;

  while (processedCount < totalProducts) {
    const products = await Product.find()
      .select('_id name description category brand outfitTags')
      .skip(processedCount)
      .limit(batchSize);

    if (products.length === 0) break;

    products.forEach(product => {
      const text = `${product.name} ${product.description} ${product.category} ${product.brand} ${product.outfitTags?.join(' ') || ''}`;
      tfidf.addDocument(text.toLowerCase());
    });

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const text = `${product.name} ${product.description} ${product.category} ${product.brand} ${product.outfitTags?.join(' ') || ''}`;

      const featureVector = [];
      tfidf.tfidfs(text.toLowerCase(), (index, measure) => {
        featureVector[index] = measure;
      });

      const magnitude = Math.sqrt(featureVector.reduce((sum, val) => sum + val * val, 0));
      const normalizedVector = magnitude > 0 ? featureVector.map(val => val / magnitude) : featureVector;

      await Product.findByIdAndUpdate(product._id, {
        featureVector: normalizedVector
      });

      if ((i + 1) % 100 === 0) {
      }
    }

    processedCount += products.length;
    batchNumber++;

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function generateUserEmbeddings() {
  const totalUsers = await User.countDocuments({
    $or: [
      { 'interactionHistory.0': { $exists: true } },
      { 'preferences.style': { $exists: true } }
    ]
  });

  const batchSize = 500;
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

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      const embedding = generateUserEmbedding(user);
      await User.findByIdAndUpdate(user._id, {
        userEmbedding: embedding
      });

      if ((i + 1) % 50 === 0) {
      }
    }

    processedCount += users.length;
    batchNumber++;

    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

function generateUserEmbedding(user) {
  const embedding = new Array(128).fill(0);

  if (user.age) {
    const ageNormalized = Math.min(user.age / 100, 1);
    embedding[0] = ageNormalized;
    embedding[1] = Math.sin(ageNormalized * Math.PI);
    embedding[2] = Math.cos(ageNormalized * Math.PI);
  }

  if (user.gender) {
    const genderMap = { 'male': 1, 'female': 2, 'other': 3 };
    embedding[3] = genderMap[user.gender] / 3;
  }

  if (user.height) {
    embedding[7] = Math.min(user.height / 200, 1);
  }
  if (user.weight) {
    embedding[8] = Math.min(user.weight / 150, 1);
  }

  if (user.preferences?.style) {
    const styleMap = { 'casual': 1, 'formal': 2, 'sport': 3, 'vintage': 4, 'modern': 5, 'bohemian': 6 };
    embedding[13] = styleMap[user.preferences.style] / 6;
  }

  if (user.preferences?.colorPreferences) {
    const colorMap = { 'black': 0, 'white': 1, 'red': 2, 'blue': 3, 'green': 4, 'yellow': 5, 'pink': 6, 'purple': 7, 'orange': 8, 'brown': 9, 'gray': 10 };
    user.preferences.colorPreferences.forEach(color => {
      if (colorMap[color] !== undefined) {
        embedding[19 + colorMap[color]] = 1;
      }
    });
  }

  if (user.preferences?.priceRange) {
    embedding[30] = Math.min(user.preferences.priceRange.min / 1000000, 1);
    embedding[31] = Math.min(user.preferences.priceRange.max / 1000000, 1);
  }

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

    const ratings = user.interactionHistory.filter(i => i.rating).map(i => i.rating);
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      embedding[37] = avgRating / 5;
    }
  }

  for (let i = 64; i < 128; i++) {
    embedding[i] = Math.random() * 0.1;
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
}

async function buildUserItemMatrix() {
  const users = await User.find({ 'interactionHistory.0': { $exists: true } })
    .select('_id interactionHistory');
  const products = await Product.find().select('_id');

  const productIdToIndex = new Map();
  products.forEach((product, index) => {
    productIdToIndex.set(product._id.toString(), index);
  });

  const interactionMatrix = [];
  for (const user of users) {
    const userVector = new Array(products.length).fill(0);

    user.interactionHistory.forEach(interaction => {
      const productIndex = productIdToIndex.get(interaction.productId.toString());
      if (productIndex !== undefined) {
        const weights = { 'view': 1, 'like': 2, 'cart': 3, 'purchase': 5, 'review': 4 };
        const weight = weights[interaction.interactionType] || 1;
        const rating = interaction.rating || 3;

        userVector[productIndex] = weight * (rating / 5);
      }
    });

    interactionMatrix.push(userVector);
  }

  return interactionMatrix;
}

async function createOutfitCompatibility() {
  const totalProducts = await Product.countDocuments();

  const batchSize = 1000;
  let processedCount = 0;
  let batchNumber = 1;

  while (processedCount < totalProducts) {
    const products = await Product.find()
      .select('_id category outfitTags compatibleProducts')
      .skip(processedCount)
      .limit(batchSize);

    if (products.length === 0) break;

    const allProducts = processedCount === 0 ? await Product.find().select('_id category outfitTags') : null;

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const compatibleProducts = await findCompatibleProducts(product, allProducts || []);

      await Product.findByIdAndUpdate(product._id, {
        compatibleProducts: compatibleProducts.map(p => p._id)
      });

      if ((i + 1) % 100 === 0) {
      }
    }

    processedCount += products.length;
    batchNumber++;

    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

async function findCompatibleProducts(targetProduct, allProducts) {
  const compatible = [];
  const targetTags = targetProduct.outfitTags || [];
  const targetCategory = targetProduct.category;

  for (const product of allProducts) {
    if (product._id.toString() === targetProduct._id.toString()) continue;

    let compatibilityScore = 0;

    if (product.category === targetCategory) {
      compatibilityScore += 0.3;
    }

    const productTags = product.outfitTags || [];
    const commonTags = targetTags.filter(tag => productTags.includes(tag));
    compatibilityScore += (commonTags.length / Math.max(targetTags.length, 1)) * 0.4;

    if (isStyleCompatible(targetCategory, product.category)) {
      compatibilityScore += 0.3;
    }

    if (compatibilityScore > 0.3) {
      compatible.push({ ...product.toObject(), compatibilityScore });
    }
  }

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

if (import.meta.url === `file://${process.argv[1]}`) {
  preprocess();
}

export default preprocess;