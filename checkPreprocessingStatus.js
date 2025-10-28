import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from './models/userModel.js';
import Product from './models/productModel.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI + 'novaware');

async function checkPreprocessingStatus() {
  console.log('🔍 Checking preprocessing status...');
  
  try {
    // Check users with interaction history
    const totalUsers = await User.countDocuments();
    const usersWithInteractions = await User.countDocuments({ 'interactionHistory.0': { $exists: true } });
    const usersWithEmbeddings = await User.countDocuments({ 'userEmbedding.0': { $exists: true } });
    
    // Check products with feature vectors
    const totalProducts = await Product.countDocuments();
    const productsWithFeatures = await Product.countDocuments({ 'featureVector.0': { $exists: true } });
    const productsWithCompatibility = await Product.countDocuments({ 'compatibleProducts.0': { $exists: true } });
    
    console.log('\n📊 USER STATISTICS:');
    console.log(`   Total users: ${totalUsers.toLocaleString()}`);
    console.log(`   Users with interactions: ${usersWithInteractions.toLocaleString()} (${((usersWithInteractions/totalUsers)*100).toFixed(1)}%)`);
    console.log(`   Users with embeddings: ${usersWithEmbeddings.toLocaleString()} (${((usersWithEmbeddings/totalUsers)*100).toFixed(1)}%)`);
    
    console.log('\n📦 PRODUCT STATISTICS:');
    console.log(`   Total products: ${totalProducts.toLocaleString()}`);
    console.log(`   Products with feature vectors: ${productsWithFeatures.toLocaleString()} (${((productsWithFeatures/totalProducts)*100).toFixed(1)}%)`);
    console.log(`   Products with compatibility: ${productsWithCompatibility.toLocaleString()} (${((productsWithCompatibility/totalProducts)*100).toFixed(1)}%)`);
    
    console.log('\n🎯 PREPROCESSING STATUS:');
    if (usersWithInteractions > 0 && productsWithFeatures > 0) {
      console.log('✅ Ready for training!');
      console.log('   - Users have interaction history');
      console.log('   - Products have feature vectors');
      
      if (usersWithEmbeddings > 0) {
        console.log('   - Users have embeddings');
      } else {
        console.log('   ⚠️  Users need embeddings (run preprocessing)');
      }
      
      if (productsWithCompatibility > 0) {
        console.log('   - Products have compatibility data');
      } else {
        console.log('   ⚠️  Products need compatibility data (run preprocessing)');
      }
    } else {
      console.log('❌ Not ready for training:');
      if (usersWithInteractions === 0) {
        console.log('   - No users with interaction history');
      }
      if (productsWithFeatures === 0) {
        console.log('   - No products with feature vectors');
      }
    }
    
    // Sample data check
    if (usersWithInteractions > 0) {
      const sampleUser = await User.findOne({ 'interactionHistory.0': { $exists: true } })
        .select('name email interactionHistory userEmbedding');
      
      console.log('\n👤 SAMPLE USER:');
      console.log(`   Name: ${sampleUser?.name}`);
      console.log(`   Email: ${sampleUser?.email}`);
      console.log(`   Interactions: ${sampleUser?.interactionHistory?.length || 0}`);
      console.log(`   Has embedding: ${sampleUser?.userEmbedding ? 'Yes' : 'No'}`);
    }
    
  } catch (error) {
    console.error('❌ Error checking preprocessing status:', error);
  } finally {
    mongoose.disconnect();
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  checkPreprocessingStatus();
}

export default checkPreprocessingStatus;
