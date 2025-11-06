import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/db.js';
import Product from '../models/productModel.js';

dotenv.config();

async function main() {
  try {
    await connectDB();

    const query = { price: 0 };

    const totalZeroPrice = await Product.countDocuments(query);

    console.log('==============================');
    console.log('Đếm sản phẩm có giá = 0');
    console.log('==============================');
    console.log(`Tổng số sản phẩm price = 0: ${totalZeroPrice}`);

  } catch (err) {
    console.error('Lỗi khi đếm sản phẩm:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

main();


