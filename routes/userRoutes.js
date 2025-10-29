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
  getFavorites,
  checkHasPurchaseHistory,
  checkHasGender,
  checkHasStylePreference,
  getUsersForTesting
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
 *     summary: Đăng ký người dùng mới
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
 *     summary: Lấy danh sách tất cả người dùng (chỉ Admin)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of users per page
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
 *     summary: Đăng nhập người dùng
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
/**
 * @swagger
 * /users/{userId}/favorites:
 *   get:
 *     summary: Lấy danh sách sản phẩm yêu thích của người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Number of favorites per page
 *     responses:
 *       200:
 *         description: Favorites retrieved successfully
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
 *                     favorites:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Product'
 *                     page:
 *                       type: number
 *                     pages:
 *                       type: number
 *                     count:
 *                       type: number
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 */
router.route('/:userId/favorites').get(protect, getFavorites); 

/**
 * @swagger
 * /users/{userId}/check/purchase-history:
 *   get:
 *     summary: Kiểm tra lịch sử mua hàng của người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Purchase history check completed successfully
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
 *                     hasPurchaseHistory:
 *                       type: boolean
 *                       description: Whether user has purchase history
 *                     orderCount:
 *                       type: number
 *                       description: Total number of paid orders
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 */
router.route('/:userId/check/purchase-history').get(protect, checkHasPurchaseHistory);

/**
 * @swagger
 * /users/{userId}/check/gender:
 *   get:
 *     summary: Kiểm tra thông tin giới tính của người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Gender check completed successfully
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
 *                     hasGender:
 *                       type: boolean
 *                       description: Whether user has gender information
 *                     gender:
 *                       type: string
 *                       nullable: true
 *                       enum: [male, female, other]
 *                       description: User gender if available
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 */
router.route('/:userId/check/gender').get(protect, checkHasGender);

/**
 * @swagger
 * /users/{userId}/check/style-preference:
 *   get:
 *     summary: Kiểm tra sở thích phong cách của người dùng
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Style preference check completed successfully
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
 *                     hasStylePreference:
 *                       type: boolean
 *                       description: Whether user has style preference
 *                     style:
 *                       type: string
 *                       nullable: true
 *                       enum: [casual, formal, sport, vintage, modern, bohemian]
 *                       description: User style preference if available
 *       401:
 *         description: Unauthorized
 *         $ref: '#/components/responses/UnauthorizedError'
 *       404:
 *         description: User not found
 */
router.route('/:userId/check/style-preference').get(protect, checkHasStylePreference);

/**
 * @swagger
 * /users/testing:
 *   get:
 *     summary: Lấy danh sách người dùng để test các mô hình
 *     tags: [Users]
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [personalization, outfit-suggestions]
 *         description: Loại test - personalization hoặc outfit-suggestions
 *       - in: query
 *         name: pageNumber
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Số trang (bắt đầu từ 1)
 *       - in: query
 *         name: perPage
 *         schema:
 *           type: integer
 *           default: 9
 *         description: Số lượng users mỗi trang (mặc định 9)
 *     responses:
 *       200:
 *         description: Users retrieved successfully for testing
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
 *                     type:
 *                       type: string
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           interactionCount:
 *                             type: number
 *                           categories:
 *                             type: array
 *                             items:
 *                               type: string
 *                             description: Only for outfit-suggestions type
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         pages:
 *                           type: number
 *                         count:
 *                           type: number
 *                         perPage:
 *                           type: number
 *       400:
 *         description: Bad request - Invalid type parameter
 */
router.route('/testing').get(getUsersForTesting);

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
