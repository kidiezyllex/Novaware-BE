import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';

dotenv.config();

async function checkUsersForTesting() {
  try {
    console.log('📋 Đang kiểm tra users cho testing...\n');
    console.log('='.repeat(60));
    
    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Kiểm tra users có interactionHistory
    const totalUsers = await User.countDocuments({});
    const usersWithInteractions = await User.countDocuments({
      'interactionHistory.0': { $exists: true }
    });
    
    console.log('📊 THỐNG KÊ:');
    console.log(`   Tổng số users: ${totalUsers}`);
    console.log(`   Users có interactionHistory: ${usersWithInteractions}`);
    console.log(`   Users không có interactionHistory: ${totalUsers - usersWithInteractions}`);
    console.log('='.repeat(60));
    
    // Kiểm tra chi tiết cho personalization
    console.log('\n🔍 KIỂM TRA CHO PERSONALIZATION:');
    const personalizationUsers = await User.find({
      'interactionHistory.1': { $exists: true }
    })
    .select('_id name email interactionHistory')
    .limit(10)
    .lean();
    
    console.log(`   Số users đáp ứng: ${personalizationUsers.length}`);
    if (personalizationUsers.length > 0) {
      console.log('\n   Mẫu users (10 đầu tiên):');
      personalizationUsers.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.name} (${user.email})`);
        console.log(`      - Interaction count: ${user.interactionHistory?.length || 0}`);
      });
    }
    
    // Kiểm tra chi tiết cho outfit-suggestions
    console.log('\n🔍 KIỂM TRA CHO OUTFIT-SUGGESTIONS:');
    const targetCategories = ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories'];
    
    const usersWithInteractionsForOutfit = await User.find({
      'interactionHistory.1': { $exists: true }
    })
    .populate({
      path: 'interactionHistory.productId',
      select: 'category',
      match: { category: { $in: targetCategories } }
    })
    .limit(100)
    .lean();
    
    // Lọc users có sản phẩm từ ít nhất 2 categories khác nhau và có ít nhất 2 interactions
    const outfitUsers = usersWithInteractionsForOutfit.filter(user => {
      // Đảm bảo có ít nhất 2 interactions
      if (!user.interactionHistory || user.interactionHistory.length < 2) {
        return false;
      }
      
      const categories = new Set();
      user.interactionHistory?.forEach(interaction => {
        if (interaction.productId && interaction.productId.category) {
          categories.add(interaction.productId.category);
        }
      });
      return categories.size >= 2;
    });
    
    console.log(`   Số users đáp ứng: ${outfitUsers.length}`);
    if (outfitUsers.length > 0) {
      console.log('\n   Mẫu users (10 đầu tiên):');
      outfitUsers.slice(0, 10).forEach((user, index) => {
        const categories = new Set();
        user.interactionHistory?.forEach(interaction => {
          if (interaction.productId && interaction.productId.category) {
            categories.add(interaction.productId.category);
          }
        });
        console.log(`   ${index + 1}. ${user.name} (${user.email})`);
        console.log(`      - Interaction count: ${user.interactionHistory?.length || 0}`);
        console.log(`      - Categories: ${Array.from(categories).join(', ')}`);
      });
    }
    
    // Kiểm tra cấu trúc interactionHistory
    if (usersWithInteractions > 0) {
      console.log('\n📋 CẤU TRÚC INTERACTIONHISTORY (mẫu):');
      const sampleUser = await User.findOne({
        'interactionHistory.0': { $exists: true }
      })
      .select('interactionHistory')
      .lean();
      
      if (sampleUser && sampleUser.interactionHistory && sampleUser.interactionHistory.length > 0) {
        console.log(`   Số interactions: ${sampleUser.interactionHistory.length}`);
        console.log(`   Interaction đầu tiên:`, JSON.stringify(sampleUser.interactionHistory[0], null, 2));
      }
    } else {
      console.log('\n⚠️  Không có users nào có interactionHistory!');
      console.log('   Cần tạo interactionHistory cho users để có thể test.');
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
checkUsersForTesting();

