import mongoose from "mongoose";
import asyncHandler from "express-async-handler";
import Product from "../models/productModel.js";
import Order from "../models/orderModel.js";
import { sendSuccess, sendError, sendValidationError, sendNotFound } from "../utils/responseHelper.js";

const addOrderItems = asyncHandler(async (req, res) => {
  const {
    orderItems,
    shippingAddress,
    paymentMethod,
    itemsPrice,
    taxPrice,
    shippingPrice,
    totalPrice,
  } = req.body;

  if (orderItems && orderItems.length === 0) {
    sendValidationError(res, "No order items");
    return;
  } else {
    // Chỉ kiểm tra tồn kho, không trừ số lượng
    for (const item of orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        // Kiểm tra tổng số lượng
        if (product.countInStock < item.qty) {
          console.error(
            `Not enough stock for product: ${product.name}, id: ${product._id}. Required: ${item.qty}, মজুদ: ${product.countInStock}`
          );
          res.status(400);
          throw new Error(`Not enough stock for product: ${product.name}`);
        }
        // Kiểm tra size
        if (product.size) {
          if (
            (product.size.s &&
              item.sizeSelected === "s" &&
              product.size.s < item.qty) ||
            (product.size.m &&
              item.sizeSelected === "m" &&
              product.size.m < item.qty) ||
            (product.size.l &&
              item.sizeSelected === "l" &&
              product.size.l < item.qty) ||
            (product.size.xl &&
              item.sizeSelected === "xl" &&
              product.size.xl < item.qty)
          ) {
            console.error(
              `Not enough stock for product: ${
                product.name
              } (Size ${item.sizeSelected.toUpperCase()}), id: ${
                product._id
              }. Required: ${item.qty}, মজুদ: ${
                product.size[item.sizeSelected]
              }`
            );
            res.status(400);
            throw new Error(
              `Not enough stock for product: ${
                product.name
              } (Size ${item.sizeSelected.toUpperCase()})`
            );
          }
        }
      } else {
        console.error(`Product not found with id: ${item.product}`);
        res.status(404);
        throw new Error(`Product not found: ${item.product}`);
      }
    }

    // Tạo đơn hàng với isProcessing: true
    const order = new Order({
      orderItems,
      user: req.user._id,
      shippingAddress,
      paymentMethod,
      itemsPrice,
      taxPrice,
      shippingPrice,
      totalPrice,
      isProcessing: false,
    });

    const createdOrder = await order.save();
    sendSuccess(res, 201, "Order created successfully", { order: createdOrder });
  }
});

const confirmOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    // Kiểm tra tồn kho trước khi xác nhận
    for (const item of order.orderItems) {
      const product = await Product.findById(item.product);
      if (product) {
        if (product.countInStock < item.qty) {
          console.error(
            `Not enough stock for product: ${product.name}, id: ${product._id}. Required: ${item.qty}, মজুদ: ${product.countInStock}`
          );
          res.status(400);
          throw new Error(`Not enough stock for product: ${product.name}`);
        }
        // Kiểm tra size
        if (product.size) {
          if (
            (product.size.s &&
              item.sizeSelected === "s" &&
              product.size.s < item.qty) ||
            (product.size.m &&
              item.sizeSelected === "m" &&
              product.size.m < item.qty) ||
            (product.size.l &&
              item.sizeSelected === "l" &&
              product.size.l < item.qty) ||
            (product.size.xl &&
              item.sizeSelected === "xl" &&
              product.size.xl < item.qty)
          ) {
            console.error(
              `Not enough stock for product: ${
                product.name
              } (Size ${item.sizeSelected.toUpperCase()}), id: ${
                product._id
              }. Required: ${item.qty}, মজুদ: ${
                product.size[item.sizeSelected]
              }`
            );
            res.status(400);
            throw new Error(
              `Not enough stock for product: ${
                product.name
              } (Size ${item.sizeSelected.toUpperCase()})`
            );
          }
        }
      } else {
        console.error(`Product not found with id: ${item.product}`);
        res.status(404);
        throw new Error(`Product not found: ${item.product}`);
      }
    }

    // Tru countInStock va size sau khi xac nhan
    const updateProductPromises = [];
    for (const item of order.orderItems) {
      updateProductPromises.push(
        new Promise(async (resolve, reject) => {
          try {
            const product = await Product.findById(item.product);

            if (product) {
              const updateObject = {
                $inc: {},
              };

              if (product.size) {
                if (item.sizeSelected === "S") {
                  updateObject.$inc["size.s"] = -item.qty;
                }
                if (item.sizeSelected === "M") {
                  updateObject.$inc["size.m"] = -item.qty;
                }
                if (item.sizeSelected === "L") {
                  updateObject.$inc["size.l"] = -item.qty;
                }
                if (item.sizeSelected === "XL") {
                  updateObject.$inc["size.xl"] = -item.qty;
                }
              }

              // Trừ countInStock tương ứng
              updateObject.$inc.countInStock = -item.qty;

              // Kiểm tra số lượng âm sau khi trừ
              if (product.countInStock + updateObject.$inc.countInStock < 0) {
                console.error(
                  `Negative stock after order for product: ${
                    product.name
                  }, id: ${product._id}. CountInStock: ${
                    product.countInStock + updateObject.$inc.countInStock
                  }`
                );
                return reject(
                  new Error(`Not enough stock for product: ${product.name}`)
                );
              }
              if (product.size) {
                if (
                  item.sizeSelected === "S" &&
                  product.size.s + (updateObject.$inc["size.s"] || 0) < 0
                ) {
                  console.error(
                    `Negative stock after order for product: ${
                      product.name
                    }, id: ${product._id} (Size S). Count: ${
                      product.size.s + (updateObject.$inc["size.s"] || 0)
                    }`
                  );
                  return reject(
                    new Error(
                      `Not enough stock for product: ${product.name} (Size S)`
                    )
                  );
                }
                if (
                  item.sizeSelected === "M" &&
                  product.size.m + (updateObject.$inc["size.m"] || 0) < 0
                ) {
                  console.error(
                    `Negative stock after order for product: ${
                      product.name
                    }, id: ${product._id} (Size M). Count: ${
                      product.size.m + (updateObject.$inc["size.m"] || 0)
                    }`
                  );
                  return reject(
                    new Error(
                      `Not enough stock for product: ${product.name} (Size M)`
                    )
                  );
                }
                if (
                  item.sizeSelected === "L" &&
                  product.size.l + (updateObject.$inc["size.l"] || 0) < 0
                ) {
                  console.error(
                    `Negative stock after order for product: ${
                      product.name
                    }, id: ${product._id} (Size L). Count: ${
                      product.size.l + (updateObject.$inc["size.l"] || 0)
                    }`
                  );
                  return reject(
                    new Error(
                      `Not enough stock for product: ${product.name} (Size L)`
                    )
                  );
                }
                if (
                  item.sizeSelected === "XL" &&
                  product.size.xl + (updateObject.$inc["size.xl"] || 0) < 0
                ) {
                  console.error(
                    `Negative stock after order for product: ${
                      product.name
                    }, id: ${product._id} (Size XL). Count: ${
                      product.size.xl + (updateObject.$inc["size.xl"] || 0)
                    }`
                  );
                  return reject(
                    new Error(
                      `Not enough stock for product: ${product.name} (Size XL)`
                    )
                  );
                }
              }

              const result = await Product.updateOne(
                { _id: product._id },
                updateObject
              );

              if (result.matchedCount === 0 || result.modifiedCount === 0) {
                console.error(
                  "Product update did not modify any document:",
                  product.name,
                  result
                );
              }
              resolve();
            } else {
              console.error(`Product not found with id: ${item.product}`);
              resolve();
            }
          } catch (error) {
            console.error("Error updating product:", error);
            reject(error);
          }
        })
      );
    }

    try {
      await Promise.all(updateProductPromises);
      order.isProcessing = true;
      const updatedOrder = await order.save();
      sendSuccess(res, 200, "Order confirmed successfully", { order: updatedOrder });
    } catch (error) {
      console.error("Error updating products:", error);
      sendError(res, 500, "Error updating products", { error: error.message });
    }
  } else {
    sendNotFound(res, "Order not found");
  }
});

const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate(
    "user",
    "name email"
  );

  if (order) {
    sendSuccess(res, 200, "Order retrieved successfully", { order });
  } else {
    sendNotFound(res, "Order not found!");
  }
});

const updateOrderToPaid = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isPaid = true;
    order.paidAt = Date.now();
    order.paymentResult = {
      id: req.body.id,
      status: req.body.status,
      update_time: req.body.update_time,
      email_address: req.body.payer.email_address,
    };

    const updatedOrder = await order.save();

    sendSuccess(res, 200, "Order payment updated successfully", { order: updatedOrder });
  } else {
    sendNotFound(res, "Order not found");
  }
});

const getMyOrders = asyncHandler(async (req, res) => {
  const perPage = parseInt(req.query.perPage) || 9;
  const page = parseInt(req.query.pageNumber) || 1;
  
  const count = await Order.countDocuments({ user: req.user._id });
  const orders = await Order.find({ user: req.user._id })
    .limit(perPage)
    .skip(perPage * (page - 1))
    .sort({ createdAt: -1 });
    
  sendSuccess(res, 200, "User orders retrieved successfully", { 
    orders, 
    page, 
    pages: Math.ceil(count / perPage), 
    count 
  });
});

const getOrders = asyncHandler(async (req, res) => {
  const perPage = parseInt(req.query.perPage) || 9;
  const page = parseInt(req.query.pageNumber) || 1;
  
  let keyword = {};

  if (req.query.keyword) {
    if (
      (req.query.keyword.length === 12 || req.query.keyword.length === 24) &&
      mongoose.Types.ObjectId.isValid(req.query.keyword)
    ) {
      try {
        keyword = { _id: new mongoose.Types.ObjectId(req.query.keyword) };
      } catch (error) {
        console.error("Invalid ObjectId:", error);
      }
    }
  }
  
  const count = await Order.countDocuments({ ...keyword });
  const orders = await Order.find({ ...keyword })
    .populate("user", "id name")
    .sort({ createdAt: -1 })
    .limit(perPage)
    .skip(perPage * (page - 1));
    
  sendSuccess(res, 200, "Orders retrieved successfully", { 
    orders, 
    page, 
    pages: Math.ceil(count / perPage), 
    count 
  });
});

const updateOrderToDelivered = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (order) {
    order.isDelivered = true;
    order.deliveredAt = Date.now();

    const updatedOrder = await order.save();

    sendSuccess(res, 200, "Order delivery updated successfully", { order: updatedOrder });
  } else {
    sendNotFound(res, "Order not found");
  }
});

const cancelOrder = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    sendNotFound(res, "Order not found");
    return;
  }

  if (!order.isProcessing) {
    sendValidationError(res, "Order cannot be cancelled because it is not in Processing mode");
    return;
  }

  order.isCancelled = true;
  order.isProcessing = false;
  const updatedOrder = await order.save();

  sendSuccess(res, 200, "Order cancelled successfully", { order: updatedOrder });
});

export {
  addOrderItems,
  confirmOrder,
  getOrderById,
  updateOrderToPaid,
  getMyOrders,
  getOrders,
  updateOrderToDelivered,
  cancelOrder,
};
