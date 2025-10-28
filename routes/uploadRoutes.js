import express from 'express';
import fs from 'fs/promises';
import multer from 'multer';
import { fileTypeFromFile } from 'file-type'; 
import sharp from 'sharp'; 
import cloudinary from '../config/cloudinary.js';

const router = express.Router();

// Cấu hình Multer: thêm bộ lọc loại file
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Lưu tạm tệp vào thư mục uploads
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`); // Đặt tên tệp duy nhất
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type! Only JPEG, PNG, and WEBP are allowed.'));
  }
};

const multerUpload = multer({ storage, fileFilter });

router.post('/', multerUpload.array('images', 12), async (req, res) => {
  // Hàm tải lên Cloudinary
  const uploader = async (path) => {
    try {
      return await cloudinary(path, 'Fastrend/products');
    } catch (error) {
      console.error('Cloudinary upload error:', error);
      throw new Error('Failed to upload image to Cloudinary');
    }
  };

  if (req.method === 'POST') {
    const urls = [];
    const files = req.files;

    try {
      for (const file of files) {
        const { path } = file;

        // check loai anh
        const fileTypeResult = await fileTypeFromFile(path);

        if (fileTypeResult && fileTypeResult.mime !== 'image/webp') {
          
          const convertedPath = `${path}.webp`;
          await sharp(path)
            .toFormat('webp')
            .toFile(convertedPath);

          await fs.unlink(path); 
          const newPath = await uploader(convertedPath);
          await fs.unlink(convertedPath); 
          urls.push(newPath);
        } else {
          
          const newPath = await uploader(path);
          await fs.unlink(path); 
          urls.push(newPath);
        }
      }

      res.status(200).json({
        message: 'Images uploaded successfully',
        data: urls,
      });
    } catch (error) {
      console.error('Error processing images:', error);
      res.status(500).json({
        error: 'An error occurred while processing the images',
      });
    }
  } else {
    res.status(405).json({
      error: `${req.method} method not allowed`,
    });
  }
});

export default router;
