import mongoose from 'mongoose';

const outfitSchema = new mongoose.Schema({
  name: { type: String, required: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true }],
  style: { type: String, enum: ['casual', 'formal', 'sport'] },
  season: { type: String },
  totalPrice: { type: Number },
  compatibilityScore: { type: Number }, // Điểm phù hợp của outfit
}, { timestamps: true });

const Outfit = mongoose.model('Outfit', outfitSchema);
export default Outfit;
