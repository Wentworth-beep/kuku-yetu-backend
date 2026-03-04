const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');

// Generate JWT Token
const generateToken = (id, email, isAdmin = false) => {
  return jwt.sign(
    { id, email, isAdmin },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  try {
    const { full_name, email, phone, password } = req.body;

    // Check if user exists with email
    let user = await User.findByEmail(email);
    if (user) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this email' 
      });
    }

    // Check if user exists with phone
    user = await User.findByPhone(phone);
    if (user) {
      return res.status(400).json({ 
        success: false,
        message: 'User already exists with this phone number' 
      });
    }

    // Create user
    const newUser = await User.create({ 
      full_name, 
      email, 
      phone, 
      password 
    });

    // Generate token
    const token = generateToken(newUser.id, newUser.email);

    res.status(201).json({
      success: true,
      token,
      user: {
        id: newUser.id,
        full_name: newUser.full_name,
        email: newUser.email,
        phone: newUser.phone
      }
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during registration' 
    });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Validate password
    const isMatch = await User.validatePassword(user, password);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid credentials' 
      });
    }

    // Generate token
    const token = generateToken(user.id, user.email);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error during login' 
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
const getCurrentUser = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user
    });
  } catch (err) {
    console.error('Get user error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Admin login
// @route   POST /api/auth/admin/login
// @access  Public
const adminLogin = async (req, res) => {
  // Check for validation errors
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ 
      success: false,
      errors: errors.array() 
    });
  }

  try {
    const { email, password } = req.body;

    // Check admin credentials against environment variables
    if (email === process.env.ADMIN_EMAIL && password === process.env.ADMIN_PASSWORD) {
      const token = generateToken(1, email, true);

      return res.json({
        success: true,
        token,
        user: { 
          id: 1,
          email, 
          isAdmin: true 
        }
      });
    }

    res.status(401).json({ 
      success: false,
      message: 'Invalid admin credentials' 
    });
  } catch (err) {
    console.error('Admin login error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { full_name, phone } = req.body;
    const userId = req.user.id;

    // Update user in database
    const query = `
      UPDATE users 
      SET full_name = COALESCE($1, full_name),
          phone = COALESCE($2, phone)
      WHERE id = $3
      RETURNING id, full_name, email, phone
    `;
    
    const result = await pool.query(query, [full_name, phone, userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    res.json({
      success: true,
      user: result.rows[0]
    });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    // Get user with password
    const userQuery = await pool.query(
      'SELECT * FROM users WHERE id = $1',
      [userId]
    );
    
    if (userQuery.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'User not found' 
      });
    }

    const user = userQuery.rows[0];

    // Validate current password
    const isMatch = await User.validatePassword(user, currentPassword);
    if (!isMatch) {
      return res.status(401).json({ 
        success: false,
        message: 'Current password is incorrect' 
      });
    }

    // Hash new password
    const bcrypt = require('bcryptjs');
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2',
      [hashedPassword, userId]
    );

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  adminLogin,
  updateProfile,
  changePassword
};