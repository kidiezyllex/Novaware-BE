import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BATCH_SIZE = 1000; // Xử lý theo batch để tránh quá tải bộ nhớ

// Đường dẫn đến file dữ liệu
const REVIEW_FILE = path.join(__dirname, '../data/Amazon_Fashion.jsonl');
const META_FILE = path.join(__dirname, '../data/meta_Amazon_Fashion.jsonl');

/**
 * Đọc file JSONL bằng stream (không load toàn bộ vào memory)
 */
async function* readJsonlFileStream(filePath) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    
    try {
      yield JSON.parse(trimmedLine);
    } catch (error) {
      console.error(`Lỗi parse dòng trong file ${filePath}:`, error.message);
    }
  }
}

/**
 * Đọc file JSONL và trả về Map theo key (streaming, tiết kiệm memory)
 */
async function readJsonlFileToMap(filePath, keyField) {
  const map = new Map();
  let count = 0;
  
  for await (const item of readJsonlFileStream(filePath)) {
    const key = item[keyField];
    if (!key) continue;
    
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(item);
    count++;
    
    if (count % 10000 === 0) {
      console.log(`   Đã đọc ${count.toLocaleString()} dòng...`);
    }
  }
  
  return { map, count };
}

/**
 * Tạo Set từ array để tìm kiếm nhanh
 */
function createLookupSet(array, key) {
  return new Set(array.map(item => item[key]).filter(Boolean));
}

/**
 * Hàm tính độ tương đồng giữa 2 chuỗi (Levenshtein distance)
 */
function stringSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Nếu một trong hai chuỗi chứa chuỗi kia, trả về điểm cao
  if (s1.includes(s2) || s2.includes(s1)) {
    return 0.8;
  }
  
  // Tính độ tương đồng đơn giản bằng cách so sánh các từ chung
  const words1 = new Set(s1.split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(s2.split(/\s+/).filter(w => w.length > 2));
  const intersection = [...words1].filter(w => words2.has(w));
  const union = [...new Set([...words1, ...words2])];
  
  if (union.length === 0) return 0;
  return intersection.length / union.length;
}

/**
 * Match products bằng name với title trong meta file (tối ưu)
 */
async function matchProductsByName(productsByParentAsin) {
  console.log('\n🔍 Bước 1: Đang match products bằng tên...');
  console.log('='.repeat(60));
  
  // Lấy tất cả products từ database (chưa có amazonParentAsin)
  const allProducts = await Product.find({
    $or: [
      { amazonParentAsin: { $exists: false } },
      { amazonParentAsin: null }
    ]
  }).select('_id name').lean();
  
  console.log(`📦 Số products cần match: ${allProducts.length.toLocaleString()}`);
  console.log(`📦 Số parent_asins trong meta file: ${productsByParentAsin.size.toLocaleString()}`);
  
  // Tạo index theo title để tìm kiếm nhanh hơn
  // title (normalized) -> parentAsin
  const titleIndex = new Map();
  // keyword -> [parentAsin1, parentAsin2, ...]
  const keywordIndex = new Map();
  
  console.log('📊 Đang tạo index từ meta file...');
  let indexCount = 0;
  for (const [parentAsin, metaProducts] of productsByParentAsin.entries()) {
    const firstMeta = metaProducts[0];
    if (firstMeta && firstMeta.title) {
      const normalizedTitle = firstMeta.title.toLowerCase().trim();
      // Exact match
      if (!titleIndex.has(normalizedTitle)) {
        titleIndex.set(normalizedTitle, parentAsin);
        indexCount++;
      }
      
      // Keywords index (từ khóa dài hơn 4 ký tự)
      const keywords = normalizedTitle.split(/\s+/).filter(w => w.length > 4);
      for (const keyword of keywords.slice(0, 5)) { // Lấy 5 từ đầu tiên
        if (!keywordIndex.has(keyword)) {
          keywordIndex.set(keyword, []);
        }
        keywordIndex.get(keyword).push(parentAsin);
      }
    }
    
    if (indexCount % 100000 === 0) {
      console.log(`   Đã index: ${indexCount.toLocaleString()} titles...`);
    }
  }
  
  console.log(`📊 Đã tạo index: ${titleIndex.size} exact titles, ${keywordIndex.size} keywords`);
  
  let matchedCount = 0;
  const updates = [];
  
  // Duyệt qua từng product trong database
  console.log('\n🔍 Đang match products...');
  for (let i = 0; i < allProducts.length; i++) {
    const dbProduct = allProducts[i];
    if (!dbProduct.name) continue;
    
    const normalizedName = dbProduct.name.toLowerCase().trim();
    let bestMatch = null;
    let bestScore = 0;
    let bestParentAsin = null;
    const candidates = new Set();
    
    // Thử exact match trước
    if (titleIndex.has(normalizedName)) {
      bestParentAsin = titleIndex.get(normalizedName);
      bestScore = 1.0;
    } else {
      // Tìm candidates bằng keywords
      const productKeywords = normalizedName.split(/\s+/).filter(w => w.length > 4);
      for (const keyword of productKeywords) {
        if (keywordIndex.has(keyword)) {
          keywordIndex.get(keyword).forEach(asin => candidates.add(asin));
        }
      }
      
      // Nếu có candidates, chỉ so sánh với các candidates này
      if (candidates.size > 0) {
        const candidatesArray = Array.from(candidates).slice(0, 100); // Giới hạn 100 candidates
        for (const parentAsin of candidatesArray) {
          const metaProducts = productsByParentAsin.get(parentAsin);
          if (!metaProducts || metaProducts.length === 0) continue;
          
          const meta = metaProducts[0];
          if (!meta || !meta.title) continue;
          
          const score = stringSimilarity(dbProduct.name, meta.title);
          if (score > bestScore && score > 0.4) {
            bestScore = score;
            bestParentAsin = parentAsin;
            
            // Nếu score rất cao, dừng lại
            if (score > 0.8) break;
          }
        }
      } else {
        // Nếu không có candidates, thử tìm với một số parent_asins ngẫu nhiên (giới hạn)
        const sampleSize = Math.min(1000, productsByParentAsin.size);
        const sampleAsins = Array.from(productsByParentAsin.keys()).slice(0, sampleSize);
        for (const parentAsin of sampleAsins) {
          const metaProducts = productsByParentAsin.get(parentAsin);
          if (!metaProducts || metaProducts.length === 0) continue;
          
          const meta = metaProducts[0];
          if (!meta || !meta.title) continue;
          
          const score = stringSimilarity(dbProduct.name, meta.title);
          if (score > bestScore && score > 0.4) {
            bestScore = score;
            bestParentAsin = parentAsin;
            if (score > 0.8) break;
          }
        }
      }
    }
    
    // Nếu tìm thấy match tốt, set amazonParentAsin
    if (bestParentAsin && bestScore > 0.4) {
      updates.push({
        updateOne: {
          filter: { _id: dbProduct._id },
          update: { $set: { amazonParentAsin: bestParentAsin } }
        }
      });
      matchedCount++;
      
      if (matchedCount % 50 === 0 || i % 500 === 0) {
        console.log(`   🔍 Đang xử lý: ${i + 1}/${allProducts.length} products, đã match: ${matchedCount}...`);
      }
    }
    
    // Batch update
    if (updates.length >= 500) {
      await Product.bulkWrite(updates, { ordered: false });
      updates.length = 0;
    }
  }
  
  // Update phần còn lại
  if (updates.length > 0) {
    await Product.bulkWrite(updates, { ordered: false });
  }
  
  console.log(`\n✅ Đã match và set amazonParentAsin cho ${matchedCount} products`);
  console.log(`📊 Tỷ lệ match: ${((matchedCount / allProducts.length) * 100).toFixed(2)}%`);
  console.log('='.repeat(60));
  
  return matchedCount;
}

/**
 * Bổ sung dữ liệu products từ meta file
 */
async function enrichProducts(productsByParentAsin) {
  console.log('\n📦 Bước 2: Bắt đầu bổ sung dữ liệu products...');
  console.log('='.repeat(60));
  
  let updatedCount = 0;
  let skippedCount = 0;
  let notFoundCount = 0;
  
  console.log(`📊 Tìm thấy ${productsByParentAsin.size} parent_asins trong meta file`);
  
  // Tìm products trong database theo amazonParentAsin (sau khi đã match)
  const parentAsins = Array.from(productsByParentAsin.keys());
  let processed = 0;
  
  for (let i = 0; i < parentAsins.length; i += BATCH_SIZE) {
    const batch = parentAsins.slice(i, i + BATCH_SIZE);
    processed += batch.length;
    
    console.log(`\n📦 Đang xử lý batch ${Math.floor(i / BATCH_SIZE) + 1} (${processed}/${parentAsins.length} parent_asins)...`);
    
    const products = await Product.find({
      amazonParentAsin: { $in: batch }
    }).lean();
    
    const productMap = new Map();
    products.forEach(p => {
      if (p.amazonParentAsin) {
        if (!productMap.has(p.amazonParentAsin)) {
          productMap.set(p.amazonParentAsin, []);
        }
        productMap.get(p.amazonParentAsin).push(p);
      }
    });
    
    // Cập nhật từng product
    for (const parentAsin of batch) {
      const metaProduct = productsByParentAsin.get(parentAsin);
      if (!metaProduct || metaProduct.length === 0) continue;
      
      // Lấy meta product đầu tiên (thường chỉ có 1)
      const meta = metaProduct[0];
      const dbProducts = productMap.get(parentAsin) || [];
      
      if (dbProducts.length === 0) {
        notFoundCount++;
        continue;
      }
      
      // Cập nhật tất cả products có cùng parent_asin
      for (const dbProduct of dbProducts) {
        const updateData = {};
        
        // Cập nhật các field từ meta data (bổ sung, không ghi đè nếu đã có)
        if (meta.title && (!dbProduct.name || dbProduct.name.trim() === '')) {
          updateData.name = meta.title;
        }
        if (meta.average_rating !== undefined && meta.average_rating !== null) {
          updateData.rating = meta.average_rating;
        }
        if (meta.rating_number !== undefined && meta.rating_number !== null) {
          updateData.numReviews = meta.rating_number;
        }
        if (meta.price !== null && meta.price !== undefined && meta.price > 0) {
          updateData.price = meta.price;
        }
        if (meta.description) {
          if (Array.isArray(meta.description) && meta.description.length > 0) {
            const desc = meta.description.join('\n');
            if (!dbProduct.description || dbProduct.description.trim() === '' || dbProduct.description === 'No description') {
              updateData.description = desc;
            }
          } else if (typeof meta.description === 'string' && meta.description.trim()) {
            if (!dbProduct.description || dbProduct.description.trim() === '' || dbProduct.description === 'No description') {
              updateData.description = meta.description;
            }
          }
        }
        if (meta.images && Array.isArray(meta.images) && meta.images.length > 0) {
          // Lấy large images hoặc hi_res images
          const imageUrls = meta.images
            .map(img => img.large || img.hi_res || img.thumb)
            .filter(Boolean);
          if (imageUrls.length > 0) {
            // Kết hợp với images hiện có, loại bỏ trùng lặp
            const existingImages = dbProduct.images || [];
            updateData.images = [...new Set([...existingImages, ...imageUrls])];
          }
        }
        if (meta.store && (!dbProduct.brand || dbProduct.brand.trim() === '')) {
          updateData.brand = meta.store;
        }
        if (meta.main_category && (!dbProduct.category || dbProduct.category.trim() === '')) {
          updateData.category = meta.main_category;
        }
        
        // Đảm bảo amazonParentAsin được set
        if (!dbProduct.amazonParentAsin) {
          updateData.amazonParentAsin = parentAsin;
        }
        
        if (Object.keys(updateData).length > 0) {
          await Product.updateOne(
            { _id: dbProduct._id },
            { $set: updateData }
          );
          updatedCount++;
        } else {
          skippedCount++;
        }
      }
    }
    
    console.log(`   ✅ Đã xử lý: ${updatedCount} updated, ${skippedCount} skipped, ${notFoundCount} not found`);
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TỔNG KẾT BỔ SUNG PRODUCTS:');
  console.log(`   ✅ Đã cập nhật: ${updatedCount} products`);
  console.log(`   ⏭️  Đã bỏ qua: ${skippedCount} products (không có thay đổi)`);
  console.log(`   ❌ Không tìm thấy: ${notFoundCount} parent_asins`);
  console.log('='.repeat(60));
  
  return { updatedCount, skippedCount, notFoundCount };
}

/**
 * Bổ sung dữ liệu users và reviews từ review file
 */
async function enrichUsersAndReviews(reviewsByUser, reviewsByProduct) {
  console.log('\n👥 Bắt đầu bổ sung dữ liệu users và reviews...');
  console.log('='.repeat(60));
  
  let userCreatedCount = 0;
  let userUpdatedCount = 0;
  let reviewAddedCount = 0;
  let reviewSkippedCount = 0;
  let productNotFoundCount = 0;
  
  console.log(`📊 Tìm thấy ${reviewsByUser.size} users và ${reviewsByProduct.size} products trong review file`);
  
  // Bước 1: Xử lý users
  console.log('\n👥 Bước 1: Xử lý users...');
  const MAX_USERS = 2512; // Giới hạn số lượng users tối đa (ít hơn số products)
  console.log(`⚠️  Giới hạn số lượng users: ${MAX_USERS} users`);
  
  // Đếm số users hiện có trong database
  const existingUserCount = await User.countDocuments();
  console.log(`📊 Số users hiện có trong database: ${existingUserCount}`);
  
  const userIds = Array.from(reviewsByUser.keys());
  let userProcessed = 0;
  
  for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
    // Kiểm tra giới hạn
    if (userCreatedCount >= MAX_USERS) {
      console.log(`\n⚠️  Đã đạt giới hạn ${MAX_USERS} users. Dừng tạo users mới.`);
      break;
    }
    
    const batch = userIds.slice(i, i + BATCH_SIZE);
    userProcessed += batch.length;
    
    console.log(`\n👥 Đang xử lý batch users ${Math.floor(i / BATCH_SIZE) + 1} (${userProcessed}/${userIds.length} users)...`);
    
    // Tìm users trong database
    const users = await User.find({
      amazonUserId: { $in: batch }
    }).lean();
    
    const userMap = new Map();
    users.forEach(u => {
      if (u.amazonUserId) {
        userMap.set(u.amazonUserId, u);
      }
    });
    
    // Tạo hoặc cập nhật users
    const usersToCreate = [];
    const usersToUpdate = [];
    
    for (const userId of batch) {
      // Kiểm tra giới hạn trước khi thêm vào danh sách tạo
      if (userCreatedCount >= MAX_USERS) {
        break;
      }
      
      const userReviews = reviewsByUser.get(userId);
      if (!userReviews || userReviews.length === 0) continue;
      
      let user = userMap.get(userId);
      
      if (!user) {
        // Tạo user mới nếu chưa tồn tại (chỉ khi chưa đạt giới hạn)
        if (userCreatedCount < MAX_USERS) {
          usersToCreate.push({
            name: `Amazon User ${userId.substring(0, 8)}`,
            email: `amazon_${userId}@placeholder.com`,
            password: null, // Không có password cho Amazon users
            isAdmin: false,
            amazonUserId: userId,
          });
        }
      } else {
        // Đảm bảo amazonUserId được set (không tính vào giới hạn)
        if (!user.amazonUserId) {
          usersToUpdate.push({ _id: user._id, amazonUserId: userId });
        }
      }
    }
    
    // Batch create users (chỉ tạo đến khi đạt giới hạn)
    if (usersToCreate.length > 0) {
      const remainingSlots = MAX_USERS - userCreatedCount;
      if (remainingSlots > 0) {
        const usersToInsert = usersToCreate.slice(0, remainingSlots);
        await User.insertMany(usersToInsert, { ordered: false });
        userCreatedCount += usersToInsert.length;
        
        if (usersToCreate.length > remainingSlots) {
          console.log(`   ⚠️  Đã đạt giới hạn, chỉ tạo ${remainingSlots}/${usersToCreate.length} users`);
        }
      }
    }
    
    // Batch update users
    if (usersToUpdate.length > 0) {
      const updatePromises = usersToUpdate.map(({ _id, amazonUserId }) =>
        User.updateOne({ _id }, { $set: { amazonUserId } })
      );
      await Promise.all(updatePromises);
      userUpdatedCount += usersToUpdate.length;
    }
    
    if (usersToCreate.length > 0 || usersToUpdate.length > 0) {
      console.log(`   ✅ Đã xử lý: ${Math.min(usersToCreate.length, MAX_USERS - (userCreatedCount - usersToCreate.length))} users mới, ${usersToUpdate.length} users cập nhật`);
      console.log(`   📊 Tổng số users đã tạo: ${userCreatedCount}/${MAX_USERS}`);
    }
    
    // Dừng nếu đã đạt giới hạn
    if (userCreatedCount >= MAX_USERS) {
      console.log(`\n⚠️  Đã đạt giới hạn ${MAX_USERS} users. Dừng tạo users mới.`);
      break;
    }
  }
  
  console.log(`\n📊 TỔNG KẾT USERS:`);
  console.log(`   ✅ Đã tạo: ${userCreatedCount} users mới`);
  console.log(`   ✅ Đã cập nhật: ${userUpdatedCount} users`);
  
  // Bước 2: Xử lý reviews
  console.log('\n📝 Bước 2: Xử lý reviews...');
  const parentAsins = Array.from(reviewsByProduct.keys());
  let reviewProcessed = 0;
  
  for (let i = 0; i < parentAsins.length; i += BATCH_SIZE) {
    const batch = parentAsins.slice(i, i + BATCH_SIZE);
    reviewProcessed += batch.length;
    
    console.log(`\n📝 Đang xử lý batch reviews ${Math.floor(i / BATCH_SIZE) + 1} (${reviewProcessed}/${parentAsins.length} products)...`);
    
    // Tìm products trong database
    const products = await Product.find({
      amazonParentAsin: { $in: batch }
    }).lean();
    
    const productMap = new Map();
    products.forEach(p => {
      if (p.amazonParentAsin) {
        if (!productMap.has(p.amazonParentAsin)) {
          productMap.set(p.amazonParentAsin, []);
        }
        productMap.get(p.amazonParentAsin).push(p);
      }
    });
    
    // Lấy tất cả users cần thiết
    const neededUserIds = new Set();
    batch.forEach(parentAsin => {
      const productReviews = reviewsByProduct.get(parentAsin) || [];
      productReviews.forEach(review => {
        if (review.user_id) {
          neededUserIds.add(review.user_id);
        }
      });
    });
    
    const users = await User.find({
      amazonUserId: { $in: Array.from(neededUserIds) }
    }).lean();
    
    const userMap = new Map();
    users.forEach(u => {
      if (u.amazonUserId) {
        userMap.set(u.amazonUserId, u);
      }
    });
    
    // Thêm reviews vào products (batch update để tối ưu)
    const productUpdates = [];
    let batchReviewAdded = 0;
    let batchReviewSkipped = 0;
    
    for (const parentAsin of batch) {
      const productReviews = reviewsByProduct.get(parentAsin) || [];
      const dbProducts = productMap.get(parentAsin) || [];
      
      if (dbProducts.length === 0) {
        productNotFoundCount += productReviews.length;
        continue;
      }
      
      // Thêm reviews vào tất cả products có cùng parent_asin
      for (const dbProduct of dbProducts) {
        // Lấy product với reviews hiện có
        const product = await Product.findById(dbProduct._id).lean();
        if (!product) continue;
        
        const existingReviews = product.reviews || [];
        const newReviews = [];
        const existingReviewComments = new Set(
          existingReviews.map(r => {
            const userId = r.user?.toString ? r.user.toString() : String(r.user);
            return `${userId}_${r.comment || ''}`;
          })
        );
        
        for (const reviewData of productReviews) {
          const user = userMap.get(reviewData.user_id);
          if (!user) continue;
          
          const reviewKey = `${user._id.toString()}_${reviewData.text || reviewData.title || ''}`;
          
          // Kiểm tra xem review đã tồn tại chưa
          if (existingReviewComments.has(reviewKey)) {
            batchReviewSkipped++;
            continue;
          }
          
          // Tạo review mới
          const newReview = {
            name: `Amazon User ${reviewData.user_id.substring(0, 8)}`,
            rating: reviewData.rating || 0,
            comment: reviewData.text || reviewData.title || 'No comment',
            user: user._id,
            createdAt: reviewData.timestamp ? new Date(reviewData.timestamp) : new Date(),
          };
          
          newReviews.push(newReview);
          existingReviewComments.add(reviewKey);
          batchReviewAdded++;
        }
        
        // Nếu có reviews mới, thêm vào danh sách update
        if (newReviews.length > 0) {
          const allReviews = [...existingReviews, ...newReviews];
          const totalRating = allReviews.reduce((sum, r) => sum + r.rating, 0);
          const avgRating = totalRating / allReviews.length;
          
          productUpdates.push({
            updateOne: {
              filter: { _id: dbProduct._id },
              update: {
                $push: { reviews: { $each: newReviews } },
                $set: {
                  rating: avgRating,
                  numReviews: allReviews.length
                }
              }
            }
          });
        }
      }
    }
    
    // Batch update products
    if (productUpdates.length > 0) {
      try {
        await Product.bulkWrite(productUpdates, { ordered: false });
        reviewAddedCount += batchReviewAdded;
        reviewSkippedCount += batchReviewSkipped;
        console.log(`   ✅ Đã thêm: ${batchReviewAdded} reviews mới, bỏ qua: ${batchReviewSkipped} reviews`);
      } catch (error) {
        console.error(`   ⚠️  Lỗi khi update batch: ${error.message}`);
        // Fallback: update từng product nếu bulkWrite fail
        for (const update of productUpdates) {
          try {
            await Product.updateOne(update.updateOne.filter, update.updateOne.update);
          } catch (err) {
            console.error(`   ❌ Lỗi update product ${update.updateOne.filter._id}: ${err.message}`);
          }
        }
      }
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 TỔNG KẾT REVIEWS:');
  console.log(`   ✅ Đã thêm: ${reviewAddedCount} reviews`);
  console.log(`   ⏭️  Đã bỏ qua: ${reviewSkippedCount} reviews (đã tồn tại)`);
  console.log(`   ❌ Không tìm thấy product: ${productNotFoundCount} reviews`);
  console.log('='.repeat(60));
  
  return {
    userCreatedCount,
    userUpdatedCount,
    reviewAddedCount,
    reviewSkippedCount,
    productNotFoundCount
  };
}

/**
 * Hàm chính
 */
async function mapAmazonData() {
  try {
    console.log('🚀 Bắt đầu ánh xạ và bổ sung dữ liệu Amazon...\n');
    console.log('='.repeat(60));
    
    // Kiểm tra file tồn tại
    if (!fs.existsSync(REVIEW_FILE)) {
      throw new Error(`File không tồn tại: ${REVIEW_FILE}`);
    }
    if (!fs.existsSync(META_FILE)) {
      throw new Error(`File không tồn tại: ${META_FILE}`);
    }
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đọc dữ liệu từ file (streaming để tiết kiệm memory)
    console.log('📖 Đang đọc file dữ liệu (streaming)...');
    console.log(`   - Review file: ${REVIEW_FILE}`);
    console.log(`   - Meta file: ${META_FILE}`);
    
    const startTime = Date.now();
    
    // Đọc meta file và nhóm theo parent_asin
    console.log('\n📖 Đang đọc meta file...');
    const { map: productsByParentAsin, count: metaCount } = await readJsonlFileToMap(META_FILE, 'parent_asin');
    console.log(`✅ Đã đọc ${metaCount.toLocaleString()} meta products, nhóm thành ${productsByParentAsin.size} parent_asins`);
    
    // Đọc review file và nhóm theo user_id và parent_asin
    console.log('\n📖 Đang đọc review file...');
    const reviewsByUser = new Map();
    const reviewsByProduct = new Map();
    let reviewCount = 0;
    
    for await (const review of readJsonlFileStream(REVIEW_FILE)) {
      if (!review.user_id || !review.parent_asin) continue;
      
      // Nhóm theo user
      if (!reviewsByUser.has(review.user_id)) {
        reviewsByUser.set(review.user_id, []);
      }
      reviewsByUser.get(review.user_id).push(review);
      
      // Nhóm theo product (parent_asin)
      if (!reviewsByProduct.has(review.parent_asin)) {
        reviewsByProduct.set(review.parent_asin, []);
      }
      reviewsByProduct.get(review.parent_asin).push(review);
      
      reviewCount++;
      if (reviewCount % 10000 === 0) {
        console.log(`   Đã đọc ${reviewCount.toLocaleString()} reviews...`);
      }
    }
    
    const readTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Đã đọc ${reviewCount.toLocaleString()} reviews (${readTime}s)`);
    console.log(`   - Nhóm thành ${reviewsByUser.size} users`);
    console.log(`   - Nhóm thành ${reviewsByProduct.size} products\n`);
    
    // Bước 1: Match products bằng tên và set amazonParentAsin
    const matchedCount = await matchProductsByName(productsByParentAsin);
    
    // Bước 2: Bổ sung dữ liệu products
    const productStats = await enrichProducts(productsByParentAsin);
    
    // Bổ sung dữ liệu users và reviews
    const reviewStats = await enrichUsersAndReviews(reviewsByUser, reviewsByProduct);
    
    // Tổng kết
    console.log('\n' + '='.repeat(60));
    console.log('🎉 TỔNG KẾT TOÀN BỘ:');
    console.log('='.repeat(60));
    console.log('\n📦 PRODUCTS:');
    console.log(`   🔍 Đã match: ${matchedCount} products (set amazonParentAsin)`);
    console.log(`   ✅ Đã cập nhật: ${productStats.updatedCount}`);
    console.log(`   ⏭️  Đã bỏ qua: ${productStats.skippedCount}`);
    console.log(`   ❌ Không tìm thấy: ${productStats.notFoundCount}`);
    console.log('\n👥 USERS:');
    console.log(`   ✅ Đã tạo: ${reviewStats.userCreatedCount}`);
    console.log(`   ✅ Đã cập nhật: ${reviewStats.userUpdatedCount}`);
    console.log('\n📝 REVIEWS:');
    console.log(`   ✅ Đã thêm: ${reviewStats.reviewAddedCount}`);
    console.log(`   ⏭️  Đã bỏ qua: ${reviewStats.reviewSkippedCount}`);
    console.log(`   ❌ Không tìm thấy product: ${reviewStats.productNotFoundCount}`);
    console.log('\n' + '='.repeat(60));
    console.log(`⏱️  Tổng thời gian: ${((Date.now() - startTime) / 1000).toFixed(2)} giây`);
    console.log('='.repeat(60));
    
    // Đóng kết nối database
    console.log('\n📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi ánh xạ dữ liệu:');
    console.error(error.message);
    console.error(error.stack);
    await disconnectDB();
    process.exit(1);
  }
}

// Chạy script
mapAmazonData();

