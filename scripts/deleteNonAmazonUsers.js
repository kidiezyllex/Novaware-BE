import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import User from '../models/userModel.js';

dotenv.config();

const BATCH_SIZE = 1000; // Xóa theo batch để tránh quá tải

async function deleteNonAmazonUsers() {
  try {
    console.log('🧹 Bắt đầu xóa users không có amazonUserId...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đếm số users không có amazonUserId
    const nonAmazonUsersCount = await User.countDocuments({ 
      $or: [
        { amazonUserId: { $exists: false } },
        { amazonUserId: null }
      ]
    });
    
    const amazonUsersCount = await User.countDocuments({ 
      amazonUserId: { $exists: true, $ne: null } 
    });
    
    const totalUsers = await User.countDocuments();
    
    console.log(`📊 Tổng số users hiện có: ${totalUsers.toLocaleString()}`);
    console.log(`👥 Amazon users (sẽ giữ lại): ${amazonUsersCount.toLocaleString()}`);
    console.log(`🗑️  Users khác (sẽ xóa): ${nonAmazonUsersCount.toLocaleString()}\n`);
    
    if (nonAmazonUsersCount === 0) {
      console.log('✅ Không có users nào cần xóa!');
      await disconnectDB();
      process.exit(0);
    }
    
    // Xác nhận
    console.log(`⚠️  SẼ XÓA: ${nonAmazonUsersCount.toLocaleString()} users`);
    console.log(`⚠️  CẢNH BÁO: Đây là thao tác KHÔNG THỂ HOÀN TÁC!\n`);
    console.log('⏳ Đang đợi 3 giây... (Nhấn Ctrl+C để hủy)\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Xóa theo batch
    console.log('='.repeat(60));
    console.log('Bắt đầu xóa users...');
    console.log('='.repeat(60));
    
    let deletedCount = 0;
    let batchNumber = 0;
    const startTime = Date.now();
    
    while (deletedCount < nonAmazonUsersCount) {
      batchNumber++;
      const remaining = nonAmazonUsersCount - deletedCount;
      const currentBatchSize = Math.min(BATCH_SIZE, remaining);
      
      console.log(`\n📦 Batch ${batchNumber}: Xóa ${currentBatchSize.toLocaleString()} users...`);
      
      // Tìm users cần xóa trong batch
      const usersToDelete = await User.find({
        $or: [
          { amazonUserId: { $exists: false } },
          { amazonUserId: null }
        ]
      })
        .select('_id email')
        .limit(currentBatchSize)
        .lean();
      
      if (usersToDelete.length === 0) {
        console.log('✅ Không còn users nào để xóa');
        break;
      }
      
      // Lấy danh sách IDs để xóa
      const userIds = usersToDelete.map(u => u._id);
      
      // Xóa batch
      const deleteResult = await User.deleteMany({
        _id: { $in: userIds }
      });
      
      deletedCount += deleteResult.deletedCount;
      
      // Tính toán thời gian và tốc độ
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = deletedCount / elapsed;
      const remainingTime = (nonAmazonUsersCount - deletedCount) / rate;
      
      console.log(`   ✅ Đã xóa: ${deleteResult.deletedCount.toLocaleString()} users`);
      console.log(`   📊 Tổng đã xóa: ${deletedCount.toLocaleString()}/${nonAmazonUsersCount.toLocaleString()} (${((deletedCount / nonAmazonUsersCount) * 100).toFixed(2)}%)`);
      console.log(`   ⏱️  Tốc độ: ${rate.toFixed(0)} users/giây`);
      console.log(`   ⏳ Thời gian còn lại: ~${Math.round(remainingTime)} giây`);
      
      // Cleanup memory
      if (global.gc) {
        global.gc();
      }
    }
    
    // Xác minh lại
    console.log('\n' + '='.repeat(60));
    console.log('📊 Đang xác minh kết quả...');
    const remainingNonAmazonUsers = await User.countDocuments({ 
      $or: [
        { amazonUserId: { $exists: false } },
        { amazonUserId: null }
      ]
    });
    const remainingAmazonUsers = await User.countDocuments({ 
      amazonUserId: { $exists: true, $ne: null } 
    });
    const remainingTotalUsers = await User.countDocuments();
    
    console.log(`✅ Còn lại ${remainingNonAmazonUsers.toLocaleString()} users không có amazonUserId`);
    console.log(`✅ Còn lại ${remainingAmazonUsers.toLocaleString()} Amazon users`);
    console.log(`✅ Tổng số users còn lại: ${remainingTotalUsers.toLocaleString()}`);
    
    // Tổng kết
    console.log('\n' + '='.repeat(60));
    console.log('📊 TỔNG KẾT:');
    console.log('='.repeat(60));
    console.log(`   ✅ Đã xóa: ${deletedCount.toLocaleString()} users`);
    console.log(`   👥 Amazon users còn lại: ${remainingAmazonUsers.toLocaleString()}`);
    console.log(`   👥 Tổng số users còn lại: ${remainingTotalUsers.toLocaleString()}`);
    console.log(`   ⏱️  Tổng thời gian: ${((Date.now() - startTime) / 1000).toFixed(2)} giây`);
    console.log(`   📊 Tốc độ trung bình: ${(deletedCount / ((Date.now() - startTime) / 1000)).toFixed(0)} users/giây`);
    console.log('='.repeat(60));
    
    // Đóng kết nối database
    console.log('\n📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi xóa users:');
    console.error(error.message);
    console.error(error.stack);
    await disconnectDB();
    process.exit(1);
  }
}

// Chạy script
deleteNonAmazonUsers();

