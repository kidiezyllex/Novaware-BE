import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';

dotenv.config();

const MAX_DELETE = 50000; // Số lượng tối đa cần xóa
const BATCH_SIZE = 1000; // Xóa theo batch để tránh quá tải

async function deleteProductsWithoutReviews() {
  try {
    console.log('🚀 Bắt đầu xóa products không có reviews...\n');
    console.log('='.repeat(60));

    // Kết nối database
    console.log('📡 Đang kết nối database...');
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');

    // Đếm số lượng products có reviews rỗng
    console.log('📊 Đang đếm số lượng products có reviews rỗng...');
    const totalCount = await Product.countDocuments({
      $or: [
        { reviews: { $exists: false } },
        { reviews: { $eq: [] } },
        { reviews: { $size: 0 } }
      ]
    });
    console.log(`📊 Tổng số products có reviews rỗng: ${totalCount.toLocaleString()}\n`);

    if (totalCount === 0) {
      console.log('✅ Không có products nào cần xóa!');
      await disconnectDB();
      process.exit(0);
    }

    // Xác nhận số lượng sẽ xóa
    const deleteCount = Math.min(totalCount, MAX_DELETE);
    console.log(`⚠️  SẼ XÓA: ${deleteCount.toLocaleString()} products (tối đa ${MAX_DELETE.toLocaleString()})`);
    console.log(`📝 Còn lại: ${(totalCount - deleteCount).toLocaleString()} products\n`);

    // Xóa theo batch
    console.log('='.repeat(60));
    console.log('Bắt đầu xóa products...');
    console.log('='.repeat(60));

    let deletedCount = 0;
    let batchNumber = 0;

    while (deletedCount < deleteCount) {
      batchNumber++;
      const remaining = deleteCount - deletedCount;
      const currentBatchSize = Math.min(BATCH_SIZE, remaining);

      console.log(`\n📦 Batch ${batchNumber}: Xóa ${currentBatchSize.toLocaleString()} products...`);

      // Tìm products cần xóa trong batch
      const productsToDelete = await Product.find({
        $or: [
          { reviews: { $exists: false } },
          { reviews: { $eq: [] } },
          { reviews: { $size: 0 } }
        ]
      })
      .limit(currentBatchSize)
      .select('_id')
      .lean();

      if (productsToDelete.length === 0) {
        console.log('\n⚠️  Không còn products nào để xóa trong batch này.');
        break;
      }

      // Lấy danh sách IDs để xóa
      const productIds = productsToDelete.map(p => p._id);

      // Xóa batch
      const result = await Product.deleteMany({
        _id: { $in: productIds }
      });

      const batchDeleted = result.deletedCount || 0;
      deletedCount += batchDeleted;

      console.log(`   ✅ Đã xóa: ${batchDeleted.toLocaleString()} products`);
      console.log(`   📊 Tổng đã xóa: ${deletedCount.toLocaleString()} / ${deleteCount.toLocaleString()}`);

      // Nghỉ ngắn giữa các batch để tránh quá tải
      if (deletedCount < deleteCount) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ Hoàn thành xóa products!');
    console.log('='.repeat(60));
    console.log(`📊 Tổng số đã xóa: ${deletedCount.toLocaleString()} products`);
    console.log(`📊 Còn lại trong database: ${(totalCount - deletedCount).toLocaleString()} products\n`);

    // Đóng kết nối database
    console.log('📡 Đang ngắt kết nối database...');
    await disconnectDB();
    console.log('✅ Ngắt kết nối thành công!');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Xóa products thất bại với lỗi:');
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

// Chạy script
deleteProductsWithoutReviews();

