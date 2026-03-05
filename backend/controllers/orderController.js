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
    console.log('📦 Order data received:', JSON.stringify(req.body, null, 2));

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
    console.log('📋 Generated order_id:', order_id);

    // Clean and prepare data
    const cleanProducts = products.map(p => ({
      id: parseInt(p.id),
      title: String(p.title).trim(),
      price: parseFloat(p.price),
      quantity: parseInt(p.quantity)
    }));
    
    const productsJson = JSON.stringify(cleanProducts);
    const cleanTotalAmount = parseFloat(total_amount);

    // First, check if the orders table has all required columns
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders'
    `);
    
    const columns = columnCheck.rows.map(col => col.column_name);
    console.log('📊 Available columns in orders table:', columns);

    // Check if order_id column exists
    const hasOrderId = columns.includes('order_id');
    const hasAlternativePhone = columns.includes('alternative_phone');
    const hasSpecificAddress = columns.includes('specific_address');
    const hasCreatedAt = columns.includes('created_at');

    // Build query based on existing columns
    let insertColumns = ['user_id', 'customer_name', 'phone', 'location', 'products', 'total_amount', 'status'];
    let insertValues = [req.user.id, customer_name, phone, location, productsJson, cleanTotalAmount, 'pending'];
    let placeholders = ['$1', '$2', '$3', '$4', '$5', '$6', '$7'];
    let paramCount = 7;

    // Add order_id if column exists
    if (hasOrderId) {
      insertColumns.push('order_id');
      insertValues.push(order_id);
      placeholders.push(`$${++paramCount}`);
    }

    // Add alternative_phone if column exists and value provided
    if (hasAlternativePhone && alternative_phone) {
      insertColumns.push('alternative_phone');
      insertValues.push(alternative_phone);
      placeholders.push(`$${++paramCount}`);
    }

    // Add specific_address if column exists and value provided
    if (hasSpecificAddress && specific_address) {
      insertColumns.push('specific_address');
      insertValues.push(specific_address);
      placeholders.push(`$${++paramCount}`);
    }

    // Add created_at if column exists
    if (hasCreatedAt) {
      insertColumns.push('created_at');
      insertValues.push('NOW()');
      placeholders.push(`NOW()`);
    }

    // Construct the final query
    const query = `
      INSERT INTO orders (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    console.log('📝 Final query:', query);
    console.log('📝 Values count:', insertValues.length, 'values');
    console.log('📝 Values:', insertValues);

    const result = await pool.query(query, insertValues);
    const newOrder = result.rows[0];
    
    console.log('✅ Order inserted successfully. ID:', newOrder.id);

    // Create notification for user
    try {
      // Check if notifications table has required columns
      const notifColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='notifications'
      `);
      
      const notifCols = notifColumns.rows.map(col => col.column_name);
      
      let notifQuery = 'INSERT INTO notifications (user_id, title, message, type';
      let notifValues = [req.user.id, '🛒 Order Received', `Your order #${order_id} has been received and is pending confirmation.`, 'order'];
      let notifPlaceholders = ['$1', '$2', '$3', '$4'];
      let notifParamCount = 4;

      if (notifCols.includes('is_read')) {
        notifQuery += ', is_read';
        notifValues.push(false);
        notifPlaceholders.push(`$${++notifParamCount}`);
      }
      
      if (notifCols.includes('created_at')) {
        notifQuery += ', created_at';
        notifPlaceholders.push('NOW()');
      }
      
      notifQuery += `) VALUES (${notifPlaceholders.join(', ')})`;
      
      await pool.query(notifQuery, notifValues);
      console.log('✅ Order confirmation notification sent to user', req.user.id);
    } catch (notifError) {
      console.error('⚠️ Could not send notification:', notifError.message);
      // Don't fail the order if notification fails
    }

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      order: newOrder
    });

  } catch (err) {
    console.error('❌ Create order error:', err);
    console.error('❌ Error stack:', err.stack);
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
    console.log('🔵 Fetching all orders for admin');
    
    const result = await pool.query(`
      SELECT o.*, u.full_name as user_name, u.email as user_email
      FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      ORDER BY o.id DESC
    `);
    
    console.log(`✅ Found ${result.rows.length} orders`);

    // Parse products for each order
    const parsedOrders = result.rows.map(order => {
      try {
        let products = order.products;
        if (typeof products === 'string') {
          products = JSON.parse(products);
        }
        return {
          ...order,
          products: products || []
        };
      } catch (e) {
        console.error('❌ Error parsing products for order', order.id);
        return {
          ...order,
          products: []
        };
      }
    });
    
    res.json({
      success: true,
      count: parsedOrders.length,
      orders: parsedOrders
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
    console.log('🔵 Fetching orders for user:', req.user.id);

    const result = await pool.query(
      'SELECT * FROM orders WHERE user_id = $1 ORDER BY id DESC',
      [req.user.id]
    );
    
    console.log(`✅ Found ${result.rows.length} orders for user ${req.user.id}`);

    // Parse products for each order
    const parsedOrders = result.rows.map(order => {
      try {
        let products = order.products;
        if (typeof products === 'string') {
          products = JSON.parse(products);
        }
        return {
          ...order,
          products: products || []
        };
      } catch (e) {
        console.error('❌ Error parsing products for order', order.id);
        return {
          ...order,
          products: []
        };
      }
    });
    
    res.json({
      success: true,
      count: parsedOrders.length,
      orders: parsedOrders
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
    const orderId = req.params.id;
    
    if (isNaN(parseInt(orderId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order ID format' 
      });
    }
    
    console.log('🔵 Fetching order:', orderId, 'for user:', req.user.id);

    const result = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    
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

    let parsedProducts = [];
    try {
      parsedProducts = typeof order.products === 'string' ? JSON.parse(order.products) : (order.products || []);
    } catch (e) {
      console.error('❌ Error parsing products:', e.message);
      parsedProducts = [];
    }

    const parsedOrder = {
      ...order,
      products: parsedProducts
    };

    res.json({
      success: true,
      order: parsedOrder
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

    console.log(`🔵 Updating order ${orderId} to status: ${status}`);

    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status' 
      });
    }

    const orderQuery = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = orderQuery.rows[0];

    const updateQuery = 'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *';
    const updateResult = await pool.query(updateQuery, [status, orderId]);
    const updatedOrder = updateResult.rows[0];

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    // Create notification for user
    try {
      let notificationTitle = '';
      let notificationMessage = '';
      
      switch (status) {
        case 'confirmed':
          notificationTitle = '✅ Order Confirmed';
          notificationMessage = `Your order #${order.order_id || order.id} has been confirmed and is being processed.`;
          break;
        case 'shipped':
          notificationTitle = '🚚 Order Shipped';
          notificationMessage = `Great news! Your order #${order.order_id || order.id} has been shipped and is on its way!`;
          break;
        case 'delivered':
          notificationTitle = '📦 Order Delivered';
          notificationMessage = `Your order #${order.order_id || order.id} has been delivered. Thank you for shopping with us!`;
          break;
        case 'completed':
          notificationTitle = '✨ Order Completed';
          notificationMessage = `Your order #${order.order_id || order.id} is now complete. We hope you enjoy your products!`;
          break;
        case 'cancelled':
          notificationTitle = '❌ Order Cancelled';
          notificationMessage = `Your order #${order.order_id || order.id} has been cancelled. Contact support for more information.`;
          break;
        default:
          notificationTitle = '📝 Order Update';
          notificationMessage = `Your order #${order.order_id || order.id} status has been updated to: ${status}`;
      }

      const notifQuery = `
        INSERT INTO notifications (user_id, title, message, type, is_read, created_at)
        VALUES ($1, $2, $3, $4, false, NOW())
      `;
      
      await pool.query(notifQuery, [
        order.user_id,
        notificationTitle,
        notificationMessage,
        'order'
      ]);
      
      console.log(`✅ Notification created for user ${order.user_id}`);
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError.message);
    }

    let parsedProducts = [];
    try {
      parsedProducts = typeof updatedOrder.products === 'string' ? JSON.parse(updatedOrder.products) : updatedOrder.products;
    } catch (e) {
      parsedProducts = [];
    }

    const parsedOrder = {
      ...updatedOrder,
      products: parsedProducts
    };

    res.json({
      success: true,
      message: `Order status updated to ${status}`,
      order: parsedOrder
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
    const orderId = req.params.id;
    console.log('🔵 Cancelling order:', orderId, 'by user:', req.user.id);

    const checkQuery = 'SELECT * FROM orders WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [orderId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = checkResult.rows[0];

    if (order.user_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    const updateQuery = 'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *';
    const updateResult = await pool.query(updateQuery, ['cancelled', orderId]);
    const updatedOrder = updateResult.rows[0];

    console.log('✅ Order cancelled successfully');

    res.json({
      success: true,
      message: 'Order cancelled successfully',
      order: updatedOrder
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
    console.log('🔵 Fetching order statistics');

    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'confirmed' THEN 1 END) as confirmed_orders,
        COUNT(CASE WHEN status = 'shipped' THEN 1 END) as shipped_orders,
        COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders,
        COALESCE(SUM(total_amount), 0) as total_revenue,
        COALESCE(AVG(total_amount), 0) as average_order_value
      FROM orders
    `);

    const todayResult = await pool.query(`
      SELECT COUNT(*) as today_orders, COALESCE(SUM(total_amount), 0) as today_revenue
      FROM orders 
      WHERE DATE(created_at) = CURRENT_DATE
    `);

    const weekResult = await pool.query(`
      SELECT COUNT(*) as week_orders, COALESCE(SUM(total_amount), 0) as week_revenue
      FROM orders 
      WHERE created_at >= NOW() - INTERVAL '7 days'
    `);

    console.log('✅ Statistics fetched successfully');

    res.json({
      success: true,
      stats: {
        ...result.rows[0],
        today: todayResult.rows[0],
        thisWeek: weekResult.rows[0]
      }
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
    console.log(`🔵 Fetching recent ${limit} orders`);

    const result = await pool.query(`
      SELECT o.*, u.full_name as user_name, u.email as user_email
      FROM orders o 
      LEFT JOIN users u ON o.user_id = u.id 
      ORDER BY o.id DESC 
      LIMIT $1
    `, [limit]);

    console.log(`✅ Found ${result.rows.length} recent orders`);

    const orders = result.rows.map(order => {
      try {
        return {
          ...order,
          products: typeof order.products === 'string' ? JSON.parse(order.products) : order.products
        };
      } catch (e) {
        console.error('❌ Error parsing products for order', order.id);
        return {
          ...order,
          products: []
        };
      }
    });

    res.json({
      success: true,
      count: orders.length,
      orders
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
