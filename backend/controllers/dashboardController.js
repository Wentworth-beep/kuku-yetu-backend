const pool = require('../config/database');

// @desc    Get admin dashboard stats
// @route   GET /api/dashboard/stats
// @access  Private/Admin
const getDashboardStats = async (req, res) => {
  try {
    // Get order stats
    const orderStats = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue
      FROM orders
    `);

    // Get product stats
    const productStats = await pool.query(`
      SELECT 
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_status = 'low' THEN 1 END) as low_stock_products,
        COUNT(CASE WHEN stock_status = 'out' THEN 1 END) as out_of_stock_products,
        COUNT(CASE WHEN rating >= 4.5 THEN 1 END) as highly_rated_products
      FROM products
    `);

    // Get user stats
    const userStats = await pool.query(`
      SELECT 
        COUNT(*) as total_users,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as new_users_week,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN 1 END) as new_users_month
      FROM users
    `);

    // Get category distribution
    const categoryStats = await pool.query(`
      SELECT 
        category,
        COUNT(*) as count,
        COALESCE(SUM(price), 0) as total_value
      FROM products
      GROUP BY category
    `);

    // Get daily orders for the last 7 days
    const dailyOrders = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as order_count,
        COALESCE(SUM(total_amount), 0) as revenue
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date DESC
    `);

    // Get recent activities
    const recentActivities = await pool.query(`
      (SELECT 
        'order' as type,
        id,
        'New order placed' as action,
        order_id as reference,
        created_at
      FROM orders
      ORDER BY created_at DESC
      LIMIT 5)
      UNION ALL
      (SELECT 
        'user' as type,
        id,
        'New user registered' as action,
        email as reference,
        created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 5)
      ORDER BY created_at DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      stats: {
        orders: orderStats.rows[0],
        products: productStats.rows[0],
        users: userStats.rows[0],
        categories: categoryStats.rows,
        daily_orders: dailyOrders.rows,
        recent_activities: recentActivities.rows
      }
    });
  } catch (err) {
    console.error('Get dashboard stats error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get sales report
// @route   GET /api/dashboard/sales-report
// @access  Private/Admin
const getSalesReport = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let interval;
    switch(period) {
      case 'week':
        interval = '7 days';
        break;
      case 'month':
        interval = '30 days';
        break;
      case 'year':
        interval = '365 days';
        break;
      default:
        interval = '30 days';
    }

    const salesData = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as orders,
        COALESCE(SUM(total_amount), 0) as revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value
      FROM orders
      WHERE created_at >= NOW() - INTERVAL '${interval}'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Get top selling products
    const topProducts = await pool.query(`
      SELECT 
        p.id,
        p.title,
        p.product_id,
        p.category,
        COUNT(*) as times_ordered,
        SUM((order_item->>'quantity')::int) as total_quantity,
        SUM((order_item->>'quantity')::int * (order_item->>'price')::decimal) as total_revenue
      FROM products p
      CROSS JOIN LATERAL jsonb_array_elements(
        (SELECT jsonb_agg(value) FROM orders, jsonb_array_elements(products) as value WHERE value->>'id' = p.id::text)
      ) as order_item
      GROUP BY p.id, p.title, p.product_id, p.category
      ORDER BY total_quantity DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      period,
      sales_data: salesData.rows,
      top_products: topProducts.rows
    });
  } catch (err) {
    console.error('Get sales report error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get inventory report
// @route   GET /api/dashboard/inventory-report
// @access  Private/Admin
const getInventoryReport = async (req, res) => {
  try {
    const inventoryData = await pool.query(`
      SELECT 
        category,
        COUNT(*) as total_products,
        COUNT(CASE WHEN stock_status = 'available' THEN 1 END) as in_stock,
        COUNT(CASE WHEN stock_status = 'low' THEN 1 END) as low_stock,
        COUNT(CASE WHEN stock_status = 'out' THEN 1 END) as out_of_stock,
        COALESCE(SUM(price), 0) as total_inventory_value
      FROM products
      GROUP BY category
    `);

    const lowStockProducts = await pool.query(`
      SELECT *
      FROM products
      WHERE stock_status IN ('low', 'out')
      ORDER BY 
        CASE 
          WHEN stock_status = 'out' THEN 1
          WHEN stock_status = 'low' THEN 2
        END,
        created_at DESC
    `);

    res.json({
      success: true,
      inventory_summary: inventoryData.rows,
      low_stock_products: lowStockProducts.rows
    });
  } catch (err) {
    console.error('Get inventory report error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

// @desc    Get customer analytics
// @route   GET /api/dashboard/customer-analytics
// @access  Private/Admin
const getCustomerAnalytics = async (req, res) => {
  try {
    // Customer acquisition over time
    const customerAcquisition = await pool.query(`
      SELECT 
        DATE_TRUNC('month', created_at) as month,
        COUNT(*) as new_customers
      FROM users
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY month DESC
      LIMIT 12
    `);

    // Top customers by order value
    const topCustomers = await pool.query(`
      SELECT 
        u.id,
        u.full_name,
        u.email,
        u.phone,
        COUNT(o.id) as order_count,
        COALESCE(SUM(o.total_amount), 0) as total_spent,
        MAX(o.created_at) as last_order_date
      FROM users u
      LEFT JOIN orders o ON u.id = o.user_id
      GROUP BY u.id, u.full_name, u.email, u.phone
      ORDER BY total_spent DESC
      LIMIT 10
    `);

    // Customer retention (repeat customers)
    const retentionData = await pool.query(`
      SELECT 
        COUNT(DISTINCT user_id) as customers_with_orders,
        COUNT(DISTINCT CASE WHEN order_count > 1 THEN user_id END) as repeat_customers,
        COUNT(DISTINCT CASE WHEN order_count = 1 THEN user_id END) as one_time_customers
      FROM (
        SELECT user_id, COUNT(*) as order_count
        FROM orders
        GROUP BY user_id
      ) as customer_orders
    `);

    res.json({
      success: true,
      customer_acquisition: customerAcquisition.rows,
      top_customers: topCustomers.rows,
      retention: retentionData.rows[0]
    });
  } catch (err) {
    console.error('Get customer analytics error:', err.message);
    res.status(500).json({ 
      success: false,
      message: 'Server error' 
    });
  }
};

module.exports = {
  getDashboardStats,
  getSalesReport,
  getInventoryReport,
  getCustomerAnalytics
};