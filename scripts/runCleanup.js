import { deleteLast5000Products, continueFixProducts } from './cleanupAndContinue.js';

console.log('🚀 Starting cleanup and continue process...');

// Chạy tuần tự: xóa 5000 sản phẩm cuối, sau đó tiếp tục fix
Promise.resolve()
  .then(() => {
    console.log('=== STEP 1: DELETE LAST 5000 PRODUCTS ===');
    return deleteLast5000Products();
  })
  .then(() => {
    console.log('');
    console.log('=== STEP 2: CONTINUE FIXING PRODUCTS ===');
    return continueFixProducts();
  })
  .then(() => {
    console.log('');
    console.log('🎉 Process completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 Process failed:', error);
    process.exit(1);
  });
