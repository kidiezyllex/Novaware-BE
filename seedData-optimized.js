import mongoose from 'mongoose';
import fs from 'fs';
import readline from 'readline';
import { faker } from '@faker-js/faker';
import dotenv from 'dotenv';
import Product from './models/productModel.js';
import User from './models/userModel.js';
import Outfit from './models/outfitModel.js';

// Load environment variables
dotenv.config();

mongoose.connect(process.env.MONGO_URI + 'novaware');

const BATCH_SIZE = 1000; // Process in batches of 1000

async function seedAmazonDataOptimized(metadataFile = './dataset/meta_Amazon_Fashion.jsonl', reviewsFile = './dataset/Amazon_Fashion.jsonl') {
  console.log('🚀 Starting optimized seeding process...');
  
  // Create Admin User first (or find existing)
  let adminUser = await User.findOne({ email: 'admin@novaware.com' });
  if (!adminUser) {
    adminUser = new User({
      name: 'Admin User',
      email: 'admin@novaware.com',
      password: 'admin123',
      gender: 'other',
      age: 30,
      height: 170,
      weight: 70,
      preferences: {
        style: 'casual',
        colorPreferences: ['black', 'white'],
        priceRange: { min: 50000, max: 1000000 },
      },
    });
    await adminUser.save();
    console.log('✅ Created admin user');
  } else {
    console.log('✅ Admin user already exists');
  }

  // Step 1: Process metadata in batches
  console.log('📦 Processing metadata in batches...');
  const metadataStream = fs.createReadStream(metadataFile);
  const metadataRL = readline.createInterface({ input: metadataStream, crlfDelay: Infinity });

  let productBatch = [];
  let totalProcessed = 0;
  let totalProducts = 0;

  for await (const line of metadataRL) {
    totalProcessed++;
    if (totalProcessed % 10000 === 0) {
      console.log(`📊 Processed ${totalProcessed} metadata items, inserted ${totalProducts} products...`);
    }

    try {
      const item = JSON.parse(line);
      if (item.main_category === 'AMAZON FASHION' || (item.categories && item.categories.includes('Clothing'))) {
        productBatch.push({
          name: item.title || 'Fashion Item',
          images: item.images?.map(img => img.large || img.hi_res || img.medium) || [],
          brand: item.details?.Brand || faker.company.name(),
          category: item.categories?.[1]?.toLowerCase() || 'other',
          description: item.description?.join(' ') || item.features?.join(' ') || 'No description',
          price: parseFloat(item.price) * 23000 || faker.number.int({ min: 50000, max: 1000000 }),
          sale: faker.number.int({ min: 0, max: 30 }),
          countInStock: faker.number.int({ min: 5, max: 50 }),
          size: { s: faker.number.int(20), m: faker.number.int(20), l: faker.number.int(20), xl: faker.number.int(20) },
          colors: Object.keys(item.details || {}).filter(k => k.includes('Color')).map(k => ({ name: item.details[k], hexCode: '#000000' })),
          outfitTags: item.categories?.map(c => c.toLowerCase()) || ['casual'],
          compatibleProducts: item.bought_together?.map(asin => ({ type: mongoose.Schema.Types.ObjectId, ref: 'Product', value: asin })) || [],
          featureVector: [],
          rating: item.average_rating || 0,
          numReviews: item.rating_number || 0,
          user: adminUser._id,
        });

        // Insert batch when it reaches BATCH_SIZE
        if (productBatch.length >= BATCH_SIZE) {
          try {
            await Product.insertMany(productBatch, { ordered: false });
            totalProducts += productBatch.length;
            console.log(`✅ Inserted batch of ${productBatch.length} products (Total: ${totalProducts})`);
          } catch (error) {
            // Handle duplicate key errors gracefully
            if (error.code === 11000) {
              console.log(`⚠️ Some products in batch already exist, skipping duplicates`);
            } else {
              console.error('❌ Error inserting product batch:', error.message);
            }
          }
          productBatch = []; // Clear batch
        }
      }
    } catch (e) {
      // Skip invalid JSON
    }
  }

  // Insert remaining products in the last batch
  if (productBatch.length > 0) {
    try {
      await Product.insertMany(productBatch, { ordered: false });
      totalProducts += productBatch.length;
      console.log(`✅ Inserted final batch of ${productBatch.length} products (Total: ${totalProducts})`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`⚠️ Some products in final batch already exist, skipping duplicates`);
      } else {
        console.error('❌ Error inserting final product batch:', error.message);
      }
    }
  }

  console.log(`🎉 Completed metadata processing! Total products: ${totalProducts}`);

  // Step 2: Process reviews in batches to create users
  console.log('👥 Processing reviews to create users...');
  const reviewsStream = fs.createReadStream(reviewsFile);
  const reviewsRL = readline.createInterface({ input: reviewsStream, crlfDelay: Infinity });

  const users = new Set();
  let reviewCount = 0;

  // First pass: collect unique user IDs
  for await (const line of reviewsRL) {
    reviewCount++;
    if (reviewCount % 100000 === 0) {
      console.log(`📊 Processed ${reviewCount} reviews, found ${users.size} unique users...`);
    }

    try {
      const review = JSON.parse(line);
      users.add(review.user_id);
    } catch (e) {
      // Skip invalid JSON
    }
  }

  console.log(`📊 Found ${users.size} unique users from reviews`);

  // Step 3: Create users in batches
  console.log('👥 Creating users in batches...');
  const userArray = Array.from(users);
  let totalUsers = 0;

  for (let i = 0; i < userArray.length; i += BATCH_SIZE) {
    const userBatch = userArray.slice(i, i + BATCH_SIZE).map(userId => ({
      name: faker.person.fullName(),
      email: faker.internet.email(),
      password: faker.internet.password(),
      gender: faker.helpers.arrayElement(['male', 'female', 'other']),
      age: faker.number.int({ min: 18, max: 60 }),
      height: faker.number.int({ min: 150, max: 190 }),
      weight: faker.number.int({ min: 40, max: 100 }),
      preferences: {
        style: faker.helpers.arrayElement(['casual', 'formal', 'sport']),
        colorPreferences: [faker.helpers.arrayElement(['black', 'white', 'blue'])],
        priceRange: { min: 50000, max: 1000000 },
      },
    }));

    try {
      await User.insertMany(userBatch, { ordered: false });
      totalUsers += userBatch.length;
      console.log(`✅ Inserted batch of ${userBatch.length} users (Total: ${totalUsers})`);
    } catch (error) {
      if (error.code === 11000) {
        console.log(`⚠️ Some users in batch already exist, skipping duplicates`);
      } else {
        console.error('❌ Error inserting user batch:', error.message);
      }
    }
  }

  console.log(`🎉 Completed user creation! Total users: ${totalUsers}`);

  // Final statistics
  const finalProductCount = await Product.countDocuments();
  const finalUserCount = await User.countDocuments();

  console.log('\n🎊 SEEDING COMPLETED! 🎊');
  console.log('📊 Final Statistics:');
  console.log(`Products: ${finalProductCount}`);
  console.log(`Users: ${finalUserCount}`);
  console.log(`Admin User: ${adminUser.email}`);

  mongoose.disconnect();
}

seedAmazonDataOptimized().catch(console.error);
