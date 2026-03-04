const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const auth = require('../middleware/auth');
const {
  registerUser,
  loginUser,
  getCurrentUser,
  adminLogin,
  updateProfile,
  changePassword
} = require('../controllers/authController');

// Validation rules
const registerValidation = [
  body('full_name').notEmpty().withMessage('Full name is required'),
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('phone').notEmpty().withMessage('Phone number is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

// Routes
router.post('/register', registerValidation, registerUser);
router.post('/login', loginValidation, loginUser);
router.get('/me', auth, getCurrentUser);
router.post('/admin/login', loginValidation, adminLogin);
router.put('/profile', auth, updateProfile);
router.put('/change-password', auth, changePassword);

module.exports = router;