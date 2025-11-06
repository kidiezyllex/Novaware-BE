import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

dotenv.config();

const MAX_USERS = 2512; // Giới hạn số lượng users (ít hơn số products)

async function cleanupAmazonUsers() {
  try {
    console.log('🧹 Bắt đầu dọn dẹp Amazon users...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đếm số products
    const productCount = await Product.countDocuments();
    console.log(`📦 Số lượng products hiện có: ${productCount}`);
    
    // Đếm số Amazon users (có amazonUserId)
    const amazonUserCount = await User.countDocuments({ 
      amazonUserId: { $exists: true, $ne: null } 
    });
    console.log(`👥 Số lượng Amazon users hiện có: ${amazonUserCount}`);
    
    // Đếm tổng số users
    const totalUserCount = await User.countDocuments();
    console.log(`👥 Tổng số users hiện có: ${totalUserCount}\n`);
    
    if (amazonUserCount <= MAX_USERS) {
      console.log(`✅ Số lượng Amazon users (${amazonUserCount}) đã đúng giới hạn (≤ ${MAX_USERS}). Không cần xóa.`);
      await disconnectDB();
      process.exit(0);
    }
    
    const usersToDelete = amazonUserCount - MAX_USERS;
    console.log(`⚠️  Cần xóa: ${usersToDelete.toLocaleString()} Amazon users`);
    console.log(`⚠️  Sẽ giữ lại: ${MAX_USERS} Amazon users\n`);
    
    // Xác nhận
    console.log('⏳ Đang đợi 3 giây... (Nhấn Ctrl+C để hủy)\n');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Lấy tất cả Amazon users, sắp xếp theo thời gian tạo (mới nhất trước)
    // Giữ lại những users mới nhất, xóa những users cũ nhất
    console.log('🔍 Đang lấy danh sách Amazon users...');
    const amazonUsers = await User.find({ 
      amazonUserId: { $exists: true, $ne: null } 
    })
    .sort({ createdAt: -1 }) // Sắp xếp theo thời gian tạo (mới nhất trước)
    .select('_id amazonUserId createdAt')
    .lean();
    
    // Lấy những users cần xóa (những users cũ nhất)
    const usersToRemove = amazonUsers.slice(MAX_USERS);
    const userIdsToDelete = usersToRemove.map(u => u._id);
    
    console.log(`📋 Đã lấy danh sách ${usersToRemove.length} users cần xóa\n`);
    
    // Xóa users
    console.log('🗑️  Đang xóa users...');
    const deleteResult = await User.deleteMany({
      _id: { $in: userIdsToDelete }
    });
    
    console.log(`✅ Đã xóa: ${deleteResult.deletedCount.toLocaleString()} users`);
    
    // Xác minh lại
    const remainingAmazonUsers = await User.countDocuments({ 
      amazonUserId: { $exists: true, $ne: null } 
    });
    const remainingTotalUsers = await User.countDocuments();
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TỔNG KẾT:');
    console.log('='.repeat(60));
    console.log(`   ✅ Đã xóa: ${deleteResult.deletedCount.toLocaleString()} Amazon users`);
    console.log(`   👥 Amazon users còn lại: ${remainingAmazonUsers}`);
    console.log(`   👥 Tổng số users còn lại: ${remainingTotalUsers}`);
    console.log(`   📦 Số products: ${productCount}`);
    console.log(`   ✅ Số users (${remainingAmazonUsers}) < số products (${productCount})`);
    console.log('='.repeat(60));
    
    // Đóng kết nối database
    console.log('\n📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi khi dọn dẹp users:');
    console.error(error.message);
    console.error(error.stack);
    await disconnectDB();
    process.exit(1);
  }
}

// Chạy script
cleanupAmazonUsers();

