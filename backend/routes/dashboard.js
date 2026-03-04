const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const {
  getDashboardStats,
  getSalesReport,
  getInventoryReport,
  getCustomerAnalytics
} = require('../controllers/dashboardController');

// All dashboard routes are admin only
router.use(auth);

router.get('/stats', getDashboardStats);
router.get('/sales-report', getSalesReport);
router.get('/inventory-report', getInventoryReport);
router.get('/customer-analytics', getCustomerAnalytics);

module.exports = router;