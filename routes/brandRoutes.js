import express from 'express';
import {
  getBrands,
  createBrand,
  updateBrand,
  deleteBrand,
} from '../controllers/brandController.js';
import { protect, checkAdmin } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.route('/')
  .get(getBrands)         
  .post(protect, checkAdmin, createBrand);  

router.route('/:id')
  .put(protect, checkAdmin, updateBrand)    
  .delete(protect, checkAdmin, deleteBrand); 

export default router;
