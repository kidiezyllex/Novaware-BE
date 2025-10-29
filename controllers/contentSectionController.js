import ContentSection from '../models/contentSectionModel.js';
import asyncHandler from 'express-async-handler';

const getContentSections = asyncHandler(async (req, res) => {
  const type = req.query.type;
  const query = type ? { type } : {};
  
  const perPage = parseInt(req.query.perPage) || 9;
  const page = parseInt(req.query.pageNumber) || 1;
  
  const count = await ContentSection.countDocuments(query);
  const contentSections = await ContentSection.find(query)
    .limit(perPage)
    .skip(perPage * (page - 1))
    .sort({ position: 1 });
    
  res.json({
    success: true,
    data: {
      contentSections,
      page,
      pages: Math.ceil(count / perPage),
      count
    },
    message: "Content sections retrieved successfully"
  });
});

const createContentSection = asyncHandler(async (req, res) => {
  const { type, image, images, subtitle, title, button_text, button_link, position } = req.body;

  const contentSection = new ContentSection({
    type,
    image,
    images,
    subtitle,
    title,
    button_text,
    button_link,
    position,
  });

  const createdContentSection = await contentSection.save();
  res.status(201).json(createdContentSection);
});

const updateContentSection = asyncHandler(async (req, res) => {
  const { type, image, images, subtitle, title, button_text, button_link, position } = req.body;

  const contentSection = await ContentSection.findById(req.params.id);

  if (contentSection) {
    contentSection.type = type || contentSection.type;
    contentSection.image = image !== undefined ? image : contentSection.image;
    contentSection.images = images !== undefined ? images : contentSection.images;
    contentSection.subtitle = subtitle || contentSection.subtitle;
    contentSection.title = title || contentSection.title;
    contentSection.button_text = button_text || contentSection.button_text;
    contentSection.button_link = button_link || contentSection.button_link;
    contentSection.position = position || contentSection.position;

    const updatedContentSection = await contentSection.save();
    res.json(updatedContentSection);
  } else {
    res.status(404).json({ message: 'Content section not found' });
  }
});

const deleteContentSection = asyncHandler(async (req, res) => {
  const contentSection = await ContentSection.findById(req.params.id);

  if (contentSection) {
    await contentSection.remove();
    res.json({ message: 'Content section removed' });
  } else {
    res.status(404).json({ message: 'Content section not found' });
  }
});

export {
  getContentSections,
  createContentSection,
  updateContentSection,
  deleteContentSection,
};