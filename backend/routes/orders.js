const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  createOrder,
  getAllOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
  getRecentOrders
} = require('../controllers/orderController');

// User routes
router.post('/', auth, createOrder);
router.get('/my-orders', auth, getUserOrders);
router.get('/:id', auth, getOrderById);
router.put('/:id/cancel', auth, cancelOrder);

// Admin routes
router.get('/', auth, getAllOrders);
router.get('/stats/all', auth, getOrderStats);
router.get('/recent/:limit', auth, getRecentOrders);
router.put('/:id/status', auth, updateOrderStatus);

module.exports = router;