import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI + 'novaware');

class RecommendationEvaluator {
  constructor() {
    this.testUsers = [];
    this.testData = [];
    this.results = {
      gnn: {},
      hybrid: {}
    };
  }

  async prepareTestData(testRatio = 0.2) {
    console.log('📊 Preparing test data...');
    
    const users = await User.find({ 
      'interactionHistory.0': { $exists: true },
      'interactionHistory.4': { $exists: true } // At least 5 interactions
    }).select('_id interactionHistory');
    
    console.log(`Found ${users.length} users with sufficient interaction history`);
    
    for (const user of users) {
      const interactions = user.interactionHistory;
      const testSize = Math.floor(interactions.length * testRatio);
      
      if (testSize > 0) {
        // Shuffle interactions
        const shuffled = [...interactions].sort(() => Math.random() - 0.5);
        
        // Split into train and test
        const testInteractions = shuffled.slice(0, testSize);
        const trainInteractions = shuffled.slice(testSize);
        
        // Update user with training data only
        await User.findByIdAndUpdate(user._id, {
          interactionHistory: trainInteractions
        });
        
        this.testUsers.push({
          userId: user._id,
          testInteractions: testInteractions,
          trainInteractions: trainInteractions
        });
        
        // Store test data
        testInteractions.forEach(interaction => {
          this.testData.push({
            userId: user._id,
            productId: interaction.productId,
            interactionType: interaction.interactionType,
            rating: interaction.rating
          });
        });
      }
    }
    
    console.log(`Prepared test data: ${this.testUsers.length} users, ${this.testData.length} interactions`);
  }

  async evaluateGNN(kValues = [5, 10]) {
    console.log('🎯 Evaluating GNN Recommender...');
    
    const metrics = {
      precision: {},
      recall: {},
      ndcg: {},
      outfitCoherence: 0,
      runtime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // Train the model
      await gnnRecommender.train();
      
      let totalPrecision = {};
      let totalRecall = {};
      let totalNDCG = {};
      let totalOutfitCoherence = 0;
      let evaluatedUsers = 0;
      
      for (const k of kValues) {
        totalPrecision[k] = 0;
        totalRecall[k] = 0;
        totalNDCG[k] = 0;
      }
      
      // Evaluate on test users
      for (const testUser of this.testUsers) {
        try {
          const recommendations = await gnnRecommender.recommend(testUser.userId, Math.max(...kValues));
          
          // Get ground truth for this user
          const groundTruth = this.testData
            .filter(item => item.userId.toString() === testUser.userId.toString())
            .map(item => item.productId.toString());
          
          if (groundTruth.length === 0) continue;
          
          const recommendedProducts = recommendations.products.map(p => p._id.toString());
          
          // Calculate metrics for each k
          for (const k of kValues) {
            const topK = recommendedProducts.slice(0, k);
            
            // Precision@K
            const relevantItems = topK.filter(item => groundTruth.includes(item));
            const precision = relevantItems.length / k;
            totalPrecision[k] += precision;
            
            // Recall@K
            const recall = relevantItems.length / groundTruth.length;
            totalRecall[k] += recall;
            
            // NDCG@K
            const ndcg = this.calculateNDCG(topK, groundTruth);
            totalNDCG[k] += ndcg;
          }
          
          // Outfit coherence
          if (recommendations.outfits && recommendations.outfits.length > 0) {
            const avgCoherence = recommendations.outfits.reduce((sum, outfit) => 
              sum + outfit.compatibilityScore, 0) / recommendations.outfits.length;
            totalOutfitCoherence += avgCoherence;
          }
          
          evaluatedUsers++;
          
        } catch (error) {
          console.log(`Error evaluating user ${testUser.userId}:`, error.message);
        }
      }
      
      // Calculate averages
      for (const k of kValues) {
        metrics.precision[k] = totalPrecision[k] / evaluatedUsers;
        metrics.recall[k] = totalRecall[k] / evaluatedUsers;
        metrics.ndcg[k] = totalNDCG[k] / evaluatedUsers;
      }
      
      metrics.outfitCoherence = totalOutfitCoherence / evaluatedUsers;
      metrics.runtime = Date.now() - startTime;
      
      this.results.gnn = metrics;
      console.log('✅ GNN evaluation completed');
      
    } catch (error) {
      console.error('❌ Error evaluating GNN:', error);
      this.results.gnn = { error: error.message };
    }
  }

  async evaluateHybrid(kValues = [5, 10]) {
    console.log('🎯 Evaluating Hybrid Recommender...');
    
    const metrics = {
      precision: {},
      recall: {},
      ndcg: {},
      outfitCoherence: 0,
      runtime: 0
    };
    
    const startTime = Date.now();
    
    try {
      // Train the model
      await hybridRecommender.train();
      
      let totalPrecision = {};
      let totalRecall = {};
      let totalNDCG = {};
      let totalOutfitCoherence = 0;
      let evaluatedUsers = 0;
      
      for (const k of kValues) {
        totalPrecision[k] = 0;
        totalRecall[k] = 0;
        totalNDCG[k] = 0;
      }
      
      // Evaluate on test users
      for (const testUser of this.testUsers) {
        try {
          const recommendations = await hybridRecommender.recommend(testUser.userId, Math.max(...kValues));
          
          // Get ground truth for this user
          const groundTruth = this.testData
            .filter(item => item.userId.toString() === testUser.userId.toString())
            .map(item => item.productId.toString());
          
          if (groundTruth.length === 0) continue;
          
          const recommendedProducts = recommendations.products.map(p => p._id.toString());
          
          // Calculate metrics for each k
          for (const k of kValues) {
            const topK = recommendedProducts.slice(0, k);
            
            // Precision@K
            const relevantItems = topK.filter(item => groundTruth.includes(item));
            const precision = relevantItems.length / k;
            totalPrecision[k] += precision;
            
            // Recall@K
            const recall = relevantItems.length / groundTruth.length;
            totalRecall[k] += recall;
            
            // NDCG@K
            const ndcg = this.calculateNDCG(topK, groundTruth);
            totalNDCG[k] += ndcg;
          }
          
          // Outfit coherence
          if (recommendations.outfits && recommendations.outfits.length > 0) {
            const avgCoherence = recommendations.outfits.reduce((sum, outfit) => 
              sum + outfit.compatibilityScore, 0) / recommendations.outfits.length;
            totalOutfitCoherence += avgCoherence;
          }
          
          evaluatedUsers++;
          
        } catch (error) {
          console.log(`Error evaluating user ${testUser.userId}:`, error.message);
        }
      }
      
      // Calculate averages
      for (const k of kValues) {
        metrics.precision[k] = totalPrecision[k] / evaluatedUsers;
        metrics.recall[k] = totalRecall[k] / evaluatedUsers;
        metrics.ndcg[k] = totalNDCG[k] / evaluatedUsers;
      }
      
      metrics.outfitCoherence = totalOutfitCoherence / evaluatedUsers;
      metrics.runtime = Date.now() - startTime;
      
      this.results.hybrid = metrics;
      console.log('✅ Hybrid evaluation completed');
      
    } catch (error) {
      console.error('❌ Error evaluating Hybrid:', error);
      this.results.hybrid = { error: error.message };
    }
  }

  calculateNDCG(recommended, groundTruth, k = null) {
    if (k === null) k = recommended.length;
    
    const topK = recommended.slice(0, k);
    let dcg = 0;
    
    for (let i = 0; i < topK.length; i++) {
      if (groundTruth.includes(topK[i])) {
        dcg += 1 / Math.log2(i + 2); // i+2 because log2(1) = 0
      }
    }
    
    // Calculate IDCG (Ideal DCG)
    const idealRelevance = Math.min(groundTruth.length, k);
    let idcg = 0;
    for (let i = 0; i < idealRelevance; i++) {
      idcg += 1 / Math.log2(i + 2);
    }
    
    return idcg > 0 ? dcg / idcg : 0;
  }

  generateReport() {
    console.log('\n📊 RECOMMENDATION SYSTEM EVALUATION REPORT');
    console.log('=' .repeat(60));
    
    const kValues = [5, 10];
    
    // Create comparison table
    console.log('\n📈 Performance Comparison:');
    console.log('-' .repeat(60));
    console.log('Metric'.padEnd(15) + 'GNN'.padEnd(15) + 'Hybrid'.padEnd(15) + 'Winner');
    console.log('-' .repeat(60));
    
    for (const k of kValues) {
      const gnnPrecision = this.results.gnn.precision?.[k]?.toFixed(4) || 'N/A';
      const hybridPrecision = this.results.hybrid.precision?.[k]?.toFixed(4) || 'N/A';
      const precisionWinner = this.getWinner(this.results.gnn.precision?.[k], this.results.hybrid.precision?.[k]);
      
      console.log(`Precision@${k}`.padEnd(15) + gnnPrecision.padEnd(15) + hybridPrecision.padEnd(15) + precisionWinner);
      
      const gnnRecall = this.results.gnn.recall?.[k]?.toFixed(4) || 'N/A';
      const hybridRecall = this.results.hybrid.recall?.[k]?.toFixed(4) || 'N/A';
      const recallWinner = this.getWinner(this.results.gnn.recall?.[k], this.results.hybrid.recall?.[k]);
      
      console.log(`Recall@${k}`.padEnd(15) + gnnRecall.padEnd(15) + hybridRecall.padEnd(15) + recallWinner);
      
      const gnnNDCG = this.results.gnn.ndcg?.[k]?.toFixed(4) || 'N/A';
      const hybridNDCG = this.results.hybrid.ndcg?.[k]?.toFixed(4) || 'N/A';
      const ndcgWinner = this.getWinner(this.results.gnn.ndcg?.[k], this.results.hybrid.ndcg?.[k]);
      
      console.log(`NDCG@${k}`.padEnd(15) + gnnNDCG.padEnd(15) + hybridNDCG.padEnd(15) + ndcgWinner);
    }
    
    // Outfit coherence
    const gnnCoherence = this.results.gnn.outfitCoherence?.toFixed(4) || 'N/A';
    const hybridCoherence = this.results.hybrid.outfitCoherence?.toFixed(4) || 'N/A';
    const coherenceWinner = this.getWinner(this.results.gnn.outfitCoherence, this.results.hybrid.outfitCoherence);
    
    console.log('Outfit Coherence'.padEnd(15) + gnnCoherence.padEnd(15) + hybridCoherence.padEnd(15) + coherenceWinner);
    
    // Runtime
    const gnnRuntime = this.results.gnn.runtime ? `${(this.results.gnn.runtime / 1000).toFixed(2)}s` : 'N/A';
    const hybridRuntime = this.results.hybrid.runtime ? `${(this.results.hybrid.runtime / 1000).toFixed(2)}s` : 'N/A';
    const runtimeWinner = this.getWinner(this.results.gnn.runtime, this.results.hybrid.runtime, true); // Lower is better
    
    console.log('Runtime'.padEnd(15) + gnnRuntime.padEnd(15) + hybridRuntime.padEnd(15) + runtimeWinner);
    
    console.log('-' .repeat(60));
    
    // Overall winner
    const overallWinner = this.determineOverallWinner();
    console.log(`\n🏆 Overall Winner: ${overallWinner}`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (overallWinner === 'GNN') {
      console.log('- GNN shows better performance overall');
      console.log('- Consider using GNN for production deployment');
      console.log('- GNN may be better for complex user-item relationships');
    } else if (overallWinner === 'Hybrid') {
      console.log('- Hybrid approach shows better performance overall');
      console.log('- Consider using Hybrid for production deployment');
      console.log('- Hybrid combines the strengths of both approaches');
    } else {
      console.log('- Both models show similar performance');
      console.log('- Consider factors like runtime and complexity for deployment');
    }
    
    return this.results;
  }

  getWinner(value1, value2, lowerIsBetter = false) {
    if (value1 === undefined || value2 === undefined) return 'N/A';
    
    if (lowerIsBetter) {
      return value1 < value2 ? 'GNN' : value1 > value2 ? 'Hybrid' : 'Tie';
    } else {
      return value1 > value2 ? 'GNN' : value1 < value2 ? 'Hybrid' : 'Tie';
    }
  }

  determineOverallWinner() {
    let gnnWins = 0;
    let hybridWins = 0;
    
    // Count wins for each metric
    const metrics = ['precision', 'recall', 'ndcg'];
    const kValues = [5, 10];
    
    for (const metric of metrics) {
      for (const k of kValues) {
        const gnnValue = this.results.gnn[metric]?.[k];
        const hybridValue = this.results.hybrid[metric]?.[k];
        
        if (gnnValue !== undefined && hybridValue !== undefined) {
          if (gnnValue > hybridValue) gnnWins++;
          else if (hybridValue > gnnValue) hybridWins++;
        }
      }
    }
    
    // Outfit coherence
    const gnnCoherence = this.results.gnn.outfitCoherence;
    const hybridCoherence = this.results.hybrid.outfitCoherence;
    
    if (gnnCoherence !== undefined && hybridCoherence !== undefined) {
      if (gnnCoherence > hybridCoherence) gnnWins++;
      else if (hybridCoherence > gnnCoherence) hybridWins++;
    }
    
    if (gnnWins > hybridWins) return 'GNN';
    else if (hybridWins > gnnWins) return 'Hybrid';
    else return 'Tie';
  }

  async runEvaluation() {
    console.log('🚀 Starting comprehensive evaluation...');
    
    try {
      // Prepare test data
      await this.prepareTestData();
      
      // Evaluate both models
      await this.evaluateGNN();
      await this.evaluateHybrid();
      
      // Generate report
      const results = this.generateReport();
      
      console.log('\n✅ Evaluation completed successfully!');
      return results;
      
    } catch (error) {
      console.error('❌ Error during evaluation:', error);
      throw error;
    } finally {
      mongoose.disconnect();
    }
  }
}

// Run evaluation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const evaluator = new RecommendationEvaluator();
  evaluator.runEvaluation().catch(console.error);
}

export default RecommendationEvaluator;
