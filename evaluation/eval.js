import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/userModel.js';
import Product from '../models/productModel.js';
import gnnRecommender from '../services/gnnRecommender.js';
import hybridRecommender from '../services/hybridRecommender.js';

dotenv.config();

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
    const users = await User.find({ 
      'interactionHistory.0': { $exists: true },
      'interactionHistory.4': { $exists: true }
    }).select('_id interactionHistory');
    
    for (const user of users) {
      const interactions = user.interactionHistory;
      const testSize = Math.floor(interactions.length * testRatio);
      
      if (testSize > 0) {
        const shuffled = [...interactions].sort(() => Math.random() - 0.5);
        
        const testInteractions = shuffled.slice(0, testSize);
        const trainInteractions = shuffled.slice(testSize);
        
        await User.findByIdAndUpdate(user._id, {
          interactionHistory: trainInteractions
        });
        
        this.testUsers.push({
          userId: user._id,
          testInteractions: testInteractions,
          trainInteractions: trainInteractions
        });
        
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
  }

  async evaluateGNN(kValues = [5, 10]) {
    const metrics = {
      precision: {},
      recall: {},
      ndcg: {},
      outfitCoherence: 0,
      runtime: 0
    };
    
    const startTime = Date.now();
    
    try {
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
      
      for (const testUser of this.testUsers) {
        try {
          const recommendations = await gnnRecommender.recommend(testUser.userId, Math.max(...kValues));
          
          const groundTruth = this.testData
            .filter(item => item.userId.toString() === testUser.userId.toString())
            .map(item => item.productId.toString());
          
          if (groundTruth.length === 0) continue;
          
          const recommendedProducts = recommendations.products.map(p => p._id.toString());
          
          for (const k of kValues) {
            const topK = recommendedProducts.slice(0, k);
            
            const relevantItems = topK.filter(item => groundTruth.includes(item));
            const precision = relevantItems.length / k;
            totalPrecision[k] += precision;
            
            const recall = relevantItems.length / groundTruth.length;
            totalRecall[k] += recall;
            
            const ndcg = this.calculateNDCG(topK, groundTruth);
            totalNDCG[k] += ndcg;
          }
          
          if (recommendations.outfits && recommendations.outfits.length > 0) {
            const avgCoherence = recommendations.outfits.reduce((sum, outfit) => 
              sum + outfit.compatibilityScore, 0) / recommendations.outfits.length;
            totalOutfitCoherence += avgCoherence;
          }
          
          evaluatedUsers++;
          
        } catch (error) {
        }
      }
      
      for (const k of kValues) {
        metrics.precision[k] = totalPrecision[k] / evaluatedUsers;
        metrics.recall[k] = totalRecall[k] / evaluatedUsers;
        metrics.ndcg[k] = totalNDCG[k] / evaluatedUsers;
      }
      
      metrics.outfitCoherence = totalOutfitCoherence / evaluatedUsers;
      metrics.runtime = Date.now() - startTime;
      
      this.results.gnn = metrics;
      
    } catch (error) {
      this.results.gnn = { error: error.message };
    }
  }

  async evaluateHybrid(kValues = [5, 10]) {
    const metrics = {
      precision: {},
      recall: {},
      ndcg: {},
      outfitCoherence: 0,
      runtime: 0
    };
    
    const startTime = Date.now();
    
    try {
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
      
      for (const testUser of this.testUsers) {
        try {
          const recommendations = await hybridRecommender.recommend(testUser.userId, Math.max(...kValues));
          
          const groundTruth = this.testData
            .filter(item => item.userId.toString() === testUser.userId.toString())
            .map(item => item.productId.toString());
          
          if (groundTruth.length === 0) continue;
          
          const recommendedProducts = recommendations.products.map(p => p._id.toString());
          
          for (const k of kValues) {
            const topK = recommendedProducts.slice(0, k);
            
            const relevantItems = topK.filter(item => groundTruth.includes(item));
            const precision = relevantItems.length / k;
            totalPrecision[k] += precision;
            
            const recall = relevantItems.length / groundTruth.length;
            totalRecall[k] += recall;
            
            const ndcg = this.calculateNDCG(topK, groundTruth);
            totalNDCG[k] += ndcg;
          }
          
          if (recommendations.outfits && recommendations.outfits.length > 0) {
            const avgCoherence = recommendations.outfits.reduce((sum, outfit) => 
              sum + outfit.compatibilityScore, 0) / recommendations.outfits.length;
            totalOutfitCoherence += avgCoherence;
          }
          
          evaluatedUsers++;
          
        } catch (error) {
        }
      }
      
      for (const k of kValues) {
        metrics.precision[k] = totalPrecision[k] / evaluatedUsers;
        metrics.recall[k] = totalRecall[k] / evaluatedUsers;
        metrics.ndcg[k] = totalNDCG[k] / evaluatedUsers;
      }
      
      metrics.outfitCoherence = totalOutfitCoherence / evaluatedUsers;
      metrics.runtime = Date.now() - startTime;
      
      this.results.hybrid = metrics;
      
    } catch (error) {
      this.results.hybrid = { error: error.message };
    }
  }

  calculateNDCG(recommended, groundTruth, k = null) {
    if (k === null) k = recommended.length;
    
    const topK = recommended.slice(0, k);
    let dcg = 0;
    
    for (let i = 0; i < topK.length; i++) {
      if (groundTruth.includes(topK[i])) {
        dcg += 1 / Math.log2(i + 2);
      }
    }
    
    const idealRelevance = Math.min(groundTruth.length, k);
    let idcg = 0;
    for (let i = 0; i < idealRelevance; i++) {
      idcg += 1 / Math.log2(i + 2);
    }
    
    return idcg > 0 ? dcg / idcg : 0;
  }

  generateReport() {
    const kValues = [5, 10];
    
    for (const k of kValues) {
      const gnnPrecision = this.results.gnn.precision?.[k]?.toFixed(4) || 'N/A';
      const hybridPrecision = this.results.hybrid.precision?.[k]?.toFixed(4) || 'N/A';
      const precisionWinner = this.getWinner(this.results.gnn.precision?.[k], this.results.hybrid.precision?.[k]);
      
      const gnnRecall = this.results.gnn.recall?.[k]?.toFixed(4) || 'N/A';
      const hybridRecall = this.results.hybrid.recall?.[k]?.toFixed(4) || 'N/A';
      const recallWinner = this.getWinner(this.results.gnn.recall?.[k], this.results.hybrid.recall?.[k]);
      
      const gnnNDCG = this.results.gnn.ndcg?.[k]?.toFixed(4) || 'N/A';
      const hybridNDCG = this.results.hybrid.ndcg?.[k]?.toFixed(4) || 'N/A';
      const ndcgWinner = this.getWinner(this.results.gnn.ndcg?.[k], this.results.hybrid.ndcg?.[k]);
    }
    
    const gnnCoherence = this.results.gnn.outfitCoherence?.toFixed(4) || 'N/A';
    const hybridCoherence = this.results.hybrid.outfitCoherence?.toFixed(4) || 'N/A';
    const coherenceWinner = this.getWinner(this.results.gnn.outfitCoherence, this.results.hybrid.outfitCoherence);
    
    const gnnRuntime = this.results.gnn.runtime ? `${(this.results.gnn.runtime / 1000).toFixed(2)}s` : 'N/A';
    const hybridRuntime = this.results.hybrid.runtime ? `${(this.results.hybrid.runtime / 1000).toFixed(2)}s` : 'N/A';
    const runtimeWinner = this.getWinner(this.results.gnn.runtime, this.results.hybrid.runtime, true);
    
    const overallWinner = this.determineOverallWinner();
    
    if (overallWinner === 'GNN') {
    } else if (overallWinner === 'Hybrid') {
    } else {
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
    try {
      await this.prepareTestData();
      await this.evaluateGNN();
      await this.evaluateHybrid();
      const results = this.generateReport();
      
      return results;
      
    } catch (error) {
      throw error;
    } finally {
      mongoose.disconnect();
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const evaluator = new RecommendationEvaluator();
  evaluator.runEvaluation().catch(console.error);
}

export default RecommendationEvaluator;