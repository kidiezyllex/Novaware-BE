import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RecommendationEvaluator from './evaluation/eval.js';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI + 'novaware');

async function runEvaluation() {
  console.log('🚀 Starting Recommendation System Evaluation...');
  console.log('=' .repeat(60));
  
  try {
    const evaluator = new RecommendationEvaluator();
    const results = await evaluator.runEvaluation();
    
    console.log('\n📊 EVALUATION SUMMARY');
    console.log('=' .repeat(60));
    
    // Display detailed results
    if (results.gnn && !results.gnn.error) {
      console.log('\n🎯 GNN Recommender Results:');
      console.log(`  Precision@5: ${results.gnn.precision[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  Precision@10: ${results.gnn.precision[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  Recall@5: ${results.gnn.recall[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  Recall@10: ${results.gnn.recall[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  NDCG@5: ${results.gnn.ndcg[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  NDCG@10: ${results.gnn.ndcg[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  Outfit Coherence: ${results.gnn.outfitCoherence?.toFixed(4) || 'N/A'}`);
      console.log(`  Runtime: ${(results.gnn.runtime / 1000).toFixed(2)}s`);
    } else {
      console.log('\n❌ GNN Recommender Error:', results.gnn?.error || 'Unknown error');
    }
    
    if (results.hybrid && !results.hybrid.error) {
      console.log('\n🎯 Hybrid Recommender Results:');
      console.log(`  Precision@5: ${results.hybrid.precision[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  Precision@10: ${results.hybrid.precision[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  Recall@5: ${results.hybrid.recall[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  Recall@10: ${results.hybrid.recall[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  NDCG@5: ${results.hybrid.ndcg[5]?.toFixed(4) || 'N/A'}`);
      console.log(`  NDCG@10: ${results.hybrid.ndcg[10]?.toFixed(4) || 'N/A'}`);
      console.log(`  Outfit Coherence: ${results.hybrid.outfitCoherence?.toFixed(4) || 'N/A'}`);
      console.log(`  Runtime: ${(results.hybrid.runtime / 1000).toFixed(2)}s`);
    } else {
      console.log('\n❌ Hybrid Recommender Error:', results.hybrid?.error || 'Unknown error');
    }
    
    // Determine best model
    const bestModel = determineBestModel(results);
    console.log(`\n🏆 Best Model: ${bestModel}`);
    
    // Recommendations
    console.log('\n💡 Recommendations:');
    if (bestModel === 'GNN') {
      console.log('- Use GNN for production deployment');
      console.log('- GNN shows better performance for complex user-item relationships');
      console.log('- Consider GNN for users with rich interaction history');
    } else if (bestModel === 'Hybrid') {
      console.log('- Use Hybrid for production deployment');
      console.log('- Hybrid combines collaborative and content-based filtering strengths');
      console.log('- Consider Hybrid for balanced performance across different user types');
    } else {
      console.log('- Both models show similar performance');
      console.log('- Consider factors like runtime and complexity for deployment');
      console.log('- GNN might be better for complex relationships, Hybrid for interpretability');
    }
    
    console.log('\n✅ Evaluation completed successfully!');
    
  } catch (error) {
    console.error('❌ Evaluation Error:', error);
  }
}

function determineBestModel(results) {
  if (!results.gnn || results.gnn.error || !results.hybrid || results.hybrid.error) {
    return 'Unable to determine - errors in evaluation';
  }
  
  let gnnScore = 0;
  let hybridScore = 0;
  
  // Weight different metrics
  const weights = {
    precision: 0.3,
    recall: 0.3,
    ndcg: 0.3,
    outfitCoherence: 0.1
  };
  
  // Calculate weighted scores
  for (const metric of ['precision', 'recall', 'ndcg', 'outfitCoherence']) {
    const gnnValue = results.gnn[metric];
    const hybridValue = results.hybrid[metric];
    
    if (gnnValue !== undefined && hybridValue !== undefined) {
      if (typeof gnnValue === 'object') {
        // For metrics with multiple k values, use average
        const gnnAvg = Object.values(gnnValue).reduce((sum, val) => sum + val, 0) / Object.values(gnnValue).length;
        const hybridAvg = Object.values(hybridValue).reduce((sum, val) => sum + val, 0) / Object.values(hybridValue).length;
        
        gnnScore += gnnAvg * weights[metric];
        hybridScore += hybridAvg * weights[metric];
      } else {
        gnnScore += gnnValue * weights[metric];
        hybridScore += hybridValue * weights[metric];
      }
    }
  }
  
  // Consider runtime (lower is better)
  const gnnRuntime = results.gnn.runtime || 0;
  const hybridRuntime = results.hybrid.runtime || 0;
  
  if (gnnRuntime > 0 && hybridRuntime > 0) {
    const runtimeFactor = Math.min(gnnRuntime, hybridRuntime) / Math.max(gnnRuntime, hybridRuntime);
    if (gnnRuntime < hybridRuntime) {
      gnnScore += runtimeFactor * 0.1;
    } else {
      hybridScore += runtimeFactor * 0.1;
    }
  }
  
  if (Math.abs(gnnScore - hybridScore) < 0.05) {
    return 'Tie - both models perform similarly';
  }
  
  return gnnScore > hybridScore ? 'GNN' : 'Hybrid';
}

// Run evaluation if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runEvaluation().catch(console.error);
}

export default runEvaluation;
