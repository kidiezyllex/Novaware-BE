import fixProducts from './fixProducts.js';

console.log('🚀 Starting product data fix...');

fixProducts()
  .then(() => {
    console.log('Fix completed. Run server & test API.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fix failed:', error);
    process.exit(1);
  });
