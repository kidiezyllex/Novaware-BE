import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

async function listProductsWithoutAsin() {
  try {
    console.log('📋 Đang liệt kê products chưa có amazonParentAsin...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Tìm products không có amazonParentAsin
    const productsWithoutAsin = await Product.find({
      $or: [
        { amazonParentAsin: { $exists: false } },
        { amazonParentAsin: null }
      ]
    }).select('_id name category brand rating numReviews').lean();
    
    console.log(`📦 Tìm thấy ${productsWithoutAsin.length} products chưa có amazonParentAsin\n`);
    
    if (productsWithoutAsin.length > 0) {
      console.log('📋 DANH SÁCH PRODUCTS CHƯA CÓ amazonParentAsin:');
      console.log('='.repeat(60));
      
      // Hiển thị tối đa 50 products đầu tiên
      const displayLimit = Math.min(50, productsWithoutAsin.length);
      for (let i = 0; i < displayLimit; i++) {
        const p = productsWithoutAsin[i];
        console.log(`\n${i + 1}. ID: ${p._id}`);
        console.log(`   Tên: ${p.name?.substring(0, 80)}${p.name?.length > 80 ? '...' : ''}`);
        console.log(`   Category: ${p.category || 'N/A'}`);
        console.log(`   Brand: ${p.brand || 'N/A'}`);
        console.log(`   Rating: ${p.rating || 0}, Reviews: ${p.numReviews || 0}`);
      }
      
      if (productsWithoutAsin.length > displayLimit) {
        console.log(`\n... và còn ${productsWithoutAsin.length - displayLimit} products khác`);
      }
    } else {
      console.log('✅ Tất cả products đều đã có amazonParentAsin!');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log(`📊 Tổng số: ${productsWithoutAsin.length} products`);
    console.log('='.repeat(60));
    
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
listProductsWithoutAsin();

