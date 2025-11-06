/*
 Extract first N rows from data JSONL files and compute basic stats.
 Writes results into docs/api_results as JSON and Markdown tables.
 Usage:
   node scripts/extractJsonlSamples.js --reviews Amazon_Fashion.jsonl --meta meta_Amazon_Fashion.jsonl --n 10
 Defaults:
   reviews=Amazon_Fashion.jsonl, meta=meta_Amazon_Fashion.jsonl, n=10
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { reviews: 'Amazon_Fashion.jsonl', meta: 'meta_Amazon_Fashion.jsonl', n: 10 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--reviews' && args[i+1]) out.reviews = args[++i];
    else if (a === '--meta' && args[i+1]) out.meta = args[++i];
    else if (a === '--n' && args[i+1]) out.n = parseInt(args[++i], 10) || 10;
  }
  return out;
}

async function readJsonlSample(filePath, n) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) return { exists: false, rows: [] };
  const stream = fs.createReadStream(abs, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const rows = [];
  for await (const line of rl) {
    if (!line) continue;
    try {
      rows.push(JSON.parse(line));
      if (rows.length >= n) break;
    } catch {}
  }
  rl.close();
  stream.close?.();
  return { exists: true, rows };
}

async function computeReviewStats(filePath) {
  const abs = path.resolve(filePath);
  const stats = {
    totalReviews: 0,
    uniqueUsers: 0,
    uniqueProducts: 0,
    ratingHistogram: { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 },
    exists: fs.existsSync(abs)
  };
  if (!stats.exists) return stats;

  const users = new Set();
  const prods = new Set();
  const stream = fs.createReadStream(abs, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      stats.totalReviews++;
      const r = Math.round(Number(obj.rating) || 0);
      if (stats.ratingHistogram[String(r)] !== undefined) stats.ratingHistogram[String(r)]++;
      if (obj.user_id) users.add(String(obj.user_id));
      if (obj.asin) prods.add(String(obj.asin));
    } catch {}
  }
  rl.close();
  stream.close?.();
  stats.uniqueUsers = users.size;
  stats.uniqueProducts = prods.size;
  return stats;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function toMarkdownTable(rows, columns) {
  const header = '| ' + columns.join(' | ') + ' |\n';
  const sep = '|' + columns.map(() => '---').join('|') + '|\n';
  const body = rows.map(r => '| ' + columns.map(c => (r[c] !== undefined ? String(r[c]).replace(/\n/g, ' ') : '')).join(' | ') + ' |').join('\n');
  return header + sep + body + '\n';
}

async function main() {
  const { reviews, meta, n } = parseArgs();
  const dataDir = path.resolve('data');
  const outDir = path.resolve('docs', 'api_results');
  ensureDir(outDir);

  const reviewsPath = path.join(dataDir, reviews);
  const metaPath = path.join(dataDir, meta);

  const sampleReviews = await readJsonlSample(reviewsPath, n);
  const sampleMeta = await readJsonlSample(metaPath, n);
  const stats = await computeReviewStats(reviewsPath);

  fs.writeFileSync(path.join(outDir, 'sample_reviews.json'), JSON.stringify(sampleReviews, null, 2));
  fs.writeFileSync(path.join(outDir, 'sample_meta.json'), JSON.stringify(sampleMeta, null, 2));
  fs.writeFileSync(path.join(outDir, 'dataset_stats.json'), JSON.stringify(stats, null, 2));

  // Build compact markdown tables
  const reviewCols = ['rating', 'title', 'user_id', 'asin', 'timestamp', 'verified_purchase'];
  const reviewRows = (sampleReviews.rows || []).map(x => ({
    rating: x.rating,
    title: (x.title || '').slice(0, 60),
    user_id: x.user_id,
    asin: x.asin,
    timestamp: x.timestamp,
    verified_purchase: x.verified_purchase
  }));
  const metaCols = ['title', 'average_rating', 'rating_number', 'store', 'categories', 'details'];
  const metaRows = (sampleMeta.rows || []).map(x => ({
    title: (x.title || '').slice(0, 60),
    average_rating: x.average_rating,
    rating_number: x.rating_number,
    store: x.store,
    categories: Array.isArray(x.categories) ? JSON.stringify(x.categories).slice(0, 40) : '',
    details: x.details ? (x.details['Date First Available'] || Object.keys(x.details)[0] || '') : ''
  }));

  const md = [
    '### Data Samples (Generated)\n',
    '**Reviews**\n',
    toMarkdownTable(reviewRows, reviewCols),
    '\n**Metadata**\n',
    toMarkdownTable(metaRows, metaCols),
    '\n**Stats**\n',
    '```json\n' + JSON.stringify(stats, null, 2) + '\n```\n'
  ].join('\n');

  fs.writeFileSync(path.join(outDir, 'tables.md'), md, 'utf8');

  console.log('Saved samples and stats to', outDir);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});


