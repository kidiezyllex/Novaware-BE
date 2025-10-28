import mongoose from 'mongoose';
import dotenv from 'dotenv';
import RecommendationEvaluator from './evaluation/eval.js';

dotenv.config();

mongoose.connect(process.env.MONGO_URI + 'novaware');

async function runEvaluation() {
  try {
    const evaluator = new RecommendationEvaluator();
    const results = await evaluator.runEvaluation();
    
    if (results.gnn && !results.gnn.error) {
    } else {
    }
    
    if (results.hybrid && !results.hybrid.error) {
    } else {
    }
    
    const bestModel = determineBestModel(results);
    
    if (bestModel === 'GNN') {
    } else if (bestModel === 'Hybrid') {
    } else {
    }
    
  } catch (error) {
  }
}

function determineBestModel(results) {
  if (!results.gnn || results.gnn.error || !results.hybrid || results.hybrid.error) {
    return 'Unable to determine - errors in evaluation';
  }
  
  let gnnScore = 0;
  let hybridScore = 0;
  
  const weights = {
    precision: 0.3,
    recall: 0.3,
    ndcg: 0.3,
    outfitCoherence: 0.1
  };
  
  for (const metric of ['precision', 'recall', 'ndcg', 'outfitCoherence']) {
    const gnnValue = results.gnn[metric];
    const hybridValue = results.hybrid[metric];
    
    if (gnnValue !== undefined && hybridValue !== undefined) {
      if (typeof gnnValue === 'object') {
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

if (import.meta.url === `file://${process.argv[1]}`) {
  runEvaluation().catch(console.error);
}

export default runEvaluation;