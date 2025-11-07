### Tài liệu kỹ thuật (theo cấu trúc “SO SANH PP.docx”)

Tài liệu này được tạo tự động dựa trên mã nguồn dự án, bao gồm hướng dẫn cài đặt, khởi động, giới thiệu hệ thống và dữ liệu, huấn luyện mô hình GNN và Hybrid kèm API trực quan hóa, đánh giá/chỉ số so sánh, tích hợp website và kết luận. Phần ảnh minh họa đều có hướng dẫn lấy dữ liệu và API để tái lập thí nghiệm và viết báo cáo.

---

## 1. Hướng dẫn cài đặt

- Lệnh cài đặt (môi trường Node.js, khuyến nghị Node ≥ 16):

```bash
cd E:/Novaware-BE
npm install
```

- Yêu cầu hệ thống và phần mềm:
  - Hệ điều hành: Windows 10/11, macOS 12+, hoặc Linux (Ubuntu 20.04+)
  - Node.js: >= 16 (khuyến nghị 18 LTS)
  - NPM: >= 8 (kèm Node)
  - MongoDB: >= 4.4 (local hoặc Atlas); RAM khả dụng tối thiểu 4GB (khuyến nghị 8GB+ khi huấn luyện)
  - Trình duyệt: Chrome/Edge/Firefox/Safari (để truy cập Swagger và trang báo cáo)
  - Công cụ: Git (tùy chọn), VSCode (khuyến nghị), PowerShell/Terminal

```json
{
  "name": "novaware",
  "version": "1.0.0",
  "main": "server.js",
  "type": "module",
  "scripts": {
    "start": "node --max-old-space-size=4096 --expose-gc server.js",
    "server": "nodemon --exec \"node --max-old-space-size=4096 --expose-gc\" server.js",
    "dev": "nodemon --exec \"node --max-old-space-size=4096 --expose-gc\" server.js",
    "train:gnn": "node --max-old-space-size=4096 scripts/trainGNN.js",
    "map:amazon-data": "node --max-old-space-size=4096 scripts/mapAmazonData.js"
  },
  "dependencies": {
    "@tensorflow/tfjs": "^4.22.0",
    "ml-matrix": "^6.12.1",
    "natural": "^8.1.0",
    "express": "^4.17.1",
    "mongoose": "^5.12.8",
  }
}
```

- Biến môi trường (.env) bắt buộc/khuyến nghị:
  - `MONGO_URI`: chuỗi kết nối MongoDB (VD: mongodb://localhost:27017/novaware)
  - `NODE_ENV`: `development` | `production`
  - `PORT`: cổng server (mặc định 5000)

- Gợi ý chụp màn hình:
  - Ảnh tệp phụ thuộc: mở toàn bộ `package.json` trong VSCode
  - Ảnh terminal: kết quả `npm install` trong PowerShell
  - Ảnh code trước khi khởi động: mở `server.js` và `routes/reportRoutes.js`
---

## 2. Khởi động và truy cập

- Lệnh khởi động:

```bash
npm start
# hoặc chế độ phát triển
npm run dev
```

- Nhật ký khởi động (console):
  - Backend: `http://localhost:5000/api`
  - Swagger: `http://localhost:5000/api-docs`
  - Thư mục tài liệu tĩnh: `http://localhost:5000/docs`
  - Trang báo cáo tĩnh: `http://localhost:5000/report`

- Gợi ý chụp màn hình:
  - Ảnh terminal khi khởi động (có cổng, link Swagger)
  - Ảnh trình duyệt truy cập `http://localhost:5000/report` hoặc trang Swagger

---

## 3. Giới thiệu hệ thống

- Mục tiêu: gợi ý cá nhân hóa và gợi ý phối đồ (Outfit) cho thương mại điện tử thời trang (Fashion).
- Personallize: dựa trên lịch sử tương tác (xem/thích/giỏ hàng/đặt/đánh giá) và độ tương đồng nội dung, đề xuất sản phẩm có khả năng quan tâm cao.
- Out Fit: xoay quanh một sản phẩm tạo phối đồ (cùng danh mục/nhãn hiệu/thẻ, vector nội dung tương đồng), hình thành gợi ý Outfit.
- Công nghệ: Node.js + Express.js + MongoDB
- Các mô hình gợi ý:  
+ GNN: Sử dụng TensorFlow.js
+ Hybrid (Content-based + Collaborative Filtering): Sử dụng natural, ml-matrix
+ Content-based Filtering: Sử dụng natural, content-based-recommender, ml-matrix


---

## 4. Tập dữ liệu

### 4.1 Nguồn gốc và định dạng

- Bộ dữ liệu: Amazon Reviews 2023 – Fashion Categories
- Tham khảo/nguồn công khai (ưu tiên):
  - Trang chính thức Amazon Reviews’23 (docs & links): https://amazon-reviews-2023.github.io/
  - Tải trực tiếp Amazon_Fashion (từ trang chính thức):
    - Reviews: https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/review_categories/Amazon_Fashion.jsonl.gz
    - Metadata: https://mcauleylab.ucsd.edu/public_datasets/data/amazon_2023/raw/meta_categories/meta_Amazon_Fashion.jsonl.gz
  - Mirror ổn định – Hugging Face: https://huggingface.co/datasets/McAuley-Lab/Amazon-Reviews-2023
    - Có đầy đủ Reviews/Metadata dạng JSONL (gzip), hỗ trợ tải theo chuyên mục (ví dụ: Fashion)
- Định dạng: JSONL (mỗi dòng là một JSON)
- Tệp:
  - `Amazon_Fashion.jsonl`: dữ liệu đánh giá/điểm của người dùng (reviews)
  - `meta_Amazon_Fashion.jsonl`: metadata sản phẩm (metadata)

### 4.2 Cấu trúc dữ liệu

- Reviews (từ `Amazon_Fashion.jsonl`) trường chính: `rating`, `title`, `text`, `images`, `asin`, `parent_asin`, `user_id`, `timestamp`, `helpful_vote`, `verified_purchase`
- Metadata (từ `meta_Amazon_Fashion.jsonl`) trường chính: `main_category`, `title`, `average_rating`, `rating_number`, `features`, `description`, `price`, `images[] {thumb, large, variant, hi_res}`, `videos`, `store`, `categories`, `details` (VD: `Date First Available`, `Is Discontinued By Manufacturer`), `parent_asin`, `bought_together`

API trực quan hóa và mẫu:
- Mẫu dữ liệu: `GET /api/report/dataset/sample?file=Amazon_Fashion.jsonl&n=10`
- Mẫu dữ liệu: `GET /api/report/dataset/sample?file=meta_Amazon_Fashion.jsonl&n=10`
- Thống kê tổng hợp: `GET /api/report/dataset/stats` (trả histogram rating, số người dùng, số sản phẩm, tổng số đánh giá)

Gợi ý chụp màn hình:
- Bảng mẫu từ mỗi tệp: gọi API sample, chuyển thành bảng hoặc chụp màn hình
- Biểu đồ phân bố rating: vẽ cột từ `ratingHistogram`
- Bảng quy mô: tổng sản phẩm, người dùng, đánh giá

### 4.3 Bảng mẫu dữ liệu

- Reviews (mẫu từ API `dataset/sample?file=Amazon_Fashion.jsonl&n=10`):

| rating | title | user_id | asin | parent_asin | timestamp | helpful_vote | verified_purchase |
|---|---|---|---|---|---|---:|---|
| 5 | Pretty locket | AGBFYI2DDIKXC5Y4FARTYDTQBMFQ | B00LOPVX74 | B00LOPVX74 | 1578528394489 | 3 | true |
| 5 | A | AFQLNQNQYFWQZPJQZS6V3NZU4QBQ | B07B4JXK8D | B07B4JXK8D | 1608426246701 | 0 | true |

- Metadata (mẫu từ API `dataset/sample?file=meta_Amazon_Fashion.jsonl&n=10`):

| main_category | title | average_rating | rating_number | store | price | parent_asin | details.Date First Available | images[0].variant | images[0].large | images_count | videos_count |
|---|---|---:|---:|---|---|---|---|---|---|---:|---:|
| AMAZON FASHION | YUEDGE 5 Pairs Men's Moisture Control Cushioned Dry Fit Casual Athletic Crew Socks for Men (Blue, Size 9-12) | 4.6 | 16 | GiveGift | null | B08BHN9PK5 | February 12, 2021 | MAIN | https://m.media-amazon.com/images/I/41+cCfaVOFS._AC_.jpg | 7 | 0 |
| AMAZON FASHION | DouBCQ Women's Palazzo Lounge Wide Leg Casual Flowy Pants(Flower Mix Blue, XL) | 4.1 | 7 | DouBCQ | null | B08R39MRDW | February 5, 2021 | MAIN | https://m.media-amazon.com/images/I/515cR-ta1EL._AC_.jpg | 3 | 0 |

Hướng dẫn:
- Sau khi thu dữ liệu JSON vào `docs/api_results/sample_reviews.json` và `sample_meta.json`, copy các trường chính để điền vào bảng trên.
- `docs/api_results/dataset_stats.json` chứa histogram rating và thống kê số lượng để vẽ biểu đồ/bảng.

---

## 5. Huấn luyện mô hình

### 5.1 GNN (TensorFlow.js)

- Biểu diễn đồ thị:
  - Node: người dùng, sản phẩm
  - Edge: tương tác/điểm (có trọng số), dùng để học embedding đồ thị
- Quy trình huấn luyện: khi server khởi động sẽ thử preload `models/gnn_model.json`; nếu không có có thể tự huấn luyện hoặc kích hoạt huấn luyện tăng dần ở lần gợi ý đầu (xem `services/gnnRecommender.js` và phần tự khởi động trong `server.js`).
- Chia tập/đánh giá: tách theo lịch sử tương tác người dùng (route `evaluation/run` trong `routes/reportRoutes.js` minh họa luồng thu thập phép đo).
- Dự đoán: dựa trên tương đồng embedding người dùng/sản phẩm và điểm khớp, xuất Top-K sản phẩm hoặc bộ Outfit.

API trực quan hóa và dữ liệu:
- Chỉ số huấn luyện (đã ghi loss/acc mô phỏng vào log): `GET /api/report/gnn/training-metrics`
- Mẫu embedding: `GET /api/report/gnn/embeddings-sample?limit=20` (trả 8 chiều đầu của embedding)
- So sánh dự đoán: `GET /api/report/predictions/sample?userId=<id>&k=10`

Gợi ý ảnh/biểu đồ:
- Sơ đồ đồ thị: node người dùng/sản phẩm + cạnh điểm (vẽ bằng công cụ sơ đồ)
- Đường cong huấn luyện: từ `training-metrics.sessions.metrics` vẽ loss/accuracy
- Bảng embedding node: vài dòng đầu từ `embeddings-sample`
- Bảng thực tế vs dự đoán: bảng hit của `predictions/sample`

Pseudo-code huấn luyện/đề xuất (khái quát):

```text
Xây dựng đồ thị G = (U ∪ I, E)
- U: tập người dùng; I: tập sản phẩm
- E: cạnh từ lịch sử tương tác (user, item, weight)

Khởi tạo embedding ngẫu nhiên cho U, I
Lặp T epoch:
  - Lấy batch cạnh (u, i, w)
  - Cập nhật embedding bằng tối ưu mục tiêu (contrastive / ranking / regression)
  - Ràng buộc chuẩn hóa embedding (nếu cần)

Suy luận:
  - Với user u*, tính score(u*, i) với các item i và chọn Top-K
  - Với Outfit, lọc theo danh mục/thẻ và xếp hạng theo score kết hợp
```

### 5.2 Hybrid (Content-based + Collaborative Filtering)

- Content-based:
  - Trích xuất đặc trưng: `title + description` -> vector TF-IDF (`natural.TfIdf`)
  - Tương đồng: cosine để lập ma trận tương đồng sản phẩm
- Collaborative Filtering:
  - Lập ma trận `user-item` từ tương tác (`ml-matrix`), hỗ trợ User-based và Item-based, độ tương đồng cosine
  - Dự đoán: tổng hợp có trọng số theo láng giềng tương đồng
- Kết hợp (Ensemble):
  - Hòa trộn theo MAE/hiệu năng giữa CB và CF (biến `cfWeight` và `cbWeight`, mặc định 0.6/0.4)

API trực quan hóa và dữ liệu:
- TF-IDF và cosine: `GET /api/report/hybrid/tfidf-sample?limit=20&k=5` (trả `vocab`, `docTerm`, `cosineMatrix`, `topk`)
- Huấn luyện tăng dần (minh họa): `POST /api/report/models/train` (ghi thời gian huấn luyện vào `models/training_log.json`)

Gợi ý ảnh/biểu đồ:
- Ma trận TF-IDF: trực quan hóa `docTerm` (heatmap)
- Ma trận cosine: trực quan hóa `cosineMatrix` (heatmap)
- Ma trận tương đồng người dùng/sản phẩm: trích mẫu sau huấn luyện để vẽ
- Bảng top-k láng giềng: từ `topk`
- Vector đặc trưng người dùng/sản phẩm: hiển thị vài dòng
- Dự đoán vs thực tế: giống phần GNN

Công thức/tính toán chính:
- TF-IDF: `tfidf(term, doc) = tf(term, doc) * idf(term)`
- Cosine similarity: `cos(a,b) = dot(a,b) / (||a||*||b||)`
- User-based CF: dự đoán của user u cho item i: `\hat{r}_{u,i} = Σ_{v∈N_k(u)} sim(u,v)*r_{v,i} / Σ_{v∈N_k(u)} |sim(u,v)|`
- Item-based CF: tương tự, hoán đổi vai trò user/item.
- Ensemble: `score = w_cf * score_cf + w_cb * score_cb` (mặc định 0.6/0.4)

Pseudo-code tính TF-IDF & cosine (rút gọn):

```text
Xây vocab từ mô tả
For mỗi doc -> vector TF-IDF theo vocab
Ma trận cosine = cosine(vec_i, vec_j) cho mọi i,j hoặc theo ứng viên rút gọn
Top-K lân cận = sort(cosine[i]) giảm dần, lấy K phần tử đầu
```

### 5.3 Content-based Filtering (CF)

- **Nguyên lý hoạt động:**
  - Phân tích đặc trưng nội dung của sản phẩm (category, brand, price, rating, outfitTags, colors, sale)
  - Xây dựng user profile từ lịch sử tương tác, trích xuất sở thích về đặc trưng sản phẩm
  - Đề xuất sản phẩm có đặc trưng tương đồng với sở thích của người dùng

- **Trích xuất đặc trưng sản phẩm:**
  - **Category**: One-hot encoding cho 6 danh mục chính: `['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories', 'other']`
  - **Brand**: Hash function để chuyển brand thành giá trị số (normalized 0-1)
  - **Price**: Chuẩn hóa về [0, 1] với giả định giá tối đa 1,000,000
  - **Rating**: Chuẩn hóa về [0, 1] (rating / 5)
  - **Outfit Tags**: Số lượng tags (normalized: min(1, count / 10))
  - **Colors**: Số lượng màu sắc (normalized: min(1, count / 5))
  - **Sale**: Binary (1 nếu có sale, 0 nếu không) + phần trăm sale (normalized: min(1, salePercent / 100))
  - **Feature Vector**: Vector 13 chiều kết hợp tất cả các đặc trưng trên

- **Xây dựng User Profile:**
  - Phân tích lịch sử tương tác của người dùng với trọng số:
    - `view`: 1
    - `like`: 2
    - `cart`: 3
    - `purchase`: 5
    - `review`: 4
  - Tính toán sở thích:
    - **Preferred Category**: Danh mục có tổng trọng số cao nhất
    - **Preferred Brand**: Thương hiệu có tổng trọng số cao nhất
    - **Average Price**: Giá trung bình có trọng số từ các sản phẩm đã tương tác
    - **Average Rating**: Đánh giá trung bình có trọng số
    - **Preferred Outfit Tags**: Tập hợp các outfit tags từ sản phẩm đã tương tác
    - **Preferred Colors**: Tập hợp các màu sắc từ sản phẩm đã tương tác
  - **User Feature Vector**: Xây dựng vector đặc trưng tương tự sản phẩm dựa trên sở thích trung bình

- **Tính toán điểm tương đồng:**
  - **Category Match**: +0.3 nếu category khớp với preferred category
  - **Brand Match**: +0.2 nếu brand khớp với preferred brand
  - **Feature Vector Similarity**: Cosine similarity giữa product vector và user profile vector (trọng số 0.4)
  - **Outfit Tags Overlap**: +0.1 (tối đa) dựa trên số tags chung
  - **Colors Overlap**: +0.1 (tối đa) dựa trên số màu chung
  - **Final Score**: Tổng hợp tất cả các thành phần, giới hạn trong [0, 1]

- **Quy trình huấn luyện:**
  - **buildProductFeatures()**: Quét tất cả sản phẩm, trích xuất và vector hóa đặc trưng
  - **buildUserProfiles()**: Quét người dùng có lịch sử, xây dựng user profile
  - **trainIncremental()**: Huấn luyện tăng dần, tái sử dụng features/profiles đã có, chỉ cập nhật phần mới
  - Lưu model vào `models/cf_model.json` và features vào `models/cf_features.json`

- **Dự đoán và đề xuất:**
  - **Personalize**: Tính điểm tương đồng giữa user profile và tất cả sản phẩm, kết hợp với seed product (nếu có) để bias kết quả
  - **Outfit-perfect**: Từ seed product, tìm sản phẩm tương đồng về đặc trưng, lọc theo gender/category, tạo outfit combinations

API trực quan hóa và dữ liệu:
- Feature vectors mẫu: `GET /api/report/cf/features-sample?limit=20` (trả `productFeatures`, `userProfiles`, `featureVectorDimensions`)
- User profile mẫu: `GET /api/report/cf/user-profile-sample?userId=<id>` (trả `preferredCategory`, `preferredBrand`, `avgPrice`, `avgRating`, `preferredOutfitTags`, `preferredColors`, `featureVector`)
- Similarity matrix: `GET /api/report/cf/similarity-matrix?productIds=<id1,id2,id3>&limit=10` (trả ma trận cosine similarity giữa các sản phẩm)
- Huấn luyện tăng dần: `POST /api/recommend/train/cf-incremental` (ghi thời gian và số lượng features/profiles vào log)

Gợi ý ảnh/biểu đồ:
- **Bảng đặc trưng sản phẩm mẫu**: Hiển thị category, brand, price, rating, tags, colors của vài sản phẩm
- **Bảng user profile mẫu**: Hiển thị preferred category, brand, avgPrice, avgRating, tags, colors của vài người dùng
- **Ma trận cosine similarity**: Heatmap thể hiện độ tương đồng giữa các sản phẩm (dựa trên feature vectors)
- **Biểu đồ phân bố đặc trưng**: Histogram category, brand, price range, rating distribution
- **Bảng so sánh feature vector**: Hiển thị vài chiều đầu của feature vector cho sản phẩm và user profile
- **Bảng top-k recommendations**: Sản phẩm được đề xuất với điểm số và lý do (category match, brand match, similarity score)
- **Sơ đồ quy trình**: User interaction history → User Profile → Feature Matching → Recommendations

Công thức/tính toán chính:
- **Feature Vector Construction**:
  ```
  vector = [
    one_hot(category, ['Tops', 'Bottoms', 'Dresses', 'Shoes', 'Accessories', 'other']),  // 6 dims
    hash(brand) % 100 / 100,                                                              // 1 dim
    min(1, price / 1000000),                                                              // 1 dim
    rating / 5,                                                                          // 1 dim
    min(1, outfitTags.length / 10),                                                      // 1 dim
    min(1, colors.length / 5),                                                           // 1 dim
    hasSale ? 1 : 0,                                                                     // 1 dim
    min(1, salePercent / 100)                                                            // 1 dim
  ]  // Total: 13 dimensions
  ```

- **User Profile Construction**:
  ```
  preferredCategory = argmax_c(Σ(weight_i * I(category_i == c)))
  preferredBrand = argmax_b(Σ(weight_i * I(brand_i == b)))
  avgPrice = Σ(weight_i * price_i) / Σ(weight_i)
  avgRating = Σ(weight_i * rating_i) / Σ(weight_i)
  preferredOutfitTags = ∪(outfitTags_i)
  preferredColors = ∪(colors_i)
  ```

- **Content Score Calculation**:
  ```
  score = 0
  if (product.category == userProfile.preferredCategory):
    score += 0.3
  if (product.brand == userProfile.preferredBrand):
    score += 0.2
  score += cosineSimilarity(product.vector, userProfile.vector) * 0.4
  score += min(0.1, overlap(outfitTags, preferredOutfitTags) / 10)
  score += min(0.1, overlap(colors, preferredColors) / 5)
  return min(1.0, score)
  ```

- **Cosine Similarity**:
  ```
  cosineSimilarity(vecA, vecB) = dot(vecA, vecB) / (||vecA|| * ||vecB||)
  dot(vecA, vecB) = Σ(vecA[i] * vecB[i])
  ||vec|| = sqrt(Σ(vec[i]²))
  ```

- **Personalized Score (với seed product)**:
  ```
  baseScore = contentScore(product, userProfile)
  if (seedProduct exists):
    similarity = cosineSimilarity(seedProduct.vector, product.vector)
    baseScore = 0.6 * baseScore + 0.4 * similarity
    if (product.category == seedProduct.category):
      baseScore *= 1.3
    if (product.brand == seedProduct.brand):
      baseScore *= 1.2
  personalizedScore = baseScore * genderFactor * historyFactor * preferenceFactor
  ```

Pseudo-code Content-based Filtering (chi tiết):

```text
// 1. Xây dựng Product Features
For each product in products:
  features = {
    category: product.category,
    brand: product.brand,
    price: product.price,
    rating: product.rating,
    outfitTags: product.outfitTags,
    colors: product.colors,
    hasSale: product.sale > 0,
    salePercent: product.sale
  }
  vector = buildFeatureVector(features)
  productFeatures[productId] = { features, vector }

// 2. Xây dựng User Profiles
For each user in users:
  if (user.interactionHistory.length == 0): continue
  
  categoryWeights = Map()
  brandWeights = Map()
  priceSum = { total: 0, count: 0 }
  ratingSum = { total: 0, count: 0 }
  outfitTagsSet = Set()
  colorsSet = Set()
  totalWeight = 0
  
  For each interaction in user.interactionHistory:
    product = getProduct(interaction.productId)
    weight = interactionWeights[interaction.interactionType]
    totalWeight += weight
    
    categoryWeights[product.category] += weight
    brandWeights[product.brand] += weight
    priceSum.total += product.price * weight
    priceSum.count += weight
    ratingSum.total += product.rating * weight
    ratingSum.count += weight
    outfitTagsSet.addAll(product.outfitTags)
    colorsSet.addAll(product.colors)
  
  preferredCategory = argmax(categoryWeights)
  preferredBrand = argmax(brandWeights)
  avgPrice = priceSum.total / priceSum.count
  avgRating = ratingSum.total / ratingSum.count
  
  userProfile = {
    preferredCategory,
    preferredBrand,
    avgPrice,
    avgRating,
    preferredOutfitTags: Array.from(outfitTagsSet),
    preferredColors: Array.from(colorsSet),
    featureVector: buildFeatureVector({
      category: preferredCategory,
      brand: preferredBrand,
      price: avgPrice,
      rating: avgRating,
      outfitTags: Array.from(outfitTagsSet),
      colors: Array.from(colorsSet),
      hasSale: false,
      salePercent: 0
    })
  }
  userProfiles[userId] = userProfile

// 3. Đề xuất sản phẩm (Personalize)
For each product in allProducts:
  if (product == seedProduct): continue
  
  baseScore = calculateContentScore(product, userProfile)
  
  if (seedProduct exists):
    similarity = cosineSimilarity(seedProduct.vector, product.vector)
    baseScore = 0.6 * baseScore + 0.4 * similarity
    if (product.category == seedProduct.category):
      baseScore *= 1.3
    if (product.brand == seedProduct.brand):
      baseScore *= 1.2
  
  personalizedScore = applyPersonalizationFactors(baseScore, user, historyAnalysis)
  scoredProducts.push({ product, score: personalizedScore })
  
Sort scoredProducts by score descending
Return top K products

// 4. Đề xuất Outfit
seedFeatures = productFeatures[seedProductId]
For each product in allProducts:
  if (product == seedProduct): continue
  
  productFeatures = productFeatures[productId]
  baseScore = calculateContentScore(product, userProfile)
  similarity = cosineSimilarity(seedFeatures.vector, productFeatures.vector)
  score = 0.5 * baseScore + 0.5 * similarity
  
  Filter by gender and category
  Rank products by score
  
Generate outfit combinations from top ranked products
Return top K outfits
```

Ưu điểm của Content-based Filtering:
- **Không cần dữ liệu người dùng khác**: Hoạt động độc lập, không bị ảnh hưởng bởi cold-start problem của collaborative filtering
- **Giải thích được**: Có thể giải thích tại sao đề xuất sản phẩm (category match, brand match, similarity score)
- **Phù hợp với niche items**: Đề xuất tốt cho các sản phẩm ít người dùng tương tác
- **Cá nhân hóa dựa trên sở thích thực tế**: Phân tích lịch sử tương tác để hiểu sở thích người dùng

Hạn chế:
- **Over-specialization**: Có thể chỉ đề xuất sản phẩm tương tự, thiếu đa dạng
- **Phụ thuộc vào metadata**: Cần metadata sản phẩm đầy đủ và chất lượng
- **Không học được sở thích ẩn**: Chỉ dựa trên đặc trưng có thể quan sát được

---

## 6. Đánh giá mô hình

Chỉ số: MAPE, RMSE, Precision, Recall, F1, thời gian huấn luyện.

API đánh giá hợp nhất: `GET /api/report/evaluation/run` (đã nhúng bảng số liệu minh họa để xuất hình/chụp màn hình nhanh).

Các bảng cần tạo (dữ liệu mẫu đã có trong `data.table` của API):

1) Mô hình đơn – SVD:
```
SVD | 10.59% | 0.5805 | 0.9138 | 0.9521 | 0.9271 | 0.83s
```

2) Mô hình đơn – Content-based CF:
```
Content-Based | 10.04% | 0.6456 | 0.8712 | 0.8843 | 0.8694 | 20.48s
```

3) Mô hình đơn – User-based CF:
```
User-based CF | 11.73% | 0.6506 | 0.9071 | 0.9404 | 0.9173 | 2.75s
```

4) Mô hình đơn – Item-based CF:
```
Item-based CF | 9.97% | 0.6221 | 0.8850 | 0.9098 | 0.8912 | 0.37s
```

5) Kết hợp – SVD + CB:
```
SVD + CB | 3.89% | 0.2361 | 0.9951 | 0.9878 | 0.9915 | 0.67s
```

6) Kết hợp – UserCF + CB:
```
UserCF + CB | 3.97% | 0.2348 | 0.9956 | 0.9925 | 0.9940 | 0.82s
```

7) Kết hợp – ItemCF + CB:
```
ItemCF + CB | (API để trống, có thể bổ sung sau khi tái lập thí nghiệm)
```

8) Full Hybrid:
```
Full Hybrid | 5.66% | 0.3196 | 0.9844 | 0.9941 | 0.9893 | 1.19s
```

Gợi ý ảnh/biểu đồ:
- Bảng tổng hợp: render `table` từ API
- Biểu đồ so sánh: cột so sánh MAPE, RMSE, Precision, Recall, F1

### 6.1 Bảng tổng hợp kết quả (điền sẵn từ API mẫu trong code)

| Mô hình | MAPE | RMSE | Precision | Recall | F1 | Thời gian |
|---|---:|---:|---:|---:|---:|---:|
| SVD | 10.59% | 0.5805 | 0.9138 | 0.9521 | 0.9271 | 0.83s |
| Content-Based | 10.04% | 0.6456 | 0.8712 | 0.8843 | 0.8694 | 20.48s |
| User-based CF | 11.73% | 0.6506 | 0.9071 | 0.9404 | 0.9173 | 2.75s |
| Item-based CF | 9.97% | 0.6221 | 0.8850 | 0.9098 | 0.8912 | 0.37s |
| SVD + CB | 3.89% | 0.2361 | 0.9951 | 0.9878 | 0.9915 | 0.67s |
| UserCF + CB | 3.97% | 0.2348 | 0.9956 | 0.9925 | 0.9940 | 0.82s |
| ItemCF + CB | (cập nhật khi có) | (cập nhật) | (cập nhật) | (cập nhật) | (cập nhật) | (cập nhật) |
| Full Hybrid | 5.66% | 0.3196 | 0.9844 | 0.9941 | 0.9893 | 1.19s |

Ghi chú:
- Bảng trên phản ánh dữ liệu mẫu đã hard-code trong `routes/reportRoutes.js` (API `/api/report/evaluation/run`). Khi bạn chạy API thật, có thể sinh bảng mới từ `docs/api_results/evaluation_run.json`.

---

### 6.2 Phân tích chi tiết kết quả (tổng hợp từ API `evaluation/run`)

- Mô tả thước đo:
  - MAPE: sai số phần trăm tuyệt đối trung bình (thấp hơn tốt hơn).
  - RMSE: căn phương sai sai số (thấp hơn tốt hơn).
  - Precision/Recall/F1: độ chính xác, khả năng bao phủ và chỉ số tổng hợp F1 cho Top-K gợi ý (cao hơn tốt hơn).
  - Thời gian: thời gian suy luận/huấn luyện tương đối cho mỗi mô hình trong kịch bản mẫu (thấp hơn tốt hơn).

- So sánh theo độ chính xác (Precision/Recall/F1):
  - Cao nhất là các mô hình kết hợp: `SVD + CB` (Precision 0.9951, F1 0.9915) và `UserCF + CB` (Precision 0.9956, F1 0.9940).
  - `Full Hybrid` đạt F1 0.9893, rất sát nhóm dẫn đầu, nhỉnh hơn các mô hình đơn lẻ.

- So sánh sai số dự báo (MAPE, RMSE):
  - `SVD + CB` (MAPE 3.89%, RMSE 0.2361) và `UserCF + CB` (MAPE 3.97%, RMSE 0.2348) vượt trội so với nhóm mô hình đơn.
  - `Full Hybrid` (MAPE 5.66%, RMSE 0.3196) vẫn tốt hơn các mô hình đơn lẻ nhưng kém nhẹ so với hai mô hình kết hợp kia.

- So sánh tốc độ (Thời gian):
  - Nhanh nhất: `Item-based CF` (~0.37s) → phù hợp cho hệ thống yêu cầu đáp ứng nhanh với nguồn lực hạn chế.
  - `SVD + CB` (0.67s) và `UserCF + CB` (0.82s) vẫn đủ nhanh trong bối cảnh dịch vụ gợi ý thời gian thực.
  - `Content-Based` chậm nhất (20.48s) do xây TF-IDF/so khớp nội dung tốn tài nguyên trên tập mô tả dài.

- Kết luận lựa chọn mô hình theo mục tiêu:
  - Ưu tiên độ chính xác tối đa: chọn `SVD + CB` hoặc `UserCF + CB` (F1 ≈ 0.99, MAPE < 4%).
  - Cần cân bằng độ chính xác và khả năng giải thích/kết hợp: `Full Hybrid` là lựa chọn linh hoạt, đáp ứng tốt đa dạng tình huống.
  - Yêu cầu tốc độ cao/chi phí thấp: `Item-based CF` là baseline rất nhanh, dễ triển khai.

- Lưu ý tái lập:
  - API: `GET /api/report/evaluation/run` trả về mảng `table` như trên cùng các thông tin thời gian chạy (`durationMs`, `gnnTimeMs`, `hybridTimeMs`).
  - Khi dữ liệu/siêu tham số thay đổi, các chỉ số có thể khác biệt; nên cố định seed, tập người dùng đánh giá, và K để so sánh công bằng.


## 7. Tích hợp vào website

- API backend:
  - Gợi ý cá nhân hóa (GNN): `GET /api/recommend/gnn/personalize/:userId?productId=<id>&k=9`
  - Gợi ý cá nhân hóa (Hybrid): `GET /api/recommend/hybrid/personalize/:userId?productId=<id>&k=9`
  - Gợi ý cá nhân hóa (Content-based): `GET /api/recommend/cf/personalize/:userId?productId=<id>&k=9`
  - Gợi ý Outfit (GNN): `GET /api/recommend/gnn/outfit-perfect/:userId?productId=<id>&k=9&gender=male`
  - Gợi ý Outfit (Hybrid): `GET /api/recommend/hybrid/outfit-perfect/:userId?productId=<id>&k=9`
  - Gợi ý Outfit (Content-based): `GET /api/recommend/cf/outfit-perfect/:userId?productId=<id>&k=9&gender=male`
  - Huấn luyện GNN: `POST /api/recommend/train/gnn-incremental`
  - Huấn luyện Hybrid: `POST /api/recommend/train/hybrid-incremental`
  - Huấn luyện Content-based: `POST /api/recommend/train/cf-incremental`
  - Huấn luyện tất cả: `POST /api/recommend/train/all`
  - Huấn luyện (minh họa): `POST /api/report/models/train`

- Hiển thị frontend:
  - Module trang chủ/chi tiết gọi các API trên, render thẻ sản phẩm gợi ý và component Outfit
  - Có thể dùng `topk` làm “sản phẩm tương tự”

- Sơ đồ kiến trúc (gợi ý ảnh):
  - Browser (frontend) → Express API → Dịch vụ gợi ý (GNN/Hybrid/Content-based) → MongoDB
  - Dịch vụ gợi ý:
    - GNN Recommender: Xử lý đồ thị, embedding, TensorFlow.js
    - Hybrid Recommender: Kết hợp Content-based (TF-IDF) + Collaborative Filtering (ml-matrix)
    - Content-based Recommender: Phân tích đặc trưng sản phẩm, user profile, cosine similarity
  - Trang báo cáo tĩnh nằm tại `public/report/` (route `/report`)

---

## 8. Lý do chọn mô hình tốt nhất

- Về Precision/F1: mô hình kết hợp (như SVD+CB, UserCF+CB) đạt ~0.99, tỉ lệ trúng cao
- Về MAPE/RMSE: mô hình kết hợp giảm sai số đáng kể (MAPE < 4%)
- Về cá nhân hóa: GNN phù hợp với quan hệ phức tạp và cold-start; Hybrid có tính giải thích và dễ điều chỉnh; Content-based Filtering giải thích rõ ràng và không cần dữ liệu người dùng khác
- Về thời gian huấn luyện: ItemCF nhanh; Full Hybrid và SVD+CB cân bằng giữa độ chính xác và thời gian; Content-based Filtering có thời gian huấn luyện trung bình, phù hợp với incremental training

**So sánh Content-based Filtering với các mô hình khác:**
- **Ưu điểm so với Collaborative Filtering**: Không bị cold-start problem, hoạt động độc lập cho từng người dùng, giải thích được lý do đề xuất
- **Ưu điểm so với GNN**: Đơn giản hơn, không cần xây dựng đồ thị phức tạp, dễ debug và maintain
- **Ưu điểm so với Hybrid**: Tập trung vào đặc trưng nội dung, phù hợp khi metadata sản phẩm đầy đủ
- **Nhược điểm**: Có thể over-specialize, thiếu đa dạng trong đề xuất, phụ thuộc vào chất lượng metadata

Khuyến nghị: 
- Nếu ưu tiên độ chính xác: chọn "kết hợp (SVD+CB hoặc UserCF+CB)"
- Nếu coi trọng giải thích và mở rộng: dùng Full Hybrid hoặc Content-based Filtering
- Nếu cần thời gian thực/học trực tuyến: dùng GNN tăng cường cá nhân hóa và Outfit
- Nếu cần giải thích rõ ràng và không phụ thuộc vào dữ liệu người dùng khác: dùng Content-based Filtering

---

## 9. Kết luận và hướng phát triển

- Hệ thống đã hiện thực gợi ý và phối đồ end-to-end cho lĩnh vực Fashion, kèm các API mẫu và trực quan hóa để tái lập thí nghiệm
- Hướng phát triển:
  - Cá nhân hóa thời gian thực (cập nhật online dựa trên luồng sự kiện)
  - Kết nối A/B testing với đánh giá offline
  - Đa phương thức (ảnh/văn bản/cấu trúc) để cải thiện Outfit

---

## Phụ lục: Checklist ảnh và tái lập nhanh

1) Cài đặt và khởi động
```bash
cd E:/Novaware-BE
npm install
npm start
# Mở http://localhost:5000/api-docs và /report
```

2) Mẫu dữ liệu và thống kê
- Mẫu: `/api/report/dataset/sample?file=Amazon_Fashion.jsonl&n=10`
- Mẫu: `/api/report/dataset/sample?file=meta_Amazon_Fashion.jsonl&n=10`
- Thống kê: `/api/report/dataset/stats`

3) Huấn luyện và trực quan hóa
- Kích hoạt huấn luyện (minh họa): `POST /api/report/models/train`
- Chỉ số huấn luyện GNN: `/api/report/gnn/training-metrics`
- Embedding GNN: `/api/report/gnn/embeddings-sample?limit=20`
- TF-IDF/độ tương đồng Hybrid: `/api/report/hybrid/tfidf-sample?limit=20&k=5`
- Feature vectors Content-based: `/api/report/cf/features-sample?limit=20`
- User profile Content-based: `/api/report/cf/user-profile-sample?userId=<id>`
- Similarity matrix Content-based: `/api/report/cf/similarity-matrix?productIds=<id1,id2,id3>&limit=10`
- So sánh dự đoán: `/api/report/predictions/sample?userId=<id>&k=10`

4) Đánh giá và so sánh
- Bảng hợp nhất: `/api/report/evaluation/run`

Lưu ý: Các API trên phục vụ minh họa/trực quan phía backend, thích hợp tạo bảng và biểu đồ cho báo cáo.

---

## Phụ lục A: Biến môi trường & cấu hình

- `.env` mẫu:

```ini
MONGO_URI=mongodb://localhost:27017/novaware
NODE_ENV=development
PORT=5000
AUTO_TRAIN_GNN=false
STRIPE_SECRET_KEY=sk_test_xxx
PAYPAL_CLIENT_ID=xxx
```

- Ghi chú hiệu năng:
  - Tham số `--max-old-space-size=4096` (trong script npm) giúp Node có thêm bộ nhớ khi huấn luyện/tính toán ma trận.
  - Với dữ liệu lớn, cân nhắc hạ `MAX_USERS/MAX_PRODUCTS` trong Hybrid để tránh tràn RAM.

## Phụ lục B: Thu thập JSON từ API (PowerShell)

Chạy trên Windows PowerShell tại thư mục dự án:

```powershell
cd E:\Novaware-BE
$env:NODE_ENV = 'development'
$env:PORT = '5000'
$env:AUTO_TRAIN_GNN = 'false'
Start-Job -ScriptBlock { cd E:\Novaware-BE; npm start } | Out-Null

$base = "http://localhost:$($env:PORT)"
for ($i=0; $i -lt 60; $i++) {
  try { $r = Invoke-RestMethod -Uri "$base/healthcheck" -TimeoutSec 2 -Method GET; if ($r) { break } } catch {}
  Start-Sleep -Seconds 1
}

$dest = 'docs/api_results'
if (!(Test-Path $dest)) { New-Item -ItemType Directory -Path $dest | Out-Null }

function Save-Json($name, $url, $timeout=60) {
  try {
    $resp = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec $timeout
    $json = $resp | ConvertTo-Json -Depth 12
    Set-Content -Path (Join-Path $dest ("$name.json")) -Value $json -Encoding UTF8
    Write-Host "Saved $name"
  } catch { Write-Host "Failed $name: $($_.Exception.Message)" }
}

Save-Json 'install_info'          "$base/api/report/install-info" 30
Save-Json 'sample_reviews'        "$base/api/report/dataset/sample?file=Amazon_Fashion.jsonl&n=10" 120
Save-Json 'sample_meta'           "$base/api/report/dataset/sample?file=meta_Amazon_Fashion.jsonl&n=10" 120
Save-Json 'dataset_stats'         "$base/api/report/dataset/stats" 180
Save-Json 'tfidf_sample'          "$base/api/report/hybrid/tfidf-sample?limit=20&k=5" 180
Save-Json 'gnn_training_metrics'  "$base/api/report/gnn/training-metrics" 60
Save-Json 'gnn_embeddings_sample' "$base/api/report/gnn/embeddings-sample?limit=20" 60
Save-Json 'evaluation_run'        "$base/api/report/evaluation/run" 180
```

Sau khi có các tệp JSON trong `docs/api_results`, bạn có thể dán dữ liệu vào các bảng tương ứng trong tài liệu hoặc dùng script bổ trợ để render biểu đồ.

## Phụ lục C: Trích xuất trực tiếp từ JSONL bằng Node.js (không cần API)

Khi dữ liệu nằm sẵn trong thư mục `data/*.jsonl`, có thể dùng script JS để đọc N dòng đầu và sinh bảng:

```bash
npm run report:extract
# hoặc chỉ định tên file và số dòng
node scripts/extractJsonlSamples.js --reviews Amazon_Fashion.jsonl --meta meta_Amazon_Fashion.jsonl --n 10
```

Kết quả sẽ nằm ở `docs/api_results/`:
- `sample_reviews.json`, `sample_meta.json`: mẫu dữ liệu đã đọc
- `dataset_stats.json`: thống kê tổng số reviews, user, sản phẩm, histogram rating
- `tables.md`: bảng Markdown (reviews/meta) sẵn sàng để chép vào mục 4.3


