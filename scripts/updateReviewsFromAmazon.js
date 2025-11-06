import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const BATCH_SIZE = 1000;
const REVIEW_FILE = path.join(__dirname, '../data/Amazon_Fashion.jsonl');

/**
 * Đọc file JSONL và nhóm reviews theo parent_asin
 */
async function readReviewsByParentAsin() {
  console.log('📖 Đang đọc review file...');
  const reviewsByProduct = new Map();
  let lineCount = 0;
  
  const fileStream = fs.createReadStream(REVIEW_FILE, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    if (!line.trim()) continue;
    
    try {
      const review = JSON.parse(line);
      const parentAsin = review.parent_asin || review.parentAsin;
      
      if (!parentAsin) continue;
      
      if (!reviewsByProduct.has(parentAsin)) {
        reviewsByProduct.set(parentAsin, []);
      }
      reviewsByProduct.get(parentAsin).push(review);
      
      lineCount++;
      if (lineCount % 100000 === 0) {
        console.log(`   Đã đọc ${lineCount.toLocaleString()} reviews...`);
      }
    } catch (error) {
      // Bỏ qua dòng lỗi
      continue;
    }
  }
  
  console.log(`✅ Đã đọc ${lineCount.toLocaleString()} reviews, nhóm thành ${reviewsByProduct.size} products\n`);
  return reviewsByProduct;
}

/**
 * Cập nhật reviews cho products theo amazonParentAsin
 */
async function updateReviewsFromAmazon() {
  try {
    console.log('🔄 Bắt đầu cập nhật reviews từ Amazon...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đọc reviews từ file
    const reviewsByProduct = await readReviewsByParentAsin();
    
    // Lấy tất cả users có amazonUserId
    console.log('👥 Đang tải users...');
    const users = await User.find({ amazonUserId: { $exists: true, $ne: null } })
      .select('_id amazonUserId')
      .lean();
    
    const userMap = new Map();
    users.forEach(u => {
      if (u.amazonUserId) {
        userMap.set(u.amazonUserId, u);
      }
    });
    console.log(`✅ Đã tải ${users.length} users\n`);
    
    // Lấy tất cả products có amazonParentAsin
    console.log('📦 Đang tải products có amazonParentAsin...');
    const allProducts = await Product.find({
      amazonParentAsin: { $exists: true, $ne: null }
    }).select('_id name amazonParentAsin reviews rating numReviews').lean();
    
    const productMap = new Map();
    allProducts.forEach(p => {
      if (p.amazonParentAsin) {
        if (!productMap.has(p.amazonParentAsin)) {
          productMap.set(p.amazonParentAsin, []);
        }
        productMap.get(p.amazonParentAsin).push(p);
      }
    });
    console.log(`✅ Đã tải ${allProducts.length} products\n`);
    
    // Xử lý reviews theo batch
    console.log('📝 Bắt đầu cập nhật reviews...');
    const parentAsins = Array.from(reviewsByProduct.keys());
    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalNotFound = 0;
    let totalNoReviews = 0;
    let totalProductsChecked = 0;
    const updatedProducts = []; // Track products đã cập nhật
    
    for (let i = 0; i < parentAsins.length; i += BATCH_SIZE) {
      const batch = parentAsins.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(parentAsins.length / BATCH_SIZE);
      
      if (batchNum % 50 === 0 || batchNum <= 5) {
        console.log(`\n📝 Đang xử lý batch ${batchNum}/${totalBatches} (${batch.length} products)...`);
      }
      
      const productUpdates = [];
      let batchUpdated = 0;
      let batchSkipped = 0;
      let batchNotFound = 0;
      let batchNoReviews = 0;
      
      for (const parentAsin of batch) {
        const productReviews = reviewsByProduct.get(parentAsin) || [];
        const dbProducts = productMap.get(parentAsin) || [];
        
        if (dbProducts.length === 0) {
          batchNotFound += productReviews.length;
          continue;
        }
        
        // Xử lý từng product
        for (const dbProduct of dbProducts) {
          totalProductsChecked++;
          const oldReviewCount = dbProduct.reviews?.length || 0;
          const oldRating = dbProduct.rating || 0;
          
          // Kiểm tra xem product đã có reviews từ Amazon chưa
          const existingReviews = dbProduct.reviews || [];
          const hasAmazonReviews = existingReviews.some(r => 
            r.name && typeof r.name === 'string' && r.name.startsWith('Amazon User')
          );
          
          // Bỏ qua nếu đã có reviews từ Amazon
          if (hasAmazonReviews && oldReviewCount > 0) {
            batchSkipped++;
            continue;
          }
          
          // Đếm products không có reviews từ Amazon
          if (!hasAmazonReviews) {
            batchNoReviews++;
          }
          
          // Tạo reviews mới từ Amazon data
          const newReviews = [];
          const reviewKeys = new Set(); // Để tránh duplicate
          let userNotFoundCount = 0;
          const usersToCreate = new Map(); // Tập hợp users cần tạo
          
          for (const reviewData of productReviews) {
            let user = userMap.get(reviewData.user_id);
            
            // Nếu không có user, thêm vào danh sách tạo mới
            if (!user && reviewData.user_id) {
              usersToCreate.set(reviewData.user_id, null);
              continue;
            }
            
            if (!user) {
              userNotFoundCount++;
              continue;
            }
            
            const reviewKey = `${user._id.toString()}_${reviewData.text || reviewData.title || ''}`;
            
            // Kiểm tra duplicate với reviews cũ (nếu có)
            const existingReviewKeys = new Set(
              existingReviews.map(r => {
                const userId = r.user?.toString ? r.user.toString() : String(r.user);
                return `${userId}_${r.comment || ''}`;
              })
            );
            
            if (existingReviewKeys.has(reviewKey) || reviewKeys.has(reviewKey)) {
              continue;
            }
            reviewKeys.add(reviewKey);
            
            // Tạo review mới
            const newReview = {
              name: `Amazon User ${reviewData.user_id.substring(0, 8)}`,
              rating: reviewData.rating || 0,
              comment: reviewData.text || reviewData.title || 'No comment',
              user: user._id,
              createdAt: reviewData.timestamp ? new Date(reviewData.timestamp) : new Date(),
            };
            
            newReviews.push(newReview);
          }
          
          // Tạo users mới nếu cần
          if (usersToCreate.size > 0) {
            const newUsers = [];
            for (const [amazonUserId, _] of usersToCreate) {
              // Kiểm tra lại xem user đã tồn tại chưa (tránh duplicate)
              const existingUser = await User.findOne({ amazonUserId });
              if (!existingUser && newUsers.findIndex(u => u.amazonUserId === amazonUserId) === -1) {
                // Tạo email unique dựa trên amazonUserId
                const email = `amazon_user_${amazonUserId.toLowerCase()}@placeholder.com`;
                // Kiểm tra email đã tồn tại chưa
                const emailExists = await User.findOne({ email });
                if (!emailExists) {
                  newUsers.push({
                    name: `Amazon User ${amazonUserId.substring(0, 8)}`,
                    email: email,
                    password: null, // Không set password cho Amazon users
                    amazonUserId: amazonUserId,
                    isAdmin: false
                  });
                }
              }
            }
            
            if (newUsers.length > 0) {
              try {
                // Tạo users mới (có thể cần hash password)
                const createdUsers = await User.insertMany(newUsers, { ordered: false });
                // Thêm vào userMap
                createdUsers.forEach(u => {
                  if (u.amazonUserId) {
                    userMap.set(u.amazonUserId, u);
                  }
                });
                
                // Xử lý lại reviews với users vừa tạo
                for (const reviewData of productReviews) {
                  if (!newReviews.find(r => r.user?.toString() === userMap.get(reviewData.user_id)?._id?.toString())) {
                    const user = userMap.get(reviewData.user_id);
                    if (!user) continue;
                    
                    const reviewKey = `${user._id.toString()}_${reviewData.text || reviewData.title || ''}`;
                    const existingReviewKeys = new Set(
                      existingReviews.map(r => {
                        const userId = r.user?.toString ? r.user.toString() : String(r.user);
                        return `${userId}_${r.comment || ''}`;
                      })
                    );
                    
                    if (existingReviewKeys.has(reviewKey) || reviewKeys.has(reviewKey)) {
                      continue;
                    }
                    reviewKeys.add(reviewKey);
                    
                    const newReview = {
                      name: `Amazon User ${reviewData.user_id.substring(0, 8)}`,
                      rating: reviewData.rating || 0,
                      comment: reviewData.text || reviewData.title || 'No comment',
                      user: user._id,
                      createdAt: reviewData.timestamp ? new Date(reviewData.timestamp) : new Date(),
                    };
                    
                    newReviews.push(newReview);
                  }
                }
              } catch (error) {
                console.error(`   ⚠️  Lỗi khi tạo users: ${error.message}`);
              }
            }
          }
          
          // Nếu có reviews mới, cập nhật product
          if (newReviews.length > 0) {
            // Log thông tin debug nếu là batch đầu tiên
            if (batchNum <= 3 && updatedProducts.length < 5) {
              console.log(`   📝 Product ${dbProduct._id}: ${oldReviewCount} → ${newReviews.length} reviews mới (${userNotFoundCount} reviews không có user)`);
            }
            // Thêm reviews mới vào reviews cũ (nếu có)
            const finalReviews = [...existingReviews, ...newReviews];
            const finalReviewCount = finalReviews.length;
            const finalTotalRating = finalReviews.reduce((sum, r) => sum + (r.rating || 0), 0);
            const finalAvgRating = finalReviewCount > 0 ? finalTotalRating / finalReviewCount : 0;
            
            productUpdates.push({
              updateOne: {
                filter: { _id: dbProduct._id },
                update: {
                  $set: {
                    reviews: finalReviews,
                    rating: finalAvgRating,
                    numReviews: finalReviewCount
                  }
                }
              }
            });
            
            // Track product đã cập nhật
            updatedProducts.push({
              _id: dbProduct._id,
              name: dbProduct.name,
              amazonParentAsin: parentAsin,
              oldReviewCount,
              newReviewCount: finalReviewCount,
              newReviewAdded: newReviews.length,
              oldRating,
              newRating: finalAvgRating
            });
            
            batchUpdated += newReviews.length;
          } else {
            // Không có reviews mới, có thể do không có user hoặc không có reviews trong file
            if (productReviews.length > 0 && userNotFoundCount === productReviews.length) {
              // Tất cả reviews đều không có user
              batchSkipped++;
            } else if (productReviews.length === 0) {
              // Không có reviews trong file cho parentAsin này
              batchSkipped++;
            } else {
              // Có thể tất cả reviews đều duplicate
              batchSkipped++;
            }
          }
        }
      }
      
      // Batch update products
      if (productUpdates.length > 0) {
        try {
          await Product.bulkWrite(productUpdates, { ordered: false });
          totalUpdated += batchUpdated;
          totalSkipped += batchSkipped;
          totalNotFound += batchNotFound;
          totalNoReviews += batchNoReviews;
          
          if (batchNum % 50 === 0 || batchNum <= 5) {
            console.log(`   ✅ Đã cập nhật: ${productUpdates.length} products với ${batchUpdated} reviews mới`);
            console.log(`   ⏭️  Đã bỏ qua: ${batchSkipped} products (có reviews từ Amazon)`);
            console.log(`   📊 Products chưa có reviews Amazon: ${batchNoReviews}`);
          }
        } catch (error) {
          console.error(`   ⚠️  Lỗi khi update batch: ${error.message}`);
        }
      } else {
        totalSkipped += batchSkipped;
        totalNotFound += batchNotFound;
        totalNoReviews += batchNoReviews;
      }
    }
    
    console.log(`\n📊 Đã kiểm tra: ${totalProductsChecked} products`);
    
    // Hiển thị danh sách products đã cập nhật
    console.log('\n' + '='.repeat(60));
    console.log('📊 TỔNG KẾT:');
    console.log(`   ✅ Đã cập nhật: ${totalUpdated} reviews mới cho ${updatedProducts.length} products`);
    console.log(`   ⏭️  Đã bỏ qua: ${totalSkipped} products (đã có reviews từ Amazon)`);
    console.log(`   📦 Products chưa có reviews Amazon: ${totalNoReviews}`);
    console.log(`   ❌ Không tìm thấy product: ${totalNotFound} reviews`);
    console.log('='.repeat(60));
    
    // Hiển thị danh sách products đã cập nhật (cũ --> mới)
    console.log('\n📋 DANH SÁCH PRODUCTS ĐÃ CẬP NHẬT REVIEWS (CŨ --> MỚI):');
    console.log('='.repeat(60));
    
    const displayLimit = Math.min(50, updatedProducts.length);
    for (let i = 0; i < displayLimit; i++) {
      const p = updatedProducts[i];
      console.log(`\n${i + 1}. ID: ${p._id}`);
      console.log(`   Tên: ${p.name?.substring(0, 80)}${p.name?.length > 80 ? '...' : ''}`);
      console.log(`   amazonParentAsin: ${p.amazonParentAsin}`);
      const change = p.newReviewCount - p.oldReviewCount;
      console.log(`   Reviews: ${p.oldReviewCount} → ${p.newReviewCount} (${change > 0 ? '+' : ''}${change}, thêm ${p.newReviewAdded || 0} reviews mới)`);
      console.log(`   Rating: ${p.oldRating.toFixed(2)} → ${p.newRating.toFixed(2)}`);
    }
    
    if (updatedProducts.length > displayLimit) {
      console.log(`\n... và còn ${updatedProducts.length - displayLimit} products khác`);
    }
    
    // Đóng kết nối database
    console.log('\n📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi:');
    console.error(error.message);
    console.error(error.stack);
    await disconnectDB();
    process.exit(1);
  }
}

// Chạy script
updateReviewsFromAmazon();

