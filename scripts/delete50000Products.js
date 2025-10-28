console.log('🚀 Starting delete 50,000 products script...');

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import { connectDB, disconnectDB } from '../config/db.js';

dotenv.config();

async function delete50000Products() {
  try {
    console.log('🔗 Connecting to database...');
    await connectDB();
    console.log('✅ Connected to database');
    
    console.log('📊 Counting total products...');
    const totalProducts = await Product.countDocuments({});
    console.log(`Found ${totalProducts} products in database`);
    
    if (totalProducts <= 50000) {
      console.log('❌ Not enough products to delete');
      return;
    }
    
    console.log('🗑️ Starting deletion process...');
    
    // Xóa từng batch nhỏ để tránh timeout
    const BATCH_SIZE = 1000;
    const TOTAL_TO_DELETE = 50000;
    let deletedCount = 0;
    
    while (deletedCount < TOTAL_TO_DELETE) {
      const remainingToDelete = TOTAL_TO_DELETE - deletedCount;
      const currentBatchSize = Math.min(BATCH_SIZE, remainingToDelete);
      
      console.log(`📦 Deleting batch: ${deletedCount + 1}-${deletedCount + currentBatchSize}`);
      
      // Lấy sản phẩm để xóa
      const productsToDelete = await Product.find({})
        .sort({ _id: -1 })
        .limit(currentBatchSize)
        .select('_id');
      
      if (productsToDelete.length === 0) {
        console.log('❌ No more products to delete');
        break;
      }
      
      // Xóa batch
      const deleteResult = await Product.deleteMany({
        _id: { $in: productsToDelete.map(p => p._id) }
      });
      
      deletedCount += deleteResult.deletedCount;
      console.log(`✅ Deleted ${deleteResult.deletedCount} products (Total: ${deletedCount})`);
      
      // Nghỉ một chút để tránh overload
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`🎉 Successfully deleted ${deletedCount} products`);
    
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
    
  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await disconnectDB();
    console.log('🔌 Disconnected from database');
  }
}

// Chạy script
delete50000Products()
  .then(() => {
    console.log('🎉 Script completed successfully!');
    console.log('💡 You can now run: node scripts/runFix.js');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Script failed:', error);
    process.exit(1);
  });
