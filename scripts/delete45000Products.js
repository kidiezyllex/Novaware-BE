import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

// Script để xóa 45,000 sản phẩm cuối cùng
async function delete45000Products() {
  try {
    console.log('🔗 Connecting to database...');
    console.log('   - MongoDB URI:', process.env.MONGO_URI ? 'Set' : 'Not set');
    
    await connectDB();
    console.log('   - Database connected successfully');
    
    console.log('📊 Counting total products...');
    const totalProducts = await Product.countDocuments({});
    console.log(`Found ${totalProducts} products in database`);
    
    // Xóa 45,000 sản phẩm cuối cùng
    const DELETE_COUNT = 45000;
    
    if (totalProducts <= DELETE_COUNT) {
      console.log(`❌ Not enough products to delete (need more than ${DELETE_COUNT})`);
      return;
    }
    
    console.log(`🗑️ Deleting ${DELETE_COUNT} products from the end...`);
    
    // Lấy sản phẩm để xóa (từ cuối lên)
    const productsToDelete = await Product.find({})
      .sort({ _id: -1 }) // Sắp xếp theo _id giảm dần (mới nhất trước)
      .limit(DELETE_COUNT)
      .select('_id name');
    
    console.log(`Found ${productsToDelete.length} products to delete`);
    
    // Hiển thị một vài sản phẩm sẽ bị xóa
    console.log('🔍 Sample products to be deleted:');
    productsToDelete.slice(0, 5).forEach((product, index) => {
      console.log(`   ${index + 1}. "${product.name}" (ID: ${product._id})`);
    });
    
    // Xóa các sản phẩm
    console.log('⏳ Deleting products...');
    const deleteResult = await Product.deleteMany({
      _id: { $in: productsToDelete.map(p => p._id) }
    });
    
    console.log(`✅ Successfully deleted ${deleteResult.deletedCount} products`);
    
    // Kiểm tra số lượng còn lại
    const remainingProducts = await Product.countDocuments({});
    console.log(`📊 Remaining products: ${remainingProducts}`);
    
    // Kiểm tra sản phẩm đã được fix
    const productsWithFeatureVector = await Product.countDocuments({ 
      featureVector: { $exists: true, $ne: [] } 
    });
    const productsWithCategory = await Product.countDocuments({ 
      category: { $ne: 'other', $exists: true } 
    });
    const productsWithCompatible = await Product.countDocuments({ 
      compatibleProducts: { $exists: true, $ne: [] } 
    });
    
    console.log('📈 Current status:');
    console.log(`   - Products with featureVector: ${productsWithFeatureVector}`);
    console.log(`   - Products with proper category: ${productsWithCategory}`);
    console.log(`   - Products with compatible products: ${productsWithCompatible}`);
    
    console.log('');
    console.log('🎯 Ready to continue fixing remaining products!');
    
  } catch (error) {
    console.error('❌ Error deleting products:', error);
    throw error;
  } finally {
    await disconnectDB();
    console.log('🔌 Disconnected from database');
  }
}

// Chạy script nếu được gọi trực tiếp
if (import.meta.url === `file://${process.argv[1]}`) {
  delete45000Products()
    .then(() => {
      console.log('🎉 Deletion completed successfully!');
      console.log('💡 You can now run: node scripts/runFix.js');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Deletion failed:', error);
      process.exit(1);
    });
}

export default delete45000Products;
