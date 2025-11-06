import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import gnnRecommender from '../services/gnnRecommender.js';

dotenv.config();

async function trainGNN() {
  try {
    console.log('🚀 Bắt đầu train GNN model...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Train GNN model
    console.log('🎯 Đang train GNN model...');
    const startTime = Date.now();
    
    try {
      // Force retrain bằng cách reset cache
      gnnRecommender.isTrained = false;
      gnnRecommender.lastTrainingTime = 0;
      
      await gnnRecommender.train();
      
      const endTime = Date.now();
      const trainingTime = ((endTime - startTime) / 1000).toFixed(2);
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ Train GNN model thành công!');
      console.log(`⏱️  Thời gian train: ${trainingTime} giây`);
      console.log('='.repeat(60));
      
    } catch (error) {
      console.error('\n❌ Lỗi khi train GNN model:');
      console.error(error.message);
      console.error(error.stack);
      throw error;
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
trainGNN();

