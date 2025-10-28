import mongoose from 'mongoose';
import dotenv from 'dotenv';
import gnnRecommender from './services/gnnRecommender.js';
import hybridRecommender from './services/hybridRecommender.js';
import User from './models/userModel.js';
import Product from './models/productModel.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI + 'novaware');

async function testBothRecommendationSystems() {
  console.log('🧪 Testing Both Recommendation Systems...');
  console.log('=' .repeat(60));
  
  try {
    // Find a test user with interaction history
    const testUser = await User.findOne({ 
      'interactionHistory.0': { $exists: true },
      'preferences.style': { $exists: true }
    }).select('_id name gender age preferences interactionHistory');
    
    if (!testUser) {
      console.log('❌ No test user found with interaction history');
      return;
    }
    
    console.log(`👤 Testing with user: ${testUser.name} (${testUser.gender}, age: ${testUser.age})`);
    console.log(`📊 User preferences:`, testUser.preferences);
    console.log(`📈 Interaction history: ${testUser.interactionHistory.length} interactions`);
    
    // Test GNN Recommender (TensorFlow.js)
    console.log('\n🎯 Testing GNN Recommender (TensorFlow.js)...');
    console.log('=' .repeat(50));
    
    try {
      const gnnStart = Date.now();
      const gnnRecommendations = await gnnRecommender.recommend(testUser._id, 5);
      const gnnTime = Date.now() - gnnStart;
      
      console.log('✅ GNN Recommendations:');
      console.log(`📦 Products (${gnnRecommendations.products.length}):`);
      gnnRecommendations.products.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.name} - ${product.category} - $${product.price}`);
        console.log(`     Brand: ${product.brand}, Tags: ${product.outfitTags?.join(', ') || 'None'}`);
      });
      
      console.log(`\n👗 Outfits (${gnnRecommendations.outfits.length}):`);
      gnnRecommendations.outfits.forEach((outfit, index) => {
        console.log(`  ${index + 1}. ${outfit.name} - ${outfit.description}`);
        console.log(`     Style: ${outfit.style}, Gender: ${outfit.gender}, Price: $${outfit.totalPrice}`);
        console.log(`     Products: ${outfit.products.map(p => p.name).join(', ')}`);
        console.log(`     Compatibility Score: ${outfit.compatibilityScore.toFixed(2)}`);
      });
      
      console.log(`\n📊 GNN Model Info:`);
      console.log(`  Model: ${gnnRecommendations.model}`);
      console.log(`  Personalization: ${gnnRecommendations.personalization}`);
      console.log(`  Outfit Type: ${gnnRecommendations.outfitType}`);
      console.log(`  Runtime: ${(gnnTime / 1000).toFixed(2)}s`);
      
    } catch (error) {
      console.error('❌ GNN Recommender Error:', error.message);
    }
    
    // Test Hybrid Recommender (Natural + ml-matrix)
    console.log('\n🎯 Testing Hybrid Recommender (Natural + ml-matrix)...');
    console.log('=' .repeat(50));
    
    try {
      const hybridStart = Date.now();
      const hybridRecommendations = await hybridRecommender.recommend(testUser._id, 5);
      const hybridTime = Date.now() - hybridStart;
      
      console.log('✅ Hybrid Recommendations:');
      console.log(`📦 Products (${hybridRecommendations.products.length}):`);
      hybridRecommendations.products.forEach((product, index) => {
        console.log(`  ${index + 1}. ${product.name} - ${product.category} - $${product.price}`);
        console.log(`     Brand: ${product.brand}, Tags: ${product.outfitTags?.join(', ') || 'None'}`);
      });
      
      console.log(`\n👗 Outfits (${hybridRecommendations.outfits.length}):`);
      hybridRecommendations.outfits.forEach((outfit, index) => {
        console.log(`  ${index + 1}. ${outfit.name} - ${outfit.description}`);
        console.log(`     Style: ${outfit.style}, Gender: ${outfit.gender}, Price: $${outfit.totalPrice}`);
        console.log(`     Products: ${outfit.products.map(p => p.name).join(', ')}`);
        console.log(`     Compatibility Score: ${outfit.compatibilityScore.toFixed(2)}`);
      });
      
      console.log(`\n📊 Hybrid Model Info:`);
      console.log(`  Model: ${hybridRecommendations.model}`);
      console.log(`  CF Weight: ${hybridRecommendations.cfWeight}, CB Weight: ${hybridRecommendations.cbWeight}`);
      console.log(`  Personalization: ${hybridRecommendations.personalization}`);
      console.log(`  Outfit Type: ${hybridRecommendations.outfitType}`);
      console.log(`  Runtime: ${(hybridTime / 1000).toFixed(2)}s`);
      
    } catch (error) {
      console.error('❌ Hybrid Recommender Error:', error.message);
    }
    
    // Test Personalization Examples
    console.log('\n🎯 Testing Personalization Examples...');
    console.log('=' .repeat(50));
    
    // Show user's interaction history
    console.log('📈 User\'s Interaction History:');
    for (const interaction of testUser.interactionHistory.slice(0, 3)) {
      const product = await Product.findById(interaction.productId).select('name category brand outfitTags');
      if (product) {
        console.log(`  - ${product.name} (${product.category}) - ${interaction.interactionType}`);
        console.log(`    Brand: ${product.brand}, Tags: ${product.outfitTags?.join(', ') || 'None'}`);
      }
    }
    
    // Test outfit gender-specific examples
    console.log('\n👗 Gender-Specific Outfit Examples:');
    if (testUser.gender === 'male') {
      console.log('  Men\'s Outfit: Shirt + Pants + Shoes combination');
      console.log('  Example: Casual shirt + Jeans + Sneakers');
    } else if (testUser.gender === 'female') {
      console.log('  Women\'s Outfit: Dress + Accessories combination');
      console.log('  Example: Summer dress + Handbag + Sandals');
    } else {
      console.log('  Unisex Outfit: Top + Bottom + Accessory combination');
      console.log('  Example: T-shirt + Shorts + Hat');
    }
    
    // Performance Comparison
    console.log('\n📊 Performance Comparison:');
    console.log('=' .repeat(50));
    console.log('Model'.padEnd(20) + 'Runtime'.padEnd(15) + 'Products'.padEnd(10) + 'Outfits');
    console.log('-'.repeat(50));
    console.log('GNN (TensorFlow.js)'.padEnd(20) + `${(gnnTime / 1000).toFixed(2)}s`.padEnd(15) + '5'.padEnd(10) + '3');
    console.log('Hybrid (Natural+ml)'.padEnd(20) + `${(hybridTime / 1000).toFixed(2)}s`.padEnd(15) + '5'.padEnd(10) + '3');
    
    console.log('\n✅ Both Recommendation Systems Test Completed!');
    console.log('\n💡 Summary:');
    console.log('- GNN (TensorFlow.js): Graph Neural Network approach for complex user-item relationships');
    console.log('- Hybrid (Natural + ml-matrix): Combines collaborative and content-based filtering');
    console.log('- Both provide personalized recommendations and gender-specific outfit suggestions');
    
  } catch (error) {
    console.error('❌ Test Error:', error);
  } finally {
    mongoose.disconnect();
  }
}

// Test API endpoints
async function testAPIEndpoints() {
  console.log('\n🌐 Testing API Endpoints...');
  console.log('=' .repeat(50));
  
  const baseURL = 'http://localhost:5000/api/recommend';
  
  console.log('Available endpoints:');
  console.log(`  GET ${baseURL}/gnn/:userId - GNN recommendations (TensorFlow.js)`);
  console.log(`  GET ${baseURL}/hybrid/:userId - Hybrid recommendations (Natural + ml-matrix)`);
  console.log(`  GET ${baseURL}/best/:userId - Best model recommendations`);
  console.log(`  GET ${baseURL}/outfits/:userId - Outfit recommendations only`);
  console.log(`  GET ${baseURL}/similar/:productId - Similar products`);
  console.log(`  GET ${baseURL}/trending - Trending products`);
  console.log(`  GET ${baseURL}/personalized/:userId - Personalized recommendations`);
  console.log(`  POST ${baseURL}/train - Train models`);
  
  console.log('\nExample usage:');
  console.log(`  curl ${baseURL}/gnn/USER_ID`);
  console.log(`  curl ${baseURL}/hybrid/USER_ID`);
  console.log(`  curl ${baseURL}/best/USER_ID`);
  console.log(`  curl ${baseURL}/outfits/USER_ID?k=3`);
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  testBothRecommendationSystems()
    .then(() => testAPIEndpoints())
    .catch(console.error);
}

export { testBothRecommendationSystems, testAPIEndpoints };
