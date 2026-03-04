const Product = require('../models/Product');
const pool = require('../config/database');
const fs = require('fs');
const path = require('path');

// Generate unique product ID
const generateProductId = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// @desc    Get all products
// @route   GET /api/products
// @access  Public
const getProducts = async (req, res) => {
  try {
    const products = await Product.findAll();
    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    console.error('Get products error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (err) {
    console.error('Get product error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get product by product ID (unique code)
// @route   GET /api/products/code/:productId
// @access  Public
const getProductByCode = async (req, res) => {
  try {
    const product = await Product.findByProductId(req.params.productId);
    
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    res.json({
      success: true,
      product
    });
  } catch (err) {
    console.error('Get product by code error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get products by category
// @route   GET /api/products/category/:category
// @access  Public
const getProductsByCategory = async (req, res) => {
  try {
    const products = await Product.findByCategory(req.params.category);
    
    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    console.error('Get products by category error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Search products
// @route   GET /api/products/search
// @access  Public
const searchProducts = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.json({
        success: true,
        count: 0,
        products: []
      });
    }

    const products = await Product.search(q);
    
    res.json({
      success: true,
      count: products.length,
      products
    });
  } catch (err) {
    console.error('Search products error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Create product
// @route   POST /api/products
// @access  Private/Admin
const createProduct = async (req, res) => {
  try {
    const {
      title, price, old_price, description,
      category, stock_status, rating
    } = req.body;

    // Validate required fields
    if (!title || !price || !description || !category || !rating) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    // Generate unique product ID
    const product_id = generateProductId();

    // Process images
    const images = req.files ? req.files.map(file => `/uploads/${file.filename}`) : [];

    const product = await Product.create({
      product_id,
      title,
      price,
      old_price: old_price || null,
      description,
      category,
      stock_status: stock_status || 'available',
      rating,
      images
    });

    res.status(201).json({
      success: true,
      message: 'Product created successfully',
      product
    });
  } catch (err) {
    console.error('Create product error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Update product
// @route   PUT /api/products/:id
// @access  Private/Admin
const updateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const {
      title, price, old_price, description,
      category, stock_status, rating
    } = req.body;

    // Check if product exists
    const existingProduct = await Product.findById(productId);
    if (!existingProduct) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    // Build update query
    let updateQuery = 'UPDATE products SET ';
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (title) {
      updates.push(`title = $${paramCount}`);
      values.push(title);
      paramCount++;
    }
    if (price) {
      updates.push(`price = $${paramCount}`);
      values.push(price);
      paramCount++;
    }
    if (old_price !== undefined) {
      updates.push(`old_price = $${paramCount}`);
      values.push(old_price);
      paramCount++;
    }
    if (description) {
      updates.push(`description = $${paramCount}`);
      values.push(description);
      paramCount++;
    }
    if (category) {
      updates.push(`category = $${paramCount}`);
      values.push(category);
      paramCount++;
    }
    if (stock_status) {
      updates.push(`stock_status = $${paramCount}`);
      values.push(stock_status);
      paramCount++;
    }
    if (rating) {
      updates.push(`rating = $${paramCount}`);
      values.push(rating);
      paramCount++;
    }

    // Handle new images if uploaded
    if (req.files && req.files.length > 0) {
      const newImages = req.files.map(file => `/uploads/${file.filename}`);
      const existingImages = existingProduct.images || [];
      const allImages = [...existingImages, ...newImages];
      
      updates.push(`images = $${paramCount}`);
      values.push(allImages);
      paramCount++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'No fields to update' 
      });
    }

    updateQuery += updates.join(', ');
    updateQuery += ` WHERE id = $${paramCount} RETURNING *`;
    values.push(productId);

    const result = await pool.query(updateQuery, values);

    res.json({
      success: true,
      message: 'Product updated successfully',
      product: result.rows[0]
    });
  } catch (err) {
    console.error('Update product error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Check if product exists and get images
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    // Delete associated images from filesystem
    if (product.images && product.images.length > 0) {
      product.images.forEach(imagePath => {
        const fullPath = path.join(__dirname, '..', imagePath);
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
        }
      });
    }

    // Delete from database
    await pool.query('DELETE FROM products WHERE id = $1', [productId]);

    res.json({
      success: true,
      message: 'Product deleted successfully'
    });
  } catch (err) {
    console.error('Delete product error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM products WHERE rating >= 4.5 ORDER BY created_at DESC LIMIT 10'
    );

    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    console.error('Get featured products error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get products by price range
// @route   GET /api/products/price-range
// @access  Public
const getProductsByPriceRange = async (req, res) => {
  try {
    const { min, max } = req.query;
    
    const result = await pool.query(
      'SELECT * FROM products WHERE price BETWEEN $1 AND $2 ORDER BY price',
      [min || 0, max || 999999]
    );

    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    console.error('Get products by price range error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Update product stock
// @route   PATCH /api/products/:id/stock
// @access  Private/Admin
const updateProductStock = async (req, res) => {
  try {
    const { stock_status } = req.body;
    const productId = req.params.id;

    const result = await pool.query(
      'UPDATE products SET stock_status = $1 WHERE id = $2 RETURNING *',
      [stock_status, productId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    res.json({
      success: true,
      message: 'Stock status updated successfully',
      product: result.rows[0]
    });
  } catch (err) {
    console.error('Update product stock error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = {
  getProducts,
  getProductById,
  getProductByCode,
  getProductsByCategory,
  searchProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getFeaturedProducts,
  getProductsByPriceRange,
  updateProductStock
};