import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

async function listUpdatedProducts() {
  try {
    console.log('📋 Đang liệt kê products đã có reviews từ Amazon...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Tìm products có amazonParentAsin và có reviews
    const productsWithReviews = await Product.find({
      amazonParentAsin: { $exists: true, $ne: null },
      'reviews.0': { $exists: true } // Có ít nhất 1 review
    })
    .select('_id name amazonParentAsin rating numReviews reviews')
    .lean();
    
    console.log(`📦 Tìm thấy ${productsWithReviews.length} products có reviews từ Amazon\n`);
    
    if (productsWithReviews.length > 0) {
      console.log('📋 DANH SÁCH PRODUCTS ĐÃ CẬP NHẬT REVIEWS:');
      console.log('='.repeat(60));
      
      // Hiển thị tối đa 50 products đầu tiên
      const displayLimit = Math.min(50, productsWithReviews.length);
      for (let i = 0; i < displayLimit; i++) {
        const p = productsWithReviews[i];
        const reviewCount = p.reviews?.length || 0;
        const oldReviewCount = 0; // Không biết số cũ, có thể thêm logic để track
        
        console.log(`\n${i + 1}. ID: ${p._id}`);
        console.log(`   Tên: ${p.name?.substring(0, 80)}${p.name?.length > 80 ? '...' : ''}`);
        console.log(`   amazonParentAsin: ${p.amazonParentAsin}`);
        console.log(`   Reviews: ${oldReviewCount} → ${reviewCount} (mới: +${reviewCount})`);
        console.log(`   Rating: ${p.rating?.toFixed(2) || 0} (${reviewCount} reviews)`);
        
        // Hiển thị một vài reviews mẫu
        if (p.reviews && p.reviews.length > 0) {
          const sampleReviews = p.reviews.slice(0, 2);
          sampleReviews.forEach((r, idx) => {
            const comment = r.comment?.substring(0, 50) || 'No comment';
            console.log(`   - Review ${idx + 1}: ${r.rating}⭐ "${comment}${r.comment?.length > 50 ? '...' : ''}"`);
          });
          if (p.reviews.length > 2) {
            console.log(`   ... và ${p.reviews.length - 2} reviews khác`);
          }
        }
      }
      
      if (productsWithReviews.length > displayLimit) {
        console.log(`\n... và còn ${productsWithReviews.length - displayLimit} products khác`);
      }
      
      // Thống kê
      const totalReviews = productsWithReviews.reduce((sum, p) => sum + (p.reviews?.length || 0), 0);
      const avgReviews = totalReviews / productsWithReviews.length;
      const totalRating = productsWithReviews.reduce((sum, p) => sum + (p.rating || 0), 0);
      const avgRating = totalRating / productsWithReviews.length;
      
      console.log('\n' + '='.repeat(60));
      console.log('📊 THỐNG KÊ:');
      console.log(`   Tổng số products có reviews: ${productsWithReviews.length}`);
      console.log(`   Tổng số reviews: ${totalReviews.toLocaleString()}`);
      console.log(`   Trung bình reviews/product: ${avgReviews.toFixed(2)}`);
      console.log(`   Rating trung bình: ${avgRating.toFixed(2)}`);
      console.log('='.repeat(60));
    } else {
      console.log('⚠️  Không có products nào có reviews từ Amazon');
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
listUpdatedProducts();

