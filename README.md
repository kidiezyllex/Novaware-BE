Backend API build with Express, JavaScript, MVC, RESTful.

Tutorial
Detailed documentation for all API endpoints available in the system.

## 1. Users & Authentication

### 1.1. Register
Method: POST
Path: /api/auth/register
Access: Public
Payload:
```json
{
  "name": "string",
  "email": "string",
  "password": "string"
}
```
Response:
```json
{
  "message": "User registered successfully",
  "data": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "isAdmin": false
  }
}
```

### 1.2. Login
Method: POST
Path: /api/auth/login
Access: Public
Payload:
```json
{
  "email": "string",
  "password": "string"
}
```
Response:
```json
{
  "message": "Login successful",
  "data": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "isAdmin": false,
    "token": "string"
  }
}
```
### 1.9. Forgot Password
Method: POST
Path: /api/auth/forgot-password
Access: Public
Payload:
```json
{
  "email": "string"
}
```
Response:
```json
{
  "message": "Email sent to {email} with verification code"
}
```

### 1.10. Verify Code
Method: POST
Path: /api/auth/verify-code
Access: Public
Payload:
```json
{
  "email": "string",
  "code": "string"
}
```
Response:
```json
{
  "message": "Verification successful",
  "data": {
    "resetToken": "string"
  }
}
```

### 1.11. Reset Password
Method: PUT
Path: /api/auth/reset-password
Access: Private (Reset Token Required)
Headers:
```
Authorization: Bearer {resetToken}
```
Payload:
```json
{
  "password": "string"
}
```
Response:
```json
{
  "message": "Password updated successfully"
}
```

### 1.11.5. Reset Password By User ID
Method: POST
Path: /api/auth/reset-password-by-user-id
Access: Public
Payload:
```json
{
  "userId": "string",
  "newPassword": "string"
}
```
Response:
```json
{
  "message": "Password reset successfully"
}
```

### 1.12. Get User Profile
Method: GET
Path: /api/users/profile
Access: Private
Response:
```json
{
  "message": "User profile retrieved successfully",
  "data": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "height": "number",
    "weight": "number",
    "gender": "string",
    "isAdmin": false
  }
}
```

### 1.13. Update User Profile
Method: PUT
Path: /api/users/profile
Access: Private
Payload:
```json
{
  "name": "string",
  "email": "string",
  "password": "string",
  "height": "number",
  "weight": "number",
  "gender": "string"
}
```
Response:
```json
{
  "message": "User profile updated successfully",
  "data": {
    "_id": "string",
    "name": "string",
    "email": "string",
    "height": "number",
    "weight": "number",
    "gender": "string",
    "isAdmin": false,
    "token": "string"
  }
}
```

### 1.14. Get All Users
Method: GET
Path: /api/users
Access: Private/Admin
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Users retrieved successfully",
  "data": {
    "users": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 1.15. Get User By ID
Method: GET
Path: /api/users/:id
Access: Public
Response:
```json
{
  "message": "User retrieved successfully",
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "isAdmin": false
    }
  }
}
```

### 1.16. Update User
Method: PUT
Path: /api/users/:id
Access: Private/Admin
Payload:
```json
{
  "name": "string",
  "email": "string",
  "isAdmin": false
}
```
Response:
```json
{
  "message": "User updated successfully",
  "data": {
    "user": {
      "_id": "string",
      "name": "string",
      "email": "string",
      "isAdmin": false
    }
  }
}
```

### 1.17. Delete User
Method: DELETE
Path: /api/users/:id
Access: Private/Admin
Response:
```json
{
  "message": "User removed successfully"
}
```

### 1.18. Add to Favorites
Method: POST
Path: /api/users/:userId/favorites
Access: Private
Payload:
```json
{
  "productId": "string"
}
```
Response:
```json
{
  "message": "Product added to favorites"
}
```

### 1.19. Remove from Favorites
Method: DELETE
Path: /api/users/:userId/favorites/:productId
Access: Private
Response:
```json
{
  "message": "Product removed from favorites"
}
```

### 1.20. Get Favorites
Method: GET
Path: /api/users/:userId/favorites
Access: Private
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Favorites retrieved successfully",
  "data": {
    "favorites": [],
    "page": 1,
    "pages": 5,
    "count": 45
  }
}
```

### 1.21. Check Purchase History
Method: GET
Path: /api/users/:userId/check/purchase-history
Access: Private
Response:
```json
{
  "message": "Purchase history checked successfully",
  "data": {
    "hasPurchaseHistory": true,
    "orderCount": 5
  }
}
```

### 1.22. Check Gender
Method: GET
Path: /api/users/:userId/check/gender
Access: Private
Response:
```json
{
  "message": "Gender check completed successfully",
  "data": {
    "hasGender": true,
    "gender": "male"
  }
}
```

### 1.23. Check Style Preference
Method: GET
Path: /api/users/:userId/check/style-preference
Access: Private
Response:
```json
{
  "message": "Style preference check completed successfully",
  "data": {
    "hasStylePreference": true,
    "style": "casual"
  }
}
```

### 1.24. Get Users for Testing
Method: GET
Path: /api/users/testing
Access: Public
Query Parameters:
- type: "personalization" | "outfit-suggestions" (required)
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Users for {type} testing retrieved successfully",
  "data": {
    "type": "string",
    "users": [],
    "pagination": {
      "page": 1,
      "pages": 10,
      "count": 90,
      "perPage": 9
    }
  }
}
```

## 2. Products

### 2.1. Get All Products
Method: GET
Path: /api/products
Access: Public
Query Parameters:
- keyword: string (optional)
- pageNumber: number (default: 1)
- pageSize: number (default: 9)
- option: "all" (optional - returns all products without pagination)
Response:
```json
{
  "message": "Products retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 2.2. Get Product By ID
Method: GET
Path: /api/products/:id
Access: Public
Response:
```json
{
  "message": "Product retrieved successfully",
  "data": {
    "product": {
      "_id": "string",
      "name": "string",
      "price": "number",
      "sale": "number",
      "images": [],
      "brand": "string",
      "category": "string",
      "description": "string",
      "size": {
        "s": "number",
        "m": "number",
        "l": "number",
        "xl": "number"
      },
      "countInStock": "number",
      "colors": [],
      "rating": "number",
      "numReviews": "number",
      "reviews": []
    }
  }
}
```

### 2.3. Create Product
Method: POST
Path: /api/products
Access: Private/Admin
Payload:
```json
{
  "name": "string",
  "price": "number",
  "sale": "number",
  "images": ["string"],
  "brand": "string",
  "category": "string",
  "description": "string",
  "size": {
    "s": "number",
    "m": "number",
    "l": "number",
    "xl": "number"
  },
  "colors": ["string"]
}
```
Response:
```json
{
  "message": "Product created successfully",
  "data": {
    "product": {}
  }
}
```

### 2.4. Update Product
Method: PUT
Path: /api/products/:id
Access: Private/Admin
Payload:
```json
{
  "name": "string",
  "price": "number",
  "sale": "number",
  "images": ["string"],
  "brand": "string",
  "category": "string",
  "description": "string",
  "size": {
    "s": "number",
    "m": "number",
    "l": "number",
    "xl": "number"
  },
  "colors": ["string"]
}
```
Response:
```json
{
  "message": "Product updated successfully",
  "data": {
    "product": {}
  }
}
```

### 2.5. Delete Product
Method: DELETE
Path: /api/products/:id
Access: Private/Admin
Response:
```json
{
  "message": "Product removed successfully"
}
```

### 2.6. Create Product Review
Method: POST
Path: /api/products/:id/reviews
Access: Private
Payload:
```json
{
  "rating": "number",
  "comment": "string"
}
```
Response:
```json
{
  "message": "Review added successfully"
}
```

### 2.7. Get Top Products
Method: GET
Path: /api/products/top
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Top products retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 2.8. Get Latest Products
Method: GET
Path: /api/products/latest
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Latest products retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 2.9. Get Sale Products
Method: GET
Path: /api/products/sale
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Sale products retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 2.10. Get Related Products
Method: GET
Path: /api/products/related
Access: Public
Query Parameters:
- category: string (optional)
- excludeId: string (optional)
Response:
```json
{
  "message": "Related products retrieved successfully",
  "data": {
    "products": []
  }
}
```

### 2.11. Get Products Sorted By Price
Method: GET
Path: /api/products/price
Access: Public
Query Parameters:
- sortBy: "asc" | "desc" (default: "asc")
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Products sorted by price retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 2.12. Recommend Size for User
Method: GET
Path: /api/products/recommend-size/:userId
Access: Public
Response:
```json
{
  "message": "Size recommendation retrieved successfully",
  "data": {
    "recommendedSize": "string"
  }
}
```

### 2.13. Filter Products
Method: GET
Path: /api/products/filter
Access: Public
Query Parameters:
- keyword: string (optional)
- categories: string (comma-separated, optional)
- brands: string (comma-separated, optional)
- size: "s" | "m" | "l" | "xl" (optional)
- rating: number (optional)
- priceMin: number (optional)
- priceMax: number (optional)
- sort_by: "latest" | "rating" | "sale" | "priceAsc" | "priceDesc" (optional)
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Filtered products retrieved successfully",
  "data": {
    "products": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

## 3. Orders

### 3.1. Create Order
Method: POST
Path: /api/orders
Access: Private
Payload:
```json
{
  "orderItems": [
    {
      "product": "string",
      "name": "string",
      "image": "string",
      "price": "number",
      "qty": "number",
      "sizeSelected": "string"
    }
  ],
  "shippingAddress": {
    "address": "string",
    "city": "string",
    "postalCode": "string",
    "country": "string"
  },
  "paymentMethod": "string",
  "itemsPrice": "number",
  "taxPrice": "number",
  "shippingPrice": "number",
  "totalPrice": "number"
}
```
Response:
```json
{
  "message": "Order created successfully",
  "data": {
    "order": {}
  }
}
```

### 3.2. Get All Orders
Method: GET
Path: /api/orders
Access: Private/Admin
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
- keyword: string (optional - order ID)
Response:
```json
{
  "message": "Orders retrieved successfully",
  "data": {
    "orders": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 3.3. Get Order By ID
Method: GET
Path: /api/orders/:id
Access: Public
Response:
```json
{
  "message": "Order retrieved successfully",
  "data": {
    "order": {}
  }
}
```

### 3.4. Get My Orders
Method: GET
Path: /api/orders/myorders
Access: Private
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "User orders retrieved successfully",
  "data": {
    "orders": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 3.5. Update Order to Paid
Method: PUT
Path: /api/orders/:id/pay
Access: Private
Payload:
```json
{
  "id": "string",
  "status": "string",
  "update_time": "string",
  "payer": {
    "email_address": "string"
  }
}
```
Response:
```json
{
  "message": "Order payment updated successfully",
  "data": {
    "order": {}
  }
}
```

### 3.6. Update Order to Delivered
Method: PUT
Path: /api/orders/:id/deliver
Access: Private/Admin
Response:
```json
{
  "message": "Order delivery updated successfully",
  "data": {
    "order": {}
  }
}
```

### 3.7. Cancel Order
Method: PUT
Path: /api/orders/:id/cancel
Access: Private
Response:
```json
{
  "message": "Order cancelled successfully",
  "data": {
    "order": {}
  }
}
```

### 3.8. Confirm Order
Method: PUT
Path: /api/orders/:id/confirm
Access: Private/Admin
Response:
```json
{
  "message": "Order confirmed successfully",
  "data": {
    "order": {}
  }
}
```

## 4. Categories

### 4.1. Get All Categories
Method: GET
Path: /api/categories
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Categories retrieved successfully",
  "data": {
    "categories": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 4.2. Get Category Counts
Method: GET
Path: /api/categories/counts
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Category counts retrieved successfully",
  "data": {
    "categoryCounts": [
      {
        "name": "string",
        "count": "number"
      }
    ],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 4.3. Create Category
Method: POST
Path: /api/categories
Access: Private/Admin
Payload:
```json
{
  "name": "string"
}
```
Response:
```json
{
  "message": "Category created successfully",
  "data": {
    "category": {
      "_id": "string",
      "name": "string"
    }
  }
}
```

### 4.4. Update Category
Method: PUT
Path: /api/categories/:id
Access: Private/Admin
Payload:
```json
{
  "name": "string"
}
```
Response:
```json
{
  "message": "Category updated successfully",
  "data": {
    "category": {
      "_id": "string",
      "name": "string"
    }
  }
}
```

### 4.5. Delete Category
Method: DELETE
Path: /api/categories/:id
Access: Private/Admin
Response:
```json
{
  "message": "Category removed successfully"
}
```

## 5. Brands

### 5.1. Get All Brands
Method: GET
Path: /api/brands
Access: Public
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "Brands retrieved successfully",
  "data": {
    "brands": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

### 5.2. Create Brand
Method: POST
Path: /api/brands
Access: Private/Admin
Payload:
```json
{
  "name": "string"
}
```
Response:
```json
{
  "message": "Brand created successfully",
  "data": {
    "brand": {
      "_id": "string",
      "name": "string"
    }
  }
}
```

### 5.3. Update Brand
Method: PUT
Path: /api/brands/:id
Access: Private/Admin
Payload:
```json
{
  "name": "string"
}
```
Response:
```json
{
  "message": "Brand updated successfully",
  "data": {
    "brand": {
      "_id": "string",
      "name": "string"
    }
  }
}
```

### 5.4. Delete Brand
Method: DELETE
Path: /api/brands/:id
Access: Private/Admin
Response:
```json
{
  "message": "Brand removed successfully"
}
```

### 5.5. Get Grouped Brands
Method: GET
Path: /api/brands/grouped
Access: Public
Response:
```json
{
  "message": "Brands grouped successfully",
  "data": {
    "groups": [
      {
        "letter": "A",
        "brands": [
          { "_id": "string", "name": "Apple" }
        ]
      },
      {
        "letter": "B",
        "brands": [
          { "_id": "string", "name": "Bose" }
        ]
      }
    ]
  }
}
```

## 6. Content Sections

### 6.1. Get All Content Sections
Method: GET
Path: /api/content-sections
Access: Public
Query Parameters:
- type: string (optional)
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "success": true,
  "data": {
    "contentSections": [],
    "page": 1,
    "pages": 10,
    "count": 90
  },
  "message": "Content sections retrieved successfully"
}
```

### 6.2. Create Content Section
Method: POST
Path: /api/content-sections
Access: Private/Admin
Payload:
```json
{
  "type": "string",
  "image": "string",
  "images": ["string"],
  "subtitle": "string",
  "title": "string",
  "button_text": "string",
  "button_link": "string",
  "position": "number"
}
```
Response:
```json
{
  "_id": "string",
  "type": "string",
  "image": "string",
  "images": [],
  "subtitle": "string",
  "title": "string",
  "button_text": "string",
  "button_link": "string",
  "position": "number"
}
```

### 6.3. Update Content Section
Method: PUT
Path: /api/content-sections/:id
Access: Private/Admin
Payload:
```json
{
  "type": "string",
  "image": "string",
  "images": ["string"],
  "subtitle": "string",
  "title": "string",
  "button_text": "string",
  "button_link": "string",
  "position": "number"
}
```
Response:
```json
{
  "_id": "string",
  "type": "string",
  "image": "string",
  "images": [],
  "subtitle": "string",
  "title": "string",
  "button_text": "string",
  "button_link": "string",
  "position": "number"
}
```

### 6.4. Delete Content Section
Method: DELETE
Path: /api/content-sections/:id
Access: Private/Admin
Response:
```json
{
  "message": "Content section removed"
}
```

## 7. Chat

### 7.1. Get User Chat
Method: GET
Path: /api/chats/:userId
Access: Private (User or Admin)
Response:
```json
{
  "message": "Chat retrieved successfully",
  "data": {
    "chat": {
      "_id": "string",
      "user": {},
      "messages": [
        {
          "sender": "string",
          "content": "string",
          "timestamp": "date"
        }
      ]
    }
  }
}
```

### 7.2. Send Message
Method: POST
Path: /api/chats/:userId
Access: Private (User or Admin)
Payload:
```json
{
  "sender": "string",
  "content": "string"
}
```
Response:
```json
{
  "message": "Message sent successfully",
  "data": {
    "message": {
      "sender": "string",
      "content": "string",
      "timestamp": "date"
    }
  }
}
```

### 7.3. Get All Chats
Method: GET
Path: /api/chats
Access: Private/Admin
Query Parameters:
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "message": "All chats retrieved successfully",
  "data": {
    "chats": [],
    "page": 1,
    "pages": 10,
    "count": 90
  }
}
```

## 8. Upload

### 8.1. Upload Images
Method: POST
Path: /api/upload
Access: Public
Content-Type: multipart/form-data
Body:
- images: File[] (max 12 files, JPEG/PNG/WEBP)
Response:
```json
{
  "message": "Images uploaded successfully",
  "data": ["string"]
}
```

## 9. Recommendations

### 9.1. Personalized Products (GNN)
Method: GET
Path: /api/recommend/gnn/personalize/:userId
Access: Public
Query Parameters:
- k: number (default: 9)
Response:
```json
{
  "success": true,
  "message": "Personalized recommendations generated successfully",
  "data": []
}
```

### 9.2. Hybrid Recommendations
Method: GET
Path: /api/recommend/hybrid/:userId
Access: Public
Query Parameters:
- k: number (default: 9)
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "success": true,
  "message": "Hybrid recommendations generated successfully",
  "data": {
    "products": [],
    "pagination": {
      "page": 1,
      "pages": 10,
      "count": 90,
      "perPage": 9
    }
  }
}
```

### 9.3. Outfit Perfect (GNN)
Method: GET
Path: /api/recommend/gnn/outfit-perfect/:userId
Access: Public
Query Parameters:
- productId: string (required)
- k: number (default: 9)
- pageNumber: number (default: 1)
- perPage: number (default: 9)
Response:
```json
{
  "success": true,
  "message": "Outfit recommendations generated successfully",
  "data": {
    "outfits": [],
    "model": "string",
    "timestamp": "string",
    "pagination": {
      "page": 1,
      "pages": 10,
      "count": 90,
      "perPage": 9
    }
  }
}
```

### 9.4. Train GNN (Incremental)
Method: POST
Path: /api/recommend/train/gnn-incremental
Access: Public
Response:
```json
{
  "success": true,
  "message": "GNN incremental training done",
  "data": {
    "gnn": {
      "trained": true,
      "trainingTime": "12.34s",
      "mode": "incremental"
    }
  }
}
```

## 10. Chatbot & AI

### 10.1. Chat with Gemini
Method: POST
Path: /api/chatgemini
Access: Public
Payload:
```json
{
  "prompt": "string"
}
```
Response:
```json
{
  "text": "string"
}
```

### 10.2. Chat with Novaware (Wit.ai + Gemini)
Method: POST
Path: /api/chatnovaware
Access: Public
Payload:
```json
{
  "prompt": "string"
}
```
Response:
```json
{
  "text": "string",
  "imageLinks": ["string"]
}
```

## 11. Payment

### 11.1. Get PayPal Client ID
Method: GET
Path: /api/config/paypal
Access: Public
Response:
```
"string"
```

### 11.2. Create Payment Intent (Stripe)
Method: POST
Path: /api/create-payment-intent
Access: Public
Payload:
```json
{
  "totalPrice": "number"
}
```
Response:
```json
{
  "clientSecret": "string"
}
```

## Authentication

Most endpoints require authentication using JWT Bearer token:
```
Authorization: Bearer {token}
```

Admin-only endpoints require the user to have `isAdmin: true`.

## Error Responses

Standard error response format:
```json
{
  "message": "Error message",
  "stack": "Error stack (development only)"
}
```

## Pagination

Most list endpoints support pagination with:
- `pageNumber`: Page number (starts from 1)
- `perPage`: Items per page (default: 9)

Response includes pagination metadata:
```json
{
  "page": 1,
  "pages": 10,
  "count": 90
}
```

