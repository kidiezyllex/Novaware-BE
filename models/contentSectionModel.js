import mongoose from 'mongoose';

const contentSectionSchema = mongoose.Schema(
  {
    type: { type: String, required: true },
    images: [{ type: String }], 
    image: { type: String }, 
    subtitle: { type: String },
    title: { type: String },
    button_text: { type: String },
    button_link: { type: String },
    position: { type: String },
  },
  {
    timestamps: true,
  }
);

const ContentSection = mongoose.model('ContentSection', contentSectionSchema);

export default ContentSection;