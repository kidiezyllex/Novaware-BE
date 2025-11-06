import dotenv from 'dotenv';
import { connectDB, disconnectDB } from '../config/db.js';
import Product from '../models/productModel.js';

dotenv.config();

const SIZE_OPTIONS = ['s', 'm', 'l', 'xl'];

// Danh sách màu phổ biến trong thời trang (hex)
const FASHION_COLOR_HEXES = [
  '#000000', // black
  '#FFFFFF', // white
  '#808080', // gray
  '#1E90FF', // dodger blue
  '#000080', // navy
  '#FF0000', // red
  '#800020', // burgundy
  '#8B4513', // saddle brown
  '#556B2F', // dark olive green
  '#228B22', // forest green
  '#006400', // dark green
  '#FFD700', // gold
  '#FFA500', // orange
  '#FFC0CB', // pink
  '#FF69B4', // hot pink
  '#800080', // purple
  '#E6E6FA', // lavender
  '#87CEEB', // sky blue
  '#C3B091', // khaki
  '#F5F5DC', // beige
];

function toVnd(basePrice) {
  if (typeof basePrice !== 'number' || Number.isNaN(basePrice)) return 0;
  // Nếu giá nhỏ, coi như USD và quy đổi sang VND ~23k; nếu đã lớn, giữ nguyên
  const price = basePrice < 1000 ? basePrice * 23000 : basePrice;
  return Math.round(price);
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roundToNearest(price, step = 1000) {
  return Math.max(step, Math.round(price / step) * step);
}

function generateVariantPrice(baseVnd) {
  // Dao động +-15%
  const delta = 0.85 + Math.random() * 0.30; // [0.85, 1.15]
  return roundToNearest(baseVnd * delta, 1000);
}

function distributeStock(totalTarget, count) {
  if (count <= 0) return [];
  if (totalTarget <= 0) return new Array(count).fill(0);

  // Sinh trọng số ngẫu nhiên rồi chuẩn hoá về tổng ~ totalTarget
  const weights = Array.from({ length: count }, () => Math.random() ** 1.5 + 0.2);
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w / sum) * totalTarget);
  // Làm tròn số lượng và điều chỉnh sai số để khớp tổng
  let stocks = raw.map((v) => Math.max(0, Math.round(v)));
  let diff = totalTarget - stocks.reduce((a, b) => a + b, 0);
  while (diff !== 0) {
    const i = Math.floor(Math.random() * count);
    if (diff > 0) {
      stocks[i] += 1;
      diff -= 1;
    } else if (stocks[i] > 0) {
      stocks[i] -= 1;
      diff += 1;
    }
  }
  return stocks;
}

function getExistingCombosSet(product) {
  const set = new Set();
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      if (!v) continue;
      const key = `${(v.size || '').toLowerCase()}|${(v.color || '').toLowerCase()}`;
      set.add(key);
    }
  }
  return set;
}

function generateTargetCombos(targetCount, existingSet) {
  const combos = [];
  // Duyệt qua tổ hợp size x color theo thứ tự ngẫu nhiên cho đến khi đủ số lượng
  const sizes = [...SIZE_OPTIONS];
  const colors = [...FASHION_COLOR_HEXES];
  // Xáo trộn đơn giản
  sizes.sort(() => Math.random() - 0.5);
  colors.sort(() => Math.random() - 0.5);

  // Tạo pool tổ hợp không lặp
  const pool = [];
  for (const s of sizes) {
    for (const c of colors) {
      pool.push({ size: s, color: c });
    }
  }
  // Xáo trộn pool
  pool.sort(() => Math.random() - 0.5);

  for (const item of pool) {
    const key = `${item.size}|${item.color}`.toLowerCase();
    if (!existingSet.has(key)) {
      combos.push(item);
      existingSet.add(key);
      if (combos.length >= targetCount) break;
    }
  }

  // Nếu vẫn chưa đủ (trường hợp cực đoan), lặp lại màu khác thứ tự
  while (combos.length < targetCount) {
    const s = SIZE_OPTIONS[randomInt(0, SIZE_OPTIONS.length - 1)];
    const c = FASHION_COLOR_HEXES[randomInt(0, FASHION_COLOR_HEXES.length - 1)];
    const key = `${s}|${c}`.toLowerCase();
    if (!existingSet.has(key)) {
      combos.push({ size: s, color: c });
      existingSet.add(key);
    }
  }

  return combos;
}

async function upsertVariantsForProduct(product) {
  const current = Array.isArray(product.variants) ? product.variants : [];
  const existingCount = current.length;
  const minTarget = 12;
  const maxTarget = 20;
  if (existingCount >= minTarget) {
    return { updated: false, added: 0, reason: `đã có ${existingCount} variants` };
  }

  const targetTotal = randomInt(minTarget, maxTarget);
  const needs = Math.max(0, targetTotal - existingCount);

  const baseVnd = toVnd(product.price || 0);
  const approxTotalStock = Math.max(product.countInStock || 0, targetTotal * 2);
  const newStocks = distributeStock(approxTotalStock, needs);

  const existingSet = getExistingCombosSet(product);
  const combos = generateTargetCombos(needs, existingSet);

  const newVariants = combos.map((combo, idx) => ({
    color: combo.color,
    size: combo.size,
    price: generateVariantPrice(baseVnd),
    stock: newStocks[idx] ?? 0,
  }));

  product.variants = [...current, ...newVariants];
  // countInStock sẽ được cập nhật bởi pre-save hook trong model
  await product.save();
  return { updated: true, added: newVariants.length };
}

async function main() {
  await connectDB();
  try {
    const products = await Product.find({});
    console.log(`Tổng số sản phẩm: ${products.length}`);
    let totalUpdated = 0;
    let totalAdded = 0;
    let processed = 0;

    for (const p of products) {
      const result = await upsertVariantsForProduct(p);
      processed += 1;
      if (result.updated) {
        totalUpdated += 1;
        totalAdded += result.added;
        console.log(`✅ [${processed}/${products.length}] ${p._id}: +${result.added} variants (tổng: ${p.variants.length})`);
      } else {
        console.log(`⏭️  [${processed}/${products.length}] ${p._id}: bỏ qua (${result.reason || 'đủ số lượng'})`);
      }
    }

    console.log('==============================');
    console.log('Hoàn tất sinh variants cho sản phẩm');
    console.log('==============================');
    console.log(`Sản phẩm được cập nhật: ${totalUpdated}`);
    console.log(`Tổng variants được thêm: ${totalAdded}`);
  } catch (err) {
    console.error('Lỗi khi sinh variants:', err?.message || err);
    process.exitCode = 1;
  } finally {
    await disconnectDB();
  }
}

main();


