// config/chatbot.js
import { marked } from "marked";
import pkg from "node-wit";
const { Wit } = pkg;
import dotenv from "dotenv";
import Product from "../models/productModel.js";
import mongoose from "mongoose";
import Order from "../models/orderModel.js";

dotenv.config();

const WIT_AI_SERVER_ACCESS_TOKEN = process.env.WIT_AI_SERVER_ACCESS_TOKEN;
const client = new Wit({ accessToken: WIT_AI_SERVER_ACCESS_TOKEN });
let conversationContext = {};

// cac ham truy xuat du lieu
async function getProductInfo(productName) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
    });
    return product || null;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductPrice(productName) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
    });
    if (product) {
      return product.price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      });
    }
    return null;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductsByCategory(category) {
  try {
    const products = await Product.find({
      category: { $regex: category, $options: "i" },
    });
    return products;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductsByBrand(brand) {
  try {
    const products = await Product.find({
      brand: { $regex: brand, $options: "i" },
    });
    return products;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductAvailability(productName) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
    });
    return product ? product.countInStock > 0 : false;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductsByColor(productName, color) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
      "colors.name": { $regex: color, $options: "i" },
    });

    if (product) {
      const colorInfo = product.colors.find(
        (c) => c.name.toLowerCase() === color.toLowerCase()
      );
      if (colorInfo && colorInfo.countInStock > 0) {
        return product; // Trả về sản phẩm nếu tìm thấy màu và còn hàng
      }
    }
    return null; // Không tìm thấy sản phẩm, màu sắc, hoặc hết hàng
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductsBySize(productName, size) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
      [`size.${size}`]: { $exists: true, $ne: 0 },
    });

    return product; // Trả về sản phẩm nếu tìm thấy và size đó có số lượng tồn kho > 0
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function getProductsOnSale() {
  try {
    const products = await Product.find({ sale: { $gt: 0 } });
    return products;
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function checkColorAvailability(productName, color) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
      "colors.name": { $regex: color, $options: "i" },
    });

    if (product) {
      const colorInfo = product.colors.find(
        (c) => c.name.toLowerCase() === color.toLowerCase()
      );
      if (colorInfo) {
        return colorInfo.countInStock > 0;
      } else {
        return false;
      }
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
async function checkSizeAvailability(productName, size) {
  try {
    const product = await Product.findOne({
      name: { $regex: productName, $options: "i" },
    });

    if (product && product.size[size] !== undefined) {
      return product.size[size] > 0;
    } else {
      return false;
    }
  } catch (error) {
    console.error("Error querying database:", error);
    throw new Error("Failed to query database");
  }
}
function getSizeRecommendation(height, weight, gender = null) {
  const maleSizes = {
    S: { height: [155, 160], weight: [40, 50], priority: 1 },
    M: { height: [161, 167], weight: [51, 60], priority: 2 },
    L: { height: [168, 175], weight: [61, 70], priority: 3 },
    XL: { height: [176, 185], weight: [71, 80], priority: 4 },
  };

  const femaleSizes = {
    S: { height: [146, 153], weight: [36, 44], priority: 1 },
    M: { height: [154, 160], weight: [45, 52], priority: 2 },
    L: { height: [161, 168], weight: [53, 61], priority: 3 },
    XL: { height: [169, 176], weight: [62, 71], priority: 4 },
  };

  const sizes = gender === "female" ? femaleSizes : maleSizes;

  let bestSize = null;
  let highestSizePriority = -1;

  for (const size in sizes) {
    const {
      height: [minHeight, maxHeight],
      weight: [minWeight, maxWeight],
      priority: sizePriority,
    } = sizes[size];

    if (
      (height >= minHeight && height <= maxHeight) ||
      (weight >= minWeight && weight <= maxWeight)
    ) {
      if (sizePriority > highestSizePriority) {
        highestSizePriority = sizePriority;
        bestSize = size;
      }
    }
  }

  return bestSize ? [bestSize] : [];
}
function getOrderIdFromData(data) {
  let orderId = null;
  if (data.entities && data.entities["order_id:order_id"]) {
    orderId = data.entities["order_id:order_id"][0].value;
    if (!/^[0-9a-fA-F]+$/.test(orderId)) {
      console.error("Invalid order ID received from Wit.ai:", orderId);
      return null;
    }
  }
  return orderId;
}

// Các hàm xử lý intent
async function handleAskPrice(data) {
  if (data.entities && data.entities["product_name:product_name"]) {
    const productName = data.entities["product_name:product_name"][0].value;
    const price = await getProductPrice(productName);
    return price
      ? `The price of ${productName} is ${price}`
      : `Sorry, we don't have information about the price of ${productName} at the moment.`;
  } else {
    return "What product are you asking about?";
  }
}

async function handleGreeting() {
  return "Hello! I am NovaWare Assistant! How can I help you today?";
}

async function handleAskProductInfo(data) {
  if (data.entities && data.entities["product_name:product_name"]) {
    const productName = data.entities["product_name:product_name"][0].value;
    const productInfo = await getProductInfo(productName);
    if (productInfo) {
      let responseText = `Here's the information about ${productName}: \n - Name: ${
        productInfo.name
      } \n - Price: ${productInfo.price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} \n - Description: ${productInfo.description} \n - Brand: ${
        productInfo.brand
      } \n - Stock: ${
        productInfo.countInStock > 0
          ? `In stock (${productInfo.countInStock})`
          : "Out of stock"
      } \n`;
      return { responseText, imageLinks: productInfo.images };
    } else {
      return `Sorry, we don't have information about ${productName} at the moment.`;
    }
  } else {
    return "What product are you asking about?";
  }
}

async function handleAskProductsByCategory(data) {
  if (data.entities && data.entities["category:category"]) {
    const category = data.entities["category:category"][0].value;
    const products = await getProductsByCategory(category);
    if (products && products.length > 0) {
      let responseText = `Here are some products in the ${category} category:\n`;
      products.forEach((product) => {
        responseText += `- ${product.name} (${product.price.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: "USD",
          }
        )} )\n`;
      });
      return responseText;
    } else {
      return `Sorry, we don't have any products in the ${category} category at the moment.`;
    }
  } else {
    return "What category are you looking for?";
  }
}

async function handleAskProductsByBrand(data) {
  if (data.entities && data.entities["brand:brand"]) {
    const brand = data.entities["brand:brand"][0].value;
    const products = await getProductsByBrand(brand);
    if (products && products.length > 0) {
      let responseText = `Here are some products from ${brand}:\n`;
      products.forEach((product) => {
        responseText += `- ${product.name} (${product.price.toLocaleString(
          "en-US",
          {
            style: "currency",
            currency: "USD",
          }
        )} )\n`;
      });
      return responseText;
    } else {
      return `Sorry, we don't have any products from ${brand} at the moment.`;
    }
  } else {
    return "What brand are you looking for?";
  }
}

async function handleCheckAvailability(data) {
  if (data.entities && data.entities["product_name:product_name"]) {
    const productName = data.entities["product_name:product_name"][0].value;
    if (data.entities["size:size"]) {
      const size = data.entities["size:size"][0].value;
      const isAvailable = await checkSizeAvailability(productName, size);
      return isAvailable
        ? `Yes, ${productName} is available in size ${size}.`
        : `No, ${productName} is not available in size ${size}.`;
    } else if (data.entities["color:color"]) {
      const color = data.entities["color:color"][0].value;
      const isAvailable = await checkColorAvailability(productName, color);
      return isAvailable
        ? `Yes, ${productName} is available in ${color}.`
        : `No, ${productName} is not available in ${color}.`;
    } else {
      const isAvailable = await getProductAvailability(productName);
      return isAvailable
        ? `Yes, ${productName} is in stock.`
        : `No, ${productName} is out of stock.`;
    }
  } else {
    return "What product are you asking about?";
  }
}

async function handleAskProductsByColor(data) {
  if (
    data.entities &&
    data.entities["product_name:product_name"] &&
    data.entities["color:color"]
  ) {
    const productName = data.entities["product_name:product_name"][0].value;
    const color = data.entities["color:color"][0].value;
    const product = await getProductsByColor(productName, color);
    return product
      ? `Yes, we have ${productName} in ${color}.`
      : `No, we don't have ${productName} in ${color}.`;
  } else {
    return "What product and color are you asking about?";
  }
}

async function handleAskProductsBySize(data) {
  if (
    data.entities &&
    data.entities["product_name:product_name"] &&
    data.entities["size:size"]
  ) {
    const productName = data.entities["product_name:product_name"][0].value;
    const size = data.entities["size:size"][0].value;
    const product = await getProductsBySize(productName, size);
    return product
      ? `Yes, we have ${productName} in size ${size}.`
      : `No, we don't have ${productName} in size ${size}.`;
  } else {
    return "What product and size are you asking about?";
  }
}

async function handleAskSaleProducts() {
  const products = await getProductsOnSale();
  if (products && products.length > 0) {
    let responseText = "Here are some products on sale:\n";
    products.forEach((product) => {
      responseText += `- ${product.name} (Sale: ${
        product.sale
      }%) - Price: ${product.price.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })} )\n`;
    });
    return responseText;
  } else {
    return "Sorry, we don't have any products on sale at the moment.";
  }
}

async function handleAskSizeRecommendation(data) {
  let height, weight, gender;

  // Lấy height từ wit/distance
  if (data.entities && data.entities["wit$distance:distance"]) {
    for (const entity of data.entities["wit$distance:distance"]) {
      if (entity.unit === "centimetre" || entity.unit === "meter") {
        height = entity.value;
        if (entity.unit === "meter") {
          height *= 100; // Đổi từ mét sang centimet
        }
        break; // Lấy giá trị đầu tiên tìm thấy
      }
    }
  }

  // Nếu không có wit/distance, thử lấy từ wit/number
  if (!height && data.entities && data.entities["wit$number:number"]) {
    for (const entity of data.entities["wit$number:number"]) {
      if (!height) {
        height = entity.value;
        break; // Lấy giá trị đầu tiên tìm thấy
      }
    }
  }

  // Lấy weight từ wit/quantity
  if (data.entities && data.entities["wit$quantity:quantity"]) {
    for (const entity of data.entities["wit$quantity:quantity"]) {
      if (entity.unit === "kilogram") {
        weight = entity.value;
        break; // Lấy giá trị đầu tiên tìm thấy
      } else if (entity.unit === "gram") {
        weight = entity.value / 1000;
        break;
      }
    }
  }

  // Nếu không có wit/quantity, thử lấy từ wit/number
  if (!weight && data.entities && data.entities["wit$number:number"]) {
    for (const entity of data.entities["wit$number:number"]) {
      if (!weight) {
        weight = entity.value;
        break; // Lấy giá trị đầu tiên tìm thấy
      }
    }
  }

  // Lấy gender
  if (data.entities && data.entities["gender:gender"]) {
    gender = data.entities["gender:gender"][0].value;
  }

  console.log("height:", height, "weight:", weight, "gender:", gender); // Debug: In ra các giá trị

  if (height && weight) {
    const recommendedSizes = getSizeRecommendation(height, weight, gender);
    console.log("recommendedSizes:", recommendedSizes); // Debug: In ra recommendedSizes
    if (recommendedSizes.length > 0) {
      return `Based on your height and weight, the recommended size for you is: ${recommendedSizes.join(
        ", "
      )}.`;
    } else {
      return "Sorry, I couldn't find a suitable size based on your measurements.";
    }
  } else {
    return "Please provide both your height and weight for a size recommendation.";
  }
}

async function handleAskOrderStatus(data) {
  let orderId = null;

  if (data.entities && data.entities["order_id:order_id"]) {
    orderId = data.entities["order_id:order_id"][0].value;
    if (!/^[0-9a-fA-F]+$/.test(orderId)) {
      console.error("Invalid order ID received from Wit.ai:", orderId);
      return "Invalid order ID format.";
    }
  }
  if (orderId) {
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return "Invalid order ID format.";
    }
    const order = await Order.findById(orderId);
    if (order) {
      let responseText = `Here's the information about order ${orderId}:\n`;
      responseText += `- Order ID: ${order._id}\n`;
      responseText += `- Order Date: ${order.createdAt.toDateString()}\n`;
      responseText += `- Status: ${
        order.isPaid
          ? order.isDelivered
            ? "Paid and Delivered"
            : "Paid, Not Delivered"
          : "Not Paid"
      }\n`; // Thêm trạng thái isPaid và isDelivered
      responseText += `- Items:\n`;
      order.orderItems.forEach((item) => {
        responseText += `  - ${item.name} (Quantity: ${
          item.qty
        }, Price: ${item.priceSale.toLocaleString("en-US", {
          style: "currency",
          currency: "USD",
        })})\n`;
      });
      responseText += `- Total: ${order.totalPrice.toLocaleString("en-US", {
        style: "currency",
        currency: "USD",
      })}\n`;
      responseText += `- Payment method: ${order.paymentMethod}\n`;
      responseText += `- Shipping address: ${order.shippingAddress.address}, ${order.shippingAddress.city}, ${order.shippingAddress.postalCode}, ${order.shippingAddress.country}\n`;
      return responseText;
    } else {
      return `Sorry, I couldn't find an order with ID ${orderId}.`;
    }
  } else {
    return "Please provide the order ID.";
  }
}

// Hàm ánh xạ intent đến hàm xử lý
const intentHandlers = {
  ask_price: handleAskPrice,
  greeting: handleGreeting,
  ask_product_info: handleAskProductInfo,
  ask_products_by_category: handleAskProductsByCategory,
  ask_products_by_brand: handleAskProductsByBrand,
  check_availability: handleCheckAvailability,
  ask_products_by_color: handleAskProductsByColor,
  ask_products_by_size: handleAskProductsBySize,
  ask_sale_products: handleAskSaleProducts,
  ask_size_recommendation: handleAskSizeRecommendation,
  ask_order_status: handleAskOrderStatus,
};

// Hàm xử lý chính
export async function chatWithWitAi(prompt) {
  try {
    const data = await client.message(prompt, {});
    console.log("data.entities", data.entities);
    console.log("data", data);

    let result = {
      responseText: null,
      imageLinks: [],
      intents: data.intents, 
      entities: data.entities,
    };

    if (result.intents && result.intents.length > 0) {
      const intent = result.intents[0].name;
      const handler = intentHandlers[intent];

      if (handler) {
        const handlerResult = await handler(data);
        if (typeof handlerResult === "string") {
          result.responseText = handlerResult;
        } else if (handlerResult.responseText) {
          result.responseText = handlerResult.responseText;
          result.imageLinks = handlerResult.imageLinks || [];
        } else {
          result.responseText = handlerResult?.responseText;
        }
      } else {
        console.warn(`No handler found for intent: ${intent}`);
        result.responseText =
          "Sorry, I am not programmed to handle that request yet.";
      }
    } else {
      result.responseText = "Sorry, I didn't understand you. Can you rephrase?";
    }
    return result;
  } catch (error) {
    console.error("Error while communicating with Wit.ai:", error);
    throw new Error(`Failed to communicate with Wit.ai API: ${error.message}`);
  }
}
