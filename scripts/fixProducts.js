import mongoose from 'mongoose';
import natural from 'natural';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

// TF-IDF Vectorizer
class TFIDFVectorizer {
  constructor() {
    this.documents = [];
    this.vocabulary = new Set();
    this.idf = {};
    this.tfidf = [];
  }

  // Tokenize và clean text
  tokenize(text) {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase());
    
    // Remove stopwords và chỉ giữ lại từ có ý nghĩa
    const stopwords = natural.stopwords;
    return tokens.filter(token => 
      token.length > 2 && 
      !stopwords.includes(token) &&
      /^[a-zA-Z]+$/.test(token) // Chỉ giữ từ tiếng Anh
    );
  }

  // Fit documents để tạo vocabulary và IDF
  fit(documents) {
    this.documents = documents.map(doc => this.tokenize(doc));
    
    // Tạo vocabulary
    this.documents.forEach(tokens => {
      tokens.forEach(token => this.vocabulary.add(token));
    });

    // Tính IDF cho mỗi từ
    this.vocabulary.forEach(term => {
      let docCount = 0;
      this.documents.forEach(tokens => {
        if (tokens.includes(term)) {
          docCount++;
        }
      });
      this.idf[term] = Math.log(this.documents.length / docCount);
    });

    // Tính TF-IDF cho mỗi document
    this.tfidf = this.documents.map(tokens => {
      const tf = {};
      const totalTokens = tokens.length;
      
      // Tính TF
      tokens.forEach(token => {
        tf[token] = (tf[token] || 0) + 1;
      });

      // Normalize TF
      Object.keys(tf).forEach(token => {
        tf[token] = tf[token] / totalTokens;
      });

      // Tính TF-IDF vector
      const vector = [];
      const vocabularyArray = Array.from(this.vocabulary);
      
      vocabularyArray.forEach(term => {
        const tfValue = tf[term] || 0;
        const idfValue = this.idf[term] || 0;
        vector.push(tfValue * idfValue);
      });

      return vector;
    });

    return this;
  }

  // Transform new document
  transform(text) {
    const tokens = this.tokenize(text);
    const tf = {};
    const totalTokens = tokens.length;
    
    if (totalTokens === 0) return new Array(this.vocabulary.size).fill(0);

    // Tính TF
    tokens.forEach(token => {
      tf[token] = (tf[token] || 0) + 1;
    });

    // Normalize TF
    Object.keys(tf).forEach(token => {
      tf[token] = tf[token] / totalTokens;
    });

    // Tính TF-IDF vector
    const vector = [];
    const vocabularyArray = Array.from(this.vocabulary);
    
    vocabularyArray.forEach(term => {
      const tfValue = tf[term] || 0;
      const idfValue = this.idf[term] || 0;
      vector.push(tfValue * idfValue);
    });

    return vector;
  }
}

// Hàm phân loại sản phẩm dựa trên tên
function categorizeProduct(name) {
  const nameLower = name.toLowerCase();
  
  // Tops
  if (nameLower.includes('shirt') || nameLower.includes('tee') || nameLower.includes('t-shirt') || 
      nameLower.includes('blouse') || nameLower.includes('top') || nameLower.includes('polo')) {
    return 'Tops';
  }
  
  // Bottoms
  if (nameLower.includes('pant') || nameLower.includes('jean') || nameLower.includes('short') ||
      nameLower.includes('trouser') || nameLower.includes('legging') || nameLower.includes('skirt')) {
    return 'Bottoms';
  }
  
  // Dresses
  if (nameLower.includes('dress') || nameLower.includes('gown') || nameLower.includes('jumpsuit')) {
    return 'Dresses';
  }
  
  // Shoes
  if (nameLower.includes('shoe') || nameLower.includes('sock') || nameLower.includes('sneaker') ||
      nameLower.includes('boot') || nameLower.includes('sandal') || nameLower.includes('heel')) {
    return 'Shoes';
  }
  
  // Accessories
  if (nameLower.includes('bag') || nameLower.includes('hat') || nameLower.includes('belt') ||
      nameLower.includes('watch') || nameLower.includes('jewelry') || nameLower.includes('scarf') ||
      nameLower.includes('glove') || nameLower.includes('sunglass')) {
    return 'Accessories';
  }
  
  // Mặc định
  return 'Other';
}

// Hàm chọn sản phẩm tương thích ngẫu nhiên
function getCompatibleProducts(productId, category, allProducts, count = 3) {
  const sameCategoryProducts = allProducts.filter(p => 
    p.category === category && 
    p._id.toString() !== productId.toString()
  );
  
  if (sameCategoryProducts.length === 0) return [];
  
  // Shuffle và lấy số lượng cần thiết
  const shuffled = sameCategoryProducts.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(p => p._id);
}

// Hàm chính để fix products
async function fixProducts() {
  try {
    console.log('🔗 Connecting to database...');
    console.log('   - MongoDB URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
    
    // Set timeout cho connection
    const connectPromise = connectDB();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Database connection timeout')), 30000)
    );
    
    await Promise.race([connectPromise, timeoutPromise]);
    console.log('   - Database connected successfully');
    
    // Đếm tổng số products trước
    console.log('📊 Counting total products...');
    const totalProducts = await Product.countDocuments({});
    console.log(`Found ${totalProducts} products to process`);
    
    if (totalProducts === 0) {
      console.log('❌ No products found in database');
      return;
    }

    // Cấu hình batch processing
    const BATCH_SIZE = 100; // Xử lý 100 sản phẩm mỗi lần
    const totalBatches = Math.ceil(totalProducts / BATCH_SIZE);
    
    console.log(`🔄 Processing in ${totalBatches} batches of ${BATCH_SIZE} products each`);
    console.log('');

    // Lấy sample products để hiển thị
    console.log('🔍 Sample products:');
    const sampleProducts = await Product.find({}).limit(3);
    sampleProducts.forEach((product, index) => {
      console.log(`   ${index + 1}. "${product.name}" - Category: "${product.category}" - FeatureVector: ${product.featureVector?.length || 0} elements`);
    });
    console.log('');

    // Chuẩn bị TF-IDF với sample data trước
    console.log('🔤 Preparing TF-IDF vocabulary...');
    const sampleDocs = sampleProducts.map(product => 
      `${product.name} ${product.description} ${product.brand} ${product.category}`
    );
    
    // Lấy thêm documents để build vocabulary tốt hơn
    const moreDocs = await Product.find({}).limit(1000).select('name description brand category');
    const allDocs = moreDocs.map(product => 
      `${product.name} ${product.description} ${product.brand} ${product.category}`
    );
    
    const vectorizer = new TFIDFVectorizer();
    vectorizer.fit(allDocs);
    console.log(`   - Vocabulary size: ${vectorizer.vocabulary.size}`);
    console.log('');

    // Xử lý từng batch
    let totalProcessed = 0;
    let featureVectorCount = 0;
    let categoryUpdateCount = 0;
    let compatibleProductsCount = 0;
    const startTime = Date.now();

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const skip = batchIndex * BATCH_SIZE;
      console.log(`📦 Processing batch ${batchIndex + 1}/${totalBatches} (products ${skip + 1}-${Math.min(skip + BATCH_SIZE, totalProducts)})`);
      
      // Lấy batch products
      const batchProducts = await Product.find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(); // Sử dụng lean() để giảm memory usage
      
      console.log(`   - Loaded ${batchProducts.length} products in memory`);
      
      // Lấy products để tính compatible products (chỉ cần ID và category)
      // Cache này sẽ được tái sử dụng cho các batch tiếp theo
      if (!global.allProductsForCompatibility) {
        console.log('   - Loading all products for compatibility calculation...');
        global.allProductsForCompatibility = await Product.find({})
          .select('_id category')
          .lean();
        console.log(`   - Loaded ${global.allProductsForCompatibility.length} products for compatibility`);
      }
      
      // Xử lý từng sản phẩm trong batch
      for (let i = 0; i < batchProducts.length; i++) {
        const product = batchProducts[i];
        const updates = {};
        
        // 1. Tính featureVector
        const document = `${product.name} ${product.description} ${product.brand} ${product.category}`;
        const featureVector = vectorizer.transform(document);
        updates.featureVector = featureVector;
        featureVectorCount++;
        
        // 2. Cập nhật category nếu cần
        const newCategory = categorizeProduct(product.name);
        if (product.category === 'other' || !product.category) {
          updates.category = newCategory;
          categoryUpdateCount++;
        }
        
        // 3. Cập nhật compatibleProducts nếu rỗng
        if (!product.compatibleProducts || product.compatibleProducts.length === 0) {
          const compatibleIds = getCompatibleProducts(
            product._id, 
            updates.category || product.category, 
            global.allProductsForCompatibility
          );
          updates.compatibleProducts = compatibleIds;
          compatibleProductsCount++;
        }
        
        // Cập nhật sản phẩm
        await Product.findByIdAndUpdate(product._id, updates);
        totalProcessed++;
      }
      
      // Progress update sau mỗi batch
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const progress = ((batchIndex + 1) / totalBatches * 100).toFixed(1);
      const avgTimePerBatch = elapsed / (batchIndex + 1);
      const remainingBatches = totalBatches - (batchIndex + 1);
      const estimatedTimeRemaining = (remainingBatches * avgTimePerBatch).toFixed(1);
      
      console.log(`   ✅ Batch ${batchIndex + 1} completed`);
      console.log(`   📊 Overall Progress: ${progress}% (${totalProcessed}/${totalProducts}) | Time: ${elapsed}s`);
      console.log(`   - Feature Vectors: ${featureVectorCount}`);
      console.log(`   - Category Updates: ${categoryUpdateCount}`);
      console.log(`   - Compatible Products: ${compatibleProductsCount}`);
      console.log(`   - Estimated time remaining: ${estimatedTimeRemaining}s`);
      console.log('');
      
      // Force garbage collection sau mỗi batch
      if (global.gc) {
        global.gc();
      }
    }

    console.log(`✅ Successfully processed ${totalProcessed} products`);
    
    // Thống kê
    const stats = await Product.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgFeatureVectorLength: { $avg: { $size: '$featureVector' } },
          avgCompatibleProducts: { $avg: { $size: '$compatibleProducts' } }
        }
      }
    ]);
    
    console.log('\n📈 Statistics:');
    stats.forEach(stat => {
      console.log(`Category: ${stat._id}`);
      console.log(`  - Count: ${stat.count}`);
      console.log(`  - Avg Feature Vector Length: ${stat.avgFeatureVectorLength?.toFixed(2) || 'N/A'}`);
      console.log(`  - Avg Compatible Products: ${stat.avgCompatibleProducts?.toFixed(2) || 'N/A'}`);
    });

  } catch (error) {
    console.error('❌ Error fixing products:', error);
    throw error;
  } finally {
    // Cleanup global cache
    if (global.allProductsForCompatibility) {
      delete global.allProductsForCompatibility;
    }
    
    await disconnectDB();
    console.log('🔌 Disconnected from database');
  }
}

// Chạy script nếu được gọi trực tiếp
if (import.meta.url === `file://${process.argv[1]}`) {
  fixProducts()
    .then(() => {
      console.log('🎉 Product fixing completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Product fixing failed:', error);
      process.exit(1);
    });
}

export default fixProducts;
