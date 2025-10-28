import express from 'express';
import {
  authUser,
  getUserProfile,
  registerUser,
  updateUserProfile,
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
  forgotPassword,
  verifyCode,
  resetPassword,
  addToFavorites,
  removeFromFavorites,
  getFavorites
} from '../controllers/userController.js';
import { protect, checkAdmin, protectResetPassword, } from '../middlewares/authMiddleware.js';
import passport from 'passport';
import generateToken from '../utils/generateToken.js';

const router = express.Router();

router.route('/').post(registerUser).get(protect, checkAdmin, getUsers);
router.post('/login', authUser);

//Google OAuth
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  (req, res) => {
    const user = req.user;
    const token = generateToken(user); 
    const redirectUrl = `http://localhost:3000/?success=true&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&isAdmin=${user.isAdmin}&token=${token}`;
    res.redirect(redirectUrl);
  }
);
// Facebook OAuth
router.get(
  '/facebook',
  passport.authenticate('facebook', { scope: ['email'] })
);
router.get(
  '/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login', session: false }),
  (req, res) => {
    const user = req.user;
    const token = generateToken(user); 
    const redirectUrl = `http://localhost:3000/?success=true&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&isAdmin=${user.isAdmin}&token=${token}`;
    res.redirect(redirectUrl);
  }
);
// Twitter OAuth
router.get(
  '/twitter',
  passport.authenticate('twitter')
);

router.get(
  '/twitter/callback',
  passport.authenticate('twitter', { failureRedirect: '/login', session: false }),
  (req, res) => {
    const user = req.user;
    const token = generateToken(user); 
    const redirectUrl = `http://localhost:3000/?success=true&id=${user._id}&name=${encodeURIComponent(user.name)}&email=${encodeURIComponent(user.email)}&isAdmin=${user.isAdmin}&token=${token}`;
    res.redirect(redirectUrl);
  }
);

router.post('/forgot-password', forgotPassword);
router.post('/verify-code', verifyCode);
router.put('/reset-password', protectResetPassword, resetPassword);

router.route('/:userId/favorites').post(protect, addToFavorites); 
router.route('/:userId/favorites/:productId').delete(protect, removeFromFavorites); 
router.route('/:userId/favorites').get(protect, getFavorites); 

router
  .route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

router
  .route('/:id')
  .delete(protect, checkAdmin, deleteUser)
  .get(protect, checkAdmin, getUserById)
  .put(protect, checkAdmin, updateUser);


   
export default router;
