import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import Order from '../models/orderModel.js';

dotenv.config();

const BATCH_SIZE = 100;

async function createInteractionHistory() {
  try {
    console.log('🔄 Bắt đầu tạo interactionHistory cho users...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Lấy tất cả users
    console.log('👥 Đang tải users...');
    const users = await User.find({}).select('_id name email favorites interactionHistory').lean();
    console.log(`✅ Đã tải ${users.length} users\n`);
    
    // Lấy tất cả products có reviews
    console.log('📦 Đang tải products với reviews...');
    const products = await Product.find({
      'reviews.0': { $exists: true }
    }).select('_id reviews').lean();
    console.log(`✅ Đã tải ${products.length} products có reviews\n`);
    
    // Lấy tất cả orders
    console.log('🛒 Đang tải orders...');
    const orders = await Order.find({}).select('user orderItems').lean();
    console.log(`✅ Đã tải ${orders.length} orders\n`);
    
    // Tạo map: user -> reviews
    const userReviewsMap = new Map();
    products.forEach(product => {
      if (product.reviews && product.reviews.length > 0) {
        product.reviews.forEach(review => {
          if (review.user) {
            const userId = review.user.toString();
            if (!userReviewsMap.has(userId)) {
              userReviewsMap.set(userId, []);
            }
            userReviewsMap.get(userId).push({
              productId: product._id,
              rating: review.rating || 0,
              timestamp: review.createdAt || new Date()
            });
          }
        });
      }
    });
    
    console.log(`📊 Đã tìm thấy reviews cho ${userReviewsMap.size} users\n`);
    
    // Tạo map: user -> favorites
    const userFavoritesMap = new Map();
    users.forEach(user => {
      if (user.favorites && user.favorites.length > 0) {
        userFavoritesMap.set(user._id.toString(), user.favorites.map(fav => fav.toString()));
      }
    });
    
    console.log(`📊 Đã tìm thấy favorites cho ${userFavoritesMap.size} users\n`);
    
    // Tạo map: user -> purchases
    const userPurchasesMap = new Map();
    orders.forEach(order => {
      if (order.user && order.orderItems && order.orderItems.length > 0) {
        const userId = order.user.toString();
        if (!userPurchasesMap.has(userId)) {
          userPurchasesMap.set(userId, []);
        }
        order.orderItems.forEach(item => {
          if (item.product) {
            userPurchasesMap.get(userId).push({
              productId: item.product.toString(),
              timestamp: order.createdAt || new Date()
            });
          }
        });
      }
    });
    
    console.log(`📊 Đã tìm thấy purchases cho ${userPurchasesMap.size} users\n`);
    
    // Cập nhật interactionHistory cho từng user
    console.log('📝 Bắt đầu tạo interactionHistory...');
    let totalUpdated = 0;
    let totalSkipped = 0;
    
    for (let i = 0; i < users.length; i += BATCH_SIZE) {
      const batch = users.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(users.length / BATCH_SIZE);
      
      if (batchNum % 10 === 0 || batchNum <= 3) {
        console.log(`\n📝 Đang xử lý batch ${batchNum}/${totalBatches} (${batch.length} users)...`);
      }
      
      const userUpdates = [];
      
      for (const user of batch) {
        const userId = user._id.toString();
        const interactions = [];
        
        // Thêm reviews
        if (userReviewsMap.has(userId)) {
          const reviews = userReviewsMap.get(userId);
          reviews.forEach(review => {
            interactions.push({
              productId: review.productId,
              interactionType: 'review',
              rating: review.rating,
              timestamp: review.timestamp
            });
          });
        }
        
        // Thêm favorites
        if (userFavoritesMap.has(userId)) {
          const favorites = userFavoritesMap.get(userId);
          favorites.forEach(productId => {
            // Kiểm tra xem đã có review cho product này chưa
            const hasReview = interactions.some(i => i.productId.toString() === productId);
            if (!hasReview) {
              interactions.push({
                productId: productId,
                interactionType: 'like',
                timestamp: new Date()
              });
            }
          });
        }
        
        // Thêm purchases
        if (userPurchasesMap.has(userId)) {
          const purchases = userPurchasesMap.get(userId);
          purchases.forEach(purchase => {
            // Kiểm tra xem đã có interaction cho product này chưa
            const hasInteraction = interactions.some(i => 
              i.productId.toString() === purchase.productId.toString()
            );
            if (!hasInteraction) {
              interactions.push({
                productId: purchase.productId,
                interactionType: 'purchase',
                timestamp: purchase.timestamp
              });
            } else {
              // Cập nhật interaction thành purchase nếu chưa phải purchase
              const existingIndex = interactions.findIndex(i => 
                i.productId.toString() === purchase.productId.toString()
              );
              if (existingIndex >= 0 && interactions[existingIndex].interactionType !== 'purchase') {
                interactions[existingIndex].interactionType = 'purchase';
                interactions[existingIndex].timestamp = purchase.timestamp;
              }
            }
          });
        }
        
        // Chỉ cập nhật nếu có interactions mới
        if (interactions.length > 0) {
          // Kiểm tra xem user đã có interactionHistory chưa
          const existingInteractions = user.interactionHistory || [];
          const existingProductIds = new Set(
            existingInteractions.map(i => i.productId?.toString())
          );
          
          // Chỉ thêm interactions mới (chưa có trong database)
          const newInteractions = interactions.filter(i => 
            !existingProductIds.has(i.productId.toString())
          );
          
          if (newInteractions.length > 0 || existingInteractions.length === 0) {
            userUpdates.push({
              updateOne: {
                filter: { _id: user._id },
                update: {
                  $set: {
                    interactionHistory: existingInteractions.length > 0 
                      ? [...existingInteractions, ...newInteractions]
                      : interactions
                  }
                }
              }
            });
            totalUpdated++;
          } else {
            totalSkipped++;
          }
        } else {
          totalSkipped++;
        }
      }
      
      // Batch update users
      if (userUpdates.length > 0) {
        try {
          await User.bulkWrite(userUpdates, { ordered: false });
          if (batchNum % 10 === 0 || batchNum <= 3) {
            console.log(`   ✅ Đã cập nhật: ${userUpdates.length} users`);
          }
        } catch (error) {
          console.error(`   ⚠️  Lỗi khi update batch ${batchNum}: ${error.message}`);
        }
      }
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TỔNG KẾT:');
    console.log(`   ✅ Đã cập nhật: ${totalUpdated} users`);
    console.log(`   ⏭️  Đã bỏ qua: ${totalSkipped} users`);
    console.log('='.repeat(60));
    
    // Kiểm tra lại số users có interactionHistory
    const finalCount = await User.countDocuments({
      'interactionHistory.0': { $exists: true }
    });
    console.log(`\n📊 Số users có interactionHistory sau khi cập nhật: ${finalCount}`);
    
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
createInteractionHistory();

