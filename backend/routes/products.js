const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const {
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
} = require('../controllers/productController');

// Configure multer for file upload
const storage = multer.diskStorage({
  destination: './uploads/',
  filename: (req, file, cb) => {
    cb(null, 'product-' + Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5000000 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Images only!'));
    }
  }
});

// Public routes
router.get('/', getProducts);
router.get('/search', searchProducts);
router.get('/featured', getFeaturedProducts);
router.get('/price-range', getProductsByPriceRange);
router.get('/category/:category', getProductsByCategory);
router.get('/code/:productId', getProductByCode);
router.get('/:id', getProductById);

// Admin routes
router.post('/', auth, upload.array('images', 10), createProduct);
router.put('/:id', auth, upload.array('images', 10), updateProduct);
router.delete('/:id', auth, deleteProduct);
router.patch('/:id/stock', auth, updateProductStock);

module.exports = router;