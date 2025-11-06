import { connectDB, disconnectDB } from '../config/db.js';
import dotenv from 'dotenv';
import Product from '../models/productModel.js';
import User from '../models/userModel.js';
import fs from 'fs';
import readline from 'readline';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const REVIEW_FILE = path.join(__dirname, '../data/Amazon_Fashion.jsonl');

async function debugReviewUpdate() {
  try {
    console.log('🔍 Debug: Kiểm tra tại sao không cập nhật được reviews...\n');
    
    await connectDB();
    console.log('✅ Kết nối database thành công!\n');
    
    // Lấy một vài products chưa có reviews từ Amazon
    const productsWithoutAmazon = await Product.find({
      amazonParentAsin: { $exists: true, $ne: null },
      $or: [
        { reviews: { $size: 0 } },
        { 'reviews.name': { $not: { $regex: '^Amazon User' } } }
      ]
    })
    .select('_id name amazonParentAsin reviews')
    .limit(5)
    .lean();
    
    console.log(`📦 Tìm thấy ${productsWithoutAmazon.length} products để debug:\n`);
    
    // Lấy users
    const users = await User.find({ amazonUserId: { $exists: true, $ne: null } })
      .select('_id amazonUserId')
      .lean();
    
    const userMap = new Map();
    users.forEach(u => {
      if (u.amazonUserId) {
        userMap.set(u.amazonUserId, u);
      }
    });
    console.log(`👥 Có ${users.length} users với amazonUserId\n`);
    
    // Đọc reviews từ file cho các parent_asins này
    const parentAsins = productsWithoutAmazon.map(p => p.amazonParentAsin);
    const reviewsByParentAsin = new Map();
    
    console.log('📖 Đang đọc reviews từ file...');
    const fileStream = fs.createReadStream(REVIEW_FILE, { encoding: 'utf8' });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    
    let lineCount = 0;
    let foundCount = 0;
    
    for await (const line of rl) {
      if (!line.trim()) continue;
      
      try {
        const review = JSON.parse(line);
        const parentAsin = review.parent_asin || review.parentAsin;
        const userId = review.user_id;
        
        if (parentAsins.includes(parentAsin)) {
          if (!reviewsByParentAsin.has(parentAsin)) {
            reviewsByParentAsin.set(parentAsin, []);
          }
          reviewsByParentAsin.get(parentAsin).push(review);
          foundCount++;
        }
        
        lineCount++;
        if (lineCount % 100000 === 0) {
          process.stdout.write(`   Đã đọc ${lineCount.toLocaleString()} dòng...\r`);
        }
      } catch (error) {
        continue;
      }
    }
    
    console.log(`\n✅ Đã đọc ${lineCount.toLocaleString()} dòng`);
    console.log(`📊 Tìm thấy ${foundCount} reviews cho ${parentAsins.length} parent_asins\n`);
    
    // Kiểm tra từng product
    for (const product of productsWithoutAmazon) {
      console.log('='.repeat(60));
      console.log(`📦 Product: ${product.name?.substring(0, 60)}...`);
      console.log(`   ID: ${product._id}`);
      console.log(`   amazonParentAsin: ${product.amazonParentAsin}`);
      console.log(`   Reviews hiện tại: ${product.reviews?.length || 0}`);
      
      const reviews = reviewsByParentAsin.get(product.amazonParentAsin) || [];
      console.log(`   Reviews trong file: ${reviews.length}`);
      
      if (reviews.length > 0) {
        // Kiểm tra users
        let userFoundCount = 0;
        let userNotFoundCount = 0;
        
        for (const review of reviews.slice(0, 10)) { // Chỉ check 10 reviews đầu
          const user = userMap.get(review.user_id);
          if (user) {
            userFoundCount++;
          } else {
            userNotFoundCount++;
            if (userNotFoundCount <= 3) {
              console.log(`   ❌ User không tìm thấy: ${review.user_id}`);
            }
          }
        }
        
        console.log(`   👥 Users có trong DB: ${userFoundCount}/${Math.min(10, reviews.length)}`);
        console.log(`   ❌ Users không có trong DB: ${userNotFoundCount}/${Math.min(10, reviews.length)}`);
      } else {
        console.log(`   ⚠️  Không có reviews trong file cho parentAsin này!`);
      }
    }
    
    await disconnectDB();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Lỗi:');
    console.error(error.message);
    console.error(error.stack);
    await disconnectDB();
    process.exit(1);
  }
}

debugReviewUpdate();

