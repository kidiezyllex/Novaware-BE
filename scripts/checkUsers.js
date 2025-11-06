import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import User from '../models/userModel.js';

dotenv.config();

async function checkUsers() {
  try {
    console.log('📊 Kiểm tra số lượng users...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Đếm tổng số users
    const totalUsers = await User.countDocuments();
    console.log(`👥 Tổng số users: ${totalUsers.toLocaleString()}`);
    
    // Đếm Amazon users (có amazonUserId)
    const amazonUsers = await User.countDocuments({ 
      amazonUserId: { $exists: true, $ne: null } 
    });
    console.log(`👥 Amazon users (có amazonUserId): ${amazonUsers.toLocaleString()}`);
    
    // Đếm users khác (không có amazonUserId)
    const otherUsers = await User.countDocuments({ 
      $or: [
        { amazonUserId: { $exists: false } },
        { amazonUserId: null }
      ]
    });
    console.log(`👥 Users khác (không có amazonUserId): ${otherUsers.toLocaleString()}`);
    
    // Kiểm tra users có email placeholder
    const placeholderUsers = await User.countDocuments({
      email: { $regex: /@placeholder\.com$/ }
    });
    console.log(`👥 Users có email placeholder: ${placeholderUsers.toLocaleString()}`);
    
    // Kiểm tra users có email thật
    const realEmailUsers = await User.countDocuments({
      email: { $not: { $regex: /@placeholder\.com$/ } }
    });
    console.log(`👥 Users có email thật: ${realEmailUsers.toLocaleString()}`);
    
    console.log('\n' + '='.repeat(60));
    console.log('📊 TÓM TẮT:');
    console.log('='.repeat(60));
    console.log(`   Tổng số users: ${totalUsers.toLocaleString()}`);
    console.log(`   - Amazon users: ${amazonUsers.toLocaleString()}`);
    console.log(`   - Users khác: ${otherUsers.toLocaleString()}`);
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
checkUsers();

