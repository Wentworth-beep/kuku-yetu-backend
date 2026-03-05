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
    console.log('Order data:', JSON.stringify(req.body, null, 2));

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
    console.log('📦 Generated order_id:', order_id);

    // Clean and prepare data
    const cleanProducts = products.map(p => ({
      id: parseInt(p.id),
      title: String(p.title).trim(),
      price: parseFloat(p.price),
      quantity: parseInt(p.quantity)
    }));
    
    const productsJson = JSON.stringify(cleanProducts);
    const cleanTotalAmount = parseFloat(total_amount);

    // Check which columns exist in the orders table
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders'
    `);
    
    const columns = columnCheck.rows.map(col => col.column_name);
    console.log('📊 Available columns:', columns);

    // Build dynamic INSERT query based on existing columns
    let insertColumns = ['user_id', 'customer_name', 'phone', 'location', 'products', 'total_amount', 'status'];
    let insertValues = [req.user.id, customer_name, phone, location, productsJson, cleanTotalAmount, 'pending'];
    let placeholders = ['$1', '$2', '$3', '$4', '$5', '$6', '$7'];
    let paramCount = 7;

    // Add optional columns if they exist
    if (columns.includes('order_id')) {
      insertColumns.push('order_id');
      insertValues.push(order_id);
      placeholders.push(`$${++paramCount}`);
    }

    if (columns.includes('alternative_phone') && alternative_phone) {
      insertColumns.push('alternative_phone');
      insertValues.push(alternative_phone);
      placeholders.push(`$${++paramCount}`);
    }

    if (columns.includes('specific_address') && specific_address) {
      insertColumns.push('specific_address');
      insertValues.push(specific_address);
      placeholders.push(`$${++paramCount}`);
    }

    if (columns.includes('created_at')) {
      insertColumns.push('created_at');
      insertValues.push('NOW()');
      placeholders.push(`NOW()`);
    }

    const query = `
      INSERT INTO orders (${insertColumns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    console.log('📝 Executing query:', query);
    console.log('📝 With values:', insertValues);

    const result = await pool.query(query, insertValues);
    const newOrder = result.rows[0];
    
    console.log('✅ Order inserted successfully:', newOrder.id);

    // Try to create notification
    try {
      // Check if notifications table has required columns
      const notifColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='notifications'
      `);
      
      const notifCols = notifColumns.rows.map(col => col.column_name);
      console.log('📊 Notification columns:', notifCols);
      
      if (notifCols.includes('user_id') && notifCols.includes('title') && 
          notifCols.includes('message') && notifCols.includes('type')) {
        
        let notifQuery = 'INSERT INTO notifications (user_id, title, message, type';
        let notifValues = [req.user.id, 'Order Received', `Your order #${order_id} has been received.`, 'order'];
        let notifPlaceholders = ['$1', '$2', '$3', '$4'];
        
        if (notifCols.includes('is_read')) {
          notifQuery += ', is_read';
          notifValues.push(false);
          notifPlaceholders.push(`$${notifValues.length}`);
        }
        
        if (notifCols.includes('created_at')) {
          notifQuery += ', created_at';
          notifPlaceholders.push('NOW()');
        }
        
        notifQuery += `) VALUES (${notifPlaceholders.join(', ')})`;
        
        await pool.query(notifQuery, notifValues);
        console.log('✅ Notification created for user', req.user.id);
      }
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError.message);
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
    console.log('🔵 Fetching all orders for admin');
    
    // Check if orders table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'orders'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📭 Orders table does not exist');
      return res.json({
        success: true,
        count: 0,
        orders: []
      });
    }
    
    // Check if created_at column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders'
    `);
    
    const columns = columnCheck.rows.map(col => col.column_name);
    
    let query;
    if (columns.includes('created_at')) {
      query = `
        SELECT o.*, u.full_name as user_name, u.email as user_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC
      `;
    } else {
      query = `
        SELECT o.*, u.full_name as user_name, u.email as user_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.id DESC
      `;
    }
    
    const result = await pool.query(query);
    console.log(`✅ Found ${result.rows.length} orders`);

    // Safely parse products for each order
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

    // Check if created_at column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders'
    `);
    
    const columns = columnCheck.rows.map(col => col.column_name);
    
    let query;
    if (columns.includes('created_at')) {
      query = `
        SELECT * FROM orders 
        WHERE user_id = $1 
        ORDER BY created_at DESC
      `;
    } else {
      query = `
        SELECT * FROM orders 
        WHERE user_id = $1 
        ORDER BY id DESC
      `;
    }
    
    const result = await pool.query(query, [req.user.id]);
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
    
    // Validate that orderId is a number
    if (isNaN(parseInt(orderId))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid order ID format' 
      });
    }
    
    console.log('🔵 Fetching order:', orderId, 'for user:', req.user.id);

    const query = 'SELECT * FROM orders WHERE id = $1';
    const result = await pool.query(query, [orderId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = result.rows[0];

    // Check if user owns the order or is admin
    if (order.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    // Parse products
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

    // Validate status
    const validStatuses = ['pending', 'confirmed', 'shipped', 'delivered', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid status' 
      });
    }

    // Get order details first
    const orderQuery = await pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
    if (orderQuery.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = orderQuery.rows[0];

    // Update status
    const updateQuery = 'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *';
    const updateResult = await pool.query(updateQuery, [status, orderId]);
    const updatedOrder = updateResult.rows[0];

    console.log(`✅ Order ${orderId} status updated to ${status}`);

    // Create notification for user based on status
    try {
      const notifColumns = await pool.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name='notifications'
      `);
      
      const notifCols = notifColumns.rows.map(col => col.column_name);
      
      if (notifCols.includes('user_id') && notifCols.includes('title') && 
          notifCols.includes('message') && notifCols.includes('type')) {
        
        let notificationTitle = 'Order Update';
        let notificationMessage = '';
        
        switch (status) {
          case 'confirmed':
            notificationTitle = 'Order Confirmed';
            notificationMessage = `Your order #${order.order_id || order.id} has been confirmed and is being processed.`;
            break;
          case 'shipped':
            notificationTitle = 'Order Shipped';
            notificationMessage = `Great news! Your order #${order.order_id || order.id} has been shipped and is on its way!`;
            break;
          case 'delivered':
            notificationTitle = 'Order Delivered';
            notificationMessage = `Your order #${order.order_id || order.id} has been delivered. Thank you for shopping with us!`;
            break;
          case 'completed':
            notificationTitle = 'Order Completed';
            notificationMessage = `Your order #${order.order_id || order.id} is now complete. We hope you enjoy your products!`;
            break;
          case 'cancelled':
            notificationTitle = 'Order Cancelled';
            notificationMessage = `Your order #${order.order_id || order.id} has been cancelled. Contact support for more information.`;
            break;
          default:
            notificationMessage = `Your order #${order.order_id || order.id} status has been updated to: ${status}`;
        }

        let notifQuery = 'INSERT INTO notifications (user_id, title, message, type';
        let notifValues = [order.user_id, notificationTitle, notificationMessage, 'order'];
        let notifPlaceholders = ['$1', '$2', '$3', '$4'];
        
        if (notifCols.includes('is_read')) {
          notifQuery += ', is_read';
          notifValues.push(false);
          notifPlaceholders.push(`$${notifValues.length}`);
        }
        
        if (notifCols.includes('created_at')) {
          notifQuery += ', created_at';
          notifPlaceholders.push('NOW()');
        }
        
        notifQuery += `) VALUES (${notifPlaceholders.join(', ')})`;
        
        await pool.query(notifQuery, notifValues);
        console.log(`✅ Notification created for user ${order.user_id}`);
      }
    } catch (notifError) {
      console.error('⚠️ Failed to create notification:', notifError.message);
    }

    // Parse products for response
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

    // Check if order exists
    const checkQuery = 'SELECT * FROM orders WHERE id = $1';
    const checkResult = await pool.query(checkQuery, [orderId]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'Order not found' 
      });
    }

    const order = checkResult.rows[0];

    // Check if user owns the order
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ 
        success: false,
        message: 'Access denied' 
      });
    }

    // Check if order can be cancelled (only pending or confirmed orders)
    if (!['pending', 'confirmed'].includes(order.status)) {
      return res.status(400).json({ 
        success: false,
        message: 'Order cannot be cancelled at this stage' 
      });
    }

    // Update status to cancelled
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

    // Check if created_at column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders' AND column_name='created_at'
    `);
    
    let todayQuery, weekQuery;
    
    if (columnCheck.rows.length > 0) {
      todayQuery = `
        SELECT COUNT(*) as today_orders, COALESCE(SUM(total_amount), 0) as today_revenue
        FROM orders 
        WHERE DATE(created_at) = CURRENT_DATE
      `;
      
      weekQuery = `
        SELECT COUNT(*) as week_orders, COALESCE(SUM(total_amount), 0) as week_revenue
        FROM orders 
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `;
    } else {
      todayQuery = `SELECT 0 as today_orders, 0 as today_revenue`;
      weekQuery = `SELECT 0 as week_orders, 0 as week_revenue`;
    }

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

    const todayResult = await pool.query(todayQuery);
    const weekResult = await pool.query(weekQuery);

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
    console.error('Get order stats error:', err);
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

    // Check if created_at column exists
    const columnCheck = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='orders' AND column_name='created_at'
    `);
    
    let query;
    if (columnCheck.rows.length > 0) {
      query = `
        SELECT o.*, u.full_name as user_name, u.email as user_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.created_at DESC 
        LIMIT $1
      `;
    } else {
      query = `
        SELECT o.*, u.full_name as user_name, u.email as user_email
        FROM orders o 
        LEFT JOIN users u ON o.user_id = u.id 
        ORDER BY o.id DESC 
        LIMIT $1
      `;
    }

    const result = await pool.query(query, [limit]);
    console.log(`✅ Found ${result.rows.length} recent orders`);

    const orders = result.rows.map(order => {
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
        console.error('Error parsing products for order', order.id);
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
    console.error(' Get recent orders error:', err);
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
