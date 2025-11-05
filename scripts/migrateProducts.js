import mongoose from "mongoose";
import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../config/db.js";
import Product from "../models/productModel.js";
import Color from "../models/colorModel.js";
import Size from "../models/sizeModel.js";
import User from "../models/userModel.js";
import faker from "faker";

dotenv.config();

// Progress bar utility
class ProgressBar {
  constructor(total, barLength = 30) {
    this.total = total;
    this.current = 0;
    this.barLength = barLength;
    this.startTime = Date.now();
    this.lastUpdate = 0;
  }

  update(current, label = "") {
    this.current = current;
    const percentage = (this.current / this.total) * 100;
    const filledLength = Math.round((this.barLength * this.current) / this.total);
    
    // Use simple characters for better Windows compatibility
    const filled = "=".repeat(filledLength);
    const empty = "-".repeat(this.barLength - filledLength);
    const bar = `[${filled}${empty}]`;
    
    // Calculate elapsed time and ETA
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / elapsed;
    const remaining = this.total - this.current;
    const eta = rate > 0 ? Math.round(remaining / rate / 1000) : 0;
    
    const productName = label.length > 30 ? label.substring(0, 27) + "..." : label;
    
    const message = `${bar} ${percentage.toFixed(1)}% | ${this.current}/${this.total} | ETA: ${eta}s | ${productName}`;
    
    if (this.current === this.total) {
      const totalTime = Math.floor((Date.now() - this.startTime) / 1000);
    }
  }
}

// Initialize Color and Size collections
async function initializeColorAndSize() {
  // Standard sizes
  const standardSizes = [
    { name: "Small", code: "S" },
    { name: "Medium", code: "M" },
    { name: "Large", code: "L" },
    { name: "Extra Large", code: "XL" },
  ];

  // Create or get sizes
  const sizeMap = new Map();
  for (const sizeData of standardSizes) {
    let size = await Size.findOne({ code: sizeData.code });
    if (!size) {
      size = await Size.create(sizeData);
      console.log(`  ✓ Created Size: ${sizeData.code}`);
    } else {
      console.log(`  ✓ Size already exists: ${sizeData.code}`);
    }
    sizeMap.set(sizeData.code.toLowerCase(), size._id);
  }

  console.log("  ✅ Size map created with", sizeMap.size, "sizes");
  return { sizeMap };
}

// Get or create Color
async function getOrCreateColor(colorName, hexCode) {
  let color = await Color.findOne({ name: colorName });
  if (!color) {
    color = await Color.create({ name: colorName, hexCode });
  }
  return color;
}

// Map size code to short code used in variants
function mapSizeCodeToShort(code) {
  if (!code) return '';
  const c = String(code).toUpperCase();
  switch (c) {
    case 'S': return 'sm';
    case 'M': return 'm';
    case 'L': return 'l';
    case 'XL': return 'xl';
    default: return c.toLowerCase();
  }
}

// Ensure at least 3 colors (fill with defaults if needed)
function ensureAtLeastThreeColors(colors) {
  const defaults = [
    { name: 'Black', hexCode: '#000000' },
    { name: 'White', hexCode: '#FFFFFF' },
    { name: 'Gray', hexCode: '#808080' },
    { name: 'Navy', hexCode: '#001F3F' },
  ];
  const existingHex = new Set((colors || []).map(c => (c.hexCode || '').toLowerCase()));
  const result = [...(colors || [])];
  let idx = 0;
  while (result.length < 3 && idx < defaults.length) {
    const d = defaults[idx++];
    if (!existingHex.has((d.hexCode || '').toLowerCase())) {
      result.push(d);
      existingHex.add((d.hexCode || '').toLowerCase());
    }
  }
  // Cap to maximum of 6 colors to keep variant explosion under control
  if (result.length > 6) {
    // Simple deterministic trim: take first 6
    return result.slice(0, 6);
  }
  return result;
}

// Process a single product to create variants (overwrite, build color × size)
async function processProductVariants(product, sizeMap) {
  const variantCandidates = [];

  // Get colors from product
  let colors = product.colors || [];
  if (colors.length === 0) {
    // If no colors, create a default color and variant
    const defaultColor = await getOrCreateColor("Default", "#000000");
    const defaultSizeId = sizeMap.get("m"); // Default to Medium
    if (defaultSizeId) {
      variantCandidates.push({
        color: (defaultColor.hexCode || '#000000'),
        size: mapSizeCodeToShort('M'),
        price: product.price || 0,
        stock: product.countInStock || 0,
      });
    }
  } else {
    // Ensure at least 3 colors
    colors = ensureAtLeastThreeColors(colors);
    // Create variants for each color and size combination
    const sizeKeys = ["s", "m", "l", "xl"];

    // Prepare per-size total stock from legacy field
    const sizeTotals = {
      s: (product.size && product.size.s) || 0,
      m: (product.size && product.size.m) || 0,
      l: (product.size && product.size.l) || 0,
      xl: (product.size && product.size.xl) || 0,
    };

    const numColors = colors.length;

    // Determine price adjustments per size and color
    const sizePriceAdjPct = { s: 0.00, m: 0.01, l: 0.02, xl: 0.03 };

    for (let colorIdx = 0; colorIdx < colors.length; colorIdx++) {
      const colorData = colors[colorIdx];
      // Persist color if not existed, but use hex in variants
      const colorDoc = await getOrCreateColor(colorData.name, colorData.hexCode);

      // Simple small color-based price adjustment (0%, 1%, 2%, 3% ... capped)
      const colorAdjPct = Math.min(colorIdx * 0.01, 0.03);

      for (const sizeKey of sizeKeys) {
        const sizeId = sizeMap.get(sizeKey);
        if (!sizeId) continue;

        // Calculate stock per variant by splitting size total evenly across colors
        const totalForSize = sizeTotals[sizeKey] || 0;
        const basePerColor = Math.floor(totalForSize / (numColors || 1));
        const remainder = totalForSize % (numColors || 1);
        const stockForThisColor = basePerColor + (colorIdx < remainder ? 1 : 0);

        // Price per variant = base price with size + color adjustments
        const basePrice = product.price || 0;
        const adjusted = basePrice * (1 + (sizePriceAdjPct[sizeKey] || 0) + colorAdjPct);
        const priceForVariant = Math.round(adjusted);

        variantCandidates.push({
          color: (colorDoc.hexCode || colorData.hexCode || '#000000'),
          size: mapSizeCodeToShort(sizeKey),
          price: priceForVariant,
          stock: stockForThisColor,
        });
      }
    }
  }

  // If no candidates created, create at least one default variant
  if (variantCandidates.length === 0) {
    const defaultSizeId = sizeMap.get("m");
    if (defaultSizeId) {
      // Create or get a default color
      const defaultColor = await getOrCreateColor("Default", "#000000");
      variantCandidates.push({
        color: (defaultColor.hexCode || '#000000'),
        size: mapSizeCodeToShort('M'),
        price: product.price || 0,
        stock: product.countInStock || 0,
      });
    }
  }

  // Update product with ALL variant combinations per requirement (overwrite)
  product.variants = variantCandidates;
  await product.save();
  return { status: 'migrated', variantsCount: variantCandidates.length };
}

// Migrate variants from colors and size to variants array (batch processing)
async function migrateVariants() {
  try {
    console.log("\n🔄 Migrating variants from colors and size...\n");

    console.log("📦 Step 1: Initializing Color and Size collections...");
    const { sizeMap } = await initializeColorAndSize();
    console.log("✅ Color and Size initialized successfully!\n");

    console.log("📦 Step 2: Counting total products...");
    const totalProducts = await Product.countDocuments({});
    console.log(`✅ Found ${totalProducts} products in database\n`);
    
    if (totalProducts === 0) {
      console.log("⚠️  No products found in database. Skipping migration.");
      return;
    }
    
    // Batch processing configuration
    const BATCH_SIZE = 100; // Process 100 products at a time
    const totalBatches = Math.ceil(totalProducts / BATCH_SIZE);
    
    console.log(`📊 Starting migration for ${totalProducts} products...`);
    console.log(`   Batch size: ${BATCH_SIZE} products`);
    console.log(`   Total batches: ${totalBatches}\n`);
    
    const progressBar = new ProgressBar(totalProducts, 50);
    let migratedCount = 0;
    let skippedCount = 0;
    let processedCount = 0;

    console.log("📦 Step 3: Processing products in batches...\n");
    
    // Process in batches
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const skip = batchNum * BATCH_SIZE;
      
      console.log(`\n📦 Processing batch ${batchNum + 1}/${totalBatches} (products ${skip + 1} to ${Math.min(skip + BATCH_SIZE, totalProducts)})...`);
      
      // Fetch batch of products
      const products = await Product.find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(); // Use lean() for better performance
      
      // Process each product in the batch
      for (let i = 0; i < products.length; i++) {
        const productDoc = products[i];
        processedCount++;
        
        // Update progress bar per product with index and name
        progressBar.update(
          processedCount,
          `#${processedCount} ${productDoc.name ? String(productDoc.name).slice(0, 30) : ''}`
        );

        try {
          // Fetch full product document for saving
          const product = await Product.findById(productDoc._id);
          if (!product) continue;

          const result = await processProductVariants(product, sizeMap);
          
          if (result.status === 'migrated') {
            migratedCount++;
          } else {
            skippedCount++;
          }
        } catch (error) {
          console.error(`\n❌ Error migrating product ${productDoc._id}:`, error.message);
        }
      }
      
      // Log batch completion
      console.log(`   ✅ Batch ${batchNum + 1} completed: ${migratedCount} migrated, ${skippedCount} skipped`);
      
      // Small delay to prevent overwhelming the database
      if (batchNum < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n✅ Variants migration completed!`);
    console.log(`   - Total processed: ${processedCount} products`);
    console.log(`   - Migrated: ${migratedCount} products`);
    console.log(`   - Skipped (already have variants): ${skippedCount} products`);
  } catch (error) {
    console.error("\n❌ Error in migrateVariants:", error);
    console.error("Stack:", error.stack);
    throw error;
  }
}

// Process a single product to generate reviews (target exactly numReviews, block until done)
async function processProductReviews(product, users) {
  const currentReviewsCount = product.reviews ? product.reviews.length : 0;
  const expectedReviewsCount = product.numReviews || 0;

  if (currentReviewsCount >= expectedReviewsCount) {
    return { status: 'skipped', reviewsCount: currentReviewsCount };
  }

  let reviewsNeeded = expectedReviewsCount - currentReviewsCount;
  let newReviews = [];

  // Build set of existing reviewer userIds
  const existingUserIds = new Set((product.reviews || []).map(r => String(r.user)));
  // Candidates are users not already used
  const candidateUsers = users.filter(u => !existingUserIds.has(String(u._id)));

  // 1) Use as many unique new users as possible
  const uniqueToAdd = Math.min(reviewsNeeded, candidateUsers.length);
  for (let j = 0; j < uniqueToAdd; j++) {
    const idx = Math.floor(Math.random() * candidateUsers.length);
    const [picked] = candidateUsers.splice(idx, 1);
    const review = {
      name: picked.name || faker.name.findName(),
      rating: faker.random.number({ min: 1, max: 5 }),
      comment: faker.lorem.sentences(
        faker.random.number({ min: 1, max: 3 })
      ),
      user: picked._id,
    };
    newReviews.push(review);
  }

  // 2) If still need more (not enough unique users), fill with random users (may duplicate)
  let remaining = reviewsNeeded - uniqueToAdd;
  for (let k = 0; k < remaining; k++) {
    const picked = users[Math.floor(Math.random() * users.length)];
    const review = {
      name: picked.name || faker.name.findName(),
      rating: faker.random.number({ min: 1, max: 5 }),
      comment: faker.lorem.sentences(
        faker.random.number({ min: 1, max: 3 })
      ),
      user: picked._id,
    };
    newReviews.push(review);
  }

  // Add new reviews
  if (!product.reviews) {
    product.reviews = [];
  }
  product.reviews.push(...newReviews);

  // Recalculate rating
  const allRatings = product.reviews.map((r) => r.rating);
  const avgRating =
    allRatings.reduce((sum, rating) => sum + rating, 0) /
    allRatings.length;
  product.rating = Math.round(avgRating * 10) / 10; // Round to 1 decimal

  // Update numReviews to match exactly expected count if we fulfilled it
  product.numReviews = product.reviews.length;

  await product.save();
  // If still not enough (edge), keep adding until reach target or throw after retries
  let retries = 0;
  while (product.reviews.length < expectedReviewsCount) {
    if (retries++ > 3) {
      throw new Error(`Unable to reach numReviews=${expectedReviewsCount} after retries`);
    }
    const need = expectedReviewsCount - product.reviews.length;
    newReviews = [];
    for (let k = 0; k < need; k++) {
      const picked = users[Math.floor(Math.random() * users.length)];
      newReviews.push({
        name: picked.name || faker.name.findName(),
        rating: faker.random.number({ min: 1, max: 5 }),
        comment: faker.lorem.sentences(
          faker.random.number({ min: 1, max: 3 })
        ),
        user: picked._id,
      });
    }
    product.reviews.push(...newReviews);
    const ratings = product.reviews.map(r => r.rating);
    const avg = ratings.reduce((a,b)=>a+b,0)/ratings.length;
    product.rating = Math.round(avg * 10) / 10;
    product.numReviews = product.reviews.length;
    await product.save();
  }

  // Verification log for this product after final save
  {
    const reviewsLength = (product.reviews || []).length;
    const numReviewsVal = product.numReviews || 0;
    const isMatch = numReviewsVal === reviewsLength;
    console.log(
      `   ▶ Product ${product._id}: numReviews=${numReviewsVal}, reviews.length=${reviewsLength} -> match=${isMatch ? 'YES' : 'NO'}`
    );
  }

  return { status: 'updated', reviewsAdded: product.numReviews - currentReviewsCount };
}

// Generate reviews for products (batch processing)
async function generateReviews() {
  try {
    console.log("\n📝 Generating reviews for products...\n");

    console.log("📦 Step 1: Fetching users...");
    const users = await User.find({});
    
    if (users.length === 0) {
      console.log("⚠️  No users found. Please create users first.");
      return;
    }
    console.log(`✅ Found ${users.length} users\n`);

    console.log("📦 Step 2: Counting total products...");
    const totalProducts = await Product.countDocuments({});
    
    if (totalProducts === 0) {
      console.log("⚠️  No products found in database.");
      return;
    }
    
    console.log(`✅ Found ${totalProducts} products in database\n`);
    
    // Batch processing configuration
    const BATCH_SIZE = 100; // Process 100 products at a time
    const totalBatches = Math.ceil(totalProducts / BATCH_SIZE);
    
    console.log(`📊 Starting review generation for ${totalProducts} products...`);
    console.log(`   Batch size: ${BATCH_SIZE} products`);
    console.log(`   Total batches: ${totalBatches}\n`);
    
    const progressBar = new ProgressBar(totalProducts, 50);
    let totalReviewsAdded = 0;
    let productsUpdated = 0;
    let productsSkipped = 0;
    let processedCount = 0;

    console.log("📦 Step 3: Processing products in batches...\n");
    
    // Process in batches
    for (let batchNum = 0; batchNum < totalBatches; batchNum++) {
      const skip = batchNum * BATCH_SIZE;
      
      console.log(`\n📦 Processing batch ${batchNum + 1}/${totalBatches} (products ${skip + 1} to ${Math.min(skip + BATCH_SIZE, totalProducts)})...`);
      
      // Fetch batch of products
      const products = await Product.find({})
        .skip(skip)
        .limit(BATCH_SIZE)
        .lean(); // Use lean() for better performance
      
      // Process each product in the batch
      for (let i = 0; i < products.length; i++) {
        const productDoc = products[i];
        processedCount++;
        
        // Update progress bar per product with index and name
        progressBar.update(
          processedCount,
          `#${processedCount} ${productDoc.name ? String(productDoc.name).slice(0, 30) : ''}`
        );

        try {
          // Fetch full product document for saving
          const product = await Product.findById(productDoc._id);
          if (!product) continue;

          const result = await processProductReviews(product, users);
          
          if (result.status === 'updated') {
            productsUpdated++;
            totalReviewsAdded += result.reviewsAdded;
          } else {
            productsSkipped++;
          }

          // Log verification that numReviews matches reviews.length for this product
          const reviewsLength = (product.reviews || []).length;
          const numReviewsVal = product.numReviews || 0;
          const isMatch = numReviewsVal === reviewsLength;
          console.log(
            `   ▶ Product ${product._id}: numReviews=${numReviewsVal}, reviews.length=${reviewsLength} -> match=${isMatch ? 'YES' : 'NO'}`
          );
        } catch (error) {
          console.error(`\n❌ Error generating reviews for product ${productDoc._id}:`, error.message);
        }
      }
      
      // Log batch completion
      console.log(`   ✅ Batch ${batchNum + 1} completed: ${productsUpdated} updated, ${productsSkipped} skipped, ${totalReviewsAdded} reviews added`);
      
      // Small delay to prevent overwhelming the database
      if (batchNum < totalBatches - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`\n✅ Reviews generation completed!`);
    console.log(`   - Total processed: ${processedCount} products`);
    console.log(`   - Products updated: ${productsUpdated}`);
    console.log(`   - Products skipped (already have enough reviews): ${productsSkipped}`);
    console.log(`   - Total reviews added: ${totalReviewsAdded}`);
  } catch (error) {
    console.error("\n❌ Error in generateReviews:", error);
    console.error("Stack:", error.stack);
    throw error;
  }
}

// Helper: fetch random users equal to needed review count
async function fetchRandomUsers(count) {
  if (!count || count <= 0) return [];
  try {
    const sampled = await User.aggregate([{ $sample: { size: count } }]);
    if (sampled && sampled.length > 0) return sampled;
  } catch (e) {
    // fallthrough to simple find
  }
  return await User.find({}).limit(count);
}

// Process a single product in required order: variants then reviews
async function processOneProduct(product, sizeMap, index, total, progressBar) {
  console.log(`▶ Processing #${index}/${total} _id=${product._id}`);
  await processProductVariants(product, sizeMap);
  // Determine how many reviews we still need and fetch only that many random users
  const currentReviewsCount = product.reviews ? product.reviews.length : 0;
  const expectedReviewsCount = product.numReviews || 0;
  const reviewsNeeded = Math.max(expectedReviewsCount - currentReviewsCount, 0);
  if (reviewsNeeded > 0) {
    const users = await fetchRandomUsers(reviewsNeeded);
    await processProductReviews(product, users);
  }
  // progress update with index and product name
  progressBar.update(index, `#${index} ${product.name ? String(product.name).slice(0, 30) : ''}`);
}

// Sequential per-product migration: take first product -> fill missing data -> next
async function migrateSequentialPerProduct(startFromIndex = 1) {
  console.log("\n🔄 Running sequential per-product migration...\n");

  // Initialize sizes and fetch users once
  console.log("📦 Initializing Color and Size collections...");
  const { sizeMap } = await initializeColorAndSize();
  console.log("✅ Color and Size initialized successfully!\n");

  // We no longer fetch all users upfront; we'll sample just enough per product

  console.log("📦 Counting total products...");
  const totalProducts = await Product.countDocuments({});
  console.log(`✅ Found ${totalProducts} products in database\n`);
  if (totalProducts === 0) {
    console.log("⚠️  No products found in database. Skipping.");
    return;
  }

  const safeStartIndex = Math.max(parseInt(startFromIndex, 10) || 1, 1);
  const skipCount = safeStartIndex - 1;
  const remainingTotal = Math.max(totalProducts - skipCount, 0);

  console.log(`▶ Resume option: starting from product index ${safeStartIndex}`);
  if (skipCount > 0) {
    console.log(`▶ Skipping first ${skipCount} products...`);
  }

  const progressBar = new ProgressBar(remainingTotal || 1, 50);
  let processedInThisRun = 0;

  // Determine starting _id using skip, then iterate with keyset pagination to avoid long-lived cursors
  let lastId = null;
  if (skipCount > 0) {
    const startDoc = await Product.find({})
      .sort({ _id: 1 })
      .skip(skipCount)
      .limit(1)
      .select({ _id: 1 })
      .lean();
    if (startDoc && startDoc.length > 0) {
      lastId = startDoc[0]._id;
    } else {
      console.log("⚠️  Resume index beyond dataset. Nothing to process.");
      return;
    }
  }

  const BATCH_LIMIT = 100;
  // Keyset pagination loop
  /* eslint-disable no-constant-condition */
  while (true) {
    const query = lastId ? { _id: { $gt: lastId } } : {};
    const batch = await Product.find(query)
      .sort({ _id: 1 })
      .limit(BATCH_LIMIT)
      .select({ _id: 1 })
      .lean();

    if (!batch || batch.length === 0) break;

    for (const doc of batch) {
      try {
        const product = await Product.findById(doc._id);
        if (!product) {
          lastId = doc._id;
          continue;
        }
        processedInThisRun += 1;
        await processOneProduct(
          product,
          sizeMap,
          processedInThisRun,
          remainingTotal || 1,
          progressBar
        );
        lastId = doc._id;
      } catch (err) {
        console.error(`❌ Error processing product _id=${doc._id}:`, err.message);
        lastId = doc._id;
      }
    }
  }

  console.log("\n✅ Sequential per-product migration completed!");
}

// Main migration function
async function runMigration() {
  try {
    console.log("🚀 Starting Product Migration Script (Sequential)...\n");
    console.log("=".repeat(60));

    // Connect to database
    console.log("📡 Connecting to database...");
    await connectDB();
    console.log("✅ Database connected successfully!\n");

    // Run sequential per-product migration
    console.log("=".repeat(60));
    console.log("STEP: PROCESS PRODUCTS SEQUENTIALLY (variants + reviews per product)");
    console.log("=".repeat(60));
    // Parse resume index: support --start=NNN flag or START_FROM env var
    const argv = process.argv || [];
    const startArg = argv.find((a) => a.startsWith("--start="));
    const startFromEnv = process.env.START_FROM;
    const startFromIndex = startArg ? startArg.split("=")[1] : startFromEnv;

    await migrateSequentialPerProduct(startFromIndex ? Number(startFromIndex) : 1);

    console.log("\n" + "=".repeat(60));
    console.log("✅ Migration completed successfully!\n");

    // Disconnect from database
    console.log("📡 Disconnecting from database...");
    await disconnectDB();
    console.log("✅ Disconnected successfully!");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Migration failed with error:");
    console.error(error);
    console.error("\nStack trace:", error.stack);
    try {
      await disconnectDB();
    } catch (disconnectError) {
      console.error("Error disconnecting:", disconnectError);
    }
    process.exit(1);
  }
}

// Run migration
runMigration();
