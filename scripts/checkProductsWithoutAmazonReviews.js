import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

async function checkProductsWithoutAmazonReviews() {
  try {
    console.log('📋 Đang kiểm tra products chưa có reviews từ Amazon...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Tìm products có amazonParentAsin
    const allProducts = await Product.find({
      amazonParentAsin: { $exists: true, $ne: null }
    }).select('_id name amazonParentAsin reviews').lean();
    
    console.log(`📦 Tổng số products có amazonParentAsin: ${allProducts.length}\n`);
    
    // Kiểm tra products chưa có reviews từ Amazon
    const productsWithoutAmazonReviews = [];
    const productsWithAmazonReviews = [];
    
    for (const product of allProducts) {
      const reviews = product.reviews || [];
      const hasAmazonReviews = reviews.some(r => 
        r.name && typeof r.name === 'string' && r.name.startsWith('Amazon User')
      );
      
      if (!hasAmazonReviews) {
        productsWithoutAmazonReviews.push({
          _id: product._id,
          name: product.name,
          amazonParentAsin: product.amazonParentAsin,
          reviewCount: reviews.length
        });
      } else {
        productsWithAmazonReviews.push(product._id);
      }
    }
    
    console.log('📊 KẾT QUẢ:');
    console.log(`   ✅ Products có reviews từ Amazon: ${productsWithAmazonReviews.length}`);
    console.log(`   ⚠️  Products CHƯA có reviews từ Amazon: ${productsWithoutAmazonReviews.length}`);
    console.log('='.repeat(60));
    
    if (productsWithoutAmazonReviews.length > 0) {
      console.log('\n📋 DANH SÁCH 20 PRODUCTS CHƯA CÓ REVIEWS TỪ AMAZON (MẪU):');
      console.log('='.repeat(60));
      
      const displayLimit = Math.min(20, productsWithoutAmazonReviews.length);
      for (let i = 0; i < displayLimit; i++) {
        const p = productsWithoutAmazonReviews[i];
        console.log(`\n${i + 1}. ID: ${p._id}`);
        console.log(`   Tên: ${p.name?.substring(0, 80)}${p.name?.length > 80 ? '...' : ''}`);
        console.log(`   amazonParentAsin: ${p.amazonParentAsin}`);
        console.log(`   Reviews hiện tại: ${p.reviewCount}`);
      }
      
      if (productsWithoutAmazonReviews.length > displayLimit) {
        console.log(`\n... và còn ${productsWithoutAmazonReviews.length - displayLimit} products khác`);
      }
    } else {
      console.log('\n✅ Tất cả products đều đã có reviews từ Amazon!');
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
checkProductsWithoutAmazonReviews();

