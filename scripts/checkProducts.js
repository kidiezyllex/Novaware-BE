import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

async function checkProducts() {
  try {
    console.log('📊 Kiểm tra products...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đếm tổng số products
    const totalProducts = await Product.countDocuments();
    console.log(`📦 Tổng số products: ${totalProducts.toLocaleString()}`);
    
    // Đếm products có amazonParentAsin
    const productsWithAsin = await Product.countDocuments({ 
      amazonParentAsin: { $exists: true, $ne: null } 
    });
    console.log(`📦 Products có amazonParentAsin: ${productsWithAsin.toLocaleString()}`);
    
    // Đếm products không có amazonParentAsin
    const productsWithoutAsin = await Product.countDocuments({ 
      $or: [
        { amazonParentAsin: { $exists: false } },
        { amazonParentAsin: null }
      ]
    });
    console.log(`📦 Products không có amazonParentAsin: ${productsWithoutAsin.toLocaleString()}`);
    
    // Lấy một vài products mẫu để xem cấu trúc
    console.log('\n📋 Mẫu products (5 products đầu tiên):');
    const sampleProducts = await Product.find().limit(5).select('name amazonParentAsin amazonAsin').lean();
    sampleProducts.forEach((p, i) => {
      console.log(`   ${i + 1}. ${p.name?.substring(0, 50)}...`);
      console.log(`      - amazonParentAsin: ${p.amazonParentAsin || 'KHÔNG CÓ'}`);
      console.log(`      - amazonAsin: ${p.amazonAsin || 'KHÔNG CÓ'}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
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
checkProducts();

