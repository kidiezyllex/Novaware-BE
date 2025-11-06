import { createServer } from "http";
import { chatWithWitAi } from "./config/chatbot.js";
import { configureLoginAuth } from "./config/loginAuth.js";
import { notFound, errorHandler } from "./middlewares/errorMiddleware.js";
import { marked } from "marked";
import { initSocket } from "./config/socket.js";
import path from "path";
import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import { connectDB } from "./config/db.js";
import brandRoutes from "./routes/brandRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import contentSectionRoutes from "./routes/contentSectionRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import recommendRoutes from "./routes/recommendRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import gnnRecommender from "./services/gnnRecommender.js";
import stripe from "stripe";
import { setupSwagger } from "./config/swagger.js";

dotenv.config();

let memoryCheckInterval = null;

const setupMemoryMonitoring = () => {
  memoryCheckInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    const usagePercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    if (usagePercentage > 80 && global.gc) {
      global.gc();
    }

    if (usagePercentage > 90) {
      console.warn('🚨 CRITICAL: Memory usage exceeds 90%!');
    }
  }, 5 * 60 * 1000); // Check every 5 minutes
};

process.on('SIGTERM', () => {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
});

process.on('SIGINT', () => {
  if (memoryCheckInterval) {
    clearInterval(memoryCheckInterval);
  }
});

const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

initSocket(server);

const startServer = async () => {
  try {
    await connectDB();
    configureLoginAuth();

    app.use(
      cors({
        origin: [
          "http://localhost:3000",
          "http://localhost:3000",
          "http://localhost:5000",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:5000",
          "https://novaware-store.vercel.app",
          "https://www.novaware-store.vercel.app"
        ],
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization", "Accept"],
      })
    );
    app.use(express.json());
    app.use(
      session({
        secret: "your-session-secret",
        resave: false,
        saveUninitialized: false,
        cookie: { secure: false },
      })
    );

    app.use(passport.initialize());
    app.use(passport.session());

    if (process.env.NODE_ENV === "development") {
      app.use(morgan("dev"));
      app.get("/", (req, res) => {
        res.send("API is running");
      });
    }

    app.post("/api/chatnovaware", async (req, res) => {
      try {
        const { prompt } = req.body;
        const witAiResult = await chatWithWitAi(prompt);

        const intentConfidence =
          witAiResult.intents && witAiResult.intents.length > 0
            ? witAiResult.intents[0].confidence
            : 0;

        if (intentConfidence >= 0.88) {
          const formattedResponse = await marked(witAiResult.responseText);

          return res.json({
            text: formattedResponse,
            imageLinks: witAiResult.imageLinks || [],
          });
        } else {
          // Fallback response when confidence is low
          return res.json({ 
            text: "Xin lỗi, tôi chưa hiểu rõ câu hỏi của bạn. Vui lòng thử lại với câu hỏi cụ thể hơn về sản phẩm hoặc dịch vụ của chúng tôi." 
          });
        }
      } catch (error) {
        res.status(500).json({ error: "Failed to communicate with AI" });
      }
    });

    app.use("/api/brands", brandRoutes);
    app.use("/api/categories", categoryRoutes);
    app.use("/api/products", productRoutes);
    app.use("/api/auth", authRoutes);
    app.use("/api/users", userRoutes);
    app.use("/api/orders", orderRoutes);
    app.use("/api/upload", uploadRoutes);
    app.use("/api/chats", chatRoutes);
    app.use("/api/content-sections", contentSectionRoutes);
    app.use("/api/recommend", recommendRoutes);
    app.use("/api/report", reportRoutes);

    // Setup Swagger documentation
    setupSwagger(app);

    app.get("/api/config/paypal", (req, res) => {
      res.send(process.env.PAYPAL_CLIENT_ID);
    });

    app.post("/api/create-payment-intent", async (req, res) => {
      const { totalPrice } = req.body;

      try {
        const paymentIntent = await stripeInstance.paymentIntents.create({
          amount: Math.round(totalPrice * 100),
          currency: "usd",
          automatic_payment_methods: {
            enabled: true,
          },
        });

        res.json({
          clientSecret: paymentIntent.client_secret,
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to create payment intent" });
      }
    });

    app.get("/healthcheck", async (req, res) => {
      try {
        // Check database connection
        const mongoose = await import('mongoose');
        const dbState = mongoose.default.connection.readyState;
        
        if (dbState === 1) {
          res.json({ 
            status: "Server is running", 
            database: "Connected",
            timestamp: new Date().toISOString()
          });
        } else {
          res.status(503).json({ 
            status: "Server is running", 
            database: "Disconnected",
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        res.status(503).json({ 
          status: "Server is running", 
          database: "Error checking connection",
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    const __dirname = path.resolve();
    app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

    app.use("/docs", express.static(path.join(__dirname, "/docs")));
    app.use(express.static(path.join(__dirname, "/public")));
    app.use("/report", express.static(path.join(__dirname, "/public/report")));

    app.use(notFound);

    app.use((err, req, res, next) => {
      const statusCode =
        res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

      res.status(statusCode).json({
        message: err.message || "Internal Server Error",
        stack: process.env.NODE_ENV === "production" ? null : err.stack,
      });
    });

    server.listen(
      PORT,
      () => {
        console.log(`📡 Backend API running at: http://localhost:${PORT}/api`);
        console.log(`📚 Swagger documentation running at: http://localhost:${PORT}/api-docs`);
        console.log(`📖 Documentation files available at: http://localhost:${PORT}/docs`);
        setupMemoryMonitoring();

        (async () => {
          try {
            const loaded = await gnnRecommender.loadModel();
            if (loaded) {
              console.log('✅ GNN model preloaded at startup');
            } else {
              const autoTrain = process.env.AUTO_TRAIN_GNN !== 'false';
              if (autoTrain) {
                console.log('🚀 GNN model not found. Starting automatic training with all products...');
                try {
                  const trainStart = Date.now();
                  await gnnRecommender.train();
                  const trainTime = ((Date.now() - trainStart) / 1000).toFixed(2);
                  console.log(`✅ GNN model training completed automatically in ${trainTime}s`);
                } catch (trainError) {
                  console.error('❌ Failed to auto-train GNN model:', trainError.message);
                  console.warn('⚠️  Model will be trained on first recommendation request.');
                }
              } else {
                console.warn('⚠️  GNN model not found. Model will be trained on first recommendation request.');
                console.log('💡 Tip: Train manually via API: POST /api/recommend/train/gnn');
              }
            }
          } catch (e) {
            console.error('Failed to load GNN model:', e);
            const autoTrain = process.env.AUTO_TRAIN_GNN !== 'false';
            if (autoTrain) {
              console.log('🚀 Starting automatic training with all products...');
              try {
                const trainStart = Date.now();
                await gnnRecommender.train();
                const trainTime = ((Date.now() - trainStart) / 1000).toFixed(2);
                console.log(`✅ GNN model training completed automatically in ${trainTime}s`);
              } catch (trainError) {
                console.error('❌ Failed to auto-train GNN model:', trainError.message);
                console.warn('⚠️  Model will be trained on first recommendation request.');
              }
            } else {
              console.warn('⚠️  Model will be trained on first recommendation request.');
            }
          }
        })();
      }
    );
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};


// Start the server
startServer();

export default app;