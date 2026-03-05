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
    console.log('Getting all products');
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
      message: 'Server error: ' + err.message
    });
  }
};

// @desc    Get single product
// @route   GET /api/products/:id
// @access  Public
const getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ID contains colon and clean it (fixes the 14:1 issue)
    let cleanId = id;
    if (id.includes(':')) {
      cleanId = id.split(':')[0];
      console.log(`Cleaned product ID from ${id} to ${cleanId}`);
    }
    
    // Validate that cleanId is a number
    const productId = parseInt(cleanId);
    if (isNaN(productId)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid product ID format' 
      });
    }
    
    const product = await Product.findById(productId);
    
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
    });
  }
};

// @desc    Delete product
// @route   DELETE /api/products/:id
// @access  Private/Admin
const deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false,
        message: 'Product not found' 
      });
    }

    // First delete any favorites that reference this product
    try {
      // Check if favorites table exists
      const tableCheck = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'favorites'
        );
      `);
      
      if (tableCheck.rows[0].exists) {
        await pool.query('DELETE FROM favorites WHERE product_id = $1', [productId]);
        console.log(`Deleted favorites for product ${productId}`);
      }
    } catch (favError) {
      console.log('Favorites table might not exist or other error:', favError.message);
      // Continue with deletion even if favorites table doesn't exist
    }

    // Also check for orders that might reference this product
    try {
      // This is more complex - products in orders are stored as JSON
      // We'll just log a warning instead of blocking deletion
      console.log(`Note: Product ${productId} may exist in order histories`);
    } catch (orderError) {
      console.log('Error checking orders:', orderError.message);
    }

    // Delete associated images from filesystem
    if (product.images && product.images.length > 0) {
      product.images.forEach(imagePath => {
        try {
          const fullPath = path.join(__dirname, '..', imagePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            console.log(`Deleted image: ${fullPath}`);
          }
        } catch (fileError) {
          console.error('Error deleting image file:', fileError.message);
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
    
    // Check if it's a foreign key constraint error
    if (err.code === '23503') {
      return res.status(400).json({ 
        success: false,
        message: 'Cannot delete product because it is referenced in orders or favorites. You may need to delete those records first.' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message
    });
  }
};

// @desc    Get featured products
// @route   GET /api/products/featured
// @access  Public
const getFeaturedProducts = async (req, res) => {
  try {
    // Check if created_at column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='products' AND column_name='created_at'
    `);
    
    let query;
    if (columnCheck.rows.length > 0) {
      query = 'SELECT * FROM products WHERE rating >= 4.5 ORDER BY created_at DESC LIMIT 10';
    } else {
      query = 'SELECT * FROM products WHERE rating >= 4.5 ORDER BY id DESC LIMIT 10';
    }
    
    const result = await pool.query(query);

    res.json({
      success: true,
      count: result.rows.length,
      products: result.rows
    });
  } catch (err) {
    console.error('Get featured products error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
      message: 'Server error: ' + err.message
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
