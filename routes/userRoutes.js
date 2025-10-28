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

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User management endpoints
 */

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Register a new user
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/User'
 *       400:
 *         description: Bad request
 *         $ref: '#/components/responses/ValidationError'
 *       409:
 *         description: User already exists
 *   get:
 *     summary: Get all users (Admin only)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/User'
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       403:
 *         description: Forbidden
 */
router.route('/').post(registerUser).get(protect, checkAdmin, getUsers);

/**
 * @swagger
 * /users/login:
 *   post:
 *     summary: User login
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "john@example.com"
 *               password:
 *                 type: string
 *                 example: "password123"
 *     responses:
 *       200:
 *         description: Successful login
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       $ref: '#/components/schemas/User'
 *       401:
 *         description: Invalid credentials
 *       400:
 *         description: Bad request
 */
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
