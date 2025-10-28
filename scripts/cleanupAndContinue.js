import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

// Script để xóa 5000 sản phẩm cuối cùng
async function deleteLast5000Products() {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();
    
    console.log('📊 Counting total products...');
    const totalProducts = await Product.countDocuments({});
    console.log(`Found ${totalProducts} products in database`);
    
    if (totalProducts <= 5000) {
      console.log('❌ Not enough products to delete (need more than 5000)');
      return;
    }
    
    console.log('🗑️ Deleting last 5000 products...');
    
    // Lấy 5000 sản phẩm cuối cùng để xóa
    const productsToDelete = await Product.find({})
      .sort({ _id: -1 }) // Sắp xếp theo _id giảm dần (mới nhất trước)
      .limit(5000)
      .select('_id name');
    
    console.log(`Found ${productsToDelete.length} products to delete`);
    
    // Hiển thị một vài sản phẩm sẽ bị xóa
    console.log('🔍 Sample products to be deleted:');
    productsToDelete.slice(0, 5).forEach((product, index) => {
      console.log(`   ${index + 1}. "${product.name}" (ID: ${product._id})`);
    });
    
    // Xóa các sản phẩm
    const deleteResult = await Product.deleteMany({
      _id: { $in: productsToDelete.map(p => p._id) }
    });
    
    console.log(`✅ Successfully deleted ${deleteResult.deletedCount} products`);
    
    // Kiểm tra số lượng còn lại
    const remainingProducts = await Product.countDocuments({});
    console.log(`📊 Remaining products: ${remainingProducts}`);
    
  } catch (error) {
    console.error('❌ Error deleting products:', error);
    throw error;
  } finally {
    await disconnectDB();
    console.log('🔌 Disconnected from database');
  }
}

// Script để tiếp tục fix products từ điểm đã dừng
async function continueFixProducts() {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();
    
    console.log('📊 Checking current product status...');
    const totalProducts = await Product.countDocuments({});
    const productsWithFeatureVector = await Product.countDocuments({ 
      featureVector: { $exists: true, $ne: [] } 
    });
    const productsWithCategory = await Product.countDocuments({ 
      category: { $ne: 'other', $exists: true } 
    });
    const productsWithCompatible = await Product.countDocuments({ 
      compatibleProducts: { $exists: true, $ne: [] } 
    });
    
    console.log(`Total products: ${totalProducts}`);
    console.log(`Products with featureVector: ${productsWithFeatureVector}`);
    console.log(`Products with proper category: ${productsWithCategory}`);
    console.log(`Products with compatible products: ${productsWithCompatible}`);
    
    if (productsWithFeatureVector === totalProducts && 
        productsWithCategory === totalProducts && 
        productsWithCompatible === totalProducts) {
      console.log('✅ All products are already processed!');
      return;
    }
    
    // Import và chạy fixProducts
    console.log('🔄 Continuing product fixing...');
    const { default: fixProducts } = await import('./fixProducts.js');
    await fixProducts();
    
  } catch (error) {
    console.error('❌ Error continuing fix:', error);
    throw error;
  } finally {
    await disconnectDB();
    console.log('🔌 Disconnected from database');
  }
}

// Script chính
async function main() {
  try {
    console.log('🚀 Starting cleanup and continue process...');
    console.log('');
    
    // Bước 1: Xóa 5000 sản phẩm cuối cùng
    console.log('=== STEP 1: DELETE LAST 5000 PRODUCTS ===');
    await deleteLast5000Products();
    console.log('');
    
    // Bước 2: Tiếp tục fix products
    console.log('=== STEP 2: CONTINUE FIXING PRODUCTS ===');
    await continueFixProducts();
    
    console.log('');
    console.log('🎉 Process completed successfully!');
    
  } catch (error) {
    console.error('💥 Process failed:', error);
    process.exit(1);
  }
}

// Chạy script nếu được gọi trực tiếp
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { deleteLast5000Products, continueFixProducts };
