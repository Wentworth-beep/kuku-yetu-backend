const pool = require('../config/database');

// Generate order ID
const generateOrderId = () => {
  return 'ORD-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6).toUpperCase();
};

// @desc    Create new order
// @route   POST /api/orders
// @access  Private
const createOrder = async (req, res) => {
  try {
    console.log('🔵 Creating new order for user:', req.user.id);
    console.log('📦 Order data:', JSON.stringify(req.body, null, 2));

    const {
      customer_name, phone, alternative_phone,
      location, specific_address, products, total_amount
    } = req.body;

    // Validation
    if (!customer_name || !phone || !location || !products || !total_amount) {
      return res.status(400).json({ 
        success: false,
        message: 'Please provide all required fields' 
      });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Products must be a non-empty array' 
      });
    }

    // Generate order ID
    const order_id = generateOrderId();

    // Clean products
    const cleanProducts = products.map(p => ({
      id: parseInt(p.id),
      title: String(p.title).trim(),
      price: parseFloat(p.price),
      quantity: parseInt(p.quantity)
    }));
    
    const productsJson = JSON.stringify(cleanProducts);
    const cleanTotalAmount = parseFloat(total_amount);

    // SIMPLE INSERT - only use columns that DEFINITELY exist
    // From your error, the table expects 8 parameters
    const query = `
      INSERT INTO orders 
      (user_id, customer_name, phone, location, products, total_amount, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      req.user.id,
      customer_name,
      phone,
      location,
      productsJson,
      cleanTotalAmount,
      'pending'
    ];

    console.log('📝 Executing query with 7 parameters');
    console.log('📝 Values:', values);

    const result = await pool.query(query, values);
    const newOrder = result.rows[0];
    
    // Add order_id to the response (even if not in DB)
    newOrder.order_id = order_id;
    
    console.log('✅ Order inserted successfully. ID:', newOrder.id);

    // Try to create notification
    try {
      const notifQuery = `
        INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
        VALUES ($1, $2, $3, $4, false, NOW())
      `;
      
      await pool.query(notifQuery, [
        req.user.id,
        'Order Received',
        `Your order #${order_id} has been received.`,
        'order'
      ]);
      
      console.log('✅ Notification created');
    } catch (notifError) {
      console.error('⚠️ Notification failed:', notifError.message);
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (err) {
    console.error('❌ Create order error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Get all orders (admin)
// @route   GET /api/orders
// @access  Private/Admin
const getAllOrders = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, u.full_name as user_name
      FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      ORDER BY o.id DESC
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });
  } catch (err) {
    console.error('❌ Get all orders error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Get user orders
// @route   GET /api/orders/my-orders
// @access  Private
const getUserOrders = async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC',
      [req.user.id]
    );
    
    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });
  } catch (err) {
    console.error('❌ Get user orders error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Get single order
// @route   GET /api/orders/:id
// @access  Private
const getOrderById = async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = result.rows[0];

    if (order.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    res.json({
      success: true,
      order
    });
  } catch (err) {
    console.error('❌ Get order error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Update order status
// @route   PUT /api/orders/:id/status
// @access  Private/Admin
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const orderId = req.params.id;

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status' 
      });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, orderId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Update order status error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Cancel order (user)
// @route   PUT /api/orders/:id/cancel
// @access  Private
const cancelOrder = async (req, res) => {
  try {
    const order = await pool.query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    
    if (order.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    if (order.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    if (!['pending', 'confirmed'].includes(order.rows[0].status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      ['cancelled', req.params.id]
    );

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Cancel order error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Get order statistics (admin)
// @route   GET /api/orders/stats
// @access  Private/Admin
const getOrderStats = async (req, res) => {
  try {
    const result = await pool.query(`
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

    res.json({
      success: true,
      stats: result.rows[0]
    });
  } catch (err) {
    console.error('❌ Get order stats error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

// @desc    Get recent orders (admin)
// @route   GET /api/orders/recent/:limit
// @access  Private/Admin
const getRecentOrders = async (req, res) => {
  try {
    const limit = parseInt(req.params.limit) || 10;
    
    const result = await pool.query(`
      SELECT o.*, u.full_name as user_name
      FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      ORDER BY o.id DESC 
      LIMIT $1
    `, [limit]);

    res.json({
      success: true,
      count: result.rows.length,
      orders: result.rows
    });
  } catch (err) {
    console.error('❌ Get recent orders error:', err);
    res.status(500).json({ 
      success: false,
      message: 'Server error: ' + err.message 
    });
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getUserOrders,
  getOrderById,
  updateOrderStatus,
  cancelOrder,
  getOrderStats,
  getRecentOrders
};
