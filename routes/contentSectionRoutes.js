import express from 'express';
import {
  getContentSections,
  createContentSection,
  updateContentSection,
  deleteContentSection,
} from '../controllers/contentSectionController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getContentSections) 
  .post(protect, checkAdmin, createContentSection);

router.route('/:id')
  .put(protect, checkAdmin, updateContentSection)
  .delete(protect, checkAdmin, deleteContentSection);

export default router;