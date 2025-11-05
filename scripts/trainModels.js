import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';

dotenv.config();

async function trainModels() {
  try {
    console.log('🚀 Bắt đầu train lại 2 mô hình...\n');
    console.log('='.repeat(60));

    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');

    // Train GNN model - sử dụng trainIncremental như trong router
    console.log('='.repeat(60));
    console.log('STEP 1: TRAIN GNN MODEL (incremental)');
    console.log('='.repeat(60));
    const gnnStartTime = Date.now();
    try {
      await gnnRecommender.trainIncremental();
      const gnnTime = ((Date.now() - gnnStartTime) / 1000).toFixed(2);
      console.log(`\n✅ GNN model training hoàn thành trong ${gnnTime}s`);
    } catch (error) {
      console.error('\n❌ Lỗi khi train GNN model:', error.message);
      throw error;
    }

    console.log('\n' + '='.repeat(60));
    
    // Train Hybrid model - sử dụng trainIncremental như trong router
    console.log('='.repeat(60));
    console.log('STEP 2: TRAIN HYBRID MODEL (incremental)');
    console.log('='.repeat(60));
    const hybridStartTime = Date.now();
    try {
      await hybridRecommender.trainIncremental();
      const hybridTime = ((Date.now() - hybridStartTime) / 1000).toFixed(2);
      console.log(`\n✅ Hybrid model training hoàn thành trong ${hybridTime}s`);
    } catch (error) {
      console.error('\n❌ Lỗi khi train Hybrid model:', error.message);
      throw error;
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Hoàn thành train cả 2 mô hình!\n');

    // Đóng kết nối database
    console.log('📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Training failed với lỗi:');
    console.error(error);
    console.error('\nStack trace:', error.stack);
    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error('Lỗi khi ngắt kết nối:', disconnectError);
    }
    process.exit(1);
  }
}

// Chạy training
trainModels();

