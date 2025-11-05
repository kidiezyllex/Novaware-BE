import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

export const mongoURI = process.env.MONGO_URI;

export const jwtSecret = process.env.JWT_SECRET;
export const jwtExpiresIn = process.env.JWT_EXPIRES_IN;

export const connectDB = async () => {
  try {
    mongoose.set('autoIndex', false);
    
    const conn = await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    await createIndexes();
  } catch (error) {
    process.exit(1);
  }
};

const createIndexes = async () => {
  try {
    // Import models dynamically to avoid circular dependencies
    const User = (await import('../models/userModel.js')).default;
    const Category = (await import('../models/categoryModel.js')).default;
    const Brand = (await import('../models/brandModel.js')).default;
    const Size = (await import('../models/sizeModel.js')).default;
    const Color = (await import('../models/colorModel.js')).default;
    
    await Promise.allSettled([
      User.createIndexes().catch(() => {}), // Uses schema-defined indexes
      Category.createIndexes().catch(() => {}),
      Brand.createIndexes().catch(() => {}),
      Size.createIndexes().catch(() => {}),
      Color.createIndexes().catch(() => {}),
    ]);
    
  } catch (error) {
  }
};

export const disconnectDB = async () => {
  try {
    await mongoose.disconnect();
    console.log('MongoDB Disconnected');
  } catch (error) {
    console.error(`Error disconnecting from MongoDB: ${error.message}`);
  }
};

mongoose.set('strictQuery', true);

// Export mongoose instance
export default mongoose;