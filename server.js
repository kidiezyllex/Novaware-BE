import { createServer } from "http";
import { chatWithGPT2 } from "./config/chatgpt.js";
import { chatWithWitAi } from "./config/chatbot.js";
import { configureLoginAuth } from "./config/loginAuth.js";
import { notFound, errorHandler } from "./middlewares/errorMiddleware.js";
import { marked } from "marked";
import { initSocket } from "./config/socket.js";
import chatWithGemini from "./config/gemini.js";
import path from "path";
import express from "express";
import dotenv from "dotenv";
import morgan from "morgan";
import passport from "passport";
import session from "express-session";
import cors from "cors";
import connectDB from "./config/db.js";
import brandRoutes from "./routes/brandRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import contentSectionRoutes from "./routes/contentSectionRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";
import recommendRoutes from "./routes/recommendRoutes.js";
import stripe from "stripe";

dotenv.config();
connectDB();

const stripeInstance = stripe(process.env.STRIPE_SECRET_KEY);

// set auth
configureLoginAuth();

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

//socket.io
initSocket(server);

// Enable CORS cho client
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
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

// khoi tao passport
app.use(passport.initialize());
app.use(passport.session());

// Use Morgan for HTTP request logging in development mode
if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
  app.get("/", (req, res) => {
    res.send("API is running");
  });
}

// GPT-2 Chat API
app.post("/api/chatgpt", async (req, res) => {
  try {
    const { prompt } = req.body;
    const responseText = await chatWithGPT2(prompt);
    const formattedResponse = marked(responseText);
    res.json({ text: responseText });
  } catch (error) {
    console.error("Error while communicating with Chat-gpt:", error.message);
    res.status(500).json({ error: "Failed to communicate with GPT API" });
  }
});

//Gemini chat api
app.post("/api/chatgemini", async (req, res) => {
  try {
    const { prompt } = req.body;
    const responseText = await chatWithGemini(prompt);
    const formattedResponse = marked(responseText);
    res.json({ text: formattedResponse });
  } catch (error) {
    console.error("Error while communicating with Gemini:", error.message);
    res.status(500).json({ error: "Failed to communicate with Gemini API" });
  }
});

// chatbot
app.post("/api/chatnovaware", async (req, res) => {
  try {
    const { prompt } = req.body;
    const witAiResult = await chatWithWitAi(prompt);

    console.log("witAiResult:", JSON.stringify(witAiResult, null, 2));
    const intentConfidence =
      witAiResult.intents && witAiResult.intents.length > 0
        ? witAiResult.intents[0].confidence
        : 0;

    // Kiểm tra confidence
    if (intentConfidence >= 0.88) {
      console.log("Process by Wit.ai");

      const formattedResponse = await marked(witAiResult.responseText);

      return res.json({
        text: formattedResponse,
        imageLinks: witAiResult.imageLinks || [],
      });
    } else {
      console.log("Switch Gemini");
      const systemPrompt =
        "I am integrating you into a clothing website. So imagine you are a sales person advising your customers on clothing and here is their question:";
      const combinedPrompt = `${systemPrompt}\n\n${prompt}`;
      const geminiResponse = await chatWithGemini(combinedPrompt);
      return res.json({ text: geminiResponse });
    }
  } catch (error) {
    console.error("Error in /api/chatnovaware:", error.message);
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

// App APIs
app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/content-sections", contentSectionRoutes);
app.use("/api/recommend", recommendRoutes);

// PayPal
app.get("/api/config/paypal", (req, res) => {
  res.send(process.env.PAYPAL_CLIENT_ID);
});

//Stripe
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
    console.error("Stripe payment intent creation failed:", error);
    res.status(500).json({ error: "Failed to create payment intent" });
  }
});

// Healthcheck endpoint
app.get("/healthcheck", (req, res) => {
  res.send("Server is running");
});

// upload
const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

// Serve Swagger UI
app.use("/docs", express.static(path.join(__dirname, "/docs")));
app.get("/api-docs", (req, res) => {
  res.sendFile(path.join(__dirname, "swagger-ui.html"));
});

app.use(notFound);

app.use((err, req, res, next) => {
  const statusCode =
    res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;

  res.status(statusCode).json({
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "production" ? null : err.stack,
  });

  console.error("Server error details:", err);
});

// Chay Server
server.listen(
  PORT,
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold
  )
);

export default app;
