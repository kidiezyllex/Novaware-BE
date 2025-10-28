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

configureLoginAuth();

const PORT = process.env.PORT || 5000;
const app = express();
const server = createServer(app);

initSocket(server);

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

app.use(passport.initialize());
app.use(passport.session());

if (process.env.NODE_ENV === "development") {
  app.use(morgan("dev"));
  app.get("/", (req, res) => {
    res.send("API is running");
  });
}

app.post("/api/chatgpt", async (req, res) => {
  try {
    const { prompt } = req.body;
    const responseText = await chatWithGPT2(prompt);
    const formattedResponse = marked(responseText);
    res.json({ text: responseText });
  } catch (error) {
    res.status(500).json({ error: "Failed to communicate with GPT API" });
  }
});

app.post("/api/chatgemini", async (req, res) => {
  try {
    const { prompt } = req.body;
    const responseText = await chatWithGemini(prompt);
    const formattedResponse = marked(responseText);
    res.json({ text: formattedResponse });
  } catch (error) {
    res.status(500).json({ error: "Failed to communicate with Gemini API" });
  }
});

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
      const systemPrompt =
        "I am integrating you into a clothing website. So imagine you are a sales person advising your customers on clothing and here is their question:";
      const combinedPrompt = `${systemPrompt}\n\n${prompt}`;
      const geminiResponse = await chatWithGemini(combinedPrompt);
      return res.json({ text: geminiResponse });
    }
  } catch (error) {
    res.status(500).json({ error: "Failed to communicate with AI" });
  }
});

app.use("/api/brands", brandRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/products", productRoutes);
app.use("/api/users", userRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/chats", chatRoutes);
app.use("/api/content-sections", contentSectionRoutes);
app.use("/api/recommend", recommendRoutes);

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

app.get("/healthcheck", (req, res) => {
  res.send("Server is running");
});

const __dirname = path.resolve();
app.use("/uploads", express.static(path.join(__dirname, "/uploads")));

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
});

server.listen(
  PORT,
  console.log(
    `Server running in ${process.env.NODE_ENV} mode on port ${PORT}`.yellow.bold
  )
);

export default app;